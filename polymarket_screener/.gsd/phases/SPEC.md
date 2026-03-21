# Polymarket Screener & Backtester Framework - SPEC
Status: FINALIZED

## Overview
A modular, event-driven framework for screening Polymarket events, backtesting strategies on historical data, and paper trading (front testing) live strategies. It leverages external crypto exchange data (Binance for OHLCV, Deribit for OHLCV & Options Greeks) and Macroeconomic Data to calculate and price trades. 
Execution runs locally with NO DOCKER to ensure stability and easy debugging.

## Architecture Guidelines
- **Configuration** (`config/`):
  - `strategy_params.yaml`: Strategy-specific thresholds.
  - `symbols.yaml`: Centralized Registry.
  - `network.yaml`: **VPN-Safe Network Config** (Binding to `0.0.0.0` for Docker-less cross-device access; customized ports to avoid VPN conflicts).
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
- **Frontend - Premium Dashboard** (`frontend/`):
  - **Tech Stack**: Vite + React + Tailwind + Lucide Icons + Recharts (for Alpha/Greeks visualization).
  - **Theme**: Sleek Dark Mode / Glassmorphism (Vibrant gradients, micro-animations).
- **Frontend - Premium Dashboard** (`frontend/`):
  - **Connection**: `api/ws_bridge.py`. **Auto-reconnect** and **State-Sync** logic to ensure UI matches backend even after VPN drop.
  - **Alerting**: Persistent toast notifications for Rate-Limit hits or API outages.
- **Resilience Guidelines**:
  - **Graceful Degradation**: If Sentiment API fails, strategy continues with neutral sentiment rather than crashing.
  - **No Silent Failures**: All caught exceptions must be logged with stack traces to MongoDB for cloud debugging.

## Verification Requirements
- Validate Binance/Deribit data fetchers pull fresh data and reject stale data.
- Verify Macro data integration against the Terminus macro implementation.
- Test local execution (NO DOCKER) of the entire pipeline.
