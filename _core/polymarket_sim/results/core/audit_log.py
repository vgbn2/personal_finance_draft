"""
Audit Logger
============
Tracks user commands and major system events for historical reference.
Helps the user "remember what I did".
"""

import os
import datetime
from pathlib import Path

class AuditLogger:
    """Appends events to a persistent audit log."""
    
    LOG_FILE = Path(__file__).parent.parent / "data" / "logs" / "command_history.log"

    @staticmethod
    def log_command(command: str, user: str = "User"):
        """
        Log a command execution.
        
        Args:
            command: The command run (e.g., "start_all.bat", "run_tests").
            user: Who ran it (default: "User").
        """
        AuditLogger._ensure_dir()
        
        timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        entry = f"[{timestamp}] [{user}] {command}\n"
        
        try:
            with open(AuditLogger.LOG_FILE, "a", encoding="utf-8") as f:
                f.write(entry)
        except Exception as e:
            print(f"[AuditLogger] Failed to log: {e}")

    @staticmethod
    def _ensure_dir():
        """Ensure the log directory exists."""
        AuditLogger.LOG_FILE.parent.mkdir(parents=True, exist_ok=True)

if __name__ == "__main__":
    # Test CLI usage
    import sys
    if len(sys.argv) > 1:
        AuditLogger.log_command(" ".join(sys.argv[1:]))
