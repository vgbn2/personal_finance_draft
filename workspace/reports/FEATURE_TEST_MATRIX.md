# Feature Test Matrix - 2026-06-11

Run window: 2026-06-11, Asia/Saigon

This is the active feature-evidence ledger. The dated 2026-06-11 rows remain historical baseline evidence;
the session-dated sections below are the current rerun results.

## Central Host Runtime Activation Preflight - 2026-07-29

| Feature | Entrypoint | Mode | Result | Evidence Class | Evidence | Limitation / Next Action |
|:---|:---|:---|:---|:---|:---|:---|
| Portfolio monitor | Compose `monitoring` profile | deployed read-only monitor | blocked | deployed-host runtime proof | Exited fail-closed after seven restarts; BTC notional 32,053.9 exceeds 25,000 threshold and Alpaca authentication is unavailable | Resolve the exposure-policy decision and Alpaca service authentication; do not weaken the threshold merely to keep the container alive. |
| Polymarket research | Compose `research` profile | scoped provider/archive loop | blocked | deployed-host preflight | Required `storage/polymarket/scope.json` is absent | User must supply the intended bounded market/token scope; provider polling requires restricted delegation under repository policy. |
| Paper bot | Compose `paper` profile | private-paper provider loop | blocked | source + deployed-host preflight | Compose command is paper-only and central overrides remain non-live; historical paper ledger paths exist | External provider polling requires explicitly authorized restricted delegation; no provider call or paper-state mutation ran. |
| Live execution | central-host Compose/runtime policy | real-money execution | blocked | source + deployed-host policy proof | Central Compose and `.env.central` force `LIVE_TRADING=false` and `SOVEREIGN_EXECUTION_AUTHORIZED=false`; no live service exists | A separate reviewed execution deployment is required; central-host safety overrides must not be weakened ad hoc. |

## Auth And Combined Engine Finalization - 2026-07-28 session 116

| Feature | Entrypoint | Mode | Result | Evidence Class | Evidence | Limitation / Next Action |
|:---|:---|:---|:---|:---|:---|:---|
| Private API authorization | HTTP access policy + service registry | fixture/contract | pass | source contract proof | API 25/25; anonymous protected reads reject; human roles are server-trusted; stable service tokens hash at rest; body limit rejects oversized JSON | Real Supabase login/revocation/RLS and reverse-proxy/TLS trust remain deployment gates. |
| Authenticated MCP | `backend/mcp_server` | build + policy contract | pass | source/build proof | Distinct MCP service token; read-only identity cannot promote, write, operate paper, or execute live; TypeScript build passes | Real remote stdio/SSH connector has not been exercised. |
| Exact-asset combined research | `sovereign combined --asset-id ... --json`; protected API; MCP | cached-only | degraded safely | local-runtime + source contract proof | deterministic engine tests pass; exact identity and PIT stale/future/synthetic gates pass; bounded FRED refresh fetched 86 required rows, but 0 are PIT eligible; real EURUSD returns `macro_observation_missing` | Preserve release/vintage metadata, migrate `available_at`, and connect the scoped writer to the revision-aware reader. Macro weight remains neutral pending calibration. |
| Reviewed combined workflow | protected promote + paper-cycle API | fixture/contract, non-provider | pass | source contract proof | same-principal scope, checksum tamper detection, idempotency, immutable append chain; `provider_submission:false`, `live:false` | This records reviewed paper intent; it is not broker fill/P&L simulation or live approval. |
| Environment/fresh-source reproducibility | `npm run check:env`; `npm run verify:fresh-install` | isolated exported source | pass | fresh-source proof | 118 manifest entries classify 138/138 names; installs/builds pass; native 30/30; aggregate 972/962/0/10; secrets 895/0 | Working tree remains uncommitted; host runtime and deployment proof are separate. |
| Configured-cache qualification | restricted 14-symbol VN 1d refresh + integrity/strict check | authorized bounded provider refresh | pass | provider-refresh/local-runtime proof | 172 records, 0 provider errors; 92/92 cached, 0 stale, DCS 1.0; strict 12 records, 0 errors/warnings | Remote persistence, recovery, one-writer, and soak unqualified; macro remote schema is incompatible despite credentials being present. |
| Dependency security advisory | five package roots, lockfile-only audit | restricted read-only advisory | blocked | current advisory proof | 61 vulnerable nodes: 24 high, 11 moderate, 26 low, 0 critical; no lockfile changes | Isolated owner upgrades and compatibility tests are required before release/live use. |

## SSH Host Continuation - 2026-07-28

