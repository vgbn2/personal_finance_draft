# Backtesting and Financial Analysis Tools

This directory contains a collection of Python scripts and Jupyter notebooks designed for quantitative finance, backtesting trading strategies, and performing statistical analysis on financial market data.

## Contents

### Scripts
- **`backtest.py`**: A Python script that implements a simple backtesting engine. It currently features an RSI-based strategy example on BTC-USD data using `yfinance` and `pandas_ta`.
- **`indicatorscode.py`**: A comprehensive script that calculates and plots 10 popular technical indicators (SMA, EMA, MACD, RSI, Bollinger Bands, Stochastic, CCI, OBV, ROC, Williams %R) for market analysis.

### Notebooks
- **`backtest.ipynb`**: An interactive Jupyter notebook for backtesting strategies, allowing for step-by-step execution and visualization of strategy performance.
- **`regression_analysis.ipynb`**: A notebook dedicated to performing regression analysis on financial data to model relationships between assets or variables.
- **`statistical_analysis.ipynb`**: Contains various statistical tests and analyses to understand market distributions, correlations, and other statistical properties.
- **`standard_deviation.ipynb`**: Focuses on volatility analysis using standard deviation and other risk metrics.
- **`blackschole.ipynb`**: Implements the Black-Scholes model for pricing options and analyzing greeks.
- **`backtestfx.ipynb`**: A notebook tailored for backtesting strategies specifically in the Forex (Foreign Exchange) market.
- **`strategy.ipynb`**: A playground for implementing and testing different algorithmic trading strategies.

## Requirements

To run these scripts and notebooks, you will need the following Python libraries:

```bash
pip install yfinance pandas pandas_ta matplotlib numpy
```

## Usage

1.  **Scripts**: Run directly from the command line.
    ```bash
    python backtest.py
    ```
2.  **Notebooks**: Open with Jupyter Notebook or JupyterLab to explore the data and run cells interactively.
