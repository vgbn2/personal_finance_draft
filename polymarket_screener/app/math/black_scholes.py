"""
Vectorized Black-Scholes Engine for binary option pricing.

Uses NumPy for array-based computation — can price hundreds of outcomes
in a single call with sub-millisecond latency.

Mathematical Reference:
    d1 = [ln(S/K) + (r + σ²/2)t] / (σ√t)
    d2 = d1 - σ√t
    P(S > K) = Φ(d2)   (binary call probability)
"""
import numpy as np
from scipy.stats import norm
from typing import Dict, Optional, Union

from app.utils.logger import log


# ─── Type aliases for clarity ───
ArrayLike = Union[float, np.ndarray]


def vectorized_nd2(
    S: ArrayLike,
    K: ArrayLike,
    T: ArrayLike,
    sigma: ArrayLike,
    r: float = 0.05,
) -> np.ndarray:
    """
    Vectorized N(d2) — the risk-neutral probability that S > K at expiry.

    Args:
        S: Spot price(s) — scalar or array
        K: Strike price(s) — scalar or array
        T: Time to expiry in YEARS — scalar or array
        sigma: Implied volatility (decimal, e.g. 0.60 for 60%) — scalar or array
        r: Risk-free rate (annualized, default 5%)

    Returns:
        np.ndarray of probabilities in [0, 1]
    """
    S = np.asarray(S, dtype=np.float64)
    K = np.asarray(K, dtype=np.float64)
    T = np.asarray(T, dtype=np.float64)
    sigma = np.asarray(sigma, dtype=np.float64)

    # Edge case: expired options
    expired = T <= 0
    # Edge case: zero vol
    zero_vol = sigma <= 0

    # Safe sqrt(T) and sigma (avoid divide-by-zero)
    safe_T = np.where(expired | zero_vol, 1.0, T)
    safe_sigma = np.where(expired | zero_vol, 1.0, sigma)

    sqrt_T = np.sqrt(safe_T)
    d1 = (np.log(S / K) + (r + 0.5 * safe_sigma**2) * safe_T) / (safe_sigma * sqrt_T)
    d2 = d1 - safe_sigma * sqrt_T

    # Guard against Inf/NaN from extreme inputs (Hypothesis-discovered)
    d2 = np.nan_to_num(d2, nan=0.0, posinf=37.0, neginf=-37.0)

    result = norm.cdf(d2)

    # Override edge cases
    result = np.where(expired, np.where(S >= K, 1.0, 0.0), result)
    result = np.where(~expired & zero_vol, np.where(S >= K, 1.0, 0.0), result)

    # Final safety clamp to [0, 1]
    result = np.clip(result, 0.0, 1.0)

    return result


class BlackScholes:
    """
    Stateless vectorized Black-Scholes pricer for Polymarket binary options.

    Usage:
        bs = BlackScholes(vrp_discount=0.85)
        probs = bs.fair_price(spot=67500, strike=68000, dte=1, iv=62.0)
        greeks = bs.greeks(spot=67500, strike=68000, dte=1, iv=62.0)
    """

    def __init__(self, vrp_discount: float = 0.85):
        self.vrp_discount = vrp_discount

    def fair_price(
        self,
        spot: ArrayLike,
        strike: ArrayLike,
        dte: ArrayLike,
        iv: ArrayLike,
        r: float = 0.05,
        apply_vrp: bool = True,
    ) -> np.ndarray:
        """
        Fair probability (N(d2)) for binary call options.

        Args:
            spot: Spot price(s)
            strike: Strike price(s)
            dte: Days to expiry (converted to years internally)
            iv: Implied volatility in PERCENTAGE (e.g. 62 for 62%)
            r: Risk-free rate
            apply_vrp: If True, apply VRP haircut to IV

        Returns:
            np.ndarray of fair probabilities
        """
        iv_arr = np.asarray(iv, dtype=np.float64)
        sigma = iv_arr / 100.0  # Convert percentage to decimal

        if apply_vrp:
            sigma = sigma * self.vrp_discount

        T = np.asarray(dte, dtype=np.float64) / 365.0

        return vectorized_nd2(spot, strike, T, sigma, r)

    def greeks(
        self,
        spot: ArrayLike,
        strike: ArrayLike,
        dte: ArrayLike,
        iv: ArrayLike,
        r: float = 0.05,
    ) -> Dict[str, np.ndarray]:
        """
        Calculate option Greeks for binary options (vectorized).

        Returns:
            Dict with keys: delta, gamma, theta, vega (all np.ndarray)
        """
        S = np.asarray(spot, dtype=np.float64)
        K = np.asarray(strike, dtype=np.float64)
        T = np.asarray(dte, dtype=np.float64) / 365.0
        sigma = np.asarray(iv, dtype=np.float64) / 100.0

        # Guard against edge cases
        safe = (T > 0) & (sigma > 0)
        safe_T = np.where(safe, T, 1.0)
        safe_sigma = np.where(safe, sigma, 1.0)

        sqrt_T = np.sqrt(safe_T)
        d1 = (np.log(S / K) + (r + 0.5 * safe_sigma**2) * safe_T) / (safe_sigma * sqrt_T)

        # Standard normal PDF
        pdf_d1 = norm.pdf(d1)

        # Binary option greeks
        delta = np.where(safe, pdf_d1 / (S * safe_sigma * sqrt_T), 0.0)
        gamma = np.where(safe, delta * (d1 / (S * safe_sigma * sqrt_T)), 0.0)
        theta = np.where(safe, -(S * pdf_d1 * safe_sigma) / (2 * sqrt_T), 0.0)
        vega = np.where(safe, S * sqrt_T * pdf_d1, 0.0)

        return {
            "delta": delta,
            "gamma": gamma,
            "theta": theta,
            "vega": vega,
        }

    def edge(
        self,
        fair_prob: ArrayLike,
        market_price: ArrayLike,
    ) -> np.ndarray:
        """
        Calculate edge: fair_prob - market_price.
        Positive edge = underpriced (buy opportunity).
        """
        return np.asarray(fair_prob) - np.asarray(market_price)


# ─── Module-level singleton ───
bs_engine = BlackScholes()


if __name__ == "__main__":
    # Self-test
    print("=== Vectorized Black-Scholes Self-Test ===")

    # Scalar test
    p = bs_engine.fair_price(spot=67500, strike=68000, dte=1, iv=62.0)
    print(f"Single: P(BTC > 68k | 1 DTE, 62% IV) = {p.item():.4f}")

    # Vectorized test (price 5 strikes at once)
    strikes = np.array([65000, 66000, 67000, 68000, 69000])
    probs = bs_engine.fair_price(
        spot=67500, strike=strikes, dte=1, iv=62.0
    )
    print(f"Vector: P(BTC > strikes) = {np.round(probs, 4)}")

    # Greeks
    g = bs_engine.greeks(spot=67500, strike=68000, dte=1, iv=62.0)
    print(f"Greeks: delta={g['delta'].item():.6f}, vega={g['vega'].item():.4f}")

    # Edge case: expired
    p_exp = bs_engine.fair_price(spot=68000, strike=67000, dte=0, iv=30.0)
    print(f"Expired ITM: {p_exp.item()} (should be 1.0)")

    p_otm = bs_engine.fair_price(spot=66000, strike=67000, dte=0, iv=30.0)
    print(f"Expired OTM: {p_otm.item()} (should be 0.0)")

    print("[OK] All self-tests passed")
