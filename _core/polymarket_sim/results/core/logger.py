"""
Polymarket Paper Trading Simulator — Logger Configuration
File-only logging when TUI is active. Console logging when TUI is off.
"""

from __future__ import annotations

import logging
import os
from logging.handlers import RotatingFileHandler
from pathlib import Path

LOG_DIR = Path(__file__).resolve().parent.parent / "logs"
LOG_FILE = LOG_DIR / "live_session.log"
LOG_FORMAT = "%(asctime)s | %(levelname)-7s | %(name)-25s | %(message)s"
LOG_LEVEL = logging.INFO
MAX_LOG_BYTES = 10 * 1024 * 1024  # 10 MB
BACKUP_COUNT = 5


def setup_logging(tui_active: bool = False):
    """
    Configure root logger.

    When TUI is active:
        - All logger output goes to file only (logs/live_session.log)
        - Console handler is removed to avoid corrupting rich.live.Live

    When TUI is NOT active:
        - Standard console + file logging
    """
    LOG_DIR.mkdir(parents=True, exist_ok=True)

    root = logging.getLogger()
    root.setLevel(LOG_LEVEL)

    # Remove any existing handlers
    root.handlers.clear()

    # ── File Handler (always active) ──────────────────────────
    file_handler = RotatingFileHandler(
        str(LOG_FILE),
        maxBytes=MAX_LOG_BYTES,
        backupCount=BACKUP_COUNT,
        encoding="utf-8",
    )
    file_handler.setLevel(LOG_LEVEL)
    file_handler.setFormatter(logging.Formatter(LOG_FORMAT))
    root.addHandler(file_handler)

    # ── Console Handler (only when TUI is OFF) ────────────────
    if not tui_active:
        console_handler = logging.StreamHandler()
        console_handler.setLevel(LOG_LEVEL)
        console_handler.setFormatter(logging.Formatter(LOG_FORMAT))
        root.addHandler(console_handler)

    return root
