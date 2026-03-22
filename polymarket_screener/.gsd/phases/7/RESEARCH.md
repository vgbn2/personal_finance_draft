# Research: Phase 7 — Live Connectivity & Exchange Integration

## Objective
Transition the framework from stubbed/mock data to live exchange connectivity via WebSockets and REST APIs for Polymarket, Binance, and Deribit.

## Key Findings

### 1. Polymarket CLOB API
- **Official SDK**: `py-polymarket-clob` (or `polymarket-apis` on PyPI).
- **WebSocket Protocol**: Custom protocol with channels:
  - `market`: Real-time L2 orderbook and trades.
  - `user`: Authenticated user orders and trades.
  - `RTDS`: Real-time data socket.
- **Authentication**: Requires `API_KEY`, `API_SECRET`, and `API_PASSPHRASE`.
- **Implementation Note**: We should use the official SDK where possible for signing and order management.

### 2. Binance WebSocket Data
- **Library**: `python-binance` provides `BinanceSocketManager`.
- **Stream Types**:
  - `<symbol>@kline_<interval>` for OHLCV.
  - `<symbol>@depth` for orderbook.
- **Resilience**: Binance connections expire every 24h; requires automatic re-connection logic.

### 3. Deribit WebSocket Data
- **Library**: `asyncio` + `websockets` or `deribit_websocket_v2` wrapper.
- **Protocol**: JSON-RPC 2.0.
- **Authentication**: `client_id` and `client_secret`.
- **Key Feature**: Heartbeat mechanisms are mandatory for long-lived connections.

### 4. Security & Configuration
- **Environment Variables**: All API keys must be loaded from `.env` via `config_manager`.
- **Rate Limiting**: Implementation of a decentralized "Leaky Bucket" or token-based rate limiter to prevent 429 errors across distributed clients.

## Proposed Implementation Plan

### Plan 7.1: Live Data Ingestion (Market Data)
- Implement `PolymarketLiveWS` in `app/core/data_feed.py`.
- Connect `BinanceWS` and `DeribitWS` to real streams.
- Wire into `feed_aggregator.py`.

### Plan 7.2: Polymarket CLOB Execution & Reconciliation
- Replace `PolymarketWS` stub with `ClobClient` for order placement.
- Implement live `get_open_positions()` in `app/core/reconciliation.py`.
- Add rate-limit backoff logic.

### Plan 7.3: Secure Hardware-Level Config & E2E Validation
- Finalize `.env.template` and `.env` loading for production secrets.
- Verify full signal-to-execution pipeline with real market data (Read-only first).
