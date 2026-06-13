# Codebase Organization Map

> Canonical file and folder map for the Sovereign Trading Platform. Last updated 2026-06-08.

## Purpose And Truth Rules

This file answers "where does this belong?" for files and folders. Use it as the central repo layout map before adding new modules, tests, docs, generated artifacts, or agent notes.

Truth hierarchy:

1. `workspace/STATE.md` is the current status anchor when docs drift.
2. `docs/engineering/codebase_org.md` is the canonical folder and ownership map.
3. `docs/engineering/architecture_overview.md` explains the system/data-flow model.
4. `workspace/STRUCTURAL_AUDIT_REPORT.md` and `workspace/DEV_REVIEW.md` hold audit history and active review decisions, not the canonical layout.
5. Generated Gemini/Codex artifacts are project-local state unless this map or `workspace/STATE.md` promotes them.

## System Shape

```text
config/ + external providers
        |
        v
backend/scripts + shared/lib/providers
        |
        v
storage/data validated cache
        |
        +--> backend/core C++ inspection and computation
        +--> backend/cli research, strategy, data, trade, and TUI commands
        +--> backend/api local dashboard bridge
        |
        v
Frontend/dashboard built UI served by backend/api
```

Dependency direction should stay simple: UI and CLI call backend/shared surfaces; shared provider modules perform I/O; core math and intelligence modules should not depend on UI code.

## Canonical Top-Level Layout

| Path | Status | Owner | Purpose | Cleanliness |
|------|--------|-------|---------|-------------|
| `backend/` | Active | Backend/platform | API bridge, CLI/TUI, C++ core, execution gateway, MCP server, backend scripts. | B |
| `Frontend/` | Active with generated bulk | Frontend/dashboard | React/Vite dashboard source and built dashboard artifact. | C |
| `shared/` | Active | Shared platform | Provider, backfill, settings, market, strategy, prop-firm, MCP, and utility libraries used across CLI/API/scripts. | B |
| `config/` | Active | Product/runtime config | Markets, strategies, system, and trading YAML/JSON configuration. | B |
| `storage/` | Active data plane | Data/runtime | Canonical local cache, TS index, model reports, and runtime data artifacts. | C |
| `tests/` | Active with legacy pockets | Verification | Node, web, C++, fixture, and contract tests. | C |
| `docs/` | Active docs with archive | Documentation | Contributor docs, engineering docs, research docs, design notes, and archives. | B- |
| `workspace/` | Active state/audit | Session truth | Append-only state, handoff, audit reports, and active review/debt queues. | B |
| `infra/` | Active/gated | Deployment | Deployment manifests and infrastructure descriptors. | B |
| `backend/core/` via `build/` | Source active, build generated | C++ core | CMake-built native inspection and compute surface. | B source / generated build |
| `scripts/` | Thin helper/root compatibility | Tooling | Root helper scripts only; active backend logic belongs under `backend/scripts`. | C |
| `data/` | Compatibility/legacy data root | Data compatibility | Historical or compatibility cache paths; prefer `storage/data` for current runtime. | C- |
| `models/` | Planned/placeholder | ML artifacts | Reserved for model artifacts; current reports and cache outputs mostly live under `storage/data/models`. | C |
| `supabase/` | Gated integration | Persistence/integration | Supabase migrations/config for planned or gated persistence. | B- |
| `notebooks/` | Research/support | Research | Exploratory notebooks and evidence notes. | C |
| `tools/` | Support | Tooling | Small support tools. | B- |

Generated or local-only roots: `node_modules/`, `build/`, `dist/`, `Frontend/dashboard/dist/`, `Frontend/dashboard/node_modules/`, `graphify-out/`, and runtime cache folders under `storage/data/`. These should be excluded from architecture conclusions except when auditing artifact hygiene.

Agent and workflow state: `.codex/`, `.gemini/`, `.agents/`, `.claude/`, `.gsd/`, `.mcp.json`, `AGENTS.md`, `GEMINI.md`, and `CLAUDE.md` are workflow/config surfaces. They can guide agent behavior, but do not define runtime architecture.

## Active Runtime Surfaces

### `backend/`

