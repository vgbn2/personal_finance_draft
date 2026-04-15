"""
Alpha Signals Components.
Implements correlation tracking and imbalance monitoring.

Uses centralized constants from app.core.shared.constants.
"""
import collections
import math
from typing import Dict

import numpy as np

from app.core.shared.constants import (
    EPSILON,
    MIN_SPREAD,
    MIN_CORRELATION_SAMPLES,
    DEFAULT_CORRELATION_WINDOW,
    MIN_LIQUIDITY_LOG_BASE,
    MIN_VOLUME_USD,
)
from app.core.models.domain_models import MarketSnapshot
from app.utils.logger import log


class CorrelationTracker:
    """
    Tracks rolling correlation between two price series.
    Useful for lead-lag detection (e.g. BTC Spot vs Polymarket).
    """
    def __init__(self, window_size: int = DEFAULT_CORRELATION_WINDOW):
        self.window_size = window_size
        self.series_a: collections.deque = collections.deque(maxlen=window_size)
        self.series_b: collections.deque = collections.deque(maxlen=window_size)
        self._correlation: float = 0.0

    def add_points(self, val_a: float, val_b: float):
        """Add new synchronized data points."""
        self.series_a.append(val_a)
        self.series_b.append(val_b)

        if len(self.series_a) >= MIN_CORRELATION_SAMPLES:
            try:
                a = np.array(self.series_a)
                b = np.array(self.series_b)

                # Guard: if either series is flat, correlation is undefined.
                # Return 0.0 instead of letting NumPy produce NaN.
                if np.var(a) < EPSILON or np.var(b) < EPSILON:
                    self._correlation = 0.0
                    return

                self._correlation = float(np.corrcoef(a, b)[0, 1])

                # Catch NaN from corrcoef edge cases
                if np.isnan(self._correlation):
                    self._correlation = 0.0
            except Exception:
                self._correlation = 0.0

    @property
    def correlation(self) -> float:
        return self._correlation


class AlphaEngine:
    """
    Orchestrates advanced alpha signals.
    """
    def __init__(self):
        self.trackers: Dict[str, CorrelationTracker] = {}

    def get_tracker(self, market_id: str) -> CorrelationTracker:
        if market_id not in self.trackers:
            self.trackers[market_id] = CorrelationTracker()
        return self.trackers[market_id]


class MarketScorer:
    """
    Ranks market opportunities based on edge, liquidity, and cost.
    """
    @staticmethod
    def calculate_score(snapshot: MarketSnapshot, edge: float) -> float:
        """
        Score = (Edge / Spread) * log10(Volume)
        Higher is better.
        """
        # 1. Spread penalty (uses centralized MIN_SPREAD)
        spread = MIN_SPREAD
        if snapshot.orderbook and snapshot.orderbook.best_ask and snapshot.orderbook.best_bid:
            spread = max(MIN_SPREAD, snapshot.orderbook.best_ask - snapshot.orderbook.best_bid)

        edge_to_spread = edge / max(spread, EPSILON)

        # 2. Liquidity bonus (log scale, uses centralized floor)
        volume = snapshot.orderbook.depth_usd if snapshot.orderbook else MIN_VOLUME_USD
        liquidity_bonus = math.log10(max(MIN_LIQUIDITY_LOG_BASE, volume))

        return edge_to_spread * liquidity_bonus


# Singletons
alpha_engine = AlphaEngine()
market_scorer = MarketScorer()
