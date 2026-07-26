# Web Surface

This directory contains the Node-based dashboard shell, API routes, and test
fixtures that back the local web status view.

Key areas:
- `app.js` for the native Node HTTP server, Socket.IO telemetry, and API composition
- `server/` for routes, middleware, and service helpers
- `../../Frontend/dashboard/dist/` for the built browser-facing dashboard
- `tests/` for API and chart behavior

Operational note:
- The web surface is designed to stay aligned with the CLI and data-validation
contracts.
- Fallback fixtures are used when live providers or native bridges are not
available so the dashboard still renders current local state.
- `GET /api/market/monitor` is an authenticated `data.read` endpoint over the
  canonical read-only snapshot owner. It accepts bounded filters plus
  `limit`/`offset`, keeps global counters independent of the page, and performs
  no provider request or market-data write.
## Read-only service health

`GET /api/system/service-health` requires the existing `data.read` capability and returns bounded, sanitized
heartbeat records for the paper bot, backfill, portfolio monitor, host health, and host backup services. Missing
or expired records are reported as unavailable. The endpoint never starts a process, polls a provider, writes
market data, or reads the Docker socket.
