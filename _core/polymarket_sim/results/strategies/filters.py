"""
Trade Entry Criteria (Signal Filters)
=====================================
Reusable component to filter out bad trade signals before they reach the engine.
Prevents "Insufficient Funds" errors and trading in poor liquidity conditions.
"""

import logging
from typing import Optional, TYPE_CHECKING

from ..core import config
from ..core.models import OrderSide, PortfolioSnapshot, VirtualOrder

if TYPE_CHECKING:
    from .base_strategy import BaseStrategy

logger = logging.getLogger(__name__)


class SignalFilter:
    """
    Enforces risk management and execution quality rules for strategies.
    
    Usage:
        self.filter = SignalFilter(self)
        if not self.filter.check_spread(tick): return
        if not self.filter.check_bankroll(side, price, size): return
    """

    def __init__(self, strategy: 'BaseStrategy'):
        self.strategy = strategy

    def check_spread(self, tick, max_spread: float = 0.05) -> bool:
        """
        Returns True if spread is tight enough to trade.
        """
        if tick.spread > max_spread:
            # Only log occasionally to avoid spam, or debug level
            logger.debug(
                "Basic filter: Spread too wide (%.4f > %.2f). Skipping.",
                tick.spread, max_spread
            )
            return False
        return True

    def check_price_band(self, price: float, min_price: float = 0.02, max_price: float = 0.98) -> bool:
        """
        Returns True if price is within safe trading band (avoiding 0.00/1.00 extremes).
        """
        if not (min_price < price < max_price):
            logger.debug("Basic filter: Price %.4f out of safe band [%.2f, %.2f].", price, min_price, max_price)
            return False
        return True

    def check_bankroll(self, side: OrderSide, price: float, size: float) -> bool:
        """
        Returns True if we have sufficient funds/collateral for this trade.
        Uses the *latest* portfolio snapshot from the strategy.
        """
        portfolio = self.strategy.get_portfolio()
        if not portfolio:
            # If no portfolio data yet, assume safe or fail safe? 
            # Fail safe: don't trade until we have data.
            logger.warning("Basic filter: No portfolio snapshot available yet.")
            return False

        cost = 0.0
        if side == OrderSide.BUY:
            # Cost = Price * Size
            cost = price * size
        else:
            # Shorting (Sell) on Polymarket (CTF) usually involves Mint/Merge logic.
            # Simplified: 
            # If you OWN shares (Long), selling reduces position (Proceeds, no cost).
            # If you are OPENING a Short, you effectively Buy the opposite usage pair?
            # Or you mint sets (Cost = $1.00) and sell the other side?
            # 
            # In this simulator's simplified matching engine:
            # SELL usually implies "Selling existing Longs" OR "Shorting".
            # Currently matching engine handles Short as negative position?
            # Let's rely on bankroll. 
            # 
            # Conservative check: Ensure we have at least $1.00 * size buffer if logic is complex?
            # Actually, standard matching engine check:
            # If we are CLOSING a long position (Net Pos > 0), Cost = 0 (Proceeds).
            # If we are OPENING a short (Net Pos <= 0), Cost = (1.0 - Price) * Size (Collateral) ?
            #
            # Let's assume Worst Case: we pay full max-loss for the trade?
            # Or just check "Free Balance > Cost".
            cost = price * size # Proxy for now. Ideally should check "Collateral needed".
        
        # Add a safety buffer (e.g. for fees)
        estimated_fee = size * config.FLAT_FEE_PER_SHARE
        required = cost + estimated_fee

        if portfolio.bankroll < required:
            logger.warning(
                "💰 Filter blocked %s %.0f @ %.2f: Insufficient Funds (Have $%.2f, Need ~$%.2f)",
                side.value, size, price, portfolio.bankroll, required
            )
            return False

        return True
