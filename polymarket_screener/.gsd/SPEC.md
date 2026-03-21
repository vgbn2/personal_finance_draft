# Polymarket Screener & Backtester Framework - SPEC
Status: FINALIZED

## Overview
A modular, event-driven framework for screening Polymarket events, backtesting strategies on historical data, and paper trading (front testing) live strategies. It leverages external crypto exchange data (Binance for OHLCV, Deribit for OHLCV & Options Greeks) and Macroeconomic Data to calculate and price trades. 
Execution runs locally with NO DOCKER to ensure stability and easy debugging.

## Architecture Guidelines
- **Configuration** (`config/strategy_params.json/yaml`): Exposes parameters per-asset (e.g., BTC, ETH) and per-event type. Supports configuration grids and risk limits.
- **Data Ingestion Layer** (`data/`):
  - `binance_client.py`, `deribit_client.py`: Market data and Greeks.
  - `macro_client.py`: Fed Watch (rate hike/cut probabilities) and Macro indicators.
  - `sentiment_client.py`: Crowd sentiment (e.g., Twitter, Reddit).
  - `data_aggregator.py`: Synchronizes all streams via an internal **Event Bus** (Terminus pattern). Strict freshness checks.
- **Polymarket Data Layer** (`data/polymarket/`):
  - `gamma_client.py`: Market discovery.
  - `clob_client.py`: Orderbook snapshots with **Slippage & Impact Calculator**.
- **Storage** (`data/storage.py`): Caches historical data locally (SQLite or Parquet).
- **Screener** (`screener/market_screener.py`): Isolates assets/events with **Volatility Decay Filters** to avoid entering late on news spikes.
- **Strategy Engine** (`strategy/`):
  - `base.py`: Abstract `BaseStrategy` with `on_market_event` and `on_macro_data`.
  - Includes **Arbitrage & Hedging logic** (e.g., suggesting Binance offsets for Polymarket positions).
- **Backtesting & Validation** (`backtest/`): 
  - `engine.py`, `broker.py`, `portfolio.py`.
  - `optimizer.py`: Parameter sweeps.
  - `monte_carlo.py`: Robustness testing with **Black Swan Stress Testing** (injecting artificial crashes/early resolutions).
- **Live Bridge & Dashboard** (`live/`):
  - `paper_trader.py`: Live integration.
  - **Dashboard API** (`live/api.py`): Flask/FastAPI server running in a separate thread (Terminus pattern) to provide a local web UI for monitoring without Docker.

## Verification Requirements
- Validate Binance/Deribit data fetchers pull fresh data and reject stale data.
- Verify Macro data integration against the Terminus macro implementation.
- Test local execution (NO DOCKER) of the entire pipeline.