- `backend/api/`: local Node/Express API bridge and dashboard server. The root README points `node backend/api/app.js` here.
- `backend/api/server/routes/`: now grouped by domain (`account/`, `bot/`, `data/`, `market/`, `status/`, `system/`) with `index.js` as the stable registry.
- `backend/cli/`: active Sovereign CLI/TUI entrypoint. The canonical executable is `backend/cli/sovereign_cli.js`.
- `backend/cli/commands/`: grouped by workflow and domain (`account/`, `operational/`, `research/`, `runner/`, `settings/`, `strategy/`, `tools/`, `trade/`) with `sovereign_cli.js` as the stable dispatcher.
- `backend/cli/tui/`: interactive terminal engine and command manifest.
- `backend/core/`: C++20 source used by CMake and native inspection paths.
- `backend/gateway/`: execution gateway and risk bridge work.
- `backend/mcp_server/`: MCP server source; rebuild `dist/` before trusting generated MCP output.
- `backend/scripts/`: active operational/dev scripts. Data ingestion and dev probes belong here rather than in new root `scripts/` folders.

### `shared/`

- `shared/lib/providers/`: canonical provider layer for live fetchers and history helpers.
- `shared/lib/backfill.js`: shared backfill helper used by active ingestion.
- `shared/lib/ui/`: terminal/UI helpers such as ANSI codes and glyph utilities.
- `shared/lib/ai/`: local AI client helpers and related agent-facing utilities.
- `shared/lib/mcp/`: MCP gate/agent access-control helpers.
- `shared/lib/runtime/`: repo-root discovery, env loading, config parsing, loop control, and backend bridge helpers.
- `shared/lib/market/`: market validation, quote routing, polymarket history, and related data helpers.
- `shared/lib/market/price_action.js`: canonical SMC/divergence/session-profile indicator helper.
- `shared/lib/brokers/capabilities.js`: broker runtime capability checks.
- `shared/lib/supabase/`: admin client and error helpers for Supabase integration.
- `shared/lib/compat/`: compatibility shims kept for older import paths.
- `shared/lib/settings/user_settings.js`: canonical user-settings defaults, validation, and persistence helpers shared by CLI and TUI.
- `shared/lib/strategy_registry.js`: strategy taxonomy, registry, asset-mode classification, and grade index helpers.
- `shared/lib/prop_firms.js`: prop-firm profile persistence and active profile resolution.
- Other `shared/lib/*.js` files are either thin compatibility shims or still need later category migration. Prefer the category folders before creating duplicate helpers.

### `config/`

- `config/markets/`: data-source and market universe configuration.
- `config/strategies/`: strategy YAML files visible through registry sync and backtest flows.
- `config/trading/`: trading and prop-firm profile registries.
- `config/system/`: system/runtime settings.

### `storage/`

- `storage/data/`: canonical local data plane.
- `storage/data/cache/`: runtime cache partitions and compatibility cache files.
- `storage/data/ts/`: binary time-series index written by backfill/integrity paths.
- `storage/data/models/`: model comparison and strategy-grade artifacts.

### `Frontend/dashboard/`

- `Frontend/dashboard/src/`: active React/Vite source.
- `Frontend/dashboard/dist/`: generated build artifact served by `backend/api/app.js`.
- `Frontend/dashboard/legacy.html`: legacy/support UI file; do not treat as the primary surface without a promotion decision.

## Verification Surfaces

- `tests/scripts/`: Node contract and regression tests. This is the main JS/CLI verification surface.
- `tests/scripts/tests/`: legacy nested tests; repair or quarantine imports before treating as a broad safety net.
- `tests/web/`: web/dashboard tests.
- `tests/cpp_core/`: C++ tests.
- `tests/fixtures/`: recorded fixtures and test data.
- `backend/api/tests/`: API and dashboard bridge contracts.
- `package.json` test scripts: `npm test`, `npm run test:contracts`, `npm run test:structure`, `npm run test:data`, and focused `node --test ...` slices.

## Documentation And State

- `README.md`: public project summary and start-here order.
- `docs/README.md`: documentation hub.
- `docs/ARCHITECTURE.md`: short architecture entrypoint; should point to this file for folder mapping.
- `docs/engineering/architecture_overview.md`: conceptual system/data-flow overview.
- `docs/engineering/codebase_org.md`: this canonical folder map.
- `docs/engineering/architectural_debt.md`: long-lived architecture debt notes.
- `workspace/STATE.md`: current append-only status anchor.
- `workspace/archive/`: historical workspace snapshots and superseded session artifacts.
- `workspace/STRUCTURAL_AUDIT_REPORT.md`: architecture ratings, deferred debt, and retirement conditions.
- `workspace/DEV_REVIEW.md`: active manual-review queue.
- `workspace/HANDOFF.md` and `workspace/SESSION_MEMORY.md`: session continuity.

## Generated, Cache, And Local-Only Paths

Do not add hand-written source to these paths:

