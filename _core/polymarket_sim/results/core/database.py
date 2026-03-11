"""
Polymarket Paper Trading Simulator — Async Trade Database
Uses aiosqlite for non-blocking writes inside the asyncio event loop.
"""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import aiosqlite

logger = logging.getLogger(__name__)

DB_DIR = Path(__file__).resolve().parent.parent / "data"
DB_PATH = DB_DIR / "trades.db"


class TradeDatabase:
    """
    Async SQLite database for trade history, portfolio snapshots, and sessions.
    All methods are async to avoid blocking the WS event loop.
    """

    def __init__(self, db_path: Optional[Path] = None):
        self._db_path = db_path or DB_PATH
        self._db: Optional[aiosqlite.Connection] = None

    # ── Lifecycle ─────────────────────────────────────────────

    async def connect(self):
        """Open connection and create tables if needed."""
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._db = await aiosqlite.connect(str(self._db_path))
        await self._db.execute("PRAGMA journal_mode=WAL")  # better concurrent perf
        await self._db.execute("PRAGMA synchronous=NORMAL")
        await self._create_tables()
        logger.info("📦 Database connected: %s", self._db_path)

    async def close(self):
        """Close the database connection."""
        if self._db:
            await self._db.close()
            self._db = None

    async def _create_tables(self):
        """Initialize schema."""
        await self._db.executescript("""
            CREATE TABLE IF NOT EXISTS sessions (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                strategy    TEXT NOT NULL,
                bankroll    REAL NOT NULL,
                market_slug TEXT,
                started_at  REAL NOT NULL,
                ended_at    REAL,
                final_pnl   REAL,
                final_grade TEXT
            );

            CREATE TABLE IF NOT EXISTS trades (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id  INTEGER NOT NULL,
                token_id    TEXT NOT NULL,
                side        TEXT NOT NULL,
                price       REAL NOT NULL,
                size        REAL NOT NULL,
                cost        REAL NOT NULL,
                timestamp   REAL NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(id)
            );

            CREATE TABLE IF NOT EXISTS portfolio_snapshots (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id      INTEGER NOT NULL,
                timestamp       REAL NOT NULL,
                bankroll        REAL NOT NULL,
                realized_pnl    REAL NOT NULL,
                unrealized_pnl  REAL NOT NULL,
                total_pnl       REAL NOT NULL,
                num_trades      INTEGER NOT NULL,
                win_rate        REAL NOT NULL,
                sharpe          REAL NOT NULL,
                ev              REAL NOT NULL,
                max_drawdown_pct REAL NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(id)
            );

            CREATE INDEX IF NOT EXISTS idx_trades_session ON trades(session_id);
            CREATE INDEX IF NOT EXISTS idx_snapshots_session ON portfolio_snapshots(session_id);
        """)
        await self._db.commit()

    # ── Session Management ────────────────────────────────────

    async def start_session(
        self,
        strategy_name: str,
        bankroll: float,
        market_slug: Optional[str] = None,
    ) -> int:
        """Create a new trading session. Returns session_id."""
        cursor = await self._db.execute(
            """INSERT INTO sessions (strategy, bankroll, market_slug, started_at)
               VALUES (?, ?, ?, ?)""",
            (strategy_name, bankroll, market_slug, time.time()),
        )
        await self._db.commit()
        session_id = cursor.lastrowid
        logger.info("📝 Session #%d started: %s ($%.2f)", session_id, strategy_name, bankroll)
        return session_id

    async def end_session(
        self,
        session_id: int,
        final_pnl: float,
        final_grade: str,
    ):
        """Finalize a session with results."""
        await self._db.execute(
            """UPDATE sessions SET ended_at=?, final_pnl=?, final_grade=?
               WHERE id=?""",
            (time.time(), final_pnl, final_grade, session_id),
        )
        await self._db.commit()
        logger.info("📝 Session #%d ended: PnL=$%.2f Grade=%s", session_id, final_pnl, final_grade)

    # ── Trade Recording ───────────────────────────────────────

    async def record_fill(
        self,
        session_id: int,
        token_id: str,
        side: str,
        price: float,
        size: float,
        cost: float,
    ):
        """Record a single fill/trade."""
        await self._db.execute(
            """INSERT INTO trades (session_id, token_id, side, price, size, cost, timestamp)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (session_id, token_id, side, price, size, cost, time.time()),
        )
        await self._db.commit()

    # ── Snapshot Recording ────────────────────────────────────

    async def save_snapshot(self, session_id: int, snapshot) -> None:
        """Save a portfolio snapshot. Accepts a PortfolioSnapshot dataclass."""
        await self._db.execute(
            """INSERT INTO portfolio_snapshots
               (session_id, timestamp, bankroll, realized_pnl, unrealized_pnl,
                total_pnl, num_trades, win_rate, sharpe, ev, max_drawdown_pct)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                session_id,
                snapshot.timestamp,
                snapshot.bankroll,
                snapshot.realized_pnl,
                snapshot.unrealized_pnl,
                snapshot.total_pnl,
                snapshot.num_trades,
                snapshot.win_rate,
                snapshot.sharpe,
                snapshot.ev,
                snapshot.max_drawdown_pct,
            ),
        )
        await self._db.commit()

    # ── Query Methods ─────────────────────────────────────────

    async def get_session_history(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Get recent sessions."""
        cursor = await self._db.execute(
            """SELECT id, strategy, bankroll, market_slug, started_at,
                      ended_at, final_pnl, final_grade
               FROM sessions ORDER BY started_at DESC LIMIT ?""",
            (limit,),
        )
        rows = await cursor.fetchall()
        return [
            {
                "id": r[0], "strategy": r[1], "bankroll": r[2],
                "market_slug": r[3], "started_at": r[4], "ended_at": r[5],
                "final_pnl": r[6], "final_grade": r[7],
            }
            for r in rows
        ]

    async def get_session_trades(self, session_id: int) -> List[Dict[str, Any]]:
        """Get all trades for a session."""
        cursor = await self._db.execute(
            """SELECT token_id, side, price, size, cost, timestamp
               FROM trades WHERE session_id=? ORDER BY timestamp""",
            (session_id,),
        )
        rows = await cursor.fetchall()
        return [
            {
                "token_id": r[0], "side": r[1], "price": r[2],
                "size": r[3], "cost": r[4], "timestamp": r[5],
            }
            for r in rows
        ]

    async def get_session_snapshots(self, session_id: int) -> List[Dict[str, Any]]:
        """Get portfolio snapshots for a session (for PnL curve)."""
        cursor = await self._db.execute(
            """SELECT timestamp, bankroll, realized_pnl, unrealized_pnl,
                      total_pnl, num_trades, win_rate, sharpe, ev, max_drawdown_pct
               FROM portfolio_snapshots WHERE session_id=? ORDER BY timestamp""",
            (session_id,),
        )
        rows = await cursor.fetchall()
        return [
            {
                "timestamp": r[0], "bankroll": r[1], "realized_pnl": r[2],
                "unrealized_pnl": r[3], "total_pnl": r[4], "num_trades": r[5],
                "win_rate": r[6], "sharpe": r[7], "ev": r[8], "max_drawdown_pct": r[9],
            }
            for r in rows
        ]

    async def get_last_session(self) -> Optional[Dict[str, Any]]:
        """Get the most recent session (for --resume)."""
        sessions = await self.get_session_history(limit=1)
        return sessions[0] if sessions else None
