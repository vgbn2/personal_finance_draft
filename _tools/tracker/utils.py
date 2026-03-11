from __future__ import annotations

from typing import Iterable, List, Tuple

from .models import DayEntry


def average_day_score(entries: Iterable[DayEntry]) -> float:
    scores = [e.day_score for e in entries if e.day_score is not None]
    if not scores:
        return 0.0
    return sum(scores) / len(scores)


def degree_progress_delta(history: List[Tuple[str, float]]) -> float:
    if len(history) < 2:
        return 0.0
    first = history[0][1]
    last = history[-1][1]
    return last - first

