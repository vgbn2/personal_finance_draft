"""
Monte Carlo & Black Swan stress testing module.

Runs N simulations with randomized shock injection to validate
strategy robustness under extreme market conditions.

Features:
  - Gaussian random walks with configurable drift/vol
  - Black Swan shock injection (5% chance of 50% crash)
  - VaR (Value at Risk) and CVaR (Expected Shortfall) calculation
  - Drawdown distribution analysis
"""
import numpy as np
import pandas as pd
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

from app.utils.logger import log


@dataclass
class MonteCarloResult:
    """Aggregated results from Monte Carlo simulation."""
    n_simulations: int = 0
    mean_pnl: float = 0.0
    median_pnl: float = 0.0
    std_pnl: float = 0.0
    var_95: float = 0.0          # 5th percentile PnL (95% VaR)
    var_99: float = 0.0          # 1st percentile PnL (99% VaR)
    cvar_95: float = 0.0         # Expected shortfall beyond 95% VaR
    max_drawdown_mean: float = 0.0
    max_drawdown_worst: float = 0.0
    win_rate_mean: float = 0.0
    ruin_probability: float = 0.0  # P(total loss > 50%)
    pnl_distribution: List[float] = field(default_factory=list)
    drawdown_distribution: List[float] = field(default_factory=list)

    def summary(self) -> str:
        return (
            f"Sims: {self.n_simulations} | "
            f"Mean PnL: ${self.mean_pnl:.2f} | "
            f"VaR95: ${self.var_95:.2f} | "
            f"CVaR95: ${self.cvar_95:.2f} | "
            f"MaxDD: {self.max_drawdown_worst:.1%} | "
            f"Ruin: {self.ruin_probability:.1%}"
        )


def generate_price_path(
    initial_price: float = 0.55,
    n_ticks: int = 500,
    drift: float = 0.0,
    volatility: float = 0.01,
    black_swan_prob: float = 0.05,
    black_swan_magnitude: float = 0.50,
    seed: Optional[int] = None,
) -> np.ndarray:
    """
    Generate a synthetic price path with optional Black Swan shocks.

    Args:
        initial_price: Starting price
        n_ticks: Number of ticks to generate
        drift: Annualized drift (0.0 = no trend)
        volatility: Per-tick volatility (standard deviation)
        black_swan_prob: Probability of a crash event per tick
        black_swan_magnitude: Size of crash (0.5 = 50% drop)
        seed: Random seed for reproducibility

    Returns:
        np.ndarray of prices
    """
    rng = np.random.default_rng(seed)

    returns = rng.normal(drift / n_ticks, volatility, n_ticks)

    # Inject Black Swan events
    swan_mask = rng.random(n_ticks) < black_swan_prob
    n_swans = swan_mask.sum()
    if n_swans > 0:
        returns[swan_mask] *= -(black_swan_magnitude / volatility)
        log.debug(f"Injected {n_swans} Black Swan events")

    prices = initial_price * np.cumprod(1 + returns)
    return np.clip(prices, 0.01, 0.99)  # Polymarket bounds


def calculate_max_drawdown(equity_curve: np.ndarray) -> float:
    """Calculate maximum drawdown from an equity curve."""
    if len(equity_curve) < 2:
        return 0.0
    peak = np.maximum.accumulate(equity_curve)
    drawdowns = (peak - equity_curve) / peak
    return float(np.max(drawdowns))


