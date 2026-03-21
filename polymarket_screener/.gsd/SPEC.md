# Polymarket Screener & Backtester Framework - SPEC
Status: FINALIZED

## Overview
A modular, event-driven framework for screening Polymarket events, backtesting strategies on historical data, and paper trading (front testing) live strategies. It leverages external crypto exchange data (Binance for OHLCV, Deribit for OHLCV & Options Greeks) and Macroeconomic Data to calculate and price trades. 
Execution runs locally with NO DOCKER to ensure stability and easy debugging.

## Architecture Guidelines
- **Configuration** (`config/strategy_params.json/yaml`): Exposes parameters per-asset (e.g., BTC, ETH) and per-event type (e.g., tweet markets). Supports configuration grids for optimization.
- **External Data Ingestion** (`data/exchanges/`):
  - `binance_client.py`: Fetches spot and futures OHLCV data from Binance.
  - `deribit_client.py`: Fetches options data, implied volatility (IV), and Greeks (Delta, Gamma, Theta, Vega) from Deribit.
  - `macro_client.py`: Integrates macroeconomic data (Fed Watch for rate hike/cut probabilities, CPI, etc.).
  - `sentiment_client.py`: Integrates crowd sentiment data (e.g., Twitter/X, Reddit, or specific sentiment APIs).
  - `data_aggregator.py`: Merges and synchronizes OHLCV, Greeks, Macro, Sentiment, and Polymarket data. Includes strict data freshness checks (rejects stale data).
- **Polymarket Data Layer** (`data/polymarket/`):
  - `gamma_client.py`: Interfaces with Polymarket's Gamma API.
  - `clob_client.py`: Interfaces with Polymarket's CLOB API.
- **Storage** (`data/storage.py`): Caches historical data locally (SQLite or Parquet).
- **Screener** (`screener/market_screener.py`): Allows selecting specific assets or distinct event types (e.g., tweet markets). Filters based on custom criteria.
- **Strategy Interface** (`strategy/base.py`): The `BaseStrategy` class that users inherit from.
- **Backtesting & Validation Engine** (`backtest/`): 
  - Main loop (`engine.py`), execution (`broker.py`), tracking (`portfolio.py`).
  - Optimization & Robustness (`optimizer.py` and `monte_carlo.py`): Supports testing strategy robustness via Monte Carlo simulations, parameter configuration sweeps, and advanced statistical metrics.
- **Paper Trading Engine** (`live/paper_trader.py`): Connects to live WS/REST endpoints.

## Verification Requirements
- Validate Binance/Deribit data fetchers pull fresh data and reject stale data.
- Verify Macro data integration against the Terminus macro implementation.
- Test local execution (NO DOCKER) of the entire pipeline.
