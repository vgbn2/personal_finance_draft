# Polymarket Screener & Backtester Framework - SPEC
Status: FINALIZED

## Overview
A modular, event-driven framework for screening Polymarket events, backtesting strategies on historical data, and paper trading (front testing) live strategies. It leverages external crypto exchange data (Binance for OHLCV, Deribit for OHLCV & Options Greeks) and Macroeconomic Data to calculate and price trades. 
Execution runs locally with NO DOCKER to ensure stability and easy debugging.

## Architecture Guidelines
- **Project Structure** (`app/`):
  - `app/core/`: Business logic, ingestion managers, and state clock.
  - `app/execution/`: Broker abstractions, risk gates, and settlement logic.
  - `app/math/`: Quantitative library (Black-Scholes, Kelly, Slippage).
  - `app/api/`: FastAPI routes and WebSocket bridge.
  - `app/utils/`: YAML config loader, structured logger, and shared types.
- **Resilience & Scalability**:
  - **Decentralized Modules**: No monolithic files. Pure logic separated from I/O.
  - **Structured Logging**: JSON logs for cloud persistence, Rich logs for terminal.
  - **Strict Typing**: Pydantic models for all internal and external data flows.
  - **VPN-Safe Network Config**: Local binding to `0.0.0.0` with configurable ports.
- **Frontend - Premium Dashboard** (`frontend/`):
  - **Modular Assets**: Separated HTML, CSS (layout/theme), and JS (api/state/components).
  - **Visuals**: Glassmorphism via Vanilla CSS; Lucide Icons; Chart.js.

## Verification Requirements
- Validate Binance/Deribit data fetchers pull fresh data and reject stale data.
- Verify Macro data integration against the Terminus macro implementation.
- Test local execution (NO DOCKER) of the entire pipeline.
