"""
Sentinel-MT5 — Regime Detector (Top-Down Analysis)
====================================================
Combines Elliott Wave (technical) with Macro Economic bias
(fundamental) for market regime classification.

Output
------
  RISK_ON  — impulse trend + macro alignment → full risk
  RISK_OFF — corrective phase or macro conflict → half risk
  NEUTRAL  — no clear signal → scalp only, no swings

Usage
-----
  - **Scalp mode**: regime is a filter (skip RISK_OFF)
  - **Swing mode**: regime drives direction + sizing
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import NamedTuple

import MetaTrader5 as mt5
import numpy as np
import pandas as pd

from core.config import Config
from integrations.macro_fetcher import MacroFetcher

log = logging.getLogger("sentinel.regime")


# ══════════════════════════════════════════════════════════════
# Elliott Wave — Simplified Pivot-Based Detection
# ══════════════════════════════════════════════════════════════

class ElliottWave:
    """
    ATR-adaptive zigzag pivot counting on H4.

    Avoids overfit by:
      - Using ATR-based thresholds (not fixed pips)
      - Counting structure only (not labeling exact wave numbers)
      - Requiring minimum 3 pivots before classifying
    """

    @staticmethod
    def _find_pivots(
        df: pd.DataFrame,
        atr: float,
        min_swing: float = 1.5,
    ) -> list[dict]:
        """
        Zigzag pivot detection with ATR-adaptive threshold.

        Parameters
        ----------
        min_swing : float
            Minimum swing size as multiple of ATR.
        """
        threshold = atr * min_swing
        pivots: list[dict] = []
        direction = 0  # 0=unset, 1=looking for high, -1=looking for low
        last_val = df["close"].iloc[0]
        last_idx = 0

        for i in range(1, len(df)):
            high = df["high"].iloc[i]
            low = df["low"].iloc[i]

            if direction == 0:
                if high - last_val > threshold:
                    direction = 1
                    last_val = high
                    last_idx = i
                elif last_val - low > threshold:
                    direction = -1
                    last_val = low
                    last_idx = i

            elif direction == 1:  # Looking for higher high
                if high > last_val:
                    last_val = high
                    last_idx = i
                elif last_val - low > threshold:
                    pivots.append({
                        "type": "high",
                        "price": last_val,
                        "index": last_idx,
                    })
                    direction = -1
                    last_val = low
                    last_idx = i

            elif direction == -1:  # Looking for lower low
                if low < last_val:
                    last_val = low
                    last_idx = i
                elif high - last_val > threshold:
                    pivots.append({
                        "type": "low",
                        "price": last_val,
                        "index": last_idx,
                    })
                    direction = 1
                    last_val = high
                    last_idx = i

        # Final pivot
        if direction != 0:
            pivots.append({
                "type": "high" if direction == 1 else "low",
                "price": last_val,
                "index": last_idx,
            })

        return pivots

    @staticmethod
    def classify(symbol: str) -> dict:
        """
        Classify Elliott Wave state on H4.

        Returns
        -------
        dict with:
          - ``phase``: 'impulse' | 'corrective' | 'unknown'
          - ``direction``: 'bullish' | 'bearish' | 'neutral'
          - ``wave_count``: int — number of confirmed swings
          - ``exhaustion``: bool — True if 5+ swings (potential reversal)
        """
        result = {
            "phase": "unknown",
            "direction": "neutral",
            "wave_count": 0,
            "exhaustion": False,
        }

        rates = mt5.copy_rates_from_pos(symbol, mt5.TIMEFRAME_H4, 0, 200)
        if rates is None or len(rates) < 50:
            return result

        df = pd.DataFrame(rates)

        # ATR for adaptive thresholds
        tr = pd.concat([
            df["high"] - df["low"],
            (df["high"] - df["close"].shift()).abs(),
            (df["low"] - df["close"].shift()).abs(),
        ], axis=1).max(axis=1)
        atr = tr.rolling(14).mean().iloc[-1]

        if np.isnan(atr) or atr == 0:
            return result

        pivots = ElliottWave._find_pivots(df, atr)

        if len(pivots) < 3:
            return result

        result["wave_count"] = len(pivots)

        # Analyze last 5 pivots for trend
        recent = pivots[-5:] if len(pivots) >= 5 else pivots
        highs = [p["price"] for p in recent if p["type"] == "high"]
        lows = [p["price"] for p in recent if p["type"] == "low"]

        hh = len(highs) >= 2 and all(
            highs[i] > highs[i - 1] for i in range(1, len(highs))
        )
        hl = len(lows) >= 2 and all(
            lows[i] > lows[i - 1] for i in range(1, len(lows))
        )
        lh = len(highs) >= 2 and all(
            highs[i] < highs[i - 1] for i in range(1, len(highs))
        )
        ll = len(lows) >= 2 and all(
            lows[i] < lows[i - 1] for i in range(1, len(lows))
        )

        if hh and hl:
            result["phase"] = "impulse"
            result["direction"] = "bullish"
        elif lh and ll:
            result["phase"] = "impulse"
            result["direction"] = "bearish"
        else:
            result["phase"] = "corrective"
            # Determine last direction from most recent pivot
            last = recent[-1]
            result["direction"] = (
                "bullish" if last["type"] == "low" else "bearish"
            )

        # Exhaustion: 5+ swings in same direction = overextended
        if result["wave_count"] >= 5 and result["phase"] == "impulse":
            result["exhaustion"] = True

        return result


# ══════════════════════════════════════════════════════════════
# Macro Economic Bias
# ══════════════════════════════════════════════════════════════

class MacroBias:
    """
    Macro economic bias per currency, auto-fetched from FRED API.

    Falls back to static data if FRED is unreachable.
    Data refreshes every 24 hours via ``MacroFetcher``.

    Scores: +2 hawkish, +1 mild hawk, 0 neutral, -1 mild dove, -2 dovish
    """

    _fetcher: MacroFetcher | None = None

    # ── Static fallback (used until first FRED fetch succeeds) ──
    _DATA: dict[str, dict] = {
        "USD": {"rate": 5.25, "gdp_yoy": 2.8, "cpi_yoy": 3.1, "bias": 1},
        "EUR": {"rate": 4.50, "gdp_yoy": 0.5, "cpi_yoy": 2.4, "bias": 0},
        "GBP": {"rate": 5.25, "gdp_yoy": 0.1, "cpi_yoy": 4.0, "bias": 1},
        "JPY": {"rate": 0.25, "gdp_yoy": 1.9, "cpi_yoy": 2.8, "bias": -2},
        "AUD": {"rate": 4.35, "gdp_yoy": 1.5, "cpi_yoy": 3.4, "bias": 0},
        "CAD": {"rate": 5.00, "gdp_yoy": 1.1, "cpi_yoy": 2.9, "bias": 0},
        "CHF": {"rate": 1.75, "gdp_yoy": 0.7, "cpi_yoy": 1.4, "bias": -1},
    }

    @classmethod
    def _ensure_fetcher(cls) -> None:
        """Lazy-init the FRED fetcher on first call."""
        if cls._fetcher is None:
            cls._fetcher = MacroFetcher()

    @classmethod
    def refresh(cls) -> None:
        """Force refresh macro data from FRED API."""
        cls._ensure_fetcher()
        assert cls._fetcher is not None
        fresh = cls._fetcher.get_all()
        if fresh:
            cls._DATA = fresh
            log.info("Macro data auto-refreshed from FRED (%d currencies)", len(fresh))

    @classmethod
    def get_pair_bias(cls, symbol: str) -> dict:
        """
        Compute directional macro bias for a forex pair.
        Auto-refreshes from FRED on first call.

        For gold (XAUUSD): inverse-correlated to USD strength.
        For crypto (BTCUSD): risk-on sentiment proxy.
        """
        # Auto-refresh (fetcher handles 24h caching internally)
        cls._ensure_fetcher()
        assert cls._fetcher is not None
        fresh = cls._fetcher.get_all()
        if fresh:
            cls._DATA = fresh

        result = {
            "direction": "neutral",
            "strength": 0.0,
            "base_bias": 0,
            "quote_bias": 0,
        }

        diff = 0  # Initialize

        # Special assets
        if "XAU" in symbol:
            usd = cls._DATA.get("USD", {})
            usd_bias = usd.get("bias", 0)
            diff = -usd_bias
            result["base_bias"] = diff
            result["quote_bias"] = usd_bias
        elif "BTC" in symbol:
            usd = cls._DATA.get("USD", {})
            diff = -usd.get("bias", 0)
            result["base_bias"] = diff
            result["quote_bias"] = usd.get("bias", 0)
        else:
            base_ccy = symbol[:3]
            quote_ccy = symbol[3:6]
            base = cls._DATA.get(base_ccy, {})
            quote = cls._DATA.get(quote_ccy, {})
            b_bias = base.get("bias", 0)
            q_bias = quote.get("bias", 0)
            diff = b_bias - q_bias
            result["base_bias"] = b_bias
            result["quote_bias"] = q_bias

        if diff > 0:
            result["direction"] = "bullish"
            result["strength"] = min(abs(diff) / 4.0, 1.0)
        elif diff < 0:
            result["direction"] = "bearish"
            result["strength"] = min(abs(diff) / 4.0, 1.0)
        else:
            result["direction"] = "neutral"
            result["strength"] = 0.0

        return result

    @classmethod
    def update_data(cls, currency: str, **kwargs) -> None:
        """Manual override for a currency at runtime."""
        if currency not in cls._DATA:
            cls._DATA[currency] = {}
        cls._DATA[currency].update(kwargs)
        log.info("Macro data manual override: %s → %s", currency, cls._DATA[currency])


# ══════════════════════════════════════════════════════════════
# Combined Regime Detector
# ══════════════════════════════════════════════════════════════

class RegimeResult(NamedTuple):
    regime: str          # RISK_ON, RISK_OFF, NEUTRAL
    direction: str       # bullish, bearish, neutral
    elliott: dict        # Raw Elliott Wave data
    macro: dict          # Raw macro bias data
    swing_eligible: bool # True if conditions support swing entry


class RegimeDetector:
    """
    Top-down regime classifier.

    Combines H4 Elliott Wave structure with macro economic bias
    to produce a single regime label used to filter/size trades.
    """

    @staticmethod
    def detect(symbol: str) -> RegimeResult:
        """Run full top-down analysis for *symbol*."""

        # 1. Elliott Wave on H4
        elliott = ElliottWave.classify(symbol)

        # 2. Macro Bias
        macro = MacroBias.get_pair_bias(symbol)

        # 3. Combine
        regime = "NEUTRAL"
        direction = "neutral"
        swing_eligible = False

        ew_dir = elliott["direction"]
        macro_dir = macro["direction"]
        ew_phase = elliott["phase"]

        if ew_phase == "impulse" and not elliott["exhaustion"]:
            if ew_dir == macro_dir:
                # Full alignment: trend + fundamental
                regime = "RISK_ON"
                direction = ew_dir
                swing_eligible = True
            elif macro_dir == "neutral":
                # Trend but no macro conviction
                regime = "RISK_ON"
                direction = ew_dir
                swing_eligible = False  # Scalp only
            else:
                # Trend against macro → cautious
                regime = "RISK_OFF"
                direction = ew_dir
                swing_eligible = False
        elif ew_phase == "corrective":
            regime = "RISK_OFF"
            direction = macro_dir if macro_dir != "neutral" else "neutral"
            swing_eligible = False
        elif elliott["exhaustion"]:
            # Wave 5+ exhaustion — potential reversal
            regime = "RISK_OFF"
            direction = "neutral"
            swing_eligible = False
        else:
            regime = "NEUTRAL"
            direction = macro_dir if macro["strength"] > 0.5 else "neutral"

        log.info(
            "🌍 %s Regime: %s | Dir: %s | EW: %s-%s (waves=%d, exhaust=%s) | "
            "Macro: %s (str=%.1f) | Swing: %s",
            symbol, regime, direction,
            ew_phase, ew_dir, elliott["wave_count"], elliott["exhaustion"],
            macro_dir, macro["strength"],
            "✅" if swing_eligible else "❌",
        )

        return RegimeResult(
            regime=regime,
            direction=direction,
            elliott=elliott,
            macro=macro,
            swing_eligible=swing_eligible,
        )
