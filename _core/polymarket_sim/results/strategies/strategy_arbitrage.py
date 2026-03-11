"""
Strategy: Cross-Asset Arbitrage (Sum < 1)
=========================================
Specific to binary markets with mutually exclusive outcomes (e.g., UP and DOWN).
Exploits pricing inefficiencies where the sum of the best offers for both sides is < $1.00.

How it works:
    1. Monitors two tokens simultaneously (e.g., token_a and token_b).
    2. Calculates Sum = Best Ask (A) + Best Ask (B).
    3. If Sum < 1.00 - edge_threshold:
       - BUY both A and B.
       - Guaranteed profit of (1.00 - Sum) if held to resolution.
    4. Sells (closes) when the mismatch reverses or arbitrage disappears.

Note: Requires markets where outcomes are perfectly correlated (Binary Pairs).
"""

import logging
from typing import Dict, List

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

class ArbitrageStrategy(BaseStrategy):
    name = "Strategy Arbitrage — Sum < 1"
    description = "Buys both sides of a binary market when total cost < $1.00."
    version = "1.0.0"

    def __init__(
        self,
        edge_threshold: float = 0.005,  # 0.5 cent minimum profit after fees
        trade_cooldown: float = 30.0,
    ):
        super().__init__()
        self.edge_threshold = edge_threshold
        self.trade_cooldown = trade_cooldown
        
        # State tracking for cross-asset
        self._last_ticks: Dict[str, TickData] = {}
        self.filter = SignalFilter(self)

    def on_tick(self, tick: TickData) -> List[VirtualOrder]:
        orders: List[VirtualOrder] = []
        self._last_ticks[tick.token_id] = tick

        # Need at least 2 tokens to find arbitrage
        if len(self._last_ticks) < 2:
            return orders

        # Enforce cooldown
        if not self.can_trade(self.trade_cooldown):
            return orders

        # Iterate through pairs to find arbitrage
        token_ids = list(self._last_ticks.keys())
        for i in range(len(token_ids)):
            for j in range(i + 1, len(token_ids)):
                t_a = self._last_ticks[token_ids[i]]
                t_b = self._last_ticks[token_ids[j]]
                
                # We only care about pairs that sum to 1.00 (UP/DOWN)
                # Check for "Sum < 1" opportunity
                total_cost = t_a.best_ask + t_b.best_ask
                edge = 1.0 - total_cost
                
                if edge > self.edge_threshold:
                    logger.info("🎯 ARBITRAGE FOUND: Sum=%.4f (Edge: %.4f)", total_cost, edge)
                    
                    # Size calculation: simple fixed size for arbitrage
                    size = 50.0 
                    
                    # Check bankroll for BOTH
                    if self.filter.check_bankroll(OrderSide.BUY, t_a.best_ask, size) and \
                       self.filter.check_bankroll(OrderSide.BUY, t_b.best_ask, size):
                        
                        orders.append(VirtualOrder(
                            token_id=t_a.token_id,
                            side=OrderSide.BUY,
                            order_type=OrderType.LIMIT,
                            price=t_a.best_ask,
                            size=size
                        ))
                        orders.append(VirtualOrder(
                            token_id=t_b.token_id,
                            side=OrderSide.BUY,
                            order_type=OrderType.LIMIT,
                            price=t_b.best_ask,
                            size=size
                        ))
                        self.record_trade()
                        return orders # Fire one pair at a time

        return orders

    def on_orderbook_update(self, book: OrderbookSnapshot) -> List[VirtualOrder]:
        return []

    def on_fill(self, fill: Fill) -> None:
        logger.info("💰 Arb Filter Fill: %s %.0f @ %.4f", fill.side.value, fill.size, fill.price)
