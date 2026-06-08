# Feature Test Matrix - 2026-06-08

Run window: 2026-06-08, Asia/Saigon

## Matrix

| Check | Feature Family | Feature / User Surface | Owner Path | Parent / Subset Review | Probe | Result | Evidence | Residual Risk |
|:---|:---|:---|:---|:---|:---|:---|:---|:---|
| `[x]` | MCP | Tool discovery | `backend/mcp_server/`, `.mcp.json` | keep separate | `node scripts/mcp_stdio_probe.js` | pass | stdio server initialized; `tool_count: 17`; tool list includes `get_system_status`, `run_backtest`, `get_market_universe`, `trade`, `get_portfolio` | probe uses the built stdio server path, so source-vs-build drift can still exist outside this check |
| `[x]` | MCP | Representative tool call | `backend/mcp_server/tools/` | subset of tool discovery coverage, keep separate for behavior proof | `node scripts/mcp_stdio_probe.js` | pass | `tools/call` completed without error for `get_system_status` during the stdio probe | the current helper prints a compact summary rather than the full payload, so deeper field-level MCP assertions still belong in dedicated contracts |
| `[x]` | CLI | Command import and human surfaces | `backend/cli/`, `backend/cli/sovereign_cli.js` | parent for many TUI/API wrappers | `node --test tests/scripts/module_loading.test.js tests/scripts/backend_cli_human_surfaces.test.js tests/scripts/cli_ui_contract.test.js`; `node backend/cli/sovereign_cli.js status --json`; `node backend/cli/sovereign_cli.js doctor runtime --json --no-network` | pass | module/human/contract bundle `16/16` pass; `status --json` returns Phase 9 with scoped freshness fields; `doctor runtime` returns `ok:true` with launcher and package checks green | command-specific live broker paths still need their own runtime creds and no-spend verification |
| `[x]` | TUI | Automation smoke | `backend/cli/tui/`, `tests/scripts/` | often wraps CLI commands, keep separate because PTY and prompt flow are distinct behavior | `node --test tests/scripts/tui_terminal_automation.test.js` | pass | `3/3` pass; harness reached research menu, backtest asset picker, and optimize flow without prop-firm leakage | this proves navigation and prompt flow, not every rich-terminal visual state |
| `[!]` | Data | Integrity and freshness | `storage/`, `backend/cli/commands/data/` | parent for dashboard/API data summaries | `node backend/cli/sovereign_cli.js status --json`; `node backend/cli/sovereign_cli.js backend integrity --json` | partial | `status --json`: `records 82`, `usable_records 9`, `rejected_records 73`, `stale_records 73`, `freshness_scope:"last_fetch_snapshot"`; `backend integrity --json`: `ok:true`, `84/84 cached`, `0 missing`, `0 stale`, `2 exceptions` (`RNDRUSDT`, `VRE`) | the commands are honest, but latest-fetch freshness is still degraded and `VRE` remains on the exception list until VN symbol mapping is improved |
| `[x]` | Strategy | Registry, prop-firm, and backtest contracts | `config/strategies/`, `backend/cli/commands/strategy/`, `backend/cli/commands/research/` | parent for strategy pickers and dashboard strategy views | `node --test tests/scripts/strategy_backtest_contract.test.js tests/scripts/strategy_registry_sync.test.js tests/scripts/prop_firms_contract.test.js` | pass | `22/22` pass; registry sync, prop-firm persistence, live-mode note, walk-forward output, and local C++ auto-dispatch are covered | no live market strategy sweep was attempted in this audit |
| `[x]` | Config | Settings, setup, doctor, and loop control | `shared/lib/settings/`, `shared/lib/brokers/`, `backend/cli/commands/setup.js`, `shared/lib/run_loop.js` | keep separate | `node --test tests/scripts/tests/settings_contract.test.js tests/scripts/tests/setup_doctor.test.js tests/scripts/tests/run_loop.test.js tests/scripts/tests/sovereign_cli_human_surfaces.test.js` | pass | `27/27` pass; settings persist/reset correctly, secrets stay redacted, caller-chosen env writes work, and loop state behaves deterministically | broker-specific live auth is still outside this no-spend config pass |
| `[!]` | Gateway | Broker and Polymarket execution bridge | `backend/gateway/`, `backend/cli/commands/trade/` | parent for CLI trade and bot execution surfaces | `node --test tests/scripts/tests/live_guard.test.js tests/scripts/tests/polymarket_account.test.js tests/scripts/tests/polymarket_paper.test.js tests/scripts/tests/polymarket_errors.test.js tests/scripts/tests/proposed_orders.test.js tests/scripts/tests/proposed_orders_cli.test.js` | partial | `29/29` pass; live guard blocks cloud-compute live paths, wallet resolution and error sanitization are covered, paper-run persists virtual fills, proposed-order preview fails closed on malformed input | no real live submit was attempted because it can spend pUSD, so B+ confidence stops at no-spend and contract coverage |
| `[x]` | API/Web | Server and dashboard contracts | `backend/api/`, `Frontend/dashboard/`, `web/` | may mirror CLI/API parent surfaces, keep separate for HTTP and shell-contract proof | first sandbox run failed with `listen EACCES 127.0.0.1`; rerun approved: `node --test backend/api/tests/api.test.js backend/api/tests/dashboard_contract.test.js` | pass | approved rerun `2/2` pass; API health/data summary/correlation and served dashboard shell/bundle contract are green | current API tests need loopback bind permission, so sandbox-only failures can masquerade as app regressions |
| `[x]` | Docs | Repo truth alignment | `workspace/`, `docs/engineering/` | docs may duplicate code maps; propose consolidation only | readback of `workspace/STATE.md` against current probes plus `docs/engineering/tui_feature_map.md` | pass | `workspace/STATE.md` matches Phase 9 and the refreshed `docs/engineering/tui_feature_map.md` now separates policy-green backend integrity from the separate latest-fetch freshness signal | lower-traffic docs can still drift unless this pass is folded back into the engineering notes |

