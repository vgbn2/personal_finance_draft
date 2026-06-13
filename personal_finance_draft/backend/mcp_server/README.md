# Sovereign MCP Server

LLM-facing tool server for the Sovereign trading platform (system status, backtests,
market universe, portfolio, trade gates, Polymarket tools).

## Trading safety contract

- MCP trade tools default to non-live execution unless `live=true`.
- Any live order must also set `confirm_live=true`.
- Live Polymarket orders should include an explicit `price`; this mirrors the TUI path, which previews and submits a limit order rather than an implicit market buy.
- `place_polymarket_order` also accepts `max_cost_usdc` as a caller-side spend cap.
- The server still enforces the repo-local `ai_agent_trading` feature gate before any live order path is forwarded.

## Canonical launch path

The server runs from the **compiled** output, not the TypeScript source:

```bash
# from backend/mcp_server/
npm run build      # tsc → repo-root dist/mcp_server/index.js
npm start          # node ../../dist/mcp_server/index.js
```

`npm start` resolves to `node ../../dist/mcp_server/index.js` (repo-root `dist/`).
An MCP stdio client should spawn that compiled entrypoint.

## Why not launch the `.ts` source directly

Launching `src/index.ts` via `ts-node/register` fails on local-source ESM import
resolution in this project's module layout. The build step is therefore required
before the server is reachable — always `npm run build` after changing tool source.
Treat `dist/mcp_server/index.js` as the single reliable entrypoint.

## Tool discovery smoke

```bash
npm run build
# then point an MCP stdio client at dist/mcp_server/index.js and call tools/list
# (verified tool_count: 17 — get_system_status, run_backtest, get_market_universe, trade, get_portfolio, …)
```
