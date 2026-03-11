"""
Sentinel-MT5 — Feature Engineering Pipeline (Anti-Overfit)
============================================================
Builds the input tensor for the LSTM Trade Scorer.

Tensor shape: ``(1, lookback, 4)``

Features (all z-score normalized, clipped [-3σ, +3σ])
------------------------------------------------------
  0. Z-score of price returns    (20-bar rolling)
  1. Z-score of volume change    (20-bar rolling)
  2. ATR ratio (fast 5 / slow 20)  — volatility regime
  3. VWAP deviation              — mean-reversion signal

Anti-Overfit Measures
---------------------
  - Z-score normalization → stationary, scale-invariant
  - Outlier clipping at 3σ → prevents extreme values
  - Rolling windows (not fixed lookback) → adapts to regime
  - No look-ahead bias → all features use [0, t] data only
"""
from __future__ import annotations

import logging

import MetaTrader5 as mt5
import numpy as np

from core.config import Config

log = logging.getLogger("sentinel.features")


class FeatureEngine:
    """
    Fetches recent candles from MT5 and builds the AI input tensor
    with z-score normalized, anti-overfit features.
    """

    ZSCORE_WINDOW: int = 20   # Rolling window for normalization
    CLIP_SIGMA: float = 3.0   # Max z-score magnitude
    ATR_FAST: int = 5
    ATR_SLOW: int = 20

    def __init__(
        self,
        lookback: int = Config.AI_LOOKBACK,
        n_features: int = Config.AI_FEATURES,
    ):
        self._lookback = lookback
        self._n_features = n_features

    # ── Public ────────────────────────────────────────────────


    def get_tensor(
        self,
        symbol: str,
        timeframe: int = Config.TF_MED,
    ) -> np.ndarray:
        """
        Build the anti-overfit feature tensor for *symbol*.
        Fetches live data from MT5.
        """
        # Extra bars for rolling windows
        warmup = max(self.ZSCORE_WINDOW, self.ATR_SLOW) + 5
        bars_needed = self._lookback + warmup
        rates = mt5.copy_rates_from_pos(symbol, timeframe, 0, bars_needed)

        if rates is None or len(rates) < bars_needed:
            raise ValueError(
                f"{symbol}: only {0 if rates is None else len(rates)} "
                f"bars available, need {bars_needed}"
            )

        # Convert to numpy arrays
        close = np.array([r["close"] for r in rates], dtype=np.float64)
        high = np.array([r["high"] for r in rates], dtype=np.float64)
        low = np.array([r["low"] for r in rates], dtype=np.float64)
        volume = np.array([r["tick_volume"] for r in rates], dtype=np.float64)
        
        return self.compute_features(close, high, low, volume)

    def compute_features(
        self,
        close: np.ndarray,
        high: np.ndarray,
        low: np.ndarray,
        volume: np.ndarray
    ) -> np.ndarray:
        """
        Pure math function to compute features from raw arrays.
        Decoupled from MT5 for offline training.
        """
        # ── Feature 0: Z-score of price returns ───────────────
        returns = np.diff(close) / (close[:-1] + 1e-12)
        f0 = self._rolling_zscore(returns)

        # ── Feature 1: Z-score of volume change ───────────────
        vol_change = np.diff(volume) / (volume[:-1] + 1e-9)
        f1 = self._rolling_zscore(vol_change)

        # ── Feature 2: ATR ratio (fast / slow) ────────────────
        tr = np.maximum(
            high[1:] - low[1:],
            np.maximum(
                np.abs(high[1:] - close[:-1]),
                np.abs(low[1:] - close[:-1]),
            ),
        )
        atr_fast = self._rolling_mean(tr, self.ATR_FAST)
        atr_slow = self._rolling_mean(tr, self.ATR_SLOW)
        f2 = atr_fast / (atr_slow + 1e-12)  # Ratio, naturally bounded
        f2 = np.clip(f2, 0.0, 5.0) / 5.0    # Normalize to [0, 1]

        # ── Feature 3: VWAP deviation ─────────────────────────
        typical_price = (high[1:] + low[1:] + close[1:]) / 3.0
        cum_tp_vol = np.cumsum(typical_price * volume[1:])
        cum_vol = np.cumsum(volume[1:])
        vwap = cum_tp_vol / (cum_vol + 1e-12)
        vwap_dev = (close[1:] - vwap) / (vwap + 1e-12)
        f3 = self._rolling_zscore(vwap_dev)

        # ── Align lengths & slice to lookback ─────────────────
        min_len = min(len(f0), len(f1), len(f2), len(f3))
        f0 = f0[-self._lookback:]
        f1 = f1[-self._lookback:]
        f2 = f2[-self._lookback:]
        f3 = f3[-self._lookback:]

        # Pad if needed (shouldn't happen with enough warmup)
        for arr_name in ("f0", "f1", "f2", "f3"):
            arr = locals()[arr_name]
            if len(arr) < self._lookback:
                pad = np.zeros(self._lookback - len(arr))
                locals()[arr_name] = np.concatenate([pad, arr])

        features = np.stack([f0, f1, f2, f3], axis=-1)

        # ── Hallucination check ───────────────────────────────
        if np.isnan(features).any():
            # Replace NaN with 0 (safe neutral) rather than crashing
            nan_count = np.isnan(features).sum()
            log.warning(
                "NaN values in features — replaced with 0 (%d count)",
                nan_count,
            )
            features = np.nan_to_num(features, nan=0.0)

        assert not np.isinf(features).any(), (
            "Inf detected in feature tensor"
        )

        tensor = features[np.newaxis, :, :].astype(np.float32)
        return tensor

    # ── Helpers ───────────────────────────────────────────────

    def _rolling_zscore(self, arr: np.ndarray) -> np.ndarray:
        """
        Compute rolling z-score and clip to [-3σ, +3σ].
        Anti-overfit: scale-invariant, stationary output.
        """
        w = self.ZSCORE_WINDOW
        result = np.zeros_like(arr)

        for i in range(w, len(arr)):
            window = arr[i - w : i]
            mu = np.mean(window)
            sigma = np.std(window)
            if sigma > 1e-12:
                result[i] = (arr[i] - mu) / sigma
            else:
                result[i] = 0.0

        return np.clip(result, -self.CLIP_SIGMA, self.CLIP_SIGMA)

    @staticmethod
    def _rolling_mean(arr: np.ndarray, window: int) -> np.ndarray:
        """Simple rolling mean using cumulative sum."""
        cs = np.cumsum(arr)
        cs = np.insert(cs, 0, 0)
        result = np.zeros_like(arr)
        for i in range(window, len(arr) + 1):
            result[i - 1] = (cs[i] - cs[i - window]) / window
        return result
