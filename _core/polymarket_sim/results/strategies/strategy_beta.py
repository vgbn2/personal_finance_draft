"""
Example Strategy: Simple Momentum (UPGRADED)
===========================================
Buys when price is rising according to moving averages AND Kalman-Filtered slope.
Uses Hurst Exponent to ensure trend persistence (H > 0.5) and avoids mean-reversion.
Dynamic sizing via Kelly Criterion based on Z-Score statistical edge.
"""

from __future__ import annotations

import logging
import math
import numpy as np
from collections import deque
from typing import List, Dict, Optional, Tuple

from polymarket_sim.strategies.base_strategy import BaseStrategy
from polymarket_sim.core.models import (
    Fill,
    OrderbookSnapshot,
    OrderSide,
    OrderType,
    TickData,
    VirtualOrder,
)

from polymarket_sim.strategies.filters import SignalFilter

logger = logging.getLogger(__name__)


class MomentumStrategy(BaseStrategy):
    """
    Momentum Strategy with Kalman Smoothing and Hurst Verification.
    """

    name = "Strategy Beta — Momentum (Kalman-Hurst)"
    description = "Follows the trend. Verified by Hurst Exponent and smoothed by Kalman Filter."
    version = "2.0.0"

    def __init__(
        self,
        fast_period: int = 20,
        slow_period: int = 100,
        threshold: float = 0.02,
        max_position: float = 300,
        trade_cooldown: float = 30.0,
    ):
        super().__init__()
        self.fast_period = fast_period
        self.slow_period = slow_period
        self.threshold = threshold
        self.max_position = max_position
        self.trade_cooldown = trade_cooldown

        self._prices: deque = deque(maxlen=slow_period)
        self._position: float = 0.0
        
        # Pending orders tracking
        self._pending_buy_qty: float = 0.0
        self._pending_sell_qty: float = 0.0
        
        # Entry Filters
        self.filter = SignalFilter(self)
        
        # 🧠 Advanced Analytics Engine
        self.kalman = KalmanAnalyzer(q=0.01)
        self.hurst_lookback = 100
        
    def init_params(self, params: dict):
        """Standard hook called by StrategyRunner."""
        self.fast_period = params.get("fast_period", self.fast_period)
        self.slow_period = params.get("slow_period", self.slow_period)
        self.max_position = params.get("max_position", self.max_position)
        self.trade_cooldown = params.get("trade_cooldown", self.trade_cooldown)
        
        # Kalman Q
        q = params.get("kalman_q", 0.01)
        self.kalman.q = q
        
        logger.info("🚀 %s configured: slow=%d, fast=%d, Q=%.4f", 
                    self.name, self.slow_period, self.fast_period, q)

    def on_tick(self, tick: TickData) -> List[VirtualOrder]:
        orders: List[VirtualOrder] = []
        mid = tick.mid_price
        self._prices.append(mid)

        # 🔹 FILTER: Spread Check
        if not self.filter.check_spread(tick, max_spread=0.03):
            return orders

        # Need enough data
        if len(self._prices) < self.slow_period:
            return orders

        # Calculate averages for logging/baseline
        prices_list = list(self._prices)
        fast_ma = sum(prices_list[-self.fast_period:]) / self.fast_period
        slow_ma = sum(prices_list[-self.slow_period:]) / self.slow_period

        # 🔹 FILTER: Trade Cooldown
        if not self.can_trade(self.trade_cooldown):
            return orders

        # Calculate effective position (Current + Pending)
        net_pending = self._pending_buy_qty - self._pending_sell_qty
        effective_position = self._position + net_pending

        # ── Signal Generation ─────────────────────────────────
        # 🧠 Advanced Signal Processing
        # 1. Update Kalman
        self.kalman.add_observation(mid)
        
        # 2. Get Statistical Projections
        stats = self.kalman.get_projection_stats(lookback=self.fast_period, horizon=24) 
        if not stats:
            return orders

        # 3. Hurst Check (Persistence: > 0.5 is trending)
        h_val = stats['hurst']
        is_trending = h_val > 0.52 
        
        # Buy Signal (Golden Cross + Trending + Positive Slope)
        if fast_ma > slow_ma and is_trending and stats['slope'] > 0:
            if effective_position < self.max_position:
                # 🧠 Dynamic Sizing (Kelly Criterion - Statistical Edge)
                model_price = stats['mu_price']
                edge_pct = (model_price - tick.best_ask) / tick.best_ask * 100
                
                # Win Prob (Logistic estimation on edge)
                estimated_win_prob = 1.0 / (1.0 + math.exp(-0.2 * edge_pct))
                estimated_win_prob = max(0.51, min(0.85, estimated_win_prob))
                
                # Get portfolio bankroll
                bankroll = self.get_portfolio().bankroll if self.get_portfolio() else 1000.0
                
                # Calculate optimal size
                optimal_size = self.sizer.calculate_size(
                    bankroll=bankroll,
                    win_prob=estimated_win_prob,
                    price=tick.best_ask
                )
                
                size_to_buy = optimal_size
                if effective_position < 0:
                    size_to_buy += abs(effective_position)
                
                size = min(size_to_buy, self.max_position - effective_position)

                if size > 0:
                    if not self.filter.check_price_band(tick.best_ask):
                        return orders
                    if not self.filter.check_bankroll(OrderSide.BUY, tick.best_ask, size):
                        return orders

                    orders.append(VirtualOrder(
                        token_id=tick.token_id,
                        side=OrderSide.BUY,
                        order_type=OrderType.LIMIT,
                        price=tick.best_ask,
                        size=size,
                    ))
                    self._pending_buy_qty += size
                    self.record_trade()
                    logger.info("📡 KALMAN UP | H=%.3f | Slope=%.4f | Edge=%+.1f%% | Size=%.0f", 
                                h_val, stats['slope'], edge_pct, size)

        # Sell Signal (Death Cross or Anti-Trend or Price above model projection)
        elif fast_ma < slow_ma or not is_trending or stats['slope'] < 0:
            if effective_position > 0:
                if not self.filter.check_price_band(tick.best_bid):
                    return orders

                orders.append(VirtualOrder(
                    token_id=tick.token_id,
                    side=OrderSide.SELL,
                    order_type=OrderType.LIMIT,
                    price=tick.best_bid, 
                    size=effective_position,
                ))
                self._pending_sell_qty += effective_position
                self.record_trade()
                logger.info("📡 KALMAN EXIT | H=%.3f | Slope=%.4f | Reason: %s", 
                            h_val, stats['slope'], "DeathCross" if fast_ma < slow_ma else "AntiTrend")

        return orders

    def on_orderbook_update(self, book: OrderbookSnapshot) -> List[VirtualOrder]:
        return []

    def on_fill(self, fill: Fill) -> None:
        if fill.side == OrderSide.BUY:
            self._position += fill.size
            self._pending_buy_qty = max(0.0, self._pending_buy_qty - fill.size)
        else:
            self._position -= fill.size
            self._pending_sell_qty = max(0.0, self._pending_sell_qty - fill.size)


