"""
Elon Musk Advanced Tweet Prediction Strategy
============================================
A high-fidelity statistical model for Polymarket tweet prediction markets.
Based on Negative Binomial modeling and circadian activity schedule.
"""

from __future__ import annotations
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Tuple
from collections import deque

import numpy as np
from scipy.stats import nbinom, poisson

from polymarket_sim.strategies.base_strategy import BaseStrategy
from polymarket_sim.core.models import (
    Fill,
    OrderSide,
    OrderType,
    TickData,
    VirtualOrder,
)

logger = logging.getLogger(__name__)

# Texas is UTC-6. Target User is UTC+7. Diff: +13 Hours.
# Label and Rate mapping from elonmusk_tweet.py
HOURLY_PROFILE = {
    6:  {'rate': 1.2,  'alpha': 1.1, 'label': '🍷 ACTIVE'},
    7:  {'rate': 1.2,  'alpha': 1.1, 'label': '🍷 ACTIVE'},
    8:  {'rate': 1.2,  'alpha': 1.1, 'label': '🍷 ACTIVE'},
    9:  {'rate': 1.2,  'alpha': 1.1, 'label': '🍷 ACTIVE'},
    10: {'rate': 1.2,  'alpha': 1.1, 'label': '🍷 ACTIVE'},
    11: {'rate': 1.2,  'alpha': 1.1, 'label': '🍷 ACTIVE'},
    12: {'rate': 1.6,  'alpha': 1.5, 'label': '🔥 MANIC'},
    13: {'rate': 1.6,  'alpha': 1.5, 'label': '🔥 MANIC'},
    14: {'rate': 1.6,  'alpha': 1.5, 'label': '🔥 MANIC'},
    15: {'rate': 1.6,  'alpha': 1.5, 'label': '🔥 MANIC'},
    16: {'rate': 0.1,  'alpha': 0.3, 'label': '💤 SLEEP'},
    17: {'rate': 0.1,  'alpha': 0.3, 'label': '💤 SLEEP'},
    18: {'rate': 0.1,  'alpha': 0.3, 'label': '💤 SLEEP'},
    19: {'rate': 0.1,  'alpha': 0.3, 'label': '💤 SLEEP'},
    20: {'rate': 0.6,  'alpha': 0.8, 'label': '🌅 WAKE'},
    21: {'rate': 0.6,  'alpha': 0.8, 'label': '🌅 WAKE'},
    22: {'rate': 0.95, 'alpha': 1.0, 'label': '🏢 WORK'},
    23: {'rate': 0.95, 'alpha': 1.0, 'label': '🏢 WORK'},
    0:  {'rate': 0.95, 'alpha': 1.0, 'label': '🏢 WORK'},
    1:  {'rate': 0.95, 'alpha': 1.0, 'label': '🏢 WORK'},
    2:  {'rate': 0.95, 'alpha': 1.0, 'label': '🏢 WORK'},
    3:  {'rate': 0.95, 'alpha': 1.0, 'label': '🏢 WORK'},
    4:  {'rate': 0.95, 'alpha': 1.0, 'label': '🏢 WORK'},
    5:  {'rate': 0.95, 'alpha': 1.0, 'label': '🏢 WORK'},
}

