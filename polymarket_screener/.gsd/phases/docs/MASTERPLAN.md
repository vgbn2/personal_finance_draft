# Polymarket Framework: Master Execution Plan

This document consolidates all individual phases and execution plans into a single, linear roadmap.
For high-fidelity code sketches of every module, see [FULL_CODE_SPEC.md](file:///C:/Users/Lenovo/.gemini/antigravity/brain/571bca6a-8901-4fac-b1a0-fa88d6b509cf/full_code_spec.md).

---

## 🚀 PHASE 1: Execution Foundation & Data Ingestion
**Goal**: Establish the VPN-safe architecture, component structure, and resilient data pipes.

### Plan 1.1: Project Foundation & Symbol Registry
- **Setup**: Create the modular directory structure (`config/`, `data/`, `strategy/`, `validation/`, `execution/`, `api/`).
- **Registry**: Implement `config.py` to parse `symbols.yaml`, decoupling identifiers from the logic.

### Plan 1.2: VPN-Safe Streams & Rate-Limited REST
- **VPN Safety**: Configure FastAPI server (`api/server.py`) binding to `0.0.0.0` with a WebSocket bridge (`api/ws_bridge.py`).
- **Resilient Clients**: Implement REST clients (e.g., `stock_options_client.py`) wrapped in `RateLimiter` middleware and `@retry` exponential backoffs.

### Plan 1.3: Polymarket Data Clients
- **Gamma Client**: Fetch active markets and parse metadata.
- **CLOB Client**: Retrieve real-time orderbook snapshots (bids/asks).

### Plan 1.4: Storage and Data Aggregation
- **Local Cache**: Implement Parquet caching (`data/storage.py`) to prevent redundant API calls during backtesting.
- **Aggregator**: Create `data_aggregator.py` to synchronize Binance, Deribit, and Polymarket streams into a unified `MarketState`, strictly dropping stale asynchronous data.

---

## 🧠 PHASE 2: Core Logic, Screening & Storage
**Goal**: Build the filtering mechanisms, cloud persistence, and realistic orderbook math.

### Plan 2.1: Market Screener
- **Filtering logic**: Implement `market_screener.py` to isolate specific assets (BTC) or qualitative events (Tweet Markets) based on volume/liquidity thresholds defined in `strategy_params.yaml`.

### Plan 2.2: Cloud Storage & Analytics
- **MongoDB**: Integrate `mongodb_client.py` using `pymongo` to persist trades, signals, and stack traces securely to the cloud (Render.com ready).

### Plan 2.3: Orderbook Slippage & Dashboard API
- **Slippage Math**: Enhance the CLOB client to traverse depth and calculate `effective_price` based on trade size.
- **API Endpoints**: Finalize the threaded FastAPI backend to serve the current strategy state natively to the frontend.

---

## 🧪 PHASE 3: Validation & Stress Testing
**Goal**: Ensure strategies survive extreme market conditions before risking capital.

### Plan 3.1: Market Replay Backtesting (Zero-WebSocket)
- **Engine**: Build the `backtest/engine.py` using **Market Replay** logic. Instead of live WebSockets, it reads historical Parquet ticks (from Phase 1.4) to simulate execution without network latency.
- **Slippage Simulation**: Use the `old317/quant_engine.py` pattern to simulate fills against the historical orderbook depth.

### Plan 3.2: 3D Risk Management Matrix (The "Old 317" Shield)
- **Exposure Gates**: Implement the `risk_manager.py` with three absolute boundaries:
  - **Global Cap**: 30% max portfolio exposure.
  - **Correlation Cap**: 15% max exposure per expiration date.
  - **Conviction Tiers**: Position size capped by win-probability (ITM = 5%, OTM = 1.5%).
- **Circuit Breakers**: Port the **Volatility Circuit Breaker** (`rv > MOMENTUM_THRESHOLD`) to freeze entries during market chaos.
- **Out-of-Sample Validation**: Ensure strategies are validated on unseen data to prevent overfitting ("curve-fitting") the parameters.

### Plan 3.3: Advanced Combinatorial Arbitrage (Legacy Integration)
- **Marginal Polytope Logic**: Implement dependency detection using Integer Programming (Frank-Wolfe Algorithm) to find mispriced spreads across correlated markets (e.g., Election Winner vs. Pennsylvania Winner).
- **Bregman Projection**: Use the Kullback-Leibler divergence model to calculate optimal "information-theoretic" arbitrage trades instead of simple Euclidean distance.
- **Legacy Client Integration**: Port the `15min_window_epoch` scanning logic from legacy `polymarket_client.py` for high-frequency crypto event monitoring.

---

## 🖥️ PHASE 4: Premium Dashboard (React/Vite)
**Goal**: Translate the mathematical state into a glassmorphic visualization terminal.

### Plan 4.1: UI Adaptation Layer
- **Data Contracts**: Implement the `ui_adapter.py` to format raw quant state into the specific JSON expected by the [UI_ADAPTATION_SPEC.md](file:///c:/Users/Lenovo/Desktop/VGBN/.vscode/CODEPTIT/polymarket_screener/UI_ADAPTATION_SPEC.md).
- **Responsive Pushing**: Ensure the WebSocket bridge respects the user's design for "Screener Table" and "Greeks Sidebar."

### Plan 4.1 & 4.2: Setup and Components
- **Architecture**: Initialize Vite. Build the **Screener Component**, the **Options Greeks Sidebar**, and the **Risk Dial**.

### Plan 4.3: Real-Time Syncing (Anti-Fragile)
- **State Bridging**: Implement `useSocket.js` with auto-reconnect logic to ensure the UI instantly recovers state if the underlying VPN connection drops.

---

## ☁️ PHASE 5: Deployment & Operations
**Goal**: Move the backend to a stable cloud environment while maintaining local control.

### Plan 5.1: Render.com Compatibility
- **Environment**: Ensure the Python backend runs flawlessly via a standard `start.sh` or Gunicorn setup without relying on Docker compose files.
- **Monitoring**: Verify MongoDB captures all live execution logs for remote debugging.

---

## 🛡️ PHASE 6: Stability & Pre-Flight Verification
**Goal**: Final certification that the project is "Zero-Break."

### Plan 6.1: Automated Health Checks
- **Pre-Flight Suite**: Implement `scripts/health_check.py` to verify Redis/Postgres/API connectivity before every launch.
- **CI/CD Logic**: Ensure every code change passes the `Greeks` mathematical unit tests and VPN-reconnect integration tests.