# ==========================================
# 🧠 KALMAN & MATH ENGINES (Ported from research)
# ==========================================

def calc_hurst(series: List[float], length: int = 100) -> float:
    """Hurst Exponent to determine trend persistence."""
    if len(series) < length: return 0.5
    arr = np.array(series[-length:])
    if len(arr) < 2: return 0.5
    l_ret = np.log(arr[1:] / arr[:-1])
    avg = np.mean(l_ret)
    sum_dev, max_dev, min_dev, sum_sq_diff = 0.0, 0.0, 0.0, 0.0
    loop_count = min(len(l_ret), 49)
    for i in range(loop_count):
        diff = l_ret[-(i+1)] - avg
        sum_dev += diff
        max_dev = max(max_dev, sum_dev)
        min_dev = min(min_dev, sum_dev)
        sum_sq_diff += (diff * diff)
    R = max_dev - min_dev
    S = math.sqrt(sum_sq_diff / len(l_ret)) if len(l_ret) > 0 else 0
    if S == 0 or R == 0: return 0.5
    return math.log(R / S) / math.log(len(l_ret))

class KalmanAnalyzer:
    """1D Kalman Filter + Hurst Damping for Price Projection."""
    def __init__(self, q: float = 0.01):
        self.q = q
        self.k_est = None
        self.k_err = 1.0
        self.prices: List[float] = []
        self.estimates: List[float] = []
        
    def add_observation(self, price: float):
        self.prices.append(price)
        if self.k_est is None:
            self.k_est = price
            self.estimates.append(price)
            return
        self.k_err = self.k_err + self.q
        k_gain = self.k_err / (self.k_err + 1.0)
        self.k_est = self.k_est + k_gain * (price - self.k_est)
        self.k_err = (1.0 - k_gain) * self.k_err
        self.estimates.append(self.k_est)
        if len(self.prices) > 500:
            self.prices.pop(0)
            self.estimates.pop(0)
            
    def get_projection_stats(self, lookback: int = 10, horizon: int = 24) -> Dict:
        if len(self.estimates) < lookback + 1: return {}
        current_k = self.k_est
        past_k = self.estimates[-1 - lookback]
        slope_per_bar = (current_k - past_k) / lookback
        h_val = calc_hurst(self.prices, 100)
        hurst_conf = 0.5 if h_val < 0.5 else 1.0
        final_slope = slope_per_bar * hurst_conf
        
        # Volatility
        min_len = min(len(self.prices), len(self.estimates))
        residuals = np.array(self.prices[-min_len:]) - np.array(self.estimates[-min_len:])
        current_vol = np.std(residuals[-50:]) if len(residuals) >= 50 else np.std(residuals)
        
        mu_price = current_k + (final_slope * horizon)
        sigma_future = current_vol * math.sqrt(horizon)
        
        return {
            "current_k": current_k,
            "slope": final_slope,
            "hurst": h_val,
            "vol": current_vol,
            "mu_price": mu_price,
            "sigma_future": sigma_future
        }
