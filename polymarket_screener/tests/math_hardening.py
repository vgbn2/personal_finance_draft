"""
Mathematical Hardening Tests — Property-Based Validation.

Uses the Hypothesis library to run property-based (fuzz) tests on:
  1. Black-Scholes: Never returns NaN, even with IV=0 or DTE=0
  2. Kelly Optimizer: Weights always ≤ 1.0, never negative
  3. VWAP Slippage: Handles empty orderbooks, never crashes

Goal: 100,000+ generated edge-cases fail to crash the math engine.
"""
import numpy as np
import pytest
from hypothesis import given, strategies as st, settings, HealthCheck

from app.math.black_scholes import vectorized_nd2, BlackScholes
from app.math.kelly import calculate_kelly, calculate_kelly_from_price, FrankWolfeKelly
from app.math.slippage import calculate_vwap, calculate_slippage_bps, SlippageModel


# ═══════════════════════════════════════════════════════
# BLACK-SCHOLES HARDENING
# ═══════════════════════════════════════════════════════

class TestBlackScholesHardening:
    """Prove Black-Scholes never returns NaN or Inf under any input."""

    @given(
        S=st.floats(min_value=0.01, max_value=1_000_000.0),
        K=st.floats(min_value=0.01, max_value=1_000_000.0),
        T=st.floats(min_value=0.0, max_value=10.0),
        sigma=st.floats(min_value=0.0, max_value=10.0),
        r=st.floats(min_value=-0.5, max_value=0.5),
    )
    @settings(max_examples=10000, suppress_health_check=[HealthCheck.too_slow])
    def test_nd2_never_nan(self, S, K, T, sigma, r):
        """N(d2) must never produce NaN regardless of inputs."""
        result = vectorized_nd2(S, K, T, sigma, r)
        assert not np.isnan(result).any(), f"NaN for S={S}, K={K}, T={T}, σ={sigma}"
        assert not np.isinf(result).any(), f"Inf for S={S}, K={K}, T={T}, σ={sigma}"

    @given(
        S=st.floats(min_value=0.01, max_value=1_000_000.0),
        K=st.floats(min_value=0.01, max_value=1_000_000.0),
        T=st.floats(min_value=0.0, max_value=10.0),
        sigma=st.floats(min_value=0.0, max_value=10.0),
    )
    @settings(max_examples=5000, suppress_health_check=[HealthCheck.too_slow])
    def test_nd2_bounded_zero_one(self, S, K, T, sigma):
        """N(d2) must always be in [0, 1] — it's a probability."""
        result = vectorized_nd2(S, K, T, sigma)
        assert np.all(result >= 0.0), f"Below 0 for S={S}, K={K}"
        assert np.all(result <= 1.0), f"Above 1 for S={S}, K={K}"

    def test_expired_itm_returns_one(self):
        """Expired In-The-Money option → probability = 1.0."""
        bs = BlackScholes()
        p = bs.fair_price(spot=100, strike=90, dte=0, iv=30.0)
        assert p.item() == 1.0

    def test_expired_otm_returns_zero(self):
        """Expired Out-of-The-Money option → probability = 0.0."""
        bs = BlackScholes()
        p = bs.fair_price(spot=80, strike=90, dte=0, iv=30.0)
        assert p.item() == 0.0

    @given(
        spot=st.floats(min_value=0.01, max_value=100_000.0),
        strike=st.floats(min_value=0.01, max_value=100_000.0),
        dte=st.floats(min_value=0.001, max_value=365.0),
        iv=st.floats(min_value=1.0, max_value=500.0),
    )
    @settings(max_examples=5000, suppress_health_check=[HealthCheck.too_slow])
    def test_greeks_never_nan(self, spot, strike, dte, iv):
        """Greeks must never return NaN."""
        bs = BlackScholes()
        greeks = bs.greeks(spot=spot, strike=strike, dte=dte, iv=iv)
        for name, val in greeks.items():
            assert not np.isnan(val).any(), f"NaN in {name}"
            assert not np.isinf(val).any(), f"Inf in {name}"


# ═══════════════════════════════════════════════════════
# KELLY CRITERION HARDENING
# ═══════════════════════════════════════════════════════

