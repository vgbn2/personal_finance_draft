"""
Sentinel-MT5 — TimescaleDB Trade Logger
=========================================
Stores trade events for AI retraining and audit.

Gracefully degrades to console logging if the database
is unavailable.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from .config import Config

log = logging.getLogger("sentinel.db")


class TradeLogger:
    """
    Logs trades to a TimescaleDB ``trade_logs`` hypertable.

    If the database connection fails, logs are printed to
    the console so no data is silently lost.
    """

    _CREATE_TABLE = """
    CREATE TABLE IF NOT EXISTS trade_logs (
        time           TIMESTAMPTZ    NOT NULL,
        ticket         BIGINT,
        symbol         TEXT,
        type           TEXT,
        price          DOUBLE PRECISION,
        ai_confidence  FLOAT,
        profit         DOUBLE PRECISION
    );
    """

    _CREATE_HYPER = """
    SELECT create_hypertable('trade_logs', 'time',
                             if_not_exists => TRUE);
    """

    _INSERT = """
    INSERT INTO trade_logs (time, ticket, symbol, type, price, ai_confidence, profit)
    VALUES (%s, %s, %s, %s, %s, %s, %s);
    """

    _SELECT_RECENT = """
    SELECT * FROM trade_logs
    WHERE symbol = %s
    ORDER BY time DESC
    LIMIT %s;
    """

    def __init__(self, dsn: str | None = None):
        self._dsn = dsn or Config.DB_DSN
        self._conn = None
        self._available = False
        self._connect()

    # ── Connection ────────────────────────────────────────────

    def _connect(self) -> None:
        try:
            import psycopg2
            self._conn = psycopg2.connect(self._dsn)
            self._conn.autocommit = True
            self._available = True
            self._ensure_table()
            log.info("TimescaleDB connected ✓")
        except Exception as exc:
            log.warning(
                "TimescaleDB unavailable (%s) — logging to console only",
                exc,
            )
            self._available = False

    def _ensure_table(self) -> None:
        if not self._available:
            return
        with self._conn.cursor() as cur:
            cur.execute(self._CREATE_TABLE)
            try:
                cur.execute(self._CREATE_HYPER)
            except Exception:
                pass  # hypertable may already exist or extension missing

    # ── Write ─────────────────────────────────────────────────

    def log_trade(
        self,
        ticket: int,
        symbol: str,
        trade_type: str,
        price: float,
        ai_confidence: float,
        profit: float = 0.0,
    ) -> None:
        """Insert a trade record."""
        now = datetime.now(timezone.utc)

        if self._available:
            try:
                with self._conn.cursor() as cur:
                    cur.execute(
                        self._INSERT,
                        (now, ticket, symbol, trade_type, price,
                         ai_confidence, profit),
                    )
                log.debug("Trade %s logged to DB", ticket)
                return
            except Exception as exc:
                log.error("DB insert failed: %s", exc)

        # Fallback: console
        log.info(
            "TRADE LOG | %s | ticket=%s sym=%s type=%s price=%.5f "
            "ai=%.2f profit=%.2f",
            now.isoformat(), ticket, symbol, trade_type,
            price, ai_confidence, profit,
        )

    # ── Read ──────────────────────────────────────────────────

    def get_recent(self, symbol: str, limit: int = 200) -> list[dict]:
        """Fetch recent trades for a symbol (for retraining)."""
        if not self._available:
            return []
        try:
            with self._conn.cursor() as cur:
                cur.execute(self._SELECT_RECENT, (symbol, limit))
                cols = [d[0] for d in cur.description]
                return [dict(zip(cols, row)) for row in cur.fetchall()]
        except Exception as exc:
            log.error("DB read failed: %s", exc)
            return []

    # ── Cleanup ───────────────────────────────────────────────

    def close(self) -> None:
        if self._conn:
            self._conn.close()
