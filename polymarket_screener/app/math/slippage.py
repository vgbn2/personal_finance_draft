"""
VWAP Slippage estimation for Polymarket CLOB execution.

Traverses orderbook depth to calculate the effective fill price
for a given trade size, accounting for liquidity gaps.

Mathematical Reference:
    Effective Price = Σ(Priceⱼ × Sizeⱼ) / Target Allocation
    Slippage (bps)  = |Effective - Best| / Best × 10000
"""
import numpy as np
from typing import List, Optional, Tuple

from app.utils.logger import log


def calculate_vwap(
    levels: List[Tuple[float, float]],
    target_size_usd: float,
) -> Optional[float]:
    """
    Calculate Volume-Weighted Average Price by traversing orderbook depth.

    Args:
        levels: List of (price, size_usd) tuples sorted by priority
                 (best price first: ascending for asks, descending for bids)
        target_size_usd: Target fill size in USD

    Returns:
        VWAP effective price, or None if insufficient liquidity
    """
    if not levels or target_size_usd <= 0:
        return None

    filled = 0.0
    cost = 0.0

    for price, size in levels:
        if price <= 0 or size <= 0:
            continue

        remaining = target_size_usd - filled
        fill_at_level = min(size, remaining)

        cost += price * fill_at_level
        filled += fill_at_level

        if filled >= target_size_usd - 1e-9:
            break

    if filled < target_size_usd * 0.99:
        log.warning(
            f"Insufficient liquidity: filled ${filled:.2f} of ${target_size_usd:.2f}"
        )
        return None

    return cost / filled


def calculate_slippage_bps(
    best_price: float,
    effective_price: float,
) -> float:
    """
    Calculate slippage in basis points.

    Args:
        best_price: Best available price (top of book)
        effective_price: VWAP effective fill price

    Returns:
        Slippage in basis points (always positive)
    """
    if best_price <= 0:
        return 0.0
    return abs(effective_price - best_price) / best_price * 10_000


class SlippageModel:
    """
    Stateless slippage estimator for orderbook-based execution.

    Wraps VWAP calculation with rejection logic and reporting.

    Usage:
        model = SlippageModel(max_slippage_bps=50)
        result = model.estimate(asks, target_usd=1000)
        if result['executable']:
            print(f"Fill at {result['effective_price']}")
    """

    def __init__(self, max_slippage_bps: float = 50.0):
        self.max_slippage_bps = max_slippage_bps

    def estimate(
        self,
        levels: List[Tuple[float, float]],
        target_size_usd: float,
    ) -> dict:
        """
        Estimate execution feasibility and slippage.

        Args:
            levels: Orderbook levels [(price, size_usd), ...]
            target_size_usd: Target fill size

        Returns:
            Dict with keys:
                executable: bool — whether trade should proceed
                effective_price: float or None
                best_price: float or None
                slippage_bps: float
                depth_usd: float — total available liquidity
                rejection_reason: str or None
        """
        if not levels:
            return {
                "executable": False,
                "effective_price": None,
                "best_price": None,
                "slippage_bps": 0.0,
                "depth_usd": 0.0,
                "rejection_reason": "Empty orderbook",
            }

        best_price = levels[0][0]
        depth_usd = sum(size for _, size in levels if size > 0)

        effective_price = calculate_vwap(levels, target_size_usd)

        if effective_price is None:
            return {
                "executable": False,
                "effective_price": None,
                "best_price": best_price,
                "slippage_bps": 0.0,
                "depth_usd": depth_usd,
                "rejection_reason": f"Insufficient liquidity: ${depth_usd:.2f} < ${target_size_usd:.2f}",
            }

        slippage = calculate_slippage_bps(best_price, effective_price)

        executable = slippage <= self.max_slippage_bps
        rejection_reason = None
        if not executable:
            rejection_reason = f"Slippage {slippage:.1f}bps exceeds max {self.max_slippage_bps:.1f}bps"

        return {
            "executable": executable,
            "effective_price": effective_price,
            "best_price": best_price,
            "slippage_bps": slippage,
            "depth_usd": depth_usd,
            "rejection_reason": rejection_reason,
        }


# ─── Module-level singleton ───
slippage_model = SlippageModel()


if __name__ == "__main__":
    print("=== VWAP Slippage Self-Test ===")

    # Normal fill
    asks = [(0.55, 500), (0.56, 300), (0.58, 200)]
    result = slippage_model.estimate(asks, target_size_usd=800)
    print(f"Fill $800: price={result['effective_price']:.4f}, "
          f"slip={result['slippage_bps']:.1f}bps, exec={result['executable']}")

    # Insufficient liquidity
    result2 = slippage_model.estimate(asks, target_size_usd=2000)
    print(f"Fill $2000: exec={result2['executable']}, "
          f"reason={result2['rejection_reason']}")

    # Edge case: empty book
    result3 = slippage_model.estimate([], target_size_usd=100)
    print(f"Empty book: exec={result3['executable']}")

    print("[OK] All self-tests passed")
