"""
Sentinel-MT5 — Watchdog
========================
Monitors the MT5 terminal connection and force-restarts
if the broker link drops (the "Silent Disconnect" fix).
"""
from __future__ import annotations

import logging
import subprocess
import time

import MetaTrader5 as mt5

from .config import Config

log = logging.getLogger("sentinel.watchdog")


class MT5Watchdog:
    """
    Checks ``mt5.terminal_info().connected`` on a fixed interval.
    If disconnected, kills ``terminal64.exe`` and re-initialises.
    """

    def __init__(self, interval: float | None = None):
        self._interval = interval or Config.WATCHDOG_INTERVAL
        self._consecutive_failures = 0
        self._max_retries = 5

    # ── Health probe ──────────────────────────────────────────

    def is_connected(self) -> bool:
        """Return True if MT5 terminal reports a live broker link."""
        info = mt5.terminal_info()
        if info is None:
            return False
        return bool(info.connected)

    # ── Recovery ──────────────────────────────────────────────

    def restart_terminal(self) -> bool:
        """
        Force-kill terminal64.exe, wait, then re-initialise MT5.

        Returns True if the new connection succeeds.
        """
        log.warning("MT5 disconnected — restarting terminal...")

        # 1. Kill
        try:
            subprocess.call(
                ["taskkill", "/F", "/IM", "terminal64.exe"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except FileNotFoundError:
            log.error("taskkill not found (non-Windows OS?)")

        time.sleep(5)

        # 2. Re-init
        if not mt5.initialize():
            log.error("mt5.initialize() failed after restart")
            return False

        # 3. Re-login if credentials are configured
        if Config.LOGIN_ID and Config.PASSWORD:
            if not mt5.login(Config.LOGIN_ID, Config.PASSWORD, Config.SERVER):
                log.error("mt5.login() failed after restart")
                return False

        log.info("MT5 reconnected successfully ✓")
        self._consecutive_failures = 0
        return True

    # ── Main loop (blocking — run in a thread) ────────────────

    def run_loop(self) -> None:
        """
        Blocking watchdog loop.  Designed to run inside a
        ``threading.Thread(daemon=True)`` within the Engine process.
        """
        log.info(
            "Watchdog started (interval=%.0fs, max_retries=%d)",
            self._interval,
            self._max_retries,
        )
        while True:
            time.sleep(self._interval)
            if not self.is_connected():
                self._consecutive_failures += 1
                log.warning(
                    "Connection lost (%d/%d)",
                    self._consecutive_failures,
                    self._max_retries,
                )
                if self._consecutive_failures <= self._max_retries:
                    self.restart_terminal()
                else:
                    log.critical(
                        "Max retries exceeded — watchdog giving up"
                    )
                    break
            else:
                self._consecutive_failures = 0
