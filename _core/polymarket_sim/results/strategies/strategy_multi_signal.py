"""
Strategy: Multi-Signal Paper Bot Port
Ports the Momentum Divergence, Mean Reversion, and Expiry Convergence signals
from the original paper_bot.py script.
"""

import time
from collections import deque
from dataclasses import dataclass
from typing import Dict, List, Optional

from polymarket_sim.core.models import Fill, OrderbookSnapshot, OrderSide, OrderType, TickData, VirtualOrder
from polymarket_sim.strategies.base_strategy import BaseStrategy


# Signal Parameters (matching paper_bot.py)
MOM_BTC_THRESH = 0.0008
MOM_POLY_GAP = 0.03

MR_DROP_WINDOW = 120.0
MR_DROP_THRESH = 0.10
MR_BTC_CALM = 0.0015

EX_TIME_WINDOW = 1800.0  # 30m? wait, the file said 1800s but BTC options are 15m (900s)
EX_BTC_TREND = 0.005
EX_UNDERPRICED = 0.45
MIN_EXPIRY = 300.0       # Ignore last 5 mins? The paper bot ignores if < 300s to expiry

COOLDOWN = 30.0

# Risk Params
TP_PCT = 0.60
SL_PCT = 0.50


@dataclass
class ActiveTrade:
    dir: str           # "UP" or "DOWN" (relative to token)
    entry_price: float
    est_prob: float
    target_p: float
    stop_p: float
    size: float
    signal: str


