"""
Sentinel-MT5 — SMC Strategy + Order Flow + Confluence Scoring
==============================================================
Extracted from ``mt5_engine.py`` and enhanced with:
  - Order flow tick delta (net buy vs sell from MT5 ticks)
  - Confluence scoring (0-100) with 6 weighted factors
  - Quality grading: A+ (≥85) / A (≥70) / B (≥60) / C (<60 = reject)

Top-down usage
--------------
  1. ``RegimeDetector`` provides macro bias  (external)
  2. ``SMCStrategy.full_scan()``  scores the setup
  3. Confluence gate at ``MIN_CONFLUENCE_SCORE`` decides accept/reject
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import MetaTrader5 as mt5
import numpy as np
import pandas as pd

from core.config import Config

log = logging.getLogger("sentinel.strategy")


# ══════════════════════════════════════════════════════════════
# Order Flow
# ══════════════════════════════════════════════════════════════

class OrderFlow:
    """Tick-level buy/sell imbalance from MT5."""

    @staticmethod
    def get_tick_delta(
        symbol: str,
        seconds: int = 300,
    ) -> dict:
        """
        Compute net tick delta over the last *seconds*.

        Returns
        -------
        dict with keys:
          - ``delta``    : int  — net buy - sell count
          - ``buy_vol``  : float
          - ``sell_vol`` : float
          - ``z_score``  : float — normalized delta
        """
        now = datetime.now(timezone.utc)
        start = now - timedelta(seconds=seconds)

        ticks = mt5.copy_ticks_range(
            symbol,
            start,
            now,
            mt5.COPY_TICKS_ALL,
        )

        result = {"delta": 0, "buy_vol": 0.0, "sell_vol": 0.0, "z_score": 0.0}

        if ticks is None or len(ticks) == 0:
            return result

        df = pd.DataFrame(ticks)
        if "flags" not in df.columns:
            # Fallback: estimate from price movement
            df["direction"] = np.sign(df["last"].diff().fillna(0))
            result["buy_vol"] = float((df["direction"] > 0).sum())
            result["sell_vol"] = float((df["direction"] < 0).sum())
        else:
            # MT5 tick flags: bit 2 = buy, bit 1 = sell
            buys = df[df["flags"].astype(int) & 0x04 > 0]
            sells = df[df["flags"].astype(int) & 0x02 > 0]
            result["buy_vol"] = float(
                buys["volume"].sum() if "volume" in buys.columns else len(buys)
            )
            result["sell_vol"] = float(
                sells["volume"].sum() if "volume" in sells.columns else len(sells)
            )

        result["delta"] = int(result["buy_vol"] - result["sell_vol"])

        # Z-score normalization of delta
        total = result["buy_vol"] + result["sell_vol"]
        if total > 0:
            ratio = result["delta"] / total  # range [-1, 1]
            result["z_score"] = ratio * 2.0   # scale to approx [-2, +2]

        return result


# ══════════════════════════════════════════════════════════════
# SMC Detection Methods
# ══════════════════════════════════════════════════════════════

class SMCStrategy:
    """Smart Money Concepts — enhanced with confluence scoring."""

    # ── RSI ────────────────────────────────────────────────────

    @staticmethod
    def get_rsi(symbol: str, timeframe: int, period: int = 14) -> float:
        rates = mt5.copy_rates_from_pos(symbol, timeframe, 0, period + 15)
        if rates is None or len(rates) < period + 1:
            return 50.0
        df = pd.DataFrame(rates)
        delta = df["close"].diff()
        gain = delta.where(delta > 0, 0).rolling(window=period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
        rs = gain / loss
        rsi = 100 - (100 / (1 + rs))
        val = rsi.iloc[-1]
        return float(val) if not np.isnan(val) else 50.0

    # ── Market Structure (H1) ─────────────────────────────────

    @staticmethod
    def detect_market_structure(symbol: str) -> tuple[str, float]:
        """
        Returns (bias, score).
        bias:  'bullish' | 'bearish' | 'ranging' | 'neutral'
        score: 0-25 (structure weight in confluence)
        """
        rates = mt5.copy_rates_from_pos(symbol, Config.TF_HTF, 0, 50)
        if rates is None or len(rates) < 50:
            return "neutral", 0.0

        df = pd.DataFrame(rates)
        highs = df["high"].rolling(5, center=True).max()
        lows = df["low"].rolling(5, center=True).min()
        valid_highs = highs.dropna()
        valid_lows = lows.dropna()

        if len(valid_highs) < 5:
            return "neutral", 0.0

        last_high = valid_highs.iloc[-1]
        prev_high = valid_highs.iloc[-5]
        last_low = valid_lows.iloc[-1]
        prev_low = valid_lows.iloc[-5]

        if last_high > prev_high and last_low > prev_low:
            # Strength: how clean are the HH/HL
            strength = min(25.0, 15.0 + 10.0 * (
                (last_high - prev_high) / (prev_high + 1e-12)
            ) * 1000)
            return "bullish", strength
        elif last_high < prev_high and last_low < prev_low:
            strength = min(25.0, 15.0 + 10.0 * (
                (prev_low - last_low) / (prev_low + 1e-12)
            ) * 1000)
            return "bearish", strength

        return "ranging", 5.0

    # ── FVG Detection (M15) ───────────────────────────────────

    @staticmethod
    def detect_fvg(
        symbol: str, timeframe: int, bias: str,
    ) -> tuple[dict | None, float]:
        """
        Returns (fvg_dict, score).
        score normalized by ATR to avoid overfit on pip values.
        """
        rates = mt5.copy_rates_from_pos(symbol, timeframe, 0, 30)
        if rates is None or len(rates) < 10:
            return None, 0.0

        df = pd.DataFrame(rates)

        # ATR for normalization (anti-overfit)
        tr = pd.concat([
            df["high"] - df["low"],
            (df["high"] - df["close"].shift()).abs(),
            (df["low"] - df["close"].shift()).abs(),
        ], axis=1).max(axis=1)
        atr = tr.rolling(14).mean().iloc[-1]
        if np.isnan(atr) or atr == 0:
            atr = 1e-8

        for i in range(len(df) - 2, 2, -1):
            c1, c2, c3 = df.iloc[i - 2], df.iloc[i - 1], df.iloc[i]

            if bias == "bullish" and c2["close"] > c2["open"]:
                gap = c3["low"] - c1["high"]
                if gap > 0:
                    # Normalize gap by ATR (bigger gap = stronger signal)
                    gap_quality = min(20.0, 10.0 + 10.0 * (gap / atr))
                    return (
                        {"type": "bullish", "entry": c3["low"], "sl": c1["high"]},
                        gap_quality,
                    )

            elif bias == "bearish" and c2["close"] < c2["open"]:
                gap = c1["low"] - c3["high"]
                if gap > 0:
                    gap_quality = min(20.0, 10.0 + 10.0 * (gap / atr))
                    return (
                        {"type": "bearish", "entry": c3["high"], "sl": c1["low"]},
                        gap_quality,
                    )

        return None, 0.0

    # ── AMD Phase ─────────────────────────────────────────────

    @staticmethod
    def detect_amd_phase(symbol: str) -> tuple[str, float]:
        """Returns (phase, score 0-15)."""
        rates = mt5.copy_rates_from_pos(symbol, Config.TF_MED, 0, 20)
        if rates is None:
            return "unknown", 0.0

        df = pd.DataFrame(rates)
        hl_diff = df["high"] - df["low"]
        avg_range = hl_diff.mean()
        recent_vol = hl_diff.iloc[-10:].mean()

        if recent_vol < (avg_range * 0.7):
            return "Accumulation", 10.0

        range_low = df["low"].iloc[-20:-5].min() if len(df) >= 20 else df["low"].min()
        last_low = df["low"].iloc[-1]
        last_close = df["close"].iloc[-1]

        if last_low < range_low and last_close > range_low:
            return "Manipulation", 15.0  # Highest score — ideal entry

        range_high = df["high"].iloc[-20:-5].max() if len(df) >= 20 else df["high"].max()
        last_high = df["high"].iloc[-1]

        if last_high > range_high and last_close < range_high:
            return "Manipulation", 15.0

        return "Distribution", 5.0

    # ── RSI Alignment Score ───────────────────────────────────

    @staticmethod
    def rsi_alignment_score(
        rsi_h1: float, rsi_m5: float, bias: str,
    ) -> float:
        """Returns 0-10 based on RSI confirmation."""
        if bias == "bullish":
            if rsi_h1 > 50 and rsi_m5 < 40:
                return 10.0  # Oversold on LTF with bullish HTF
            elif rsi_h1 > 50 and rsi_m5 < 50:
                return 6.0
            return 2.0
        elif bias == "bearish":
            if rsi_h1 < 50 and rsi_m5 > 60:
                return 10.0
            elif rsi_h1 < 50 and rsi_m5 > 50:
                return 6.0
            return 2.0
        return 0.0

    # ── Order Flow Score ──────────────────────────────────────

    @staticmethod
    def order_flow_score(of_data: dict, bias: str) -> float:
        """Returns 0-20 based on tick delta alignment."""
        delta = of_data.get("delta", 0)
        z = of_data.get("z_score", 0.0)

        if bias == "bullish" and delta > 0:
            return min(20.0, 10.0 + abs(z) * 5)
        elif bias == "bearish" and delta < 0:
            return min(20.0, 10.0 + abs(z) * 5)
        elif delta == 0:
            return 5.0  # Neutral
        return 0.0  # Opposing flow = zero

    # ══════════════════════════════════════════════════════════
    # Full Confluence Scanner
    # ══════════════════════════════════════════════════════════

    @classmethod
    def score_setup(
        cls,
        symbol: str,
        regime_bias: str = "neutral",
    ) -> dict | None:
        """
        Run the full SMC scan with confluence scoring.

        Parameters
        ----------
        symbol : str
        regime_bias : str
            From ``RegimeDetector``: 'bullish', 'bearish', 'neutral'

        Returns
        -------
        dict with keys: symbol, bias, fvg, confluence, quality, components
        or None if no setup found.
        """
        # 1. Market Structure (25 pts)
        bias, struct_score = cls.detect_market_structure(symbol)
        if bias in ("neutral", "ranging"):
            return None

        # 2. FVG (20 pts)
        fvg, fvg_score = cls.detect_fvg(symbol, Config.TF_MED, bias)
        if fvg is None:
            return None

        # 3. AMD Phase (15 pts)
        phase, amd_score = cls.detect_amd_phase(symbol)

        # 4. RSI Alignment (10 pts)
        rsi_h1 = cls.get_rsi(symbol, Config.TF_HTF)
        rsi_m5 = cls.get_rsi(symbol, Config.TF_LTF)
        rsi_score = cls.rsi_alignment_score(rsi_h1, rsi_m5, bias)

        # 5. Order Flow (20 pts)
        of_data = OrderFlow.get_tick_delta(symbol)
        of_score = cls.order_flow_score(of_data, bias)

        # 6. Regime Alignment (10 pts)
        if regime_bias == bias:
            regime_score = 10.0
        elif regime_bias == "neutral":
            regime_score = 5.0
        else:
            regime_score = 0.0  # Counter-regime

        # Total
        confluence = (
            struct_score + fvg_score + amd_score +
            rsi_score + of_score + regime_score
        )
        confluence = round(min(100.0, max(0.0, confluence)), 1)

        # Quality grading
        if confluence >= 85:
            quality = "A+"
        elif confluence >= 70:
            quality = "A"
        elif confluence >= Config.MIN_CONFLUENCE_SCORE:
            quality = "B"
        else:
            log.info(
                "⏭️ %s %s setup rejected — confluence %.0f < %d",
                symbol, bias, confluence, Config.MIN_CONFLUENCE_SCORE,
            )
            return None

        log.info(
            "📊 %s %s | Confluence: %.0f (%s) | "
            "Struct=%.0f FVG=%.0f AMD=%.0f RSI=%.0f OF=%.0f Regime=%.0f",
            symbol, bias, confluence, quality,
            struct_score, fvg_score, amd_score,
            rsi_score, of_score, regime_score,
        )

        return {
            "symbol": symbol,
            "bias": bias,
            "fvg": fvg,
            "confluence": confluence,
            "quality": quality,
            "phase": phase,
            "components": {
                "structure": struct_score,
                "fvg": fvg_score,
                "amd": amd_score,
                "rsi": rsi_score,
                "order_flow": of_score,
                "regime": regime_score,
            },
            "order_flow": of_data,
            "rsi_h1": rsi_h1,
            "rsi_m5": rsi_m5,
        }
