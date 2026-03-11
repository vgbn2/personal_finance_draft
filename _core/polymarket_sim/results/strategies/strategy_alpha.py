"""
Strategy Alpha: Advanced Mean-Reversion
======================================
Buys when price is oversold (RSI < 30) or below Lower Bollinger Band.
Sells when price is overbought (RSI > 70) or above Upper Bollinger Band.
Incorporates session-based risk-off logic (Stop-Loss cooldown).
"""

from __future__ import annotations

import logging
import math
import numpy as np
from datetime import datetime, timedelta
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


class MeanReversionStrategy(BaseStrategy):
    """
    Advanced Mean-Reversion Strategy with BB, RSI and Risk-Off logic.
    """

    name = "Strategy Alpha — Mean Reversion V2"
    description = "Mean-Reversion with Bollinger Bands, RSI, and Stop-Loss safety."
    version = "2.0.0"

    def __init__(
        self,
        lookback: int = 200,
        bb_k: float = 2.0,
        rsi_period: int = 14,
        max_position: float = 250,
        trade_cooldown: float = 30.0,
        stop_loss_pct: float = -5.0,
        risk_off_minutes: int = 60,
    ):
        super().__init__()
        self.lookback = lookback
        self.bb_k = bb_k
        self.rsi_period = rsi_period
        self.max_position = max_position
        self.trade_cooldown = trade_cooldown
        
        # Risk Management Params
        self.stop_loss_pct = stop_loss_pct
        self.risk_off_minutes = risk_off_minutes
        self.sleep_till: Optional[datetime] = None

        # Internal state
        self._prices: deque = deque(maxlen=max(lookback, rsi_period + 1))
        self._position: float = 0.0
        self._avg_price: float = 0.0
        
        # Pending orders tracking
        self._pending_buy_qty: float = 0.0
        self._pending_sell_qty: float = 0.0
        
        # Entry Filters
        self.filter = SignalFilter(self)

    def init_params(self, params: dict):
        """Standard hook called by StrategyRunner."""
        self.lookback = params.get("lookback", self.lookback)
        self.bb_k = params.get("bb_k", self.bb_k)
        self.rsi_period = params.get("rsi_period", self.rsi_period)
        self.max_position = params.get("max_position", self.max_position)
        self.stop_loss_pct = params.get("stop_loss_pct", self.stop_loss_pct)
        self.risk_off_minutes = params.get("risk_off_minutes", self.risk_off_minutes)
        
        logger.info("🚀 %s configured: lookback=%d, BB_k=%.1f, RSI=%d", 
                    self.name, self.lookback, self.bb_k, self.rsi_period)

    def on_tick(self, tick: TickData) -> List[VirtualOrder]:
        orders: List[VirtualOrder] = []
        mid = tick.mid_price
        self._prices.append(mid)

        # 1. Risk-Off Check (Stop Loss Cooldown)
        if self.sleep_till and datetime.now() < self.sleep_till:
            return orders

        # Need enough data
        if len(self._prices) < self.lookback:
            return orders

        # 2. Indicators
        prices_list = list(self._prices)
        rolling_mean = np.mean(prices_list[-self.lookback:])
        rolling_std = np.std(prices_list[-self.lookback:])
        
        lower_band = rolling_mean - (self.bb_k * rolling_std)
        upper_band = rolling_mean + (self.bb_k * rolling_std)
        
        rsi = self._calculate_rsi(prices_list, self.rsi_period)

        # 3. Stop-Loss Logic (Safety Exit)
        if self._position > 0 and self._avg_price > 0:
            pnl_pct = (mid - self._avg_price) / self._avg_price * 100
            if pnl_pct < self.stop_loss_pct:
                logger.warning("🚨 STOP LOSS TRIGGERED: PnL %.2f%%. Risking off for %d mins.", 
                               pnl_pct, self.risk_off_minutes)
                self.sleep_till = datetime.now() + timedelta(minutes=self.risk_off_minutes)
                
                # Market Sell to Exit
                orders.append(VirtualOrder(
                    token_id=tick.token_id,
                    side=OrderSide.SELL,
                    order_type=OrderType.LIMIT,
                    price=tick.best_bid, 
                    size=self._position,
                ))
                self._pending_sell_qty += self._position
                self.record_trade()
                return orders

        # 4. Filter Checks
        if not self.filter.check_spread(tick, max_spread=0.03):
            return orders
        if not self.can_trade(self.trade_cooldown):
            return orders

        effective_position = self._position + self._pending_buy_qty - self._pending_sell_qty

        # 5. Signal Generation
        
        # BUY: Price below Lower Band + RSI Oversold (< 30)
        if mid < lower_band and rsi < 35:
            if effective_position < self.max_position:
                # Dynamic Sizing (based on RSI distance from 30)
                edge_strength = (35 - rsi) / 20.0 # 0.0 to 1.0+
                win_prob = 0.55 + min(edge_strength, 0.20)
                
                bankroll = self.get_portfolio().bankroll if self.get_portfolio() else 1000.0
                optimal_size = self.sizer.calculate_size(bankroll, win_prob, tick.best_ask)
                
                size = min(optimal_size, self.max_position - effective_position)
                if size > 0:
                    if self.filter.check_price_band(tick.best_ask) and \
                       self.filter.check_bankroll(OrderSide.BUY, tick.best_ask, size):
                        
                        orders.append(VirtualOrder(
                            token_id=tick.token_id,
                            side=OrderSide.BUY,
                            order_type=OrderType.LIMIT,
                            price=tick.best_ask,
                            size=size,
                        ))
                        self._pending_buy_qty += size
                        self.record_trade()
                        logger.info("💎 ALPHA BUY | RSI=%.1f | Mid=%.4f < LBand=%.4f | Size=%.0f", 
                                    rsi, mid, lower_band, size)

        # SELL (Exit): Price above Upper Band OR RSI Overbought (> 65)
        elif mid > upper_band or rsi > 65:
            if effective_position > 0:
                if self.filter.check_price_band(tick.best_bid):
                    # Close position in logic segments if needed, here we close full for mean reversion
                    orders.append(VirtualOrder(
                        token_id=tick.token_id,
                        side=OrderSide.SELL,
                        order_type=OrderType.LIMIT,
                        price=tick.best_bid, 
                        size=effective_position,
                    ))
                    self._pending_sell_qty += effective_position
                    self.record_trade()
                    logger.info("💰 ALPHA EXIT | RSI=%.1f | Mid=%.4f > UBand=%.4f", 
                                rsi, mid, upper_band)

        return orders

    def _calculate_rsi(self, prices: List[float], period: int) -> float:
        """Simple RSI Calculation."""
        if len(prices) < period + 1: return 50.0
        
        deltas = np.diff(prices[-period-1:])
        seed = deltas[:period]
        up = seed[seed >= 0].sum() / period
        down = -seed[seed < 0].sum() / period
        
        if down == 0: return 100.0
        rs = up / down
        return 100.0 - (100.0 / (1.0 + rs))

    def on_fill(self, fill: Fill) -> None:
        if fill.side == OrderSide.BUY:
            # Update average price for Stop Loss
            new_total_cost = (self._position * self._avg_price) + (fill.size * fill.price)
            self._position += fill.size
            self._avg_price = new_total_cost / self._position if self._position > 0 else 0
            self._pending_buy_qty = max(0.0, self._pending_buy_qty - fill.size)
        else:
            self._position -= fill.size
            if self._position <= 0:
                self._avg_price = 0
            self._pending_sell_qty = max(0.0, self._pending_sell_qty - fill.size)

    def on_orderbook_update(self, book: OrderbookSnapshot) -> List[VirtualOrder]:
        return []
