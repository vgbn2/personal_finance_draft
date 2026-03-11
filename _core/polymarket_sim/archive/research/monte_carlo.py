
"""
Monte Carlo Simulation for Equity Curve Stress Testing.
Resamples historical trade PnLs to generate thousands of possible future outcomes.
"""

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from typing import List, Tuple

class MonteCarloSimulator:
    def __init__(self, trade_pnls: List[float], initial_capital: float = 1000.0):
        """
        Args:
            trade_pnls: List of profit/loss per trade (e.g. [+50, -20, +100])
            initial_capital: Starting bankroll for simulation
        """
        self.trades = np.array(trade_pnls)
        self.capital = initial_capital
        self.simulations = []

    def run(self, num_sims: int = 1000, trades_per_sim: int = 100) -> np.ndarray:
        """
        Run the Monte Carlo simulation.
        Returns:
            Array of shape (num_sims, trades_per_sim) containing cumulative equity.
        """
        results = np.zeros((num_sims, trades_per_sim))
        
        for i in range(num_sims):
            # Bootstrap resampling with replacement
            simulated_trades = np.random.choice(self.trades, size=trades_per_sim, replace=True)
            equity_curve = np.cumsum(simulated_trades) + self.capital
            results[i] = equity_curve

        self.simulations = results
        return results

    def get_stats(self) -> dict:
        """
        Calculate key risk metrics from simulations.
        """
        if len(self.simulations) == 0:
            return {}

        final_values = self.simulations[:, -1]
        
        # Risk of Ruin: Probability equity drops <= 0 at any point
        ruin_counts = np.sum(np.min(self.simulations, axis=1) <= 0)
        risk_of_ruin = ruin_counts / len(self.simulations)

        # VaR 95% (Value at Risk)
        var_95 = np.percentile(final_values, 5)
        
        # Median Outcome
        median_equity = np.median(final_values)

        return {
            "risk_of_ruin_pct": risk_of_ruin * 100,
            "VaR_95": var_95,
            "median_equity": median_equity,
            "min_equity": np.min(final_values),
            "max_equity": np.max(final_values)
        }

    def plot(self, title="Monte Carlo Simulation"):
        """
        Plot a subset of simulations.
        """
        if len(self.simulations) == 0:
            print("Run simulation first.")
            return

        plt.figure(figsize=(10, 6))
        # Plot first 100 paths
        for i in range(min(100, len(self.simulations))):
            plt.plot(self.simulations[i], color='gray', alpha=0.1)
        
        # Plot mean path
        mean_path = np.mean(self.simulations, axis=0)
        plt.plot(mean_path, color='blue', linewidth=2, label='Mean Path')
        
        plt.title(title)
        plt.xlabel("Trade #")
        plt.ylabel("Equity ($)")
        plt.axhline(y=self.capital, color='r', linestyle='--', label='Start Capital')
        plt.legend()
        plt.show()

if __name__ == "__main__":
    # Example Usage
    dummy_trades = [50, -20, 30, -10, 100, -50, 10, 10, -5, 80]
    mc = MonteCarloSimulator(dummy_trades, initial_capital=1000)
    mc.run(num_sims=500, trades_per_sim=50)
    stats = mc.get_stats()
    print("Stats:", stats)
