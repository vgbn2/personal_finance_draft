from __future__ import annotations

import sqlite3
import subprocess
from datetime import datetime
from pathlib import Path
from typing import List

from .ai_client import generate_ai_reflection
from .db import get_recent_days
from .models import DayEntry


ROOT = Path(__file__).resolve().parent
DB_FILE = ROOT / "tracker.db"


WORKSPACE_COMMANDS = [
    ("Open VS Code here", ["code", str(ROOT.parent)]),
    ("Run start_tracker.bat", [str(ROOT.parent / "start_tracker.bat")]),
]


def _print_header(title: str) -> None:
    print("\n" + "=" * 60)
    print(title)
    print("=" * 60)


def summarize_recent_days() -> None:
    """Ask the local model to summarize last few days and suggest focus."""
    days: List[DayEntry] = get_recent_days(limit=5)
    if not days:
        print("No days logged yet in tracker.db.")
        return

    # Build a synthetic "summary" entry so we can reuse the existing AI client.
    merged_learned = "\n\n".join(
        f"{d.date} – learned:\n{d.learned}" for d in reversed(days)
    )
    merged_wins = "\n\n".join(
        f"{d.date} – tried/attempted:\n{d.wins}" for d in reversed(days)
    )
    merged_struggles = "\n\n".join(
        f"{d.date} – struggles:\n{d.struggles}" for d in reversed(days)
    )

    synthetic = DayEntry.new(
        date=datetime.utcnow().strftime("%Y-%m-%d"),
        learned=merged_learned,
        wins=merged_wins,
        struggles=merged_struggles,
        day_score=int(sum(d.day_score for d in days) / len(days)),
        energy=int(sum(d.energy for d in days) / len(days)),
        degree_progress_pct=days[0].degree_progress_pct,
    )

    _print_header("Jarvius – Last few days overview")
    for d in days:
        print(
            f"{d.date} | score {d.day_score:3d} | energy {d.energy} | degree {d.degree_progress_pct:.1f}%"
        )

    print("\nAsking local model for a concise overview and focus for today...\n")
    reflection = generate_ai_reflection(synthetic)
    print(reflection)


def orchestrate_workspace() -> None:
    """
    Offer to run a few workspace commands as a 'gatekeeper' to coding.

    You are always asked for confirmation; nothing runs automatically.
    """
    _print_header("Jarvius – Workspace orchestration")
    print("I can launch some tools for you. Nothing runs without your 'y'.\n")

    for idx, (label, cmd) in enumerate(WORKSPACE_COMMANDS, start=1):
        print(f"{idx}. {label}")
        print(f"   Command: {cmd}")
        ans = input("   Run this? [y/N]: ").strip().lower()
        if ans == "y":
            try:
                subprocess.Popen(cmd, cwd=str(ROOT.parent))
                print("   -> Launched.\n")
            except Exception as exc:  # noqa: BLE001
                print(f"   -> Failed to launch: {exc}\n")
        else:
            print("   -> Skipped.\n")


def main() -> None:
    _print_header("Jarvius – Local assistant")
    print("Using tracker.db as your life log.\n")

    while True:
        print("Menu:")
        print("  1) Summarize my recent performance")
        print("  2) Orchestrate workspace (launch tools)")
        print("  3) Exit")

        choice = input("\nSelect option: ").strip()
        if choice == "1":
            summarize_recent_days()
        elif choice == "2":
            orchestrate_workspace()
        elif choice == "3":
            break
        else:
            print("Unknown choice.\n")


if __name__ == "__main__":
    main()

