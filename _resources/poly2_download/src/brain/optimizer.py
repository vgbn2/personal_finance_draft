import numpy as np
from typing import Tuple, Optional


class Optimizer:
    """
    Optimization utilities for trading strategies.
    """
    
    @staticmethod
    def bregman_projection(prices: np.ndarray, max_iter: int = 100) -> np.ndarray:
        """
        Bregman projection onto the probability simplex.
        
        Used for finding the 'correct' price vector that satisfies Sum=1.
        
        Args:
            prices: Current price vector
            max_iter: Maximum iterations
            
        Returns:
            Projected price vector that sums to 1
        """
        n = len(prices)
        
        # Sort prices
        sorted_prices = np.sort(prices)[::-1]
        
        # Find lambda
        cumsum = np.cumsum(sorted_prices)
        lambda_vals = (cumsum - 1) / np.arange(1, n + 1)
        
        # Find where lambda < price
        indicator = lambda_vals < sorted_prices
        if np.any(indicator):
            lambda_star = lambda_vals[np.argmax(indicator)]
        else:
            lambda_star = lambda_vals[-1]
        
        # Project
        projected = np.maximum(prices - lambda_star, 0)
        
        return projected
    
    @staticmethod
    def compute_gradient(holdings: np.ndarray, target: np.ndarray) -> np.ndarray:
        """Compute gradient for Frank-Wolfe optimization."""
        return holdings - target
    
    @staticmethod
    def frank_wolfe_step(
        current: np.ndarray,
        target: np.ndarray,
        gamma: float = 0.5
    ) -> np.ndarray:
        """
        Single Frank-Wolfe optimization step.
        
        Args:
            current: Current position
            target: Target position
            gamma: Step size (0-1)
            
        Returns:
            New position
        """
        gradient = Optimizer.compute_gradient(current, target)
        
        # Find direction (vertex of feasible region)
        direction = np.zeros_like(current)
        direction[np.argmin(gradient)] = 1.0
        
        # Line search
        new = current + gamma * (direction - current)
        
        return new


def solve_arb(
    yes_asks: list[Tuple[float, float]],
    no_asks: list[Tuple[float, float]],
    target_qty: float = 1.0,
    threshold: float = 0.96
) -> Optional[dict]:
    """
    Solve for arbitrage opportunity.
    
    Args:
        yes_asks: List of (price, size) tuples for YES
        no_asks: List of (price, size) tuples for NO
        target_qty: Target quantity
        threshold: Maximum total cost threshold
    
    Returns:
        Dict with arbitrage details or None
    """
    total_cost = 0.0
    yes_qty = 0.0
    no_qty = 0.0
    
    remaining = target_qty
    
    # Fill YES
    for price, size in yes_asks:
        if remaining <= 0:
            break
        fill = min(remaining, size)
        total_cost += fill * price
        yes_qty += fill
        remaining -= fill
    
    # Fill NO
    remaining = target_qty
    for price, size in no_asks:
        if remaining <= 0:
            break
        fill = min(remaining, size)
        total_cost += fill * price
        no_qty += fill
        remaining -= fill
    
    if total_cost < threshold and yes_qty > 0 and no_qty > 0:
        return {
            "yes_qty": yes_qty,
            "no_qty": no_qty,
            "total_cost": total_cost,
            "profit": target_qty - total_cost,
            "profit_pct": (target_qty - total_cost) / total_cost
        }
    
    return None
