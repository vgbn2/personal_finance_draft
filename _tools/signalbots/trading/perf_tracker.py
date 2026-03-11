"""
Sentinel-MT5 — Performance Tracker (Self-Analysis)
====================================================
Real-time trade statistics with adaptive risk sizing.

Law of Large Numbers
--------------------
Adaptive risk only activates after ``PERF_MIN_TRADES`` (default 100)
closed trades.  Before that, ``BASE_RISK_PCT`` is used unchanged.

Adaptive Risk Logic (post-threshold)
-------------------------------------
  Win Rate > 55% AND PF > 1.5  →  risk × 1.0  (normal)
  Win Rate 40-55% OR PF 1-1.5  →  risk × 0.5  (halved)
  Win Rate < 40% OR PF < 1.0   →  risk × 0.0  (paused)

Cooldown
--------
After ``MAX_CONSEC_LOSSES`` consecutive losses, pause for
``COOLDOWN_MINUTES`` minutes.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone

import MetaTrader5 as mt5

from core.config import Config

log = logging.getLogger("sentinel.perf")


class PerfTracker:
    """
    Tracks bot-only trade performance and adjusts risk dynamically.
    Reads from MT5 deal history filtered by ``MAGIC_NUMBER``.
    """

    def __init__(self) -> None:
        self._consec_losses: int = 0
        self._cooldown_until: float = 0.0  # timestamp
        self._cache_time: float = 0.0
        self._cached_stats: dict = {}

    # ══════════════════════════════════════════════════════════
    # Public API
    # ══════════════════════════════════════════════════════════

    def get_risk_multiplier(self) -> tuple[float, str]:
        """
        Compute risk multiplier based on recent performance.

        Returns
        -------
        (multiplier, reason):
            multiplier in [0.0, 1.0]
            reason string for logging/Discord
        """
        # Cooldown check
        if time.time() < self._cooldown_until:
            remaining = int(self._cooldown_until - time.time())
            return 0.0, f"COOLDOWN: {remaining}s remaining after {Config.MAX_CONSEC_LOSSES} consecutive losses"

        stats = self._get_stats()
        total = stats["total"]

        # Law of large numbers: don't adapt until sufficient sample
        if total < Config.PERF_MIN_TRADES:
            return 1.0, f"DEFAULT: {total}/{Config.PERF_MIN_TRADES} trades (threshold not met)"

        wr = stats["win_rate"]
        pf = stats["profit_factor"]

        # Adaptive scaling
        if wr > 0.55 and pf > 1.5:
            return 1.0, f"FULL RISK: WR={wr:.0%} PF={pf:.2f} ({total} trades)"
        elif wr >= 0.40 and pf >= 1.0:
            return 0.5, f"HALF RISK: WR={wr:.0%} PF={pf:.2f} ({total} trades)"
        else:
            return 0.0, f"PAUSED: WR={wr:.0%} PF={pf:.2f} — strategy underperforming"

    def record_result(self, profit: float) -> None:
        """
        Record a trade outcome for consecutive-loss tracking.
        """
        if profit < 0:
            self._consec_losses += 1
            log.info(
                "📉 Consecutive loss #%d / %d",
                self._consec_losses, Config.MAX_CONSEC_LOSSES,
            )
            if self._consec_losses >= Config.MAX_CONSEC_LOSSES:
                self._cooldown_until = (
                    time.time() + Config.COOLDOWN_MINUTES * 60
                )
                log.warning(
                    "⏸️ COOLDOWN activated — pausing %d minutes",
                    Config.COOLDOWN_MINUTES,
                )
        else:
            if self._consec_losses > 0:
                log.info("📈 Loss streak broken at %d", self._consec_losses)
            self._consec_losses = 0

    def get_stats(self) -> dict:
        """Public accessor for current performance stats."""
        return self._get_stats()

    # ══════════════════════════════════════════════════════════
    # Internal
    # ══════════════════════════════════════════════════════════

    def _get_stats(self) -> dict:
        """
        Query MT5 deal history and compute stats.
        Cached for 60s to avoid excessive API calls.
        """
        now = time.time()
        if now - self._cache_time < 60 and self._cached_stats:
            return self._cached_stats

        stats = {
            "total": 0,
            "wins": 0,
            "losses": 0,
            "gross_profit": 0.0,
            "gross_loss": 0.0,
            "win_rate": 0.0,
            "profit_factor": 0.0,
            "net_profit": 0.0,
            "avg_win": 0.0,
            "avg_loss": 0.0,
            "expectancy": 0.0,
        }

        # Query last 30 days of deals
        end = datetime.now(timezone.utc) + timedelta(minutes=1)
        start = end - timedelta(days=30)
        deals = mt5.history_deals_get(start, end)

        if not deals:
            self._cached_stats = stats
            self._cache_time = now
            return stats

        # Filter bot-only closed trades (entry=1=OUT, profit != 0)
        closed = [
            d for d in deals
            if d.magic == Config.MAGIC_NUMBER
            and d.entry == 1  # OUT = closed position
            and d.profit != 0
        ]

        if not closed:
            self._cached_stats = stats
            self._cache_time = now
            return stats

        # Use last PERF_MIN_TRADES or all if less
        window = closed[-Config.PERF_MIN_TRADES:]

        wins = [d for d in window if d.profit > 0]
        losses = [d for d in window if d.profit < 0]

        stats["total"] = len(window)
        stats["wins"] = len(wins)
        stats["losses"] = len(losses)
        stats["gross_profit"] = sum(d.profit for d in wins)
        stats["gross_loss"] = abs(sum(d.profit for d in losses))
        stats["net_profit"] = stats["gross_profit"] - stats["gross_loss"]

        if stats["total"] > 0:
            stats["win_rate"] = stats["wins"] / stats["total"]

        if stats["gross_loss"] > 0:
            stats["profit_factor"] = stats["gross_profit"] / stats["gross_loss"]
        elif stats["gross_profit"] > 0:
            stats["profit_factor"] = 99.0  # Infinite PF capped

        if stats["wins"] > 0:
            stats["avg_win"] = stats["gross_profit"] / stats["wins"]
        if stats["losses"] > 0:
            stats["avg_loss"] = stats["gross_loss"] / stats["losses"]

        # Expectancy = (WR × AvgWin) - ((1-WR) × AvgLoss)
        stats["expectancy"] = (
            stats["win_rate"] * stats["avg_win"]
            - (1 - stats["win_rate"]) * stats["avg_loss"]
        )

        self._cached_stats = stats
        self._cache_time = now

        log.debug(
            "📊 Stats: %d trades | WR=%.0f%% | PF=%.2f | Net=$%.2f | E=$%.2f",
            stats["total"], stats["win_rate"] * 100,
            stats["profit_factor"], stats["net_profit"],
            stats["expectancy"],
        )

        return stats
