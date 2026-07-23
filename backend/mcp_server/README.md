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
# from the repository root
npm --prefix backend/mcp_server run build
npm run setup:mcp
```

`setup:mcp` validates the compiled entrypoint before writing `.mcp.json`, emits an absolute server path,
and adds `SOVEREIGN_BACKEND_BIN` only when the platform-correct native binary exists. The write is atomic:
validation failure does not truncate a previous local MCP configuration.

From `backend/mcp_server/`, `npm start` still resolves to
`node ../../dist/mcp_server/index.js` (repo-root `dist/`).

## Why not launch the `.ts` source directly

Launching `src/index.ts` via `ts-node/register` fails on local-source ESM import
resolution in this project's module layout. The build step is therefore required
before the server is reachable — always `npm run build` after changing tool source.
Treat `dist/mcp_server/index.js` as the single reliable entrypoint.

## Host stdio and tool-discovery probe

```bash
node scripts/mcp_stdio_probe.js
```

The probe first verifies that a known-good child can deliver stdout and stderr on the current host. It then
uses the pinned MCP SDK stdio client to initialize, list tools, and call the read-only `get_system_status`
tool. Results are JSON and identify the failed stage.

- `ok: true` is host-side proof for initialize, `tools/list`, and the cached status call.
- `host_child_stdio_unavailable` means the execution environment suppressed known-good child output. It is
  host-inconclusive and must not be reported as an MCP server regression.
- `mcp_child_exited_before_initialize`, `mcp_tools_list_*`, and `mcp_status_*` identify server/protocol stages
  after the host transport self-test has passed.

Always run this probe on the intended developer or central host before calling the MCP runtime operational.
Directly starting `dist/mcp_server/index.js` proves only that the entrypoint loads; it does not prove a client
can complete a stdio exchange.

## Cached Research Tools

- `get_market_bias` mirrors `sovereign bias <symbol> --no-backfill` and includes per-timeframe freshness.
- `get_scorecard` mirrors the fail-closed cached scorecard with a `0.55` default confidence floor and
  returns the full eligibility/exclusion envelope rather than an ambiguous empty row list.
- `get_market_signal` reconciles those cached outputs and returns only `review_only` or `no_trade`; it never places orders.
- These tools do not refresh providers or place orders. Treat stale, excluded, or degraded output as no trade.

## Write Safety

- `backfill` and `backfill_family` require `execute=true` before writing cached data.
- `backfill_all` is a no-write preview by default and requires `execute=true` for cache writes; `dry_run=true` always forces preview mode.