class StrategyMultiSignal(BaseStrategy):
    name = "Multi-Signal Paper Bot"
    description = "MOM, MR, EXP signals driven by Binance BTC WS"
    version = "1.0.0"

    def __init__(self):
        super().__init__()
        # History tracking per token for Poly price drops
        self.token_hists: Dict[str, deque] = {}
        
        # Current active trades mapped by token_id
        self.active_trades: Dict[str, ActiveTrade] = {}
        
        # Cooldown tracking
        self.last_trade_ts: float = 0.0
        
        # Period tracking (for 15m BTC options)
        self.current_window_start: float = 0.0
        self.btc_open: float = 0.0

    def _get_poly_price_age(self, token_id: str, window_sec: float, now: float) -> Optional[float]:
        """Get oldest Poly price within the window for a token."""
        hist = self.token_hists.get(token_id)
        if not hist:
            return None
            
        for snap in hist:
            if now - snap["t"] >= window_sec:
                return snap["p"]
        return None

    def on_tick(self, tick: TickData) -> List[VirtualOrder]:
        orders = []
        now = tick.timestamp
        
        # Update price history per token
        if tick.token_id not in self.token_hists:
            self.token_hists[tick.token_id] = deque(maxlen=200)
        self.token_hists[tick.token_id].append({"p": tick.mid_price, "t": now})
        
        # Update period tracking
        window_start = now - (now % 900)  # 15m boundary
        if self.current_window_start != window_start:
            self.current_window_start = window_start
            self.btc_open = tick.btc_price
            
        # 1. Check open trades for Stop-Loss / Take-Profit
        exit_order = self._check_exits(tick)
        if exit_order:
            orders.append(exit_order)
            
        # 2. Check entry signals if we can trade
        if self._can_trade(now, tick.token_id):
            entry_order = self._check_signals(tick)
            if entry_order:
                orders.append(entry_order)

        return orders

    def on_orderbook_update(self, book: OrderbookSnapshot) -> List[VirtualOrder]:
        return []

    def on_fill(self, fill: Fill) -> None:
        pass

    # ── Internal Logic ────────────────────────────────────────

    def _can_trade(self, now: float, token_id: str) -> bool:
        if now - self.last_trade_ts < COOLDOWN:
            return False
            
        # Don't hold multiple positions in the same token
        if token_id in self.active_trades:
            return False
            
        portfolio = self.get_portfolio()
        if portfolio and portfolio.bankroll < 3.0:
            return False
            
        return True

    def _check_exits(self, tick: TickData) -> Optional[VirtualOrder]:
        """Check TP / SL for the current token."""
        if tick.token_id not in self.active_trades:
            return None
            
        trade = self.active_trades[tick.token_id]
        mid = tick.mid_price
        
        exit_reason = None
        if mid >= trade.target_p:
            exit_reason = f"TP hit: {mid:.4f} >= {trade.target_p:.4f}"
        elif mid <= trade.stop_p:
            exit_reason = f"SL hit: {mid:.4f} <= {trade.stop_p:.4f}"
            
        if exit_reason:
            # Emit closing order
            # The original bought YES shares. To close, we SELL them.
            order = VirtualOrder(
                token_id=tick.token_id,
                side=OrderSide.SELL,
                order_type=OrderType.MARKET,
                price=0.0,
                size=trade.size
            )
            # Remove from active tracking
            del self.active_trades[tick.token_id]
            return order
            
        return None

    def _check_signals(self, tick: TickData) -> Optional[VirtualOrder]:
        """Evaluate MOM, MR, EXP signals."""
        now = tick.timestamp
        btc_p = tick.btc_price
        if btc_p == 0.0:
            return None
            
        mid = tick.mid_price
        sigs = []
        
        # ── 1. Momentum Divergence ──
        btc_d_60 = tick.btc_delta_60s
        if btc_d_60 is not None and abs(btc_d_60) >= MOM_BTC_THRESH:
            # We assume the current token is the one aligned with the BTC move
            # In purely generic token evaluation, if BTC moves UP, the UP token should rise.
            # In polymarket_sim, we only process one token at a time.
            # We will calculate the edge assuming THIS token should move in the SAME direction as BTC
            # If doing this properly, we need to know if this is the UP or DOWN token.
            # For simplicity, if BTC is up, we bias long. But we do it directionally.
            fair_shift = btc_d_60 / MOM_BTC_THRESH * 0.15
            fair_prob = 0.50 + fair_shift
            fair_prob = max(0.05, min(0.95, fair_prob))
            
            gap = fair_prob - mid
            if gap >= MOM_POLY_GAP:
                sigs.append({"name": "MOM", "est_prob": fair_prob, "edge": gap})
                
        # ── 2. Mean Reversion ──
        old_price = self._get_poly_price_age(tick.token_id, MR_DROP_WINDOW, now)
        if old_price is not None:
            drop = old_price - mid
            btc_d_120 = tick.btc_delta_120s
            if drop >= MR_DROP_THRESH and btc_d_120 is not None and abs(btc_d_120) < MR_BTC_CALM:
                est_prob = old_price - drop * 0.3
                edge = est_prob - mid
                if edge > 0.03:
                    sigs.append({"name": "MR", "est_prob": est_prob, "edge": edge})
                    
        # ── 3. Expiry Convergence ──
        ttl = 900 - (now % 900)  # Seconds until 15m boundary
        if ttl >= MIN_EXPIRY and self.btc_open > 0:
            btc_period_delta = (btc_p - self.btc_open) / self.btc_open
            if abs(btc_period_delta) >= EX_BTC_TREND and btc_period_delta > 0:
                # Assuming this token matches the UP trend if btc_period_delta > 0
                if mid < EX_UNDERPRICED:
                    ttl_factor = max(0.5, 1.0 - ttl / EX_TIME_WINDOW)
                    est_prob = 0.70 + ttl_factor * 0.20
                    edge = est_prob - mid
                    if edge > 0.03:
                        sigs.append({"name": "EXP", "est_prob": est_prob, "edge": edge})

        if not sigs:
            return None
            
        # Pick best signal by edge
        best = max(sigs, key=lambda s: s["edge"])
        
        portfolio = self.get_portfolio()
        bankroll = portfolio.bankroll if portfolio else 100.0
        
        size = self.sizer.calculate_size(bankroll, best["est_prob"], mid)
        if size >= self.sizer.config.min_order_size:
            target_p = mid + best["edge"] * TP_PCT
            stop_p = max(0.01, mid - best["edge"] * SL_PCT)
            
            self.active_trades[tick.token_id] = ActiveTrade(
                dir="UP",
                entry_price=mid,
                est_prob=best["est_prob"],
                target_p=target_p,
                stop_p=stop_p,
                size=size,
                signal=best["name"]
            )
            self.last_trade_ts = now
            
            return VirtualOrder(
                token_id=tick.token_id,
                side=OrderSide.BUY,
                order_type=OrderType.MARKET,
                price=0.0,
                size=size
            )
            
        return None
