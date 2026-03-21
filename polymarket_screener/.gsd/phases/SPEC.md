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
  - `streams/`: WebSocket managers with **Exponential Backoff Reconnection** and **Heartbeat monitoring**.
  - `clients/`: REST clients with **Centralized Rate Limiting**, **Circuit Breakers**, and **Retry Decorators** (Exponential Backoff).
  - `data_aggregator.py`: Asynchronous Event Bus with **Stale-Data Poisoning** (auto-dropping stale inputs).
- **Data Integrity & Safety**:
  - **Schema Validation**: Using `Pydantic` for all incoming JSON/API responses.
  - **Fail-Fast Checks**: Immediate error if critical data (e.g. BTC price) is missing.
  - **Atomic Persistence**: MongoDB transactions for consistent trade logging.
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
  - **Languages**: **JavaScript/TypeScript** using **React** and **Vite**.
  - **Styling**: **Tailwind CSS** for custom glassmorphism components.
  - **Visuals**: **Lucide Icons** and **Recharts**.
  - **Connection**: Real-time **WebSocket Bridge** (`api/ws_bridge.py`) for live signals, with **REST (FastAPI)** endpoints for historical/static data.
  - **Resilience**: Auto-reconnect and state-sync logic for VPN stability.
- **Resilience Guidelines**:
  - **Graceful Degradation**: If non-critical APIs (e.g. Sentiment) fail, the system continues with neutral defaults.
  - **No Silent Failures**: All exceptions are caught and logged with tracebacks to MongoDB for remote debugging.
  - **Data Poisoning**: Automatic signal suspension if critical price feeds go stale.

## Verification Requirements
- Validate Binance/Deribit data fetchers pull fresh data and reject stale data.
- Verify Macro data integration against the Terminus macro implementation.
- Test local execution (NO DOCKER) of the entire pipeline.