| Feature | Entrypoint | Mode | Result | Evidence Class | Evidence | Limitation / Next Action |
|:---|:---|:---|:---|:---|:---|:---|
| Private-host static deployment contract | `docker compose --env-file .env.central -f infra/docker/docker-compose.yml config --quiet` | static/no-runtime | pass | host static configuration proof | SSH host is `x86_64`, has Node `v24.18.0`, protected `.env.central` (mode 600), and Compose config validates successfully | This does not start or prove the web service, Supabase login/RLS, SSH tunneling, recovery, one-writer, or soak. |
| Authenticated MCP stdio/status | `node scripts/mcp_stdio_probe.js` | read-only child-process probe | blocked | host transport preflight | Probe entrypoint exists, but its known-good child exited 0 with both stdout/stderr suppressed: `host_child_stdio_unavailable` | Inconclusive by contract; rerun from a normal host terminal with observable child stdio before judging MCP server health. |

## Global Market Monitor Exercise - 2026-07-28 session 115

| Feature | Entrypoint | Mode | Result | Evidence Class | Evidence | Limitation / Next Action |
|:---|:---|:---|:---|:---|:---|:---|
| Global monitor CLI snapshot | `node backend/cli/sovereign_cli.js market monitor --json --limit 3` | local read-only canonical data | degraded | local-runtime/data proof | `ok:true`; 89 price-bearing rows; 19 fresh, 52 delayed, 17 stale, 1 missing, 0 invalid; 3 rows returned from a 89-row filtered total; storage mode `canonical`; no refresh error | Correctly surfaces stale/missing state; does not prove provider freshness or writer recovery. Current integrity remains `ok:false`. |
| Runtime doctor | `node backend/cli/sovereign_cli.js doctor runtime --json --no-network` | read-only/no-network | pass | local-runtime proof | `ok:true`; Node `v24.18.0`; CLI, package, gateway launcher, and installed modules present | Does not prove clean install, host, provider, or service readiness. |
| Monitor/API contracts | `node --test tests/scripts/data/cache/market_monitor_service.test.js tests/scripts/data/cache/market_monitor_snapshot.test.js tests/scripts/architecture/data_storage/dashboard_market_monitor_contract.test.js backend/api/tests/access_control.test.js` | fixture/contract | pass | source contract proof | 4/4 pass | Does not prove a deployed API or remote RBAC session. |
| Dashboard monitor and responsive states | `npm run test:responsive` from `Frontend/dashboard` (host-capable) | temporary loopback + Chrome + fixture payloads | pass | host-capable local browser proof | Production build pass; 10/10 pass at 360/375/768/1440px covering navigation, overflow, loading, unauthorized, API error, empty, malformed, stale, and internal table scrolling | Requires host loopback permission; no provider or public listener. Does not prove deployed service health or soak. |
| Aggregate repository gate | `npm test` (host-capable) | local source/test | pass | host-capable source proof | 960 total / 956 pass / 0 fail / 4 intentional skips | Not fresh-clone, host deployment, recovery, backup/restore, one-writer, MCP, freshness, or soak qualification. |

## Workflow Refinement Smoke - 2026-07-27

| Feature | Entrypoint | Mode | Result | Evidence Class | Evidence | Limitation / Next Action |
|:---|:---|:---|:---|:---|:---|:---|
| CLI runtime doctor | `node backend/cli/sovereign_cli.js doctor runtime --json --no-network` | read-only, no-network | pass | local-runtime proof | `ok:true`; Node `v24.18.0`; CLI, package, gateway launcher, and installed modules present | does not prove provider, host, fresh-install, or service readiness |
| Protected API access contract | `node --test backend/api/tests/access_control.test.js` | fixture/contract | pass | source contract proof | test file passed in the two-file focused run | does not prove a remote login or deployed RBAC |
| Dashboard market-monitor contract | `node --test tests/scripts/architecture/data_storage/dashboard_market_monitor_contract.test.js` | fixture/read-only contract | pass | source contract proof | focused bundle: 2 files pass, 0 fail, 80 ms | does not prove browser rendering, running service health, or soak |
| Agent skill workflow | `npm run test:structure`; `npm run hygiene`; host `npm test` | source/contract | pass | committed-source candidate proof | mirror check 9/9; structure 2 files pass; aggregate 960 total / 956 pass / 0 fail / 4 intentional skips | working tree remains uncommitted; fresh-clone proof remains separate |

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
| `[x]` | Docs | Repo truth alignment | `workspace/`, `docs/engineering/` | docs may duplicate code maps; keep only if live probes support them | readback of `workspace/STATE.md`, `workspace/reports/FEATURE_TEST_MATRIX.md`, `workspace/reports/FEATURE_REPAIR_PLAN.md`, and `docs/engineering/tui_feature_map.md` against current probes | pass | `workspace/STATE.md` matched Phase 9 at the dated run; the report paths reflect the workspace reorganization | rerun before treating this 2026-06-11 row as current evidence |
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
