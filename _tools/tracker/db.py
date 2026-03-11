from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta
from pathlib import Path
from typing import Generator, Iterable, List, Optional, Tuple

from .models import DayEntry


DB_FILE = Path(__file__).with_name("tracker.db")


def _dict_factory(cursor: sqlite3.Cursor, row: sqlite3.Row) -> dict:
    return {col[0]: row[idx] for idx, col in enumerate(cursor.description)}


@contextmanager
def get_connection() -> Generator[sqlite3.Connection, None, None]:
    conn = sqlite3.connect(DB_FILE)
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS days (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL UNIQUE,
                learned TEXT,
                wins TEXT,
                struggles TEXT,
                day_score INTEGER,
                energy INTEGER,
                degree_progress_pct REAL,
                ai_reflection TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS degree_progress (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                percent_complete REAL NOT NULL
            )
            """
        )

        # Backwards-compatible migration: ensure ai_reflection column exists.
        cur.execute("PRAGMA table_info(days)")
        columns = [row[1] for row in cur.fetchall()]
        if "ai_reflection" not in columns:
            cur.execute("ALTER TABLE days ADD COLUMN ai_reflection TEXT")


def upsert_day_entry(entry: DayEntry) -> None:
    now = datetime.utcnow().isoformat(timespec="seconds")
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO days (
                date, learned, wins, struggles, day_score, energy,
                degree_progress_pct, ai_reflection, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(date) DO UPDATE SET
                learned = excluded.learned,
                wins = excluded.wins,
                struggles = excluded.struggles,
                day_score = excluded.day_score,
                energy = excluded.energy,
                degree_progress_pct = excluded.degree_progress_pct,
                ai_reflection = excluded.ai_reflection,
                updated_at = excluded.updated_at
            """,
            (
                entry.date,
                entry.learned,
                entry.wins,
                entry.struggles,
                entry.day_score,
                entry.energy,
                entry.degree_progress_pct,
                entry.ai_reflection,
                entry.created_at,
                now,
            ),
        )

        if entry.degree_progress_pct is not None:
            cur.execute(
                """
                INSERT INTO degree_progress (date, percent_complete)
                VALUES (?, ?)
                """,
                (entry.date, entry.degree_progress_pct),
            )


def get_day_entry_by_date(date_str: str) -> Optional[DayEntry]:
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT
                id, date, learned, wins, struggles,
                day_score, energy, degree_progress_pct,
                ai_reflection, created_at, updated_at
            FROM days
            WHERE date = ?
            """,
            (date_str,),
        )
        row = cur.fetchone()
        if row is None:
            return None
        return DayEntry.from_row(row)


def get_recent_days(limit: int = 30) -> List[DayEntry]:
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT
                id, date, learned, wins, struggles,
                day_score, energy, degree_progress_pct,
                ai_reflection, created_at, updated_at
            FROM days
            ORDER BY date DESC
            LIMIT ?
            """,
            (limit,),
        )
        rows = cur.fetchall()
        return [DayEntry.from_row(r) for r in rows]


def get_degree_trend(days_back: int = 30) -> List[Tuple[str, float]]:
    since = (datetime.utcnow() - timedelta(days=days_back)).strftime("%Y-%m-%d")
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT date, percent_complete
            FROM degree_progress
            WHERE date >= ?
            ORDER BY date ASC
            """,
            (since,),
        )
        return [(row[0], float(row[1])) for row in cur.fetchall()]

