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
# (verified tool_count: 20 — get_system_status, get_market_bias, get_scorecard, get_market_signal, run_backtest, …)
```

## Cached Research Tools

- `get_market_bias` mirrors `sovereign bias <symbol> --no-backfill` and includes per-timeframe freshness.
- `get_scorecard` mirrors the fail-closed cached scorecard with a `0.55` default confidence floor and
  returns the full eligibility/exclusion envelope rather than an ambiguous empty row list.
- `get_market_signal` reconciles those cached outputs and returns only `review_only` or `no_trade`; it never places orders.
- These tools do not refresh providers or place orders. Treat stale, excluded, or degraded output as no trade.

## Write Safety

- `backfill` and `backfill_family` require `execute=true` before writing cached data.
- `backfill_all` is a no-write preview by default and requires `execute=true` for cache writes; `dry_run=true` always forces preview mode.
