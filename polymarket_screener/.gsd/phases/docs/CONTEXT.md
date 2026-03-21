# Project Context: Polymarket Trading Framework

## 1. Mission
A professional-grade, event-driven trading framework designed specifically for Polymarket, with integrated crypto and stock market data. The goal is to maximize alpha through robust backtesting (Monte Carlo) and safe, real-time paper trading.

## 2. Core Architectural Decisions

### A. Environment & Portability
- **No Docker**: To ensure local stability, easy debugging, and direct access to native OS performance without container overhead.
- **VPN-Safe Networking**: Explicit binding to `0.0.0.0` and heartbeat state-sync to prevent WSL/Windows port conflicts (binding to specific IPs instead of just `localhost`).
- **Infrastructure Hardening**: Integrated **Redis** for sub-millisecond signal caching and **PostgreSQL** for trade/execution persistence, alongside MongoDB for cloud logging.
- **Modular Directory Structure**: Clear separation between Data, Strategy, Validation, and API layers to prevent "spaghetti code."

### B. Tech Stack
- **Backend (Python)**: High-performance data ingestion using `FastAPI` and `Asyncio`. Numerical logic powered by `NumPy/Pandas`.
- **Frontend (React/Vite)**: Premium **Glassmorphism** Dashboard with real-time WebSocket syncing.
- **Persistence Layer**: 
  - **Redis**: Real-time signal & state cache (Latency control).
  - **PostgreSQL**: Relational trade records and contract metadata.
  - **MongoDB**: Remote cloud-accessible logs (Render.com).
  - **Parquet**: Local high-speed backtest data.

### C. Reliability & Decoupling (The "Not Broken" Philosophy)
- **Strict Decoupling**: The backend Quant Engine and the Frontend UI operate on separate threads/processes. The backend "pushes" data to a non-blocking `ws_bridge`, ensuring that even a slow or crashing frontend cannot slow down the performance of the trading logic.
- **Zero Hardcoding**: All symbols and network configs are managed via YAML registries.
- **Anti-Fragile Ingestion**: Centralized rate-limiting, circuit breakers, and exponential backoff retries.
- **Stale-Data Poisoning**: Automatic signal suspension if critical price feeds stop updating.

## 3. Directory Mapping
```text
/config/            # Symbols, network, strategy parameters
/data/              # Ingestion clients (Polymarket, Binance, Deribit, Stocks)
/strategy/          # Signal generation logic (Pure functions)
/execution/         # Broker & Portfolio management
/validation/        # Backtesting & Monte Carlo engines
/api/               # FastAPI & WebSocket Bridge (The Isolation Layer)
/frontend/          # React Dashboard (Vite) - Handled by USER
/logs/              # Structured logging for debugging
```

## 4. Key Workflows
1.  **Screener**: Filter Polymarket for high-volume, event-driven opportunities.
2.  **Backtest**: Test strategies against historical data with realistic slippage.
3.  **Monte Carlo**: Verify strategy survival under "Black Swan" market shocks.
4.  **Live Terminal**: Monitor real-time Greeks and risk dials on the premium dashboard.
