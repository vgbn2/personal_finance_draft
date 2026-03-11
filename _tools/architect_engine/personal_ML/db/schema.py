"""
Architect Engine — SQLite Schema & Initialization

Tables:
  - constraints: Engineering rules with versioning and precedence
  - sessions: Generation session logs
  - architectural_components: Technology nodes per session
  - progress_metrics: Complexity/proficiency scores per session
"""

import sqlite3
import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Dict, Any

from .. import config


# ── Starter Constraint Library ────────────────────────────

STARTER_CONSTRAINTS: List[Dict[str, Any]] = [
    {
        "id": "C001",
        "domain": "data_structures",
        "rule_text": "Use collections.deque(maxlen=N) for all fixed-size history buffers",
        "rationale": "O(1) append/pop vs O(n) list slicing",
        "precedence": 70,
    },
    {
        "id": "C002",
        "domain": "concurrency",
        "rule_text": "All asyncio coroutines require explicit asyncio.timeout() wrappers",
        "rationale": "Prevents silent hangs in production event loops",
        "precedence": 90,
    },
    {
        "id": "C003",
        "domain": "concurrency",
        "rule_text": "ZeroMQ sockets must use SNDTIMEO/RCVTIMEO to prevent deadlocks",
        "rationale": "Unbounded blocking on ZMQ sockets causes cascading timeouts",
        "precedence": 85,
    },
    {
        "id": "C004",
        "domain": "risk",
        "rule_text": "All position-sizing functions must accept max_bankroll_fraction parameter with default 0.02",
        "rationale": "Hard risk ceiling enforcement — never risk >2% of bankroll per trade",
        "precedence": 95,
    },
    {
        "id": "C005",
        "domain": "risk",
        "rule_text": "All Kelly criterion implementations must include half-Kelly conservative mode",
        "rationale": "Full Kelly is theoretically optimal but practically volatile; half-Kelly reduces variance by ~50%",
        "precedence": 90,
    },
    {
        "id": "C006",
        "domain": "typing",
        "rule_text": "Full type hints mandatory on all function signatures; use typing.TypeVar for generics",
        "rationale": "Static analysis compatibility with mypy/pyright; catches type errors before runtime",
        "precedence": 80,
    },
    {
        "id": "C007",
        "domain": "performance",
        "rule_text": "No non-vectorized loops over arrays >1000 elements; use NumPy/Pandas vectorized operations",
        "rationale": "Python loops over large arrays are 100-1000x slower than vectorized equivalents",
        "precedence": 75,
    },
    {
        "id": "C008",
        "domain": "memory",
        "rule_text": "WebSocket managers must implement explicit connection cleanup on disconnect",
        "rationale": "Leaked WebSocket connections cause file descriptor exhaustion under sustained load",
        "precedence": 85,
    },
    {
        "id": "C009",
        "domain": "testing",
        "rule_text": "All pure functions require at least one property-based test using Hypothesis",
        "rationale": "Property-based tests find edge cases that example-based tests miss",
        "precedence": 70,
    },
    {
        "id": "C010",
        "domain": "architecture",
        "rule_text": "Database connection pools must specify max_connections explicitly",
        "rationale": "Default pool sizes cause connection starvation under concurrent load",
        "precedence": 80,
    },
]


