"""
Polymarket Paper Trading Simulator — Shadow Matching Engine
Simulates order fills against the live orderbook with VWAP, latency, and price-time priority.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections import deque
from typing import Deque, Dict, List, Optional

from ..core import config
from ..core.models import Fill, OrderSide, OrderType, VirtualOrder
from .orderbook import Orderbook

# Type hint for Portfolio without circular import
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from ..analysis.portfolio import Portfolio

logger = logging.getLogger(__name__)


class MatchingEngine:
    """
    Shadow matching engine that fills virtual orders against live orderbook state.

    Design decisions:
    - Market orders: immediate LOB traversal → VWAP fill
    - Limit orders: queued and checked each tick when market crosses
    - All fills delayed by configurable simulated latency
    - Virtual orders are *behind* all real liquidity (no queue-jumping)
    """

    def __init__(self, latency_ms: int = config.SIMULATED_LATENCY_MS):
        self._latency_s: float = latency_ms / 1000.0
        self._pending: Deque[VirtualOrder] = deque()
        self._open_limits: Dict[str, VirtualOrder] = {}  # id → order
        self._fills: List[Fill] = []
        self._fill_callbacks: list = []
        self._portfolios: Dict[str, "Portfolio"] = {}

    def register_portfolio(self, strategy_id: str, portfolio: "Portfolio"):
        """Register a portfolio reference for bankroll validation under a strategy ID."""
        self._portfolios[strategy_id] = portfolio

    # ── Callbacks ─────────────────────────────────────────────

    def on_fill(self, callback):
        """Register a fill callback."""
        self._fill_callbacks.append(callback)

    def _emit_fill(self, fill: Fill):
        self._fills.append(fill)
        for cb in self._fill_callbacks:
            try:
                cb(fill)
            except Exception as exc:
                logger.error("Fill callback error: %s", exc)

    # ── Order Submission ──────────────────────────────────────

    def submit_order(self, order: VirtualOrder):
        """
        Submit a virtual order.  Applies simulated latency before processing.
        """
        if order.size <= 0:
            logger.warning("Rejected order %s: size must be > 0", order.id)
            return

        # Bankroll guard: reject orders that OPEN/ADD exposure when funds are insufficient
        portfolio = self._portfolios.get(order.strategy_id)
        if portfolio:
            snap = portfolio.snapshot()
            
            # Determine if this order is closing an existing position
            is_closing = False
            token_pos = portfolio._positions.get(order.token_id)
            if token_pos and token_pos.side != order.side:
                is_closing = True
                
            if not is_closing:
                # Calculate funds committed to other open/pending orders that are NOT closing
                locked_funds = 0.0
                
                # Sum pending orders
                for o in self._pending:
                    if o.strategy_id != order.strategy_id:
                        continue
                    p = portfolio._positions.get(o.token_id)
                    closing = (p and p.side != o.side)
                    if not closing:
                        fee = config.SIMULATED_FEE_PER_SHARE * o.size
                        locked_funds += (o.price * o.size) + fee
                
                # Sum open limit orders
                for o in self._open_limits.values():
                    if o.strategy_id != order.strategy_id:
                        continue
                    p = portfolio._positions.get(o.token_id)
                    closing = (p and p.side != o.side)
                    if not closing:
                        fee = config.SIMULATED_FEE_PER_SHARE * o.size
                        locked_funds += (o.price * o.size) + fee
                
                available_balance = snap.bankroll - locked_funds
                
                # Cost of THIS order
                new_fee = config.SIMULATED_FEE_PER_SHARE * order.size
                new_cost = (order.price * order.size) + new_fee
                
                if available_balance < new_cost:
                    logger.warning(
                        "⚠️ [%s] Order %s rejected: insufficient funds (Have $%.2f, Locked $%.2f, Need $%.2f)",
                        order.strategy_id, order.id, snap.bankroll, locked_funds, new_cost,
                    )
                    return

        if order.size > config.MAX_ORDER_SIZE:
             logger.warning(
                "Clamping order %s size from %.1f to %d",
                order.id, order.size, config.MAX_ORDER_SIZE,
            )
             order.size = config.MAX_ORDER_SIZE

        order.submitted_at = time.time()
        self._pending.append(order)
        logger.info(
            "📥 Order queued: %s %s %s %.4f x %.0f (latency: %dms)",
            order.id, order.side.value, order.order_type.value,
            order.price, order.size, int(self._latency_s * 1000),
        )

    # ── Tick Processing ───────────────────────────────────────

    def process_tick(self, orderbook: Orderbook):
        """
        Process all pending and open orders against current orderbook state.
        Called once per tick after orderbook update.
        """
        now = time.time()

        # ① Process pending orders whose latency has elapsed
        ready: List[VirtualOrder] = []
        still_pending: Deque[VirtualOrder] = deque()

        while self._pending:
            order = self._pending.popleft()
            elapsed = now - order.submitted_at
            if elapsed >= self._latency_s:
                ready.append(order)
            else:
                still_pending.append(order)

        self._pending = still_pending

        # ② Execute ready orders
        for order in ready:
            if order.order_type == OrderType.MARKET:
                self._fill_market(order, orderbook)
            elif order.order_type == OrderType.LIMIT:
                # Try immediate fill, otherwise add to open limits
                if not self._try_fill_limit(order, orderbook):
                    self._open_limits[order.id] = order
                    logger.debug("Limit order %s resting at %.4f", order.id, order.price)

        # ③ Check open limit orders for crosses
        filled_ids = []
        for oid, order in self._open_limits.items():
            if self._try_fill_limit(order, orderbook):
                filled_ids.append(oid)

        for oid in filled_ids:
            del self._open_limits[oid]

    # ── Fill Logic ────────────────────────────────────────────

    def _fill_market(self, order: VirtualOrder, book: Orderbook):
        """Fill a market order via LOB traversal (VWAP)."""
        side_str = "BUY" if order.side == OrderSide.BUY else "SELL"
        result = book.walk_book(side_str, order.size)

        if result is None:
            logger.warning("❌ Market order %s rejected: empty book side", order.id)
            return

        vwap_price, filled_size = result
        slippage = abs(vwap_price - order.price) if order.price > 0 else 0.0
        current_spread = book.spread or 0.0
        current_mid = book.mid_price or vwap_price

        fill = Fill(
            order_id=order.id,
            token_id=order.token_id,
            side=order.side,
            price=vwap_price,
            size=filled_size,
            slippage=slippage,
            timestamp=time.time(),
            spread_at_fill=current_spread,
            mid_at_fill=current_mid,
            strategy_id=order.strategy_id,
        )

        logger.info(
            "✅ FILL %s %s %.0f @ %.4f (VWAP, slip: %.4f, spread: %.4f)",
            order.side.value, order.token_id,
            filled_size, vwap_price, slippage, current_spread,
        )
        self._emit_fill(fill)

    def _try_fill_limit(self, order: VirtualOrder, book: Orderbook) -> bool:
        """
        Try to fill a limit order if the market has crossed the limit price.
        Returns True if filled.
        """
        if order.side == OrderSide.BUY:
            # Buy limit fills when best ask <= limit price
            best_ask = book.best_ask
            if best_ask is None or best_ask > order.price:
                return False

            # Walk asks up to order.price for VWAP
            result = book.walk_book("BUY", order.size)
            if result is None:
                return False

            vwap_price, filled_size = result
            # Only fill if VWAP is at or below our limit
            if vwap_price > order.price:
                return False

        else:  # SELL
            # Sell limit fills when best bid >= limit price
            best_bid = book.best_bid
            if best_bid is None or best_bid < order.price:
                return False

            result = book.walk_book("SELL", order.size)
            if result is None:
                return False

            vwap_price, filled_size = result
            # Only fill if VWAP is at or above our limit
            if vwap_price < order.price:
                return False

        slippage = abs(vwap_price - order.price)
        current_spread = book.spread or 0.0
        current_mid = book.mid_price or vwap_price

        fill = Fill(
            order_id=order.id,
            token_id=order.token_id,
            side=order.side,
            price=vwap_price,
            size=filled_size,
            slippage=slippage,
            timestamp=time.time(),
            spread_at_fill=current_spread,
            mid_at_fill=current_mid,
            strategy_id=order.strategy_id,
        )

        logger.info(
            "✅ FILL %s %s %.0f @ %.4f (limit %.4f, slip: %.4f, spread: %.4f)",
            order.side.value, order.token_id,
            filled_size, vwap_price, order.price, slippage, current_spread,
        )
        self._emit_fill(fill)
        return True

    # ── Queries ───────────────────────────────────────────────

    @property
    def open_order_count(self) -> int:
        return len(self._open_limits) + len(self._pending)

    @property
    def open_orders(self) -> List[VirtualOrder]:
        return list(self._pending) + list(self._open_limits.values())

    @property
    def total_fills(self) -> int:
        return len(self._fills)

    @property
    def all_fills(self) -> List[Fill]:
        return list(self._fills)

    def cancel_all(self):
        """Cancel all pending and open orders."""
        count = len(self._pending) + len(self._open_limits)
        self._pending.clear()
        self._open_limits.clear()
        if count:
            logger.info("Cancelled %d orders.", count)
