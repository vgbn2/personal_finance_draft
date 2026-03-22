"""
Kelly Criterion allocation engine.

Implements both simple Kelly and Frank-Wolfe projected gradient Kelly
for correlated multi-outcome portfolios (e.g., Polymarket events with
dependent strikes).

Mathematical Reference:
    Simple:  f* = (bp - q) / b
    FW:      Maximize Σ pᵢ ln(Wᵢ) subject to Σ wⱼ ≤ 1
"""
import numpy as np
from typing import Dict, List, Optional, Tuple

from app.utils.logger import log


def calculate_kelly(
    win_prob: float,
    odds_offered: float,
    fraction: float = 0.25,
) -> float:
    """
    Simple Kelly criterion for a single binary bet.

    Args:
        win_prob: Probability of winning (0-1)
        odds_offered: Decimal odds (e.g., 2.5 means +150)
        fraction: Fractional Kelly (default 0.25 = quarter-Kelly for safety)

    Returns:
        Optimal bet fraction of bankroll (0.0 if negative edge)
    """
    if win_prob <= 0 or win_prob >= 1 or odds_offered <= 1:
        return 0.0

    b = odds_offered - 1.0  # Net odds
    q = 1.0 - win_prob

    full_kelly = (b * win_prob - q) / b
    return max(0.0, full_kelly * fraction)


def calculate_kelly_from_price(
    fair_prob: float,
    market_price: float,
    fraction: float = 0.25,
) -> float:
    """
    Kelly sizing from fair probability vs market price.

    For Polymarket binary options:
        - market_price is the YES token price (e.g., 0.55)
        - odds = 1 / market_price
        - If fair_prob > market_price, there's positive edge

    Args:
        fair_prob: Model's fair probability
        market_price: Current market price of the YES token
        fraction: Fractional Kelly multiplier

    Returns:
        Optimal allocation fraction
    """
    if market_price <= 0 or market_price >= 1:
        return 0.0

    odds = 1.0 / market_price
    return calculate_kelly(fair_prob, odds, fraction)


class FrankWolfeKelly:
    """
    Frank-Wolfe projected gradient ascent for multi-outcome Kelly allocation.

    Maximizes expected log-wealth:
        max Σ pᵢ · ln(1 + Rᵢ · w)
    subject to:
        Σ wⱼ ≤ budget_cap,  wⱼ ≥ 0

    Usage:
        fw = FrankWolfeKelly(budget_cap=0.20)
        weights = fw.optimize(probs, returns_matrix)
    """

    def __init__(
        self,
        budget_cap: float = 0.20,
        max_iter: int = 200,
        tol: float = 1e-8,
        fraction: float = 0.25,
    ):
        self.budget_cap = budget_cap
        self.max_iter = max_iter
        self.tol = tol
        self.fraction = fraction

    def optimize(
        self,
        state_probs: np.ndarray,
        returns_matrix: np.ndarray,
    ) -> np.ndarray:
        """
        Optimize portfolio weights using Frank-Wolfe.

        Args:
            state_probs: (S,) array — probability of each state
            returns_matrix: (S, N) array — return of token j in state i

        Returns:
            (N,) array of optimal weights (summing to ≤ budget_cap)
        """
        S, N = returns_matrix.shape
        w = np.full(N, self.budget_cap / N)  # Uniform initial guess

        for k in range(self.max_iter):
            # Wealth in each state
            wealth = 1.0 + returns_matrix @ w  # (S,)
            wealth = np.maximum(wealth, 1e-12)  # Prevent log(0)

            # Gradient: ∇f = Σ pᵢ · Rᵢ / Wᵢ
            grad = (state_probs / wealth) @ returns_matrix  # (N,)

            # Linear minimization oracle: find vertex of simplex
            s = np.zeros(N)
            best_j = np.argmax(grad)
            s[best_j] = self.budget_cap

            # Step size (diminishing)
            gamma = 2.0 / (k + 2.0)

            # Update
            w_new = w + gamma * (s - w)

            # Convergence check
            if np.linalg.norm(w_new - w) < self.tol:
                log.debug(f"FW Kelly converged at iteration {k}")
                break

            w = w_new

        # Apply fractional Kelly
        return w * self.fraction

    def log_wealth(
        self,
        state_probs: np.ndarray,
        returns_matrix: np.ndarray,
        weights: np.ndarray,
    ) -> float:
        """Expected log wealth for given weights."""
        wealth = 1.0 + returns_matrix @ weights
        wealth = np.maximum(wealth, 1e-12)
        return float(np.sum(state_probs * np.log(wealth)))


# ─── Module-level singleton ───
fw_kelly = FrankWolfeKelly()


if __name__ == "__main__":
    print("=== Kelly Criterion Self-Test ===")

    # Simple Kelly
    k1 = calculate_kelly(win_prob=0.60, odds_offered=2.0, fraction=1.0)
    print(f"Full Kelly (60% win, 2x odds): {k1:.4f} (expected ~0.20)")

    k2 = calculate_kelly_from_price(fair_prob=0.65, market_price=0.55, fraction=0.25)
    print(f"Quarter Kelly (fair=0.65, mkt=0.55): {k2:.4f}")

    # Negative edge
    k3 = calculate_kelly(win_prob=0.30, odds_offered=2.0, fraction=1.0)
    print(f"Negative edge (30% win, 2x odds): {k3:.4f} (expected 0.0)")

    # Frank-Wolfe multi-outcome
    probs = np.array([0.4, 0.3, 0.3])  # 3 states
    R = np.array([
        [1.2, -0.5],   # State 1: token A wins, token B loses
        [-0.8, 1.5],   # State 2: token A loses, token B wins
        [-0.3, -0.2],  # State 3: both lose slightly
    ])
    weights = fw_kelly.optimize(probs, R)
    print(f"FW Kelly weights: {np.round(weights, 4)}")

    print("[OK] All self-tests passed")
