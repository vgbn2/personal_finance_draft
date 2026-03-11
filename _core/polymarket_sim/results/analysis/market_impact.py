"""
Market Impact Analyzer — Measures liquidity cost and slippage.
Calculates how much a trade would "move the market" at different order sizes.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class ImpactReport:
    """Result of a market impact analysis."""
    mid_price: float           # current mid price
    spread: float              # bid-ask spread (¢)
    spread_bps: float          # spread in basis points
    vwap_buy: float            # VWAP if buying `order_size` shares
    vwap_sell: float           # VWAP if selling `order_size` shares
    slippage_buy_cents: float  # (vwap_buy - mid) per share (¢)
    slippage_sell_cents: float # (mid - vwap_sell) per share (¢)
    impact_buy_bps: float      # buy impact in basis points
    impact_sell_bps: float     # sell impact in basis points
    depth_bid: float           # total $ on bid within ±2¢ of mid
    depth_ask: float           # total $ on ask within ±2¢ of mid
    liquidity_score: float     # 0-100 score (higher = more liquid)
    order_size: float          # the hypothetical order size tested


class MarketImpactAnalyzer:
    """
    Analyzes current orderbook state for market impact at a given order size.

    Usage:
        report = MarketImpactAnalyzer.analyze(orderbook, order_size=100)
    """

    @staticmethod
    def analyze(orderbook, order_size: float = 100.0) -> Optional[ImpactReport]:
        """
        Run a full impact analysis against the current orderbook.

        Args:
            orderbook: an Orderbook instance with walk_book(), mid_price, spread, etc.
            order_size: hypothetical order size to measure impact.

        Returns:
            ImpactReport or None if book is empty.
        """
        mid = orderbook.mid_price
        spread = orderbook.spread

        if mid is None or spread is None:
            return None

        # Walk the book for buy and sell
        buy_result = orderbook.walk_book("BUY", order_size)
        sell_result = orderbook.walk_book("SELL", order_size)

        vwap_buy = buy_result[0] if buy_result else mid
        vwap_sell = sell_result[0] if sell_result else mid

        # Slippage in cents
        slip_buy = (vwap_buy - mid) * 100   # positive = costly
        slip_sell = (mid - vwap_sell) * 100  # positive = costly

        # Impact in basis points
        impact_buy_bps = ((vwap_buy - mid) / mid * 10_000) if mid > 0 else 0.0
        impact_sell_bps = ((mid - vwap_sell) / mid * 10_000) if mid > 0 else 0.0

        spread_bps = (spread / mid * 10_000) if mid > 0 else 0.0

        # Depth within ±2¢ of mid
        depth_bid = 0.0
        for level in orderbook.get_bids(50):
            if level.price >= mid - 0.02:
                depth_bid += level.price * level.size
            else:
                break

        depth_ask = 0.0
        for level in orderbook.get_asks(50):
            if level.price <= mid + 0.02:
                depth_ask += level.price * level.size
            else:
                break

        total_depth = depth_bid + depth_ask

        # Liquidity score: 0-100
        # $0 depth = 0, $5000+ depth = 100
        liq_score = min(100.0, (total_depth / 50.0))  # $5000 = 100

        return ImpactReport(
            mid_price=mid,
            spread=spread,
            spread_bps=spread_bps,
            vwap_buy=vwap_buy,
            vwap_sell=vwap_sell,
            slippage_buy_cents=slip_buy,
            slippage_sell_cents=slip_sell,
            impact_buy_bps=impact_buy_bps,
            impact_sell_bps=impact_sell_bps,
            depth_bid=depth_bid,
            depth_ask=depth_ask,
            liquidity_score=liq_score,
            order_size=order_size,
        )
