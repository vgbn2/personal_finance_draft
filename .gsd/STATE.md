## Current Position
- **Phase**: Optimization & Precision
- **Task**: Server Startup Stability & Bug Fixing
- **Status**: Paused at 2026-03-11T02:20:00+07:00

## Last Session Summary
Diagnosed and fixed server startup websocket and typescript crash bugs.
- Fixed WebSocket `.close()` exception triggering during CONNECTING state across OKX, Bybit, Deribit, Hyperliquid, Gate.io, and Bitget adapters by swapping to `.terminate()`.
- Addressed NaN timestamp database crash in `AggregatedCandleEngine.persist()` by pre-validating upstream candles.
- Resolved a silent backend crash where `startup.ts` attempted to seed `ohlcvEngine` and `ictEngine` with outdated/incorrect parameters. 

## In-Progress Work
- Ready to restart backend and frontend. Waiting for Docker to start!

## Blockers
- **Docker Dependency**: Redis and TimescaleDB containers need to be started for the backend server to launch successfully. `start.bat` will succeed once Docker Desktop is running.

## Context Dump
- `ws.close()` reliably throws Unhandled Promise Rejections if called while WebSocket `readyState` is 0 (CONNECTING). Always use `.terminate()` for forced teardowns during reconnect loops.
- `tsx` compiler swallowed errors silently without any output when we had TS interface mismatches for `ohlcvEngine.seed()` in `startup.ts`.

## Next Steps
1. Boot up Docker Desktop and verify Timescale/Redis containers.
2. Run `start.bat` to launch the backend and frontend.
3. Validate frontend data feed via WebSocket connection.
