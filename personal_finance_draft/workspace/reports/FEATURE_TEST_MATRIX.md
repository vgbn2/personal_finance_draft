# Feature Test Matrix - 2026-06-11

Run window: 2026-06-11, Asia/Saigon

## Matrix

| Check | Feature Family | Feature / User Surface | Owner Path | Parent / Subset Review | Probe | Result | Evidence | Residual Risk |
|:---|:---|:---|:---|:---|:---|:---|:---|:---|
| `[x]` | MCP | Tool discovery | `backend/mcp_server/`, `.mcp.json` | keep separate | `node scripts/mcp_stdio_probe.js` | pass | stdio server initialized; `tool_count: 17`; tool list includes `get_system_status`, `run_backtest`, `get_market_universe`, `trade`, `get_portfolio`, `get_data_availability`, and Polymarket surfaces | probe proves built stdio surface health, not source-vs-build drift outside this path |
| `[x]` | CLI | Command import and human surfaces | `backend/cli/`, `backend/cli/sovereign_cli.js` | parent for TUI/API wrappers | `node --test tests/scripts/module_loading.test.js tests/scripts/backend_cli_human_surfaces.test.js tests/scripts/cli_ui_contract.test.js`; `node --test tests/scripts/tests/sovereign_cli_human_surfaces.test.js`; `node backend/cli/sovereign_cli.js status --json`; `node backend/cli/sovereign_cli.js doctor runtime --json --no-network` | pass | contract bundle `16/16` pass; human-surfaces bundle `12/12` pass; `status --json` now recovers the canonical root snapshot from partitioned history when a stale scoped file is detected and currently returns `cache_mode:"recovered_live"`, `records: 293`, `usable_records: 293`, `stale_records: 0`, `quality:"ok"`; runtime doctor stays `ok:true` | command-specific live broker paths still need their own runtime creds and no-spend verification |
| `[x]` | TUI | Automation smoke | `backend/cli/tui/`, `tests/scripts/` | wraps CLI behavior but PTY flow is distinct | `node --test tests/scripts/tui_terminal_automation.test.js` | pass | `5/5` pass; harness reached research menu, backtest asset picker, optimize flow, trade-desk symbol source selector, and the new favourite-symbols action without prop-firm leakage | this proves prompt flow, not every rich-terminal visual state |
| `[x]` | Data | Integrity and freshness | `storage/`, `backend/cli/commands/data/` | parent for dashboard/API summaries | `npm.cmd run test:data`; `npm.cmd run test:macro`; `node backend/cli/sovereign_cli.js status --json`; `node backend/cli/sovereign_cli.js backend integrity --json`; direct `readTsIndex('VRE','1d')` probe; direct `last_fetch.json` readback after recovery | pass | `test:data` `4/4` pass; `test:macro` `4/4` pass including scoped/provider-history reserves contract; `status --json` now rebuilds and persists a representative global `last_fetch.json` from partitioned history when needed; current root snapshot readback shows `mode:"recovered_live"`, `source_count: 293`, multi-family coverage, and `snapshot_scope.kind:"global"`; `backend integrity --json` stays `ok:true`, `84/84 cached`, `0 missing`, `0 stale`, active exceptions summary now only `RNDRUSDT`; direct TS probe shows `VRE` has current `1d` data through `2026-06-11T00:00:00.000Z` | live freshness still depends on future real ingest runs; this pass proves local recovery and policy truth, not fresh network fetch |
| `[x]` | Strategy | Registry, prop-firm, and backtest contracts | `config/strategies/`, `backend/cli/commands/strategy/`, `backend/cli/commands/research/` | parent for strategy pickers and dashboard strategy views | `node --test tests/scripts/strategy_backtest_contract.test.js tests/scripts/strategy_registry_sync.test.js tests/scripts/prop_firms_contract.test.js` | pass | `22/22` pass; registry sync, prop-firm persistence, walk-forward output, and local C++ auto-dispatch are covered | no live market strategy sweep was attempted in this audit |
| `[x]` | Config | Settings, setup, doctor, and loop control | `shared/lib/settings/`, `shared/lib/brokers/`, `backend/cli/commands/setup.js`, `shared/lib/run_loop.js` | keep separate | `node --test tests/scripts/tests/settings_contract.test.js tests/scripts/tests/setup_doctor.test.js tests/scripts/tests/run_loop.test.js tests/scripts/tests/sovereign_cli_human_surfaces.test.js` | pass | `27/27` pass; settings persist/reset correctly, secrets stay redacted, env writes work, and loop state is deterministic | broker-specific live auth is still outside this no-spend config pass |
| `[!]` | Gateway | Broker and Polymarket execution bridge | `backend/gateway/`, `backend/cli/commands/trade/` | parent for CLI trade and bot execution surfaces | `node --test tests/scripts/tests/live_guard.test.js tests/scripts/tests/polymarket_account.test.js tests/scripts/tests/polymarket_paper.test.js tests/scripts/tests/polymarket_errors.test.js tests/scripts/tests/proposed_orders.test.js tests/scripts/tests/proposed_orders_cli.test.js` | partial | `30/30` pass; live guard blocks cloud-compute live paths, wallet resolution and error sanitization are covered, paper-run persists virtual fills, proposed-order preview fails closed on malformed input; trade desk now exposes a favourite-symbols action and a symbol source selector inside the TUI | no real live submit was attempted because it can spend pUSD, so this is the only meaningful feature family still below full proof |
| `[x]` | API/Web | Server and dashboard contracts | `backend/api/`, `Frontend/dashboard/`, `web/` | may mirror CLI/API parent surfaces, keep separate for HTTP and shell-contract proof | `node --test backend/api/tests/api.test.js backend/api/tests/correlation_contract.test.js backend/api/tests/dashboard_contract.test.js backend/api/tests/charts.test.js` | pass | `4/4` pass; API health/data summary/correlation are green, weekly/monthly correlation now rolls daily equity history forward when exact bars are absent, and served dashboard contract shows `endpoint_count: 5`, `html_bytes: 408`, `app_bundle_bytes: 945056` | browser-level rendering beyond the shell contract still belongs in a frontend-specific pass |
| `[x]` | Docs | Repo truth alignment | `workspace/`, `docs/engineering/` | docs may duplicate code maps; keep only if live probes support them | readback of `workspace/STATE.md`, `workspace/FEATURE_TEST_MATRIX.md`, `workspace/FEATURE_REPAIR_PLAN.md`, and `docs/engineering/tui_feature_map.md` against current probes | pass | `workspace/STATE.md` matches Phase 9; workspace ledgers now match current probes; `docs/engineering/tui_feature_map.md` is updated to the 2026-06-11 baseline and is now a deliberate tracked doc artifact | keep the map synchronized with future TUI changes; clean-clone artifact hygiene is tracked separately in the Repo Hygiene row |
| `[!]` | Repo Hygiene | Clean-clone reproducibility | `backend/core/`, `scripts/`, `notebooks/`, `workspace/`, `.dockerignore` | parent for every local green test result | `git ls-files` checks against referenced files; `npm.cmd test`; native C++ build | partial | Local runtime is strong (`npm.cmd test` -> `269/269`; native target builds after the duplicate `Path`/`PATH` workaround), but tracked code/tests/docs reference untracked or ignored files: `frame_backtester.{cpp,hpp}`, `scripts/classify_strategy_assets.js`, `scripts/mcp_stdio_probe.js`, `backend/api/tests/correlation_contract.test.js`, and ignored `notebooks/*.ipynb` | clean clone cannot be trusted to reproduce the green suite until these are tracked, generated, or contract-gated |

