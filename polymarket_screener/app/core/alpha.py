"""
Alpha Signals Components.
Implements correlation tracking and imbalance monitoring.
"""
import collections
import numpy as np
from app.core.domain_models import MarketSnapshot
from app.utils.logger import log

class CorrelationTracker:
    """
    Tracks rolling correlation between two price series.
    Useful for lead-lag detection (e.g. BTC Spot vs Polymarket).
    """
    def __init__(self, window_size: int = 50):
        self.window_size = window_size
        self.series_a = collections.deque(maxlen=window_size)
        self.series_b = collections.deque(maxlen=window_size)
        self._correlation: float = 0.0

    def add_points(self, val_a: float, val_b: float):
        """Add new synchronized data points."""
        self.series_a.append(val_a)
        self.series_b.append(val_b)
        
        if len(self.series_a) >= 10:
            try:
                # Calculate Pearson correlation
                a = np.array(self.series_a)
                b = np.array(self.series_b)
                self._correlation = np.corrcoef(a, b)[0, 1]
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
        import math
        
        # 1. Spread penalty
        spread = 0.01 # Default min spread
        if snapshot.orderbook and snapshot.orderbook.best_ask and snapshot.orderbook.best_bid:
            spread = max(0.001, snapshot.orderbook.best_ask - snapshot.orderbook.best_bid)
        
        edge_to_spread = edge / spread
        
        # 2. Liquidity bonus (log scale)
        volume = snapshot.orderbook.depth_usd if snapshot.orderbook else 100.0
        liquidity_bonus = math.log10(max(10, volume))
        
        return edge_to_spread * liquidity_bonus

# Singletons
alpha_engine = AlphaEngine()
market_scorer = MarketScorer()