class MonteCarloEngine:
    """
    Monte Carlo simulation engine for strategy stress testing.

    Generates N random price paths and runs the strategy against each,
    collecting PnL, drawdown, and risk metrics.

    Usage:
        mc = MonteCarloEngine(n_simulations=1000)
        result = mc.run(strategy_factory, broker_factory)
        print(result.summary())
    """

    def __init__(
        self,
        n_simulations: int = 1000,
        n_ticks: int = 500,
        initial_price: float = 0.55,
        volatility: float = 0.01,
        black_swan_prob: float = 0.05,
        black_swan_magnitude: float = 0.50,
    ):
        self.n_simulations = n_simulations
        self.n_ticks = n_ticks
        self.initial_price = initial_price
        self.volatility = volatility
        self.black_swan_prob = black_swan_prob
        self.black_swan_magnitude = black_swan_magnitude

    def run(
        self,
        strategy_factory: Callable,
        broker_factory: Optional[Callable] = None,
    ) -> MonteCarloResult:
        """
        Run Monte Carlo simulation.

        Args:
            strategy_factory: Callable that returns a fresh strategy instance
            broker_factory: Callable that returns a fresh SimulatedBroker

        Returns:
            MonteCarloResult with aggregated statistics
        """
        from backtest.engine import SimulatedBroker, BacktestEngine

        pnls = []
        drawdowns = []
        win_rates = []

        log.info(f"Monte Carlo: starting {self.n_simulations} simulations "
                 f"({self.n_ticks} ticks each)")

        for i in range(self.n_simulations):
            # Generate random price path
            prices = generate_price_path(
                initial_price=self.initial_price,
                n_ticks=self.n_ticks,
                volatility=self.volatility,
                black_swan_prob=self.black_swan_prob,
                black_swan_magnitude=self.black_swan_magnitude,
                seed=i,
            )

            # Build DataFrame
            df = pd.DataFrame({
                "timestamp": pd.date_range("2025-01-01", periods=self.n_ticks, freq="1min"),
                "price": prices,
                "volume": np.random.uniform(100, 5000, self.n_ticks),
            })

            # Fresh strategy and broker per simulation
            strategy = strategy_factory()
            broker = broker_factory() if broker_factory else SimulatedBroker()

            engine = BacktestEngine(strategy=strategy, broker=broker)
            report = engine.run(df)

            pnls.append(report.total_pnl)
            drawdowns.append(report.max_drawdown)
            win_rates.append(report.win_rate)

        pnl_arr = np.array(pnls)
        dd_arr = np.array(drawdowns)

        # VaR and CVaR
        var_95 = float(np.percentile(pnl_arr, 5))
        var_99 = float(np.percentile(pnl_arr, 1))
        tail = pnl_arr[pnl_arr <= var_95]
        cvar_95 = float(np.mean(tail)) if len(tail) > 0 else var_95

        result = MonteCarloResult(
            n_simulations=self.n_simulations,
            mean_pnl=float(np.mean(pnl_arr)),
            median_pnl=float(np.median(pnl_arr)),
            std_pnl=float(np.std(pnl_arr)),
            var_95=var_95,
            var_99=var_99,
            cvar_95=cvar_95,
            max_drawdown_mean=float(np.mean(dd_arr)),
            max_drawdown_worst=float(np.max(dd_arr)),
            win_rate_mean=float(np.mean(win_rates)),
            ruin_probability=float(np.mean(pnl_arr < -5000)),
            pnl_distribution=pnls,
            drawdown_distribution=drawdowns,
        )

        log.info(f"Monte Carlo complete: {result.summary()}")
        return result


if __name__ == "__main__":
    print("=== Monte Carlo Self-Test ===")

    # Generate a single price path
    path = generate_price_path(n_ticks=100, seed=42)
    print(f"Price path: {path[0]:.4f} -> {path[-1]:.4f} ({len(path)} ticks)")

    # Check bounds
    assert np.all(path >= 0.01), "Prices should be >= 0.01"
    assert np.all(path <= 0.99), "Prices should be <= 0.99"

    # Drawdown calculation
    equity = np.array([100, 110, 105, 95, 100, 90])
    dd = calculate_max_drawdown(equity)
    print(f"Drawdown test: {dd:.1%} (expected ~18.2%)")
    assert abs(dd - 0.1818) < 0.01, f"Expected ~18.2%, got {dd:.1%}"

    # Mini Monte Carlo (fast)
    from backtest.engine import SimulatedBroker

    class DummyStrategy:
        def __init__(self):
            self.prev = None
        def on_tick(self, row):
            p = row["price"]
            sig = None
            if self.prev and p > self.prev * 1.003:
                sig = {"side": "BUY", "size_usd": 50, "market_id": "mc_test"}
            elif self.prev and p < self.prev * 0.997:
                sig = {"side": "SELL", "size_usd": 50, "market_id": "mc_test"}
            self.prev = p
            return sig
        def reset(self):
            self.prev = None

    mc = MonteCarloEngine(n_simulations=10, n_ticks=100)
    result = mc.run(
        strategy_factory=DummyStrategy,
        broker_factory=lambda: SimulatedBroker(initial_capital=10_000),
    )
    print(f"MC Result: {result.summary()}")
    assert result.n_simulations == 10
    print("[OK] All self-tests passed")