- `node_modules/`
- `Frontend/dashboard/node_modules/`
- `build/`
- `dist/`
- `Frontend/dashboard/dist/`
- `graphify-out/`
- `storage/data/cache/`
- `storage/data/ts/`
- temporary `*.tmp` cache files

Use them as evidence or outputs only. If any generated/cache root is tracked or treated as source, log it in `workspace/DEV_REVIEW.md` or `workspace/STRUCTURAL_AUDIT_REPORT.md`.

## Legacy Or Compatibility Paths

- `data/`: compatibility or legacy data root. Prefer `storage/data` for current runtime unless a test explicitly labels `data/cache` as fixture/compatibility input.
- `scripts/`: root helper scripts only. New operational logic should normally go under `backend/scripts`.
- `shared/lib/adapters.js`: root compatibility shim over `shared/lib/compat/adapters.js`.
- `shared/lib/compat/adapters.js`: legacy provider/backfill bridge.
- `shared/lib/ansi.js` and `shared/lib/centralized_lib/ansi.js`: legacy shims over `shared/lib/ui/ansi.js`.
- `shared/lib/ui/ansi.js`: canonical ANSI/UI constants module.
- `shared/lib/auth/ai_client.js`: legacy shim over `shared/lib/ai/ai_client.js`.
- `shared/lib/ai/ai_client.js`: canonical local AI client helper.
- `shared/lib/mcp_gate.js` and `shared/lib/mcp_agent.js`: legacy shims over `shared/lib/mcp/`.
- `shared/lib/paths.js`, `shared/lib/env.js`, `shared/lib/config_loader.js`, `shared/lib/run_loop.js`, and `shared/lib/backend_bridge.js`: legacy shims over `shared/lib/runtime/`.
- `shared/lib/market_validation.js`, `shared/lib/quote_router.js`, and `shared/lib/polymarket_history.js`: legacy shims over `shared/lib/market/`.
- `shared/lib/indicators/price_action.js`: legacy shim over `shared/lib/market/price_action.js`.
- `shared/lib/broker_capabilities.js`: legacy shim over `shared/lib/brokers/capabilities.js`.
- `shared/lib/supabase_admin.js` and `shared/lib/supabase_errors.js`: legacy shims over `shared/lib/supabase/`.
- `backend/cli/sovereign_cli.og.js`: historical legacy CLI archive reference only. The active CLI is `backend/cli/sovereign_cli.js`, and the `.og.js` file is no longer present in the tree.
- `docs/archive/`: historical docs/UI; never use as current product truth without re-promoting it.
- Stale path names to avoid in new docs/code: `cpp_core`, `web`, `web_page`, `scripts/lib`, and `scripts/cli` unless explicitly discussing old migrations.

## Open Structural Decisions

1. Dual data roots: bless `storage/data` as runtime canonical and make every `data/cache` use explicit fixture or compatibility behavior.
2. Root scripts split: keep `scripts/` as thin wrappers or migrate remaining helpers under `backend/scripts`.
3. Test path drift: repair or quarantine legacy nested tests that import old path shapes.
4. Browser surface clarity: keep `Frontend/dashboard/src` as the active source and `Frontend/dashboard/dist` as generated output served by the API bridge.
5. CLI archive retirement: delete or move `.og.js` style fallback files only after active CLI contracts prove no runtime path needs them.
6. Model-report drift: regenerate or reclassify degraded model reports only after data-quality failures are resolved.

## Blast-Through Cleanliness Grades

| Section | Grade | Reason |
|---------|-------|--------|
| Backend/API/CLI | B | Active entrypoints are clear, but CLI archive and command-surface churn still need cleanup. |
| Shared provider layer | B | Provider/backfill boundary is mostly clean; adapter shim remains compatibility debt. |
| Config and strategy registry | B | Strategy and trading config are source-of-truth surfaces; registry sync now reduces visibility drift. |
| Storage/data | C | `storage/data` is canonical, and `data/cache` should now be treated as explicit compatibility or fixture input rather than active runtime truth. |
| Frontend/dashboard | C | Active source is clear, but generated `dist`, local dependencies, and legacy HTML need explicit handling. |
| Tests | C | Focused contracts are valuable, while legacy nested tests still contain path drift. |
| Docs/workspace | B+ | State and docs are useful, and the canonical hub plus current feature map now keep the lower-traffic surfaces aligned. |
| Generated/local artifacts | D as source, A as outputs | They are expected outputs, but should never be used as source-of-truth architecture. |

Current repo architecture rating remains `B-` for code architecture and `C+` for whole-repo cleanliness until the open decisions above are retired.
