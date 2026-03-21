# Detailed Project Context: Polymarket Screener & Backtester Framework

## 1. Executive Summary & Mission
This project aims to build a professional-grade, event-driven trading framework specifically designed for Polymarket, augmented by real-time crypto and stock market data. 
The core mission is two-fold:
1.  **Backtesting & Validation**: Provide statistical rigor through historical replay, Monte Carlo simulations, and Black Swan stress testing.
2.  **Live Paper Trading & Dashboarding**: Offer a "Not Broken", zero-crash live execution environment coupled with a premium, glassmorphic analytics dashboard.

## 2. Core Architectural Philosophy
The framework adheres strictly to the following principles:
*   **No Docker**: Emphasizes absolute local stability, direct access to native OS performance, and zero container-networking headaches.
*   **VPN-Resilient (Anti-Fragile)**: Built to run uninterrupted across virtual private networks. The backend explicitly binds to `0.0.0.0`, and the frontend implements deep auto-reconnect and state-sync logic.
*   **Zero-Crash Reliability**: Every network call, data ingestion point, and state transition is guarded by circuit breakers, rate limiters, and stale-data poison pills. No silent failures are permitted.
*   **No Hardcoding**: All variables, API endpoints, and symbols are abstracted into centralized `yaml` configurations.

## 3. Technology Stack Deep Dive
*   **Backend Subsystem (The "Quant Engine")**:
    *   **Language**: Python 3.10+
    *   **Framework**: FastAPI (for the threaded REST/WebSocket bridge) & asyncio (for concurrent streams).
    *   **Data Processing**: NumPy and Pandas ensure high-speed, vectorized mathematical calculations required for Options Greeks (Delta/Gamma/Theta) and Slippage metrics.
    *   **Resilience libraries**: `tenacity` for exponential backoff decorators.
*   **Frontend Subsystem (The "Terminal")**:
    *   **Language/Framework**: JavaScript/TypeScript, React 18+, Vite.
    *   **Styling**: Tailwind CSS configured for a premium "Glassmorphism" aesthetic (Dark mode `#0D0D0D`, blurred overlays, neon status indicators).
    *   **Visualization**: Recharts for IV surfaces, framer-motion for micro-animations (e.g., the Black Swan Risk Meter).
*   **Storage & Persistence**:
    *   **Local Caching**: Parquet/SQLite for ultra-fast read/writes during historical backtesting loops.
    *   **Cloud Logging**: MongoDB (via `pymongo`) for persistent, immutable logs of trades, signals, and API health, ready for Render.com remote access.

## 4. Subsystem Breakdown & Data Flow

### A. Data Ingestion Layer (`/data`)
*   **Polymarket (Gamma & CLOB)**: Fetches active events, resolves token_ids, and constructs deep orderbooks to calculate dynamic execution slippage.
*   **Crypto (Binance & Deribit)**: Ingests real-time OHLCV and Options data via WebSocket streams.
*   **Stocks/Macro (yfinance/Alpha Vantage)**: Polls macroeconomic indicators (Fed Watch) and stock correlations via REST.
*   **Data Aggregator (`data_aggregator.py`)**: The central nervous system. It synthesizes all streams into a unified `MarketState` object. 
    *   *Security Guard*: Implements "Stale-Data Poisoning". If the timestamp skew between Binance BTC and a Polymarket event exceeds threshold `x`, the payload is rejected to prevent trading on lag.

### B. Strategy & Execution Layer (`/strategy`, `/execution`)
*   **Signal Generation**: Pure, side-effect-free functions that evaluate the unified `MarketState` against `strategy_params.yaml` thresholds.
*   **Broker Abstraction**: Normalizes simulated executions (for backtesting/paper) and live API calls into a unified interface.

### C. Validation Layer (`/validation`)
*   **Time-Series Replay**: Iterates through Parquet caches to simulate historical performance.
*   **Monte Carlo Engine**: Runs $N$ concurrent simulations (parameterized in config) with randomized return sequences to calculate Value at Risk (VaR).
*   **Black Swan Injector**: Synthetically injects catastrophic market shocks (e.g., flash crashes) into the simulation to certify portfolio survivability.

### D. The React-FastAPI Bridge (`/api`)
*   **Threaded Server**: FastAPI runs on a daemonized thread, allowing the data ingestion and strategy loops to operate synchronously without blocking the API.
*   **Heartbeat WebSockets**: The `ws_bridge.py` maintains an active pipeline to the React frontend. If the VPN drops, the frontend hook (`useSocket.js`) catches the disconnect, waits via exponential backoff, reconnects, and demands a full `STATE_SYNC` payload before unblinding the dashboard.

## 5. Implementation Roadmap (Phases 1-4)
- **Phase 1: Foundation & Ingestion**: Project scaffolding, `symbols.yaml` integration, rate-limited REST clients, and resilient WS streams.
- **Phase 2: Core Logic & Storage**: Building the Market Screener filters, MongoDB cloud schemas, Slippage calculators, and the Threaded API bridge.
- **Phase 3: Validation & Stress Testing**: The Monte Carlo engine, Backtester loop, and Black Swan injection protocols.
- **Phase 4: Premium Frontend**: Transitioning the standalone HTML prototype into a modular React/Vite application (Screener, Greeks Panel, Risk Dial).

## 6. Directory Map (Separation of Concerns)
```text
polymarket_screener/
├── config/              # Centralized Source of Truth (symbols, network, strategy params)
├── data/                # Inbound data
│   ├── clients/         # @retry decorated REST modules
│   ├── streams/         # Auto-reconnecting WS modules
│   └── storage/         # Local Parquet cache + remote MongoDB logic
├── strategy/            # Alpha generation and pure logic
├── execution/           # Simulated and live routing
├── validation/          # Rigorous statistical testing
├── api/                 # VPN-safe FastAPI integration
├── frontend/            # React/Vite Glassmorphism dashboard
└── logs/                # MongoDB/Structured tracebacks
```

## 7. Developer Guidelines
- **Defensive Programming First**: Never assume an API call succeeds. Always wrap REST calls in `tenacity` retries and WS loops in broad `Exception` catches backed by MongoDB error logging.
- **No Global Mutability**: Strategies must compute actions based purely on the `MarketState` provided by the Aggregator.
- **Visual Parity**: Features added to the backend must be exposed via the `ws_bridge` for corresponding visual updates on the frontend dashboard.
