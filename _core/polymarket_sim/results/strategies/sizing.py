"""
Kelly Criterion Position Sizing
===============================
Calculates optimal position sizes based on the "edge" (advantage) over the market.

Formula: f* = (bp - q) / b
Where:
  f* = fraction of bankroll to wager
  b  = net odds received (decimal odds - 1)
  p  = probability of winning (our model's confidence)
  q  = probability of losing (1 - p)

Also applies:
  - Fractional Kelly (safety multiplier, e.g., 0.5x)
  - Max risk per trade (cap)
  - Min order size (floor)
"""

import logging
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SizingConfig:
    """Configuration for position sizing."""
    fractional_kelly: float = 0.25   # Safety factor (0.25 = Quarter Kelly, very safe)
    max_risk_per_trade: float = 0.05 # Never bet more than 5% of bankroll on one trade
    min_order_size: float = 2.0      # Minimum order size in USDC
    max_order_size: float = 500.0    # Hard cap on order size


class KellySizer:
    """Helper to calculate trade sizes dynamically."""

    def __init__(self, config: SizingConfig = None):
        self.config = config or SizingConfig()

    def calculate_size(self, bankroll: float, win_prob: float, price: float) -> float:
        """
        Calculate optimal order size in USDC.
        
        Args:
            bankroll: Current available funds (USDC).
            win_prob: Estimated probability of winning [0.0 - 1.0].
            price: Market price of the outcome [0.0 - 1.0] (cost basis).
                     Decimal odds = 1 / price.
                     Net odds (b) = (1 / price) - 1.
        
        Returns:
            float: Size in USDC to bet.
        """
        if price <= 0 or price >= 1:
            return 0.0

        if win_prob <= 0.5:
             # Basic filter: If we don't have >50% confidence, don't define edge here.
             # (Unless shorting, but this calculator assumes "win_prob" is for the side we are taking)
             if win_prob < price:
                 return 0.0

        # Kelly Formula Parts
        # b = net odds = (Payout / Cost) - 1 = (1 / price) - 1
        # f = (bp - q) / b
        # Simplified for binary options: f = (p - price) / (1 - price) ???
        # Let's stick to the classic form:
        
        decimal_odds = 1.0 / price
        b = decimal_odds - 1.0
        p = win_prob
        q = 1.0 - p
        
        if b <= 0:
            return 0.0

        # Full Kelly Fraction
        f_star = (b * p - q) / b

        if f_star <= 0:
            return 0.0

        # Apply safety multiplier (Fractional Kelly)
        safe_f = f_star * self.config.fractional_kelly
        
        # Apply hard cap (Max Risk)
        final_fraction = min(safe_f, self.config.max_risk_per_trade)
        
        # Calculate raw size
        raw_size = bankroll * final_fraction

        # Clamp to min/max
        if raw_size < self.config.min_order_size:
            return 0.0  # Too small to be worth it
            
        final_size = min(raw_size, self.config.max_order_size)

        return round(final_size, 2)
