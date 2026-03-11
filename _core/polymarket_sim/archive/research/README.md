# 🧪 Quant Research Laboratory

This directory contains advanced quantitative analysis tools for strategy validation.

## Modules

### 1. `markov_analysis.py`
**Purpose**: Analyze market state transitions.
- Calculates probabilities of Price Up vs Price Down given the previous N ticks.
- Helps identify if the market is Mean Reverting (P(Reversal) > 0.5) or Trending (P(Continuation) > 0.5).

### 2. `monte_carlo.py`
**Purpose**: Stress-test strategies using resampling.
- Takes a list of historical trade returns.
- Resamples them (bootstrapping) to generate 10,000+ possible equity curves.
- Calculates VaR (Value at Risk) and Risk of Ruin probabilities.

### 3. `strategy_lab.ipynb` (or `.py`)
**Purpose**: Rapid prototyping environment.
- Load historical Parquet data.
- Run backtests without the full engine overhead.
- Visualize results using `matplotlib` / `seaborn`.

## Usage
```bash
# Run Monte Carlo simulation on a strategy's trade history
python -m polymarket_sim.research.monte_carlo --trades data/trades.db
```