class ElonMuskStrategy(BaseStrategy):
    name = "Elon Musk — Statistical NBinom"
    description = "Circadian schedule + Negative Binomial tweet projection."
    version = "2.0.0"

    def __init__(self):
        super().__init__()
        # Tunable parameters from JSON
        self.base_daily_rate = 55.0
        self.dispersion_param = 0.1
        self.user_timezone_offset = 7
        self.edge_threshold = 10.0      # Min edge % to trade
        self.kelly_fraction = 0.25      # Quarter Kelly
        self.expiry_amp_max = 2.5
        self.trade_cooldown = 30.0
        self.max_pos_usd = 500.0

        # State
        self.current_count = 0          # Simulated or initialized
        self.token_range: Dict[str, Tuple[int, int]] = {} # token_id -> (low, high)
        self._pos = 0.0
        self._last_log_time = 0

    def init_params(self, params: dict):
        self.base_daily_rate = params.get("base_daily_rate", self.base_daily_rate)
        self.dispersion_param = params.get("dispersion_param", self.dispersion_param)
        self.user_timezone_offset = params.get("user_timezone_offset", self.user_timezone_offset)
        self.edge_threshold = params.get("edge_threshold", self.edge_threshold)
        self.kelly_fraction = params.get("kelly_fraction", self.kelly_fraction)
        self.current_count = params.get("starting_count", self.current_count)
        self.max_pos_usd = params.get("max_pos_usd", self.max_pos_usd)
        
        # Ranges mapping if provided in JSON
        # Example: {"token_id_abc": [100, 200]}
        if "ranges" in params:
            self.token_range = {k: tuple(v) for k, v in params["ranges"].items()}

        logger.info("🚀 %s Refined Strategy active. Rate=%.1f/day, Dispersion=%.2f", 
                    self.name, self.base_daily_rate, self.dispersion_param)

    def _get_token_range(self, token_id: str) -> Tuple[int, int]:
        """Infers or retrieves the tweet range for a token."""
        if token_id in self.token_range:
            return self.token_range[token_id]
        
        # Fallback: simple heuristic range if not configured
        # This is a place-holder for more robust title parsing
        return (0, 1000)

    def integrate_schedule(self, days_left: float) -> Tuple[float, float]:
        """Projects tweets and weighted dispersion based on current time and expiry."""
        if days_left <= 0: return 0.0, 1.0
        
        utc_now = datetime.now(timezone.utc)
        projected = 0.0
        weighted_alpha = 0.0
        base_hourly = self.base_daily_rate / 24.0
        
        # Expiry Amplifier
        expiry_amp_start = 1.0 # day
        expiry_amp = 1.0
        if days_left < expiry_amp_start:
            progress = 1.0 - (days_left / expiry_amp_start)
            expiry_amp = 1.0 + (self.expiry_amp_max - 1.0) * progress

        hours_left = days_left * 24.0
        current_time = utc_now
        while hours_left > 0:
            step = min(1.0, hours_left)
            local_hour = (current_time + timedelta(hours=self.user_timezone_offset)).hour
            prof = HOURLY_PROFILE.get(local_hour, {'rate': 1.0, 'alpha': 1.0})
            
            # Amplified deviation
            mult = 1.0 + (prof['rate'] - 1.0) * expiry_amp
            mult = max(0.0, mult)
            
            tweets = base_hourly * mult * step
            projected += tweets
            weighted_alpha += (prof['alpha'] * tweets)
            
            current_time += timedelta(hours=step)
            hours_left -= step
            
        avg_alpha_mult = weighted_alpha / projected if projected > 0 else 1.0
        return projected, avg_alpha_mult

    def calculate_nbinom_prob(self, low: int, high: int, mu: float, days_left: float, alpha_mult: float) -> float:
        """NBinom with limit convergence to Poisson."""
        if mu <= 0: return 0.0
        
        alpha = self.dispersion_param * alpha_mult
        
        # Alpha decay near resolution
        if days_left < 2.0:
            alpha *= (days_left / 2.0)
            
        if alpha < 1e-4:
            # Poisson fallback
            return (poisson.cdf(high, mu) - poisson.cdf(low - 1, mu)) * 100

        var = mu + alpha * (mu ** 2)
        p = mu / var
        n = (mu ** 2) / (var - mu)
        try:
            return (nbinom.cdf(high, n, p) - nbinom.cdf(low - 1, n, p)) * 100
        except Exception:
            return 0.0

    def on_tick(self, tick: TickData) -> List[VirtualOrder]:
        orders = []
        now = time.time()
        
        if tick.market_end_time <= 0:
            return orders

        days_left = (tick.market_end_time - now) / 86400.0
        if days_left <= 0: return orders

        # 1. Project remaining tweets
        proj_rem, alpha_mult = self.integrate_schedule(days_left)
        
        # 2. Get range for this outcome
        low, high = self._get_token_range(tick.token_id)
        
        # Needed count is total range minus what we already have
        n_min = max(0, low - self.current_count)
        n_max = max(0, high - self.current_count)
        
        # 3. Calculate Model Probability
        prob = self.calculate_nbinom_prob(n_min, n_max, proj_rem, days_left, alpha_mult)
        
        # 4. Calculate Edge
        market_price = tick.mid_price * 100 # Cents
        edge = prob - market_price
        
        # Periodic logging
        if now - self._last_log_time > 60:
            logger.info("📊 Elon Model [%s]: mu=%.1f, days=%.2f, prob=%.1f%%, price=%.1f, edge=%+.1f%%",
                        tick.token_id[:8], proj_rem, days_left, prob, market_price, edge)
            self._last_log_time = now

        # 5. Trading Decision
        if edge > self.edge_threshold and self.can_trade(self.trade_cooldown):
            # Size using adaptive Kelly logic (simplified)
            b = (100.0 / market_price) - 1.0 if market_price > 0 else 0
            p = prob / 100.0
            q = 1.0 - p
            
            if b > 0:
                f_star = (b * p - q) / b
                
                # Get current bankroll from portfolio
                portfolio = self.get_portfolio()
                current_bankroll = portfolio.bankroll if portfolio else 1000.0
                
                # Constrain by max position
                amount = min(self.max_pos_usd, self.kelly_fraction * f_star * current_bankroll)
                
                if amount > 10.0:
                    orders.append(VirtualOrder(
                        token_id=tick.token_id,
                        side=OrderSide.BUY,
                        order_type=OrderType.LIMIT,
                        price=tick.best_ask,
                        size=amount
                    ))
                    self.record_trade()
                    logger.info("🎯 Elon BUY Edge: %+.1f%% | Size: $%.0f", edge, amount)

        return orders

    def on_orderbook_update(self, book):
        return []

    def on_fill(self, fill: Fill):
        if fill.side == OrderSide.BUY:
            self._pos += fill.size
        else:
            self._pos -= fill.size
