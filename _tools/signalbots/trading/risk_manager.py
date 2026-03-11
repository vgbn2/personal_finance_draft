"""
Sentinel-MT5 — Risk Manager (Safety Gate)
==========================================
Enforces hard risk rules **before** every ``order_send()``.
If any check fails, the trade is blocked and logged.

Checks
------
  1. Max Drawdown     — blocks if equity < peak × (1 - MAX_DRAWDOWN_PCT)
  2. Daily Loss Cap   — blocks if today's realized loss ≥ MAX_DAILY_LOSS_PCT
  3. Duplicate Guard  — blocks if open position already exists on this symbol
  4. Session Filter   — blocks during daily rollover & weekends
  5. Spread Filter    — blocks if spread > MAX_SPREAD_MULT × average spread
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

import MetaTrader5 as mt5

from core.config import Config

log = logging.getLogger("sentinel.risk")


class RiskManager:
    """
    Pre-trade safety gate.  Call ``gate(symbol)`` before every
    ``order_send()``.  Returns ``True`` only if all checks pass.
    """

    def __init__(self) -> None:
        self._peak_equity: float = 0.0
        self._daily_loss: float = 0.0
        self._daily_date: str = ""
        self._halted: bool = False
        self._halt_reason: str = ""
        # snapshot peak on startup
        self._refresh_peak()

    # ══════════════════════════════════════════════════════════════
    # Public API
    # ══════════════════════════════════════════════════════════════

    def gate(self, symbol: str) -> tuple[bool, str]:
        """
        Run all safety checks for *symbol*.

        Returns
        -------
        (allowed, reason) :
            ``(True, "")`` if the trade may proceed.
            ``(False, "reason string")`` if the trade is blocked.
        """
        if self._halted:
            return False, f"HALTED: {self._halt_reason}"

        # 1. Drawdown
        ok, reason = self._check_drawdown()
        if not ok:
            self._halt(reason)
            return False, reason

        # 2. Daily loss
        ok, reason = self._check_daily_loss()
        if not ok:
            self._halt(reason)
            return False, reason

        # 3. Duplicate position
        ok, reason = self._check_duplicate(symbol)
        if not ok:
            return False, reason  # not a halt, just skip this symbol

        # 4. Session window
        ok, reason = self._check_session()
        if not ok:
            return False, reason

        # 5. Spread
        ok, reason = self._check_spread(symbol)
        if not ok:
            return False, reason

        return True, ""

    def reset_halt(self) -> None:
        """Manual override to resume trading after a halt."""
        self._halted = False
        self._halt_reason = ""
        self._refresh_peak()
        log.warning("⚠️ Risk halt manually reset — trading resumed")

    # ══════════════════════════════════════════════════════════════
    # Check 1 — Max Drawdown
    # ══════════════════════════════════════════════════════════════

    def _refresh_peak(self) -> None:
        acct = mt5.account_info()
        if acct:
            self._peak_equity = max(self._peak_equity, acct.equity)

    def _check_drawdown(self) -> tuple[bool, str]:
        acct = mt5.account_info()
        if not acct:
            return False, "Cannot read account info"

        equity = acct.equity
        self._peak_equity = max(self._peak_equity, equity)

        if self._peak_equity == 0:
            return True, ""

        drawdown_pct = 1.0 - (equity / self._peak_equity)

        if drawdown_pct >= Config.MAX_DRAWDOWN_PCT:
            return False, (
                f"MAX DRAWDOWN BREACHED: {drawdown_pct:.1%} "
                f"(limit {Config.MAX_DRAWDOWN_PCT:.0%}) | "
                f"Equity ${equity:,.2f} / Peak ${self._peak_equity:,.2f}"
            )
        return True, ""

    # ══════════════════════════════════════════════════════════════
    # Check 2 — Daily Loss Cap
    # ══════════════════════════════════════════════════════════════

    def _check_daily_loss(self) -> tuple[bool, str]:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        # Reset counter at midnight
        if today != self._daily_date:
            self._daily_date = today
            self._daily_loss = 0.0

        # Query today's realized PnL from MT5 history
        from datetime import timedelta
        start = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0,
        )
        end = datetime.now(timezone.utc) + timedelta(minutes=1)
        deals = mt5.history_deals_get(start, end)

        if deals:
            # Only count deals from THIS bot
            bot_loss = sum(
                d.profit for d in deals
                if d.magic == Config.MAGIC_NUMBER and d.profit < 0
            )
            self._daily_loss = abs(bot_loss)

        acct = mt5.account_info()
        if not acct or acct.balance == 0:
            return True, ""

        daily_loss_pct = self._daily_loss / acct.balance

        if daily_loss_pct >= Config.MAX_DAILY_LOSS_PCT:
            return False, (
                f"DAILY LOSS BREACHED: {daily_loss_pct:.1%} "
                f"(limit {Config.MAX_DAILY_LOSS_PCT:.0%}) | "
                f"Lost ${self._daily_loss:,.2f} today"
            )
        return True, ""

    # ══════════════════════════════════════════════════════════════
    # Check 3 — Duplicate Position Guard
    # ══════════════════════════════════════════════════════════════

    def _check_duplicate(self, symbol: str) -> tuple[bool, str]:
        positions = mt5.positions_get(symbol=symbol)
        if positions is None:
            return True, ""

        bot_positions = [
            p for p in positions if p.magic == Config.MAGIC_NUMBER
        ]
        if len(bot_positions) >= Config.MAX_OPEN_PER_SYMBOL:
            return False, (
                f"DUPLICATE BLOCKED: {len(bot_positions)} open on {symbol} "
                f"(limit {Config.MAX_OPEN_PER_SYMBOL})"
            )
        return True, ""

    # ══════════════════════════════════════════════════════════════
    # Check 4 — Session Filter (Rollover + Weekend)
    # ══════════════════════════════════════════════════════════════

    def _check_session(self) -> tuple[bool, str]:
        now = datetime.now(timezone.utc)

        # Weekend check (Saturday=5, Sunday=6)
        if now.weekday() in (5, 6):
            return False, "WEEKEND: Markets closed — no orders"

        # Rollover window (default 22:00-23:00 UTC ≈ 17:00-18:00 EST)
        hour = now.hour
        if Config.ROLLOVER_START_UTC <= hour < Config.ROLLOVER_END_UTC:
            return False, (
                f"ROLLOVER WINDOW: {Config.ROLLOVER_START_UTC}:00–"
                f"{Config.ROLLOVER_END_UTC}:00 UTC — spreads elevated"
            )

        return True, ""

    # ══════════════════════════════════════════════════════════════
    # Check 5 — Spread Filter
    # ══════════════════════════════════════════════════════════════

    def _check_spread(self, symbol: str) -> tuple[bool, str]:
        tick = mt5.symbol_info_tick(symbol)
        info = mt5.symbol_info(symbol)
        if not tick or not info:
            return True, ""  # can't check ⟹ allow

        current_spread = tick.ask - tick.bid
        avg_spread = info.spread_float if hasattr(info, "spread_float") else (
            info.spread * info.point
        )

        if avg_spread == 0:
            return True, ""

        spread_mult = current_spread / avg_spread

        if spread_mult > Config.MAX_SPREAD_MULT:
            return False, (
                f"SPREAD TOO WIDE on {symbol}: {spread_mult:.1f}× average "
                f"(limit {Config.MAX_SPREAD_MULT:.0f}×) | "
                f"Current {current_spread:.5f} vs avg {avg_spread:.5f}"
            )
        return True, ""

    # ══════════════════════════════════════════════════════════════
    # Internal
    # ══════════════════════════════════════════════════════════════

    def _halt(self, reason: str) -> None:
        """Emergency stop — no more trades until manual reset."""
        self._halted = True
        self._halt_reason = reason
        log.critical("🛑 TRADING HALTED: %s", reason)
