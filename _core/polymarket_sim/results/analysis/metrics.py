"""
Polymarket Paper Trading Simulator — Metrics Calculator
Sharpe, EV, Win Rate, StDev — all with division-by-zero safety.
"""

from __future__ import annotations

from typing import Dict, List

import numpy as np

from ..core import config


class MetricsCalculator:
    """
    Stateless metrics calculator.  All methods use NumPy for performance.
    Every metric has explicit safety checks to avoid NaN / division-by-zero.
    """

    @staticmethod
    def compute(trade_pnls: List[float], bankroll: float = 1000.0) -> Dict[str, float]:
        """
        Compute all core metrics from a list of per-trade PnLs.

        Returns:
            dict with keys: sharpe, ev, win_rate, stdev, num_trades
        """
        n = len(trade_pnls)
        result = {
            "sharpe": 0.0,
            "ev": 0.0,
            "win_rate": 0.0,
            "stdev": 0.0,
            "num_trades": n,
        }

        if n == 0:
            return result

        arr = np.array(trade_pnls, dtype=np.float64)

        # ── Win Rate ──────────────────────────────────────────
        wins = int(np.sum(arr > 0))
        result["win_rate"] = wins / n

        # ── Expected Value (EV) per trade ─────────────────────
        result["ev"] = float(np.mean(arr))

        # ── Standard Deviation (sample) ───────────────────────
        if n >= 2:
            result["stdev"] = float(np.std(arr, ddof=1))
        else:
            result["stdev"] = 0.0

        # ── Sharpe Ratio ──────────────────────────────────────
        #    Annualised: assume ~252 trading days, ~96 fifteen-min windows/day
        #    rf_per_trade = annual_rf / (252 * 96)
        if n >= 2 and result["stdev"] > 1e-12:
            periods_per_year = 252 * 96  # 15-min windows
            rf_per_period = config.RISK_FREE_RATE / periods_per_year
            excess_mean = float(np.mean(arr)) - rf_per_period
            result["sharpe"] = (excess_mean / result["stdev"]) * np.sqrt(periods_per_year)
        else:
            result["sharpe"] = 0.0

        return result

    # ── Individual Metric Helpers ─────────────────────────────

    @staticmethod
    def sharpe(returns: List[float], rf: float = config.RISK_FREE_RATE) -> float:
        """Annualised Sharpe ratio with safety."""
        if len(returns) < 2:
            return 0.0
        arr = np.array(returns, dtype=np.float64)
        std = float(np.std(arr, ddof=1))
        if std < 1e-12:
            return 0.0
        periods_per_year = 252 * 96
        rf_per_period = rf / periods_per_year
        return float((np.mean(arr) - rf_per_period) / std * np.sqrt(periods_per_year))

    @staticmethod
    def win_rate(trade_pnls: List[float]) -> float:
        """Win rate with zero-trade guard."""
        if not trade_pnls:
            return 0.0
        arr = np.array(trade_pnls)
        return float(np.sum(arr > 0) / len(arr))

    @staticmethod
    def expected_value(trade_pnls: List[float]) -> float:
        """Expected value per trade."""
        if not trade_pnls:
            return 0.0
        return float(np.mean(trade_pnls))

    @staticmethod
    def stdev(trade_pnls: List[float]) -> float:
        """Sample standard deviation with guard."""
        if len(trade_pnls) < 2:
            return 0.0
        return float(np.std(trade_pnls, ddof=1))
