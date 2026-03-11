from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Optional


@dataclass
class DayEntry:
    id: Optional[int]
    date: str  # YYYY-MM-DD
    learned: str
    wins: str
    struggles: str
    day_score: int
    energy: int
    degree_progress_pct: float
    ai_reflection: str
    created_at: str
    updated_at: str

    @classmethod
    def from_row(cls, row: Any) -> "DayEntry":
        (
            id_,
            date,
            learned,
            wins,
            struggles,
            day_score,  # 5
            energy,  # 6
            degree_progress_pct,  # 7
            ai_reflection,  # 8
            created_at,  # 9
            updated_at,  # 10
        ) = row
        return cls(
            id=id_,
            date=date,
            learned=learned or "",
            wins=wins or "",
            struggles=struggles or "",
            day_score=day_score or 0,
            energy=energy or 0,
            degree_progress_pct=degree_progress_pct or 0.0,
            ai_reflection=ai_reflection or "",
            created_at=created_at,
            updated_at=updated_at,
        )

    @classmethod
    def new(
        cls,
        date: str,
        learned: str,
        wins: str,
        struggles: str,
        day_score: int,
        energy: int,
        degree_progress_pct: float,
    ) -> "DayEntry":
        now = datetime.utcnow().isoformat(timespec="seconds")
        return cls(
            id=None,
            date=date,
            learned=learned,
            wins=wins,
            struggles=struggles,
            day_score=day_score,
            energy=energy,
            degree_progress_pct=degree_progress_pct,
            ai_reflection="",
            created_at=now,
            updated_at=now,
        )

    def to_upsert_tuple(self) -> tuple[Any, ...]:
        return (
            self.date,
            self.learned,
            self.wins,
            self.struggles,
            self.day_score,
            self.energy,
            self.degree_progress_pct,
            self.ai_reflection,
        )