class TestKellyHardening:
    """Prove Kelly never recommends > 100% allocation or negative sizing."""

    @given(
        win_prob=st.floats(min_value=0.0, max_value=1.0),
        odds=st.floats(min_value=1.01, max_value=100.0),
        fraction=st.floats(min_value=0.01, max_value=1.0),
    )
    @settings(max_examples=10000, suppress_health_check=[HealthCheck.too_slow])
    def test_kelly_never_negative(self, win_prob, odds, fraction):
        """Kelly fraction must always be ≥ 0."""
        result = calculate_kelly(win_prob, odds, fraction)
        assert result >= 0.0, f"Negative Kelly: {result}"

    @given(
        win_prob=st.floats(min_value=0.0, max_value=1.0),
        odds=st.floats(min_value=1.01, max_value=100.0),
    )
    @settings(max_examples=5000, suppress_health_check=[HealthCheck.too_slow])
    def test_full_kelly_never_exceeds_one(self, win_prob, odds):
        """Full Kelly (fraction=1.0) must never exceed 1.0."""
        result = calculate_kelly(win_prob, odds, fraction=1.0)
        assert result <= 1.0, f"Kelly > 1.0: {result}"

    @given(
        fair_prob=st.floats(min_value=0.01, max_value=0.99),
        market_price=st.floats(min_value=0.01, max_value=0.99),
    )
    @settings(max_examples=5000, suppress_health_check=[HealthCheck.too_slow])
    def test_kelly_from_price_bounded(self, fair_prob, market_price):
        """Kelly from price must be in [0, 1]."""
        result = calculate_kelly_from_price(fair_prob, market_price)
        assert 0.0 <= result <= 1.0, f"Out of range: {result}"

    def test_zero_edge_returns_zero(self):
        """No edge → Kelly recommends zero allocation."""
        result = calculate_kelly(win_prob=0.50, odds_offered=2.0, fraction=1.0)
        assert result == 0.0

    def test_fw_weights_sum_bounded(self):
        """Frank-Wolfe weights must sum ≤ budget_cap."""
        fw = FrankWolfeKelly(budget_cap=0.20, fraction=1.0)
        probs = np.array([0.4, 0.3, 0.3])
        R = np.array([
            [1.2, -0.5],
            [-0.8, 1.5],
            [-0.3, -0.2],
        ])
        weights = fw.optimize(probs, R)
        assert np.sum(weights) <= 0.20 + 1e-6, f"Sum exceeds cap: {np.sum(weights)}"
        assert np.all(weights >= 0), f"Negative weight found: {weights}"


# ═══════════════════════════════════════════════════════
# SLIPPAGE MODEL HARDENING
# ═══════════════════════════════════════════════════════

class TestSlippageHardening:
    """Prove slippage model handles all edge cases gracefully."""

    def test_empty_orderbook_returns_none(self):
        """Empty orderbook should return None (no crash)."""
        result = calculate_vwap([], 1000.0)
        assert result is None

    def test_zero_target_returns_none(self):
        """Zero target size should return None."""
        result = calculate_vwap([(0.55, 500)], 0.0)
        assert result is None

    def test_negative_target_returns_none(self):
        """Negative target size should return None."""
        result = calculate_vwap([(0.55, 500)], -100.0)
        assert result is None

    @given(
        best_price=st.floats(min_value=0.01, max_value=1.0),
        effective_price=st.floats(min_value=0.01, max_value=1.0),
    )
    @settings(max_examples=5000, suppress_health_check=[HealthCheck.too_slow])
    def test_slippage_bps_never_negative(self, best_price, effective_price):
        """Slippage in bps must always be ≥ 0."""
        result = calculate_slippage_bps(best_price, effective_price)
        assert result >= 0.0, f"Negative slippage: {result}"

    def test_model_rejects_empty_book(self):
        """SlippageModel returns executable=False for empty orderbook."""
        model = SlippageModel()
        result = model.estimate([], 1000.0)
        assert result["executable"] is False
        assert result["rejection_reason"] == "Empty orderbook"

    def test_model_rejects_insufficient_liquidity(self):
        """SlippageModel flags insufficient liquidity."""
        model = SlippageModel()
        result = model.estimate([(0.55, 100)], 500.0)
        assert result["executable"] is False
        assert "Insufficient liquidity" in result["rejection_reason"]
