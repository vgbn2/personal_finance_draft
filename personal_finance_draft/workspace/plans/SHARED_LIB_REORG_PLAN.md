# Shared Lib Reorg Plan

Goal: group `shared/lib` by responsibility while preserving old import paths through shims until callers are migrated.

## Batch 1: layout cleanup with compatibility shims

### UI

- Move `shared/lib/centralized_lib/ansi.js` -> `shared/lib/ui/ansi.js`
- Keep `shared/lib/ansi.js` as a shim to `./ui/ansi`
- Keep `shared/lib/centralized_lib/ansi.js` as a shim to `../ui/ansi` until callers stop using the legacy folder

Affected modules:

- `backend/cli/commands/account/auth.js`
- `backend/cli/commands/settings/settings.js`
- `backend/cli/lib/utils.js`
- `shared/lib/backtest.js`
- any other TUI helpers importing ANSI constants

### AI

- Move `shared/lib/auth/ai_client.js` -> `shared/lib/ai/ai_client.js`
- Add `shared/lib/ai/index.js`
- Keep `shared/lib/auth/ai_client.js` as a shim to `../ai/ai_client`

Affected modules:

- `backend/cli/commands/trade/trade.js`
- `#shared/ai_client` alias consumers

### MCP

- Move `shared/lib/mcp_gate.js` -> `shared/lib/mcp/gate.js`
- Move `shared/lib/mcp_agent.js` -> `shared/lib/mcp/agent.js`
- Add `shared/lib/mcp/index.js`
- Remove the empty `shared/lib/MCP/` legacy island after the move

Affected modules:

- `backend/api/app.js`
- MCP server / access-control code
- `.mcp.json`-driven local tooling

### Compatibility

- Move `shared/lib/adapters.js` -> `shared/lib/compat/adapters.js`
- Keep `shared/lib/adapters.js` as a shim until all callers are migrated

Affected modules:

- legacy provider/backfill callers
- compatibility imports in tests or scripts

## Batch 2: remaining category splits

### Strategy / backtest

- `shared/lib/backtest.js`
- `shared/lib/rsi_backtest.js`
- `shared/lib/strategy_registry.js`

### Market / data

- `shared/lib/market_validation.js`
- `shared/lib/quote_router.js`
- `shared/lib/macro_store.js`
- `shared/lib/polymarket_history.js`
- `shared/lib/crypto_aggregates.js`
- `shared/lib/indicators.js`
- `shared/lib/indicators/price_action.js`

### Runtime / plumbing

- `shared/lib/paths.js`
- `shared/lib/env.js`
- `shared/lib/config_loader.js`
- `shared/lib/run_loop.js`
- `shared/lib/backend_bridge.js`
- `shared/lib/persistence_bridge.js`
- `shared/lib/execution_memory.js`
- `shared/lib/db_pruning.js`

### ML / dataset

- `shared/lib/feature_builder.js`
- `shared/lib/ml_dataset.js`
- `shared/lib/models.js`

### Broker / profile / persistence

- `shared/lib/broker_capabilities.js`
- `shared/lib/mt5_profiles.js`
- `shared/lib/prop_firms.js`
- `shared/lib/supabase_admin.js`
- `shared/lib/supabase_errors.js`

### Batch 2 implemented

- `shared/lib/runtime/paths.js`
- `shared/lib/runtime/env.js`
- `shared/lib/runtime/config_loader.js`
- `shared/lib/runtime/run_loop.js`
- `shared/lib/runtime/backend_bridge.js`
- `shared/lib/market/validation.js`
- `shared/lib/market/quote_router.js`
- `shared/lib/market/polymarket_history.js`
- `shared/lib/market/price_action.js`
- `shared/lib/brokers/capabilities.js`
- `shared/lib/supabase/admin.js`
- `shared/lib/supabase/errors.js`
- `shared/lib/strategy/backtest.js`
- `shared/lib/strategy/rsi_backtest.js`
- `shared/lib/strategy/registry.js`
- `shared/lib/ml/feature_builder.js`
- `shared/lib/ml/dataset.js`
- `shared/lib/ml/models.js`
- `shared/lib/profiles/prop_firms.js`
- `shared/lib/profiles/mt5_profiles.js`
- `shared/lib/data/crypto_aggregates.js`
- `shared/lib/data/macro_store.js`
- `shared/lib/data/backfill.js`
- `shared/lib/data/ingestion.js`
- `shared/lib/data/db_pruning.js`
- `shared/lib/runtime/execution_memory.js`
- `shared/lib/runtime/persistence_bridge.js`
- `shared/lib/market/indicators.js`

### Still pending

No tracked backend/script/test callers remain on the legacy root shim imports after the 2026-06-08 import sweep.

The remaining root `shared/lib/*.js` files are compatibility shims for untracked/local callers or future cleanup and can be retired after broader consumer validation.

## Verification

- Re-run targeted import checks for moved modules.
- Run focused tests or `node --check` on touched entrypoints.
- Remove empty legacy directories only after compatibility paths are confirmed.