class ArchitectDB:
    """SQLite database for constraints, sessions, and telemetry."""

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or config.DB_PATH
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn: Optional[sqlite3.Connection] = None

    def connect(self) -> sqlite3.Connection:
        """Open (or return existing) connection."""
        if self._conn is None:
            self._conn = sqlite3.connect(str(self.db_path))
            self._conn.row_factory = sqlite3.Row
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("PRAGMA foreign_keys=ON")
        return self._conn

    def close(self):
        if self._conn:
            self._conn.close()
            self._conn = None

    # ── Schema Creation ──────────────────────────────────

    def init_schema(self):
        """Create all tables idempotently."""
        conn = self.connect()
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS constraints (
                id TEXT PRIMARY KEY,
                version INTEGER NOT NULL DEFAULT 1,
                domain TEXT NOT NULL,
                rule_text TEXT NOT NULL,
                rationale TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                deprecated_at TIMESTAMP,
                precedence INTEGER DEFAULT 50
            );

            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                domain TEXT NOT NULL,
                goal_summary TEXT,
                prompt_text TEXT NOT NULL,
                prompt_tokens INTEGER,
                output_tokens INTEGER,
                correction_cycles INTEGER DEFAULT 0,
                constraints_applied TEXT,
                output_hash TEXT
            );

            CREATE TABLE IF NOT EXISTS architectural_components (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT REFERENCES sessions(id),
                component_type TEXT NOT NULL,
                component_name TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS progress_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT REFERENCES sessions(id),
                complexity_score REAL,
                proficiency_score REAL,
                node_count INTEGER,
                interface_count INTEGER,
                error_rate REAL,
                computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS constraint_lineage (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT REFERENCES sessions(id),
                constraint_id TEXT REFERENCES constraints(id),
                similarity_score REAL,
                was_applied INTEGER DEFAULT 1,
                override_reason TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_constraints_domain
                ON constraints(domain);
            CREATE INDEX IF NOT EXISTS idx_sessions_timestamp
                ON sessions(timestamp);
            CREATE INDEX IF NOT EXISTS idx_sessions_domain
                ON sessions(domain);
            CREATE INDEX IF NOT EXISTS idx_lineage_session
                ON constraint_lineage(session_id);

            CREATE TABLE IF NOT EXISTS constraint_versions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                constraint_id TEXT NOT NULL,
                version INTEGER NOT NULL,
                domain TEXT NOT NULL,
                rule_text TEXT NOT NULL,
                rationale TEXT,
                precedence INTEGER,
                changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                change_reason TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_versions_constraint
                ON constraint_versions(constraint_id);
        """)
        conn.commit()

    # ── Constraint CRUD ──────────────────────────────────

    def add_constraint(
        self,
        constraint_id: str,
        domain: str,
        rule_text: str,
        rationale: str = "",
        precedence: int = 50,
    ) -> str:
        """Insert a new constraint. Returns the ID."""
        conn = self.connect()
        conn.execute(
            """INSERT OR REPLACE INTO constraints
               (id, domain, rule_text, rationale, precedence)
               VALUES (?, ?, ?, ?, ?)""",
            (constraint_id, domain, rule_text, rationale, precedence),
        )
        conn.commit()
        return constraint_id

    def get_constraint(self, constraint_id: str) -> Optional[Dict[str, Any]]:
        conn = self.connect()
        row = conn.execute(
            "SELECT * FROM constraints WHERE id = ?", (constraint_id,)
        ).fetchone()
        return dict(row) if row else None

    def list_constraints(
        self, domain: Optional[str] = None, include_deprecated: bool = False
    ) -> List[Dict[str, Any]]:
        conn = self.connect()
        query = "SELECT * FROM constraints"
        params: list = []
        conditions = []

        if domain:
            conditions.append("domain = ?")
            params.append(domain)
        if not include_deprecated:
            conditions.append("deprecated_at IS NULL")

        if conditions:
            query += " WHERE " + " AND ".join(conditions)

        query += " ORDER BY precedence DESC, domain, id"
        rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]

    def update_constraint(
        self,
        constraint_id: str,
        rule_text: Optional[str] = None,
        rationale: Optional[str] = None,
        precedence: Optional[int] = None,
        domain: Optional[str] = None,
        change_reason: str = "",
    ) -> int:
        """
        Update a constraint with version history.
        Archives the old version, increments version number, applies changes.
        Returns the new version number.
        """
        conn = self.connect()
        old = self.get_constraint(constraint_id)
        if not old:
            raise ValueError(f"Constraint {constraint_id} not found")

        old_version = old["version"]

        # Archive old version
        conn.execute(
            """INSERT INTO constraint_versions
               (constraint_id, version, domain, rule_text, rationale, precedence, change_reason)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (constraint_id, old_version, old["domain"], old["rule_text"],
             old.get("rationale", ""), old["precedence"], change_reason),
        )

        # Apply updates
        new_version = old_version + 1
        updates = {"version": new_version}
        if rule_text is not None:
            updates["rule_text"] = rule_text
        if rationale is not None:
            updates["rationale"] = rationale
        if precedence is not None:
            updates["precedence"] = precedence
        if domain is not None:
            updates["domain"] = domain

        set_clause = ", ".join(f"{k} = ?" for k in updates)
        values = list(updates.values()) + [constraint_id]
        conn.execute(
            f"UPDATE constraints SET {set_clause} WHERE id = ?", values
        )
        conn.commit()
        return new_version

    def get_constraint_history(self, constraint_id: str) -> List[Dict[str, Any]]:
        """Get version history for a constraint."""
        conn = self.connect()
        rows = conn.execute(
            """SELECT * FROM constraint_versions
               WHERE constraint_id = ?
               ORDER BY version DESC""",
            (constraint_id,),
        ).fetchall()
        return [dict(r) for r in rows]

    def deprecate_constraint(self, constraint_id: str) -> bool:
        conn = self.connect()
        cursor = conn.execute(
            "UPDATE constraints SET deprecated_at = ? WHERE id = ?",
            (datetime.now().isoformat(), constraint_id),
        )
        conn.commit()
        return cursor.rowcount > 0

    # ── Session CRUD ─────────────────────────────────────

    def create_session(
        self,
        domain: str,
        goal_summary: str = "",
    ) -> str:
        session_id = str(uuid.uuid4())[:8]
        conn = self.connect()
        conn.execute(
            """INSERT INTO sessions (id, domain, prompt_text, goal_summary)
               VALUES (?, ?, ?, ?)""",
            (session_id, domain, "", goal_summary),
        )
        conn.commit()
        return session_id

    def update_session(self, session_id: str, **kwargs):
        conn = self.connect()
        set_clauses = ", ".join(f"{k} = ?" for k in kwargs)
        values = list(kwargs.values()) + [session_id]
        conn.execute(
            f"UPDATE sessions SET {set_clauses} WHERE id = ?", values
        )
        conn.commit()

    def get_sessions(self, limit: int = 50) -> List[Dict[str, Any]]:
        conn = self.connect()
        rows = conn.execute(
            "SELECT * FROM sessions ORDER BY timestamp DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [dict(r) for r in rows]

    # ── Lineage ──────────────────────────────────────────

    def record_lineage(
        self,
        session_id: str,
        constraint_id: str,
        similarity_score: float,
        was_applied: bool = True,
        override_reason: str = "",
    ):
        conn = self.connect()
        conn.execute(
            """INSERT INTO constraint_lineage
               (session_id, constraint_id, similarity_score, was_applied, override_reason)
               VALUES (?, ?, ?, ?, ?)""",
            (session_id, constraint_id, similarity_score, int(was_applied), override_reason),
        )
        conn.commit()

    # ── Metrics ──────────────────────────────────────────

    def record_metrics(
        self,
        session_id: str,
        complexity_score: float,
        proficiency_score: float,
        node_count: int,
        interface_count: int,
        error_rate: float,
    ):
        conn = self.connect()
        conn.execute(
            """INSERT INTO progress_metrics
               (session_id, complexity_score, proficiency_score,
                node_count, interface_count, error_rate)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (session_id, complexity_score, proficiency_score,
             node_count, interface_count, error_rate),
        )
        conn.commit()

    def get_metrics_history(self, limit: int = 100) -> List[Dict[str, Any]]:
        conn = self.connect()
        rows = conn.execute(
            """SELECT pm.*, s.domain, s.goal_summary
               FROM progress_metrics pm
               JOIN sessions s ON pm.session_id = s.id
               ORDER BY pm.computed_at DESC LIMIT ?""",
            (limit,),
        ).fetchall()
        return [dict(r) for r in rows]

    # ── Seeding ──────────────────────────────────────────

    def seed_starter_constraints(self) -> int:
        """Load the starter constraint library. Returns count inserted."""
        count = 0
        for c in STARTER_CONSTRAINTS:
            existing = self.get_constraint(c["id"])
            if not existing:
                self.add_constraint(
                    constraint_id=c["id"],
                    domain=c["domain"],
                    rule_text=c["rule_text"],
                    rationale=c.get("rationale", ""),
                    precedence=c.get("precedence", 50),
                )
                count += 1
        return count
