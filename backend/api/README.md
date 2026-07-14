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