## Overlap Review

| Parent Feature | Subset Feature | Mark | Affected Paths | Behavior To Preserve | Required Tests | Rollback Path | Risk If Kept Separate |
|:---|:---|:---|:---|:---|:---|:---|:---|
| CLI research/trade commands | TUI menu flows for research and trading | keep separate | `backend/cli/sovereign_cli.js`, `backend/cli/tui/` | prompt order, PTY interaction, and menu discoverability | `tests/scripts/tui_terminal_automation.test.js`, CLI contracts | restore prior manifest/menu wiring | duplicate logic can drift, but the TUI is still a real user surface |
| Backend/API status and summaries | Dashboard shell and API route contract | keep separate | `backend/api/`, `Frontend/dashboard/`, `web/` | HTTP shape, served shell, bundle reference, auth boundary | `backend/api/tests/api.test.js`, `backend/api/tests/dashboard_contract.test.js`, `backend/api/tests/charts.test.js` | revert route/shell contract changes | browser/API consumers can break while CLI stays healthy |
| MCP `get_system_status` protocol surface | CLI/backend status surfaces | keep separate | `backend/mcp_server/`, `backend/cli/commands/status.js` | MCP schema and transport contract | `scripts/mcp_stdio_probe.js` plus CLI status probes | revert MCP server build or tool registration | protocol-layer regressions can hide behind healthy local CLI output |

## Compact Grade Snapshot

| Family | Grade | Status |
|:---|:---:|:---|
| MCP | A- | open |
| CLI | A | open |
| TUI | A | open |
| Data | A- | open |
| Strategy | A | open |
| Config | A | open |
| Gateway | B | open |
| API/Web | A- | open |
| Docs | A- | open |
| Repo Hygiene | C | partial |

## Notes

- The broad product surface is healthy under no-spend verification across MCP, CLI, TUI, strategy, config, gateway contracts, and API shell contracts.
- Deep blast-through found that this health is local-tree health, not yet clean-clone health; the open repair is to close load-bearing untracked/ignored assets before a broad commit.
- The previously reported reserves-ingest failure does not reproduce in the 2026-06-11 rerun; both `test:macro` and the direct contract test are green.
- The largest remaining verification gap is live spend, not data integrity: root status, integrity policy, and the canonical snapshot are now aligned locally.
- The docs problem is now mostly maintenance: the workspace ledgers are refreshed and the engineering map is current and tracked, so future drift is just a normal sync task.
