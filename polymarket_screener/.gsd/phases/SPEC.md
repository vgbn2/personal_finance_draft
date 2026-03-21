# Polymarket Screener & Backtester Framework - SPEC
Status: FINALIZED

## Overview
A modular, event-driven framework for screening Polymarket events, backtesting strategies on historical data, and paper trading (front testing) live strategies. It leverages external crypto exchange data (Binance for OHLCV, Deribit for OHLCV & Options Greeks) and Macroeconomic Data to calculate and price trades. 
Execution runs locally with NO DOCKER to ensure stability and easy debugging.

## Architecture Guidelines
- **Configuration** (`config/`):
  - `strategy_params.yaml`: Strategy-specific thresholds.
  - `symbols.yaml`: **Centralized Registry** of all assets (BTC/ETH, stocks, Polymarket IDs). NO HARDCODED SYMBOLS in code.
  - `secrets.env`: API keys and MongoDB URI.
- **Data Ingestion Layer (WS & REST)** (`data/`):
  - `streams/`: WebSocket managers for real-time Polymarket clob, Binance, and Deribit feeds.
  - `clients/`: REST fallback/historical clients for Greeks, Macro, Sentiment, and Stock Options.
  - `data_aggregator.py`: Asynchronous Event Bus.
- **Storage** (`data/storage/`):
  - `local_cache.py`: Parquet/Buffer for high-speed backtesting.
  - `mongodb_client.py`: Persistent cloud storage for trades, metrics, and event history (Render.com compatible).
- **Strategy Logic** (`strategy/`): Separated from execution. Pure signal generation.
- **Execution & Paper Trading** (`execution/`): 
  - `broker.py`: Simulated and Live execution abstraction.
  - `portfolio.py`: Real-time state tracking.
- **Backtesting & Optimization** (`validation/`): 
  - `backtester.py`, `monte_carlo.py`, `stress_tests.py`.
- **Frontend-Backend Connection** (`api/`):
  - `server.py`: FastAPI/Flask.
  - `routes/`: Modular endpoints (e.g., `/api/v1/markets`, `/api/v1/status`).
  - `ws_bridge.py`: Fans out internal backend event bus data to frontend WebSockets.
- **Deployment**: Render.com compatible via basic `start.sh` or `gunicorn` (No Docker). Pure Python environments.

## Verification Requirements
- Validate Binance/Deribit data fetchers pull fresh data and reject stale data.
- Verify Macro data integration against the Terminus macro implementation.
- Test local execution (NO DOCKER) of the entire pipeline.
