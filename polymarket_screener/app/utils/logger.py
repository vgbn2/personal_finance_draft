"""
Centralized logging for POLY/SCREEN.
- Rich console handler for terminal (pretty, colored, tracebacks)
- JSON file handler for cloud/debugging persistence
"""
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from rich.logging import RichHandler
from rich.console import Console

console = Console()

# ─── Project root for log output ───
_LOG_DIR = Path(__file__).resolve().parent.parent.parent / "logs"


class JSONFormatter(logging.Formatter):
    """Structured JSON formatter for file/cloud log shipping."""

    def format(self, record: logging.LogRecord) -> str:
        log_obj = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "func": record.funcName,
            "line": record.lineno,
        }
        if record.exc_info and record.exc_info[0]:
            log_obj["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_obj)


def setup_logger(
    name: str = "poly_screen",
    level: str = "INFO",
    log_file: str = "engine.log",
) -> logging.Logger:
    """
    Create (or return existing) logger with:
      1. Rich console handler for terminal
      2. JSON file handler for structured log persistence
    """
    logger = logging.getLogger(name)
    logger.setLevel(level)

    # Avoid duplicate handlers on reload
    if logger.handlers:
        return logger

    # ── Console handler (Rich) ──
    shell_handler = RichHandler(
        console=console,
        rich_tracebacks=True,
        markup=True,
        show_time=True,
        show_path=False,
    )
    shell_handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(shell_handler)

    # ── File handler (JSON) ──
    _LOG_DIR.mkdir(parents=True, exist_ok=True)
    file_handler = logging.FileHandler(_LOG_DIR / log_file, encoding="utf-8")
    file_handler.setFormatter(JSONFormatter())
    file_handler.setLevel(logging.DEBUG)  # Capture everything to file
    logger.addHandler(file_handler)

    return logger


# Global default logger
logger = setup_logger()
log = logger  # Shorthand used throughout the codebase
