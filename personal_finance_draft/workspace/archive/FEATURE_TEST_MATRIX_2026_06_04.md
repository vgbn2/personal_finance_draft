# Feature Test Matrix - 2026-06-04

Mode: rigorous-feature-testing + blast-through

## Summary

Strongest gaps first:

1. `[x] fail` Data readiness: `backend integrity --json` is currently red (`ok:false`, `84/84` cached, `0` missing, `9` stale, `1` exception).
2. `[x] fail` Structure hygiene: `.mcp.json` and `backend/gateway/node_modules/**` are tracked even though structure tests require generated/local-only paths to be untracked.
3. `[x] pass` MCP access: stdio MCP server builds and exposes 14 tools; HTTP MCP-gated API is reachable and blocks sensitive routes.
4. `[x] pass` CLI/TUI/API/strategy/macro/provider/gateway contract suites pass after fixing stale test drift and restoring the top-level `strategy` CLI handler.

## Checkmarked Matrix

| Check | Feature Family | Feature / User Surface | Owner Path | Probe | Result | Evidence | Residual Risk |
|:---|:---|:---|:---|:---|:---|:---|:---|
| `[x] pass` | Skill | Rigorous test workflow | `.agents/skills/rigorous-feature-testing` | `quick_validate.py .agents\skills\rigorous-feature-testing` | pass | Skill is valid | Future agents must explicitly load/use it until session skill index refreshes. |
| `[x] pass` | MCP | Stdio tool server | `backend/mcp_server`, `dist/mcp_server`, `scripts/mcp_stdio_probe.js` | `npm.cmd run build`; `node scripts\mcp_stdio_probe.js` | pass | Server `sovereign-mcp-server` v1.0.0, 14 tools | Tool calls were read-only; mutation-capable `trade`/`backfill*` were listed but not executed. |
| `[x] pass` | MCP/API gate | HTTP MCP-gated surface | `.mcp.json`, `backend/api/app.js`, `shared/lib/mcp_gate.js` | `GET /health`; `GET /api/system/status` with `x-mcp-agent`; `GET /api/config` with `x-mcp-agent` | pass | Health 200; system status 200; `/api/config` 403 | System status is degraded because quotes/data readiness are not fully green. |
| `[x] pass` | API/Web | Dashboard and API contracts | `backend/api/tests`, `Frontend/dashboard/dist` | `node --test backend\api\tests\api.test.js backend\api\tests\dashboard_contract.test.js backend\api\tests\charts.test.js backend\api\tests\ttl_cache.test.js` | pass | 4/4 pass | Browser rendering was not manually inspected. |
| `[x] pass` | CLI/TUI | Command loading, manifest, TUI automation/search | `backend/cli`, `tests/scripts` | grouped CLI/TUI `node --test` suite | pass | 28/28 pass | PTY semantics beyond the automation harness remain limited. |
| `[x] pass` | Strategy/backtest | Strategy registry, prop-firm, backtest contracts | `backend/cli/commands/strategy`, `config/strategies`, `config/trading` | strategy grouped `node --test` suite | pass | 22/22 pass | Live provider quality still depends on data freshness. |
| `[x] pass` | Data/provider | Backfill regression, provider parsers, indicators data flow | `backend/scripts/data_ops`, `shared/lib/providers`, `shared/lib/indicators` | data/provider grouped `node --test` suite | pass | 6/6 pass | Integration provider freshness not refreshed in this pass. |
| `[x] pass` | Macro | Macro ingestion/store contracts | `tests/scripts/macro_*`, macro ingest path | macro grouped `node --test` suite | pass | 6/6 pass, 22 macro records, 9 reserves records | Uses contract/stub paths, not live credentialed Supabase writes. |
| `[x] pass` | Gateway/portfolio | Polymarket aggregate and trade launch seams | `backend/gateway`, `tests/scripts/tests/polymarket_portfolio_aggregate.test.js` | gateway/CLI grouped `node --test` suite | partial pass | Polymarket aggregate passed; CLI gateway launch passed | Live broker credentials and live order placement were not exercised. |
| `[x] fail` | Data readiness | Backend integrity | `backend/cli/commands/tools/backend.js`, `storage/data` | `node backend\cli\sovereign_cli.js backend integrity --json` | fail | `ok:false`, `total_stale:9`, `total_exceptions:1` | Needs cache refresh or policy adjustment before full green. |
| `[x] fail` | Structure hygiene | Generated/local-only tracking | `.mcp.json`, `backend/gateway/node_modules` | `node --test tests\scripts\structure_contract.test.js` | fail | `.mcp.json` and gateway `node_modules` are tracked | Requires index cleanup, not source-code logic changes. |

## Fixes Applied During This Pass

- Added repo-local skill `rigorous-feature-testing` and inserted it into `.agents/skills/all-skills-loader/SKILL.md`.
- Added `scripts/mcp_stdio_probe.js` for repeatable MCP `initialize` / `tools/list` / read-only tool call verification.
- Restored top-level CLI dispatch for `strategy`.
- Updated `backfill_regression.test.js` to import the current `backend/cli/commands/research/research.js` path.
- Updated TUI automation to expect the current multi-asset family-filter step.
- Updated module-loading test cleanup so requiring `backend/api/app.js` does not leave Socket.IO/watch handles open.

## Grades

| Section | Grade | Reason |
|:---|:---|:---|
| MCP stdio server | A- | Builds and lists 14 tools; package `main` still points at `dist/index.js` while actual outDir is root `dist/mcp_server`. |
| HTTP MCP gate/API | B | Reachable and blocks sensitive MCP route access; system status is degraded. |
| CLI/TUI | B+ | Automation and manifest checks pass after current-flow test alignment. |
| Strategy/backtest | B+ | Contract surface passes and `strategy` dispatch is restored. |
| Data readiness | D | Required integrity gate is red due to stale cache records. |
| Structure hygiene | D | Generated/local-only paths are still tracked. |