## Overlap Review

| Parent Feature | Subset Feature | Mark | Affected Paths | Behavior To Preserve | Required Tests | Rollback Path | Risk If Kept Separate |
|:---|:---|:---|:---|:---|:---|:---|:---|
| CLI research/trade commands | TUI menu flows for research and trading | keep separate | `backend/cli/sovereign_cli.js`, `backend/cli/tui/` | prompt order, PTY interaction, and menu discoverability | `tests/scripts/tui_terminal_automation.test.js`, CLI contracts | restore prior manifest/menu wiring | duplicate logic can drift, but the TUI is still a real user surface |
| Backend/API status and summaries | Dashboard shell and API route contract | keep separate | `backend/api/`, `Frontend/dashboard/`, `web/` | HTTP shape, served shell, bundle reference, auth boundary | `backend/api/tests/api.test.js`, `backend/api/tests/dashboard_contract.test.js` | revert route/shell contract changes | browser/API consumers can break while CLI stays healthy |
| MCP `get_system_status` protocol surface | CLI/backend status surfaces | keep separate | `backend/mcp_server/`, `backend/cli/commands/status.js` | MCP schema and transport contract | `scripts/mcp_stdio_probe.js` plus CLI status probes | revert MCP server build or tool registration | protocol-layer regressions can hide behind healthy local CLI output |

## Compact Grade Snapshot

| Family | Grade | Status |
|:---|:---:|:---|
| MCP | A- | open |
| CLI | A | open |
| TUI | A | open |
| Data | B+ | open |
| Strategy | A | open |
| Config | A | open |
| Gateway | B | open |
| API/Web | A- | open |
| Docs | B+ | open |

## Notes

- The broad product surface is mostly healthy under no-spend verification.
- The largest remaining product issue is not a crash but a trust boundary: Gateway live submit still lacks a user-approved real-money proof.
- The strongest confirmed drift is in `docs/engineering/tui_feature_map.md`, not in the code paths exercised here.
- API/Web failures seen inside the sandbox were environmental. The approved rerun proved the server contracts themselves are currently green.
