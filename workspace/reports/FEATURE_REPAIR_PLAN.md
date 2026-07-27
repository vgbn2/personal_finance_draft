# Feature Repair Plan - 2026-06-11

This plan comes from the current rigorous feature pass. It focuses only on surfaces that are still partial, drifted, or verification-limited.

## Priority Findings

0. Clean-clone reproducibility is the top audit issue.
   - Evidence:
     - `npm.cmd test` -> `269/269` pass locally, but tracked tests/docs reference untracked or ignored assets.
     - `backend/core/CMakeLists.txt:94` and `backend/core/src/main.cpp:7` reference `frame_backtester.{cpp,hpp}`, while `git ls-files backend/core/src/backtest/frame_backtester.cpp backend/core/src/backtest/frame_backtester.hpp` returns nothing.
     - `tests/scripts/strategy_asset_classification.test.js:7` executes untracked `scripts/classify_strategy_assets.js`.
     - `workspace/reports/FEATURE_TEST_MATRIX.md` and this plan cite untracked `scripts/mcp_stdio_probe.js` and `backend/api/tests/correlation_contract.test.js`.
     - `tests/scripts/notebooks_contract.test.js` asserts notebooks exist, while `.gitignore` ignores `notebooks/*.ipynb` and no notebooks are tracked.
   - Impact: local runtime confidence is high, but the repository alone cannot yet reproduce the green suite or native build.

1. The canonical data snapshot and integrity policy are now locally repaired.
   - Evidence:
     - `npm.cmd run test:data` -> `4/4` pass
     - `npm.cmd run test:macro` -> `4/4` pass, including reserves history contract
     - `node backend/cli/sovereign_cli.js status --json` -> `cache_mode:"recovered_live"`, `records:293`, `usable_records:293`, `stale_records:0`, `quality:"ok"`
     - direct readback of `storage/data/cache/last_fetch.json` -> `mode:"recovered_live"`, `snapshot_scope.kind:"global"`, multi-family source set
     - `node backend/cli/sovereign_cli.js backend integrity --json` -> `ok:true`, `84/84 cached`, `0 missing`, `0 stale`, active exceptions summary only `RNDRUSDT`
   - Impact: configured cache coverage, integrity policy, and root status are now aligned without requiring a fresh network ingest.

2. The earlier reserves failure is no longer reproducible.
   - Evidence:
     - direct `node --test tests/scripts/macro_ingestion_contract.test.js` -> `2/2` pass
     - suite `npm.cmd run test:macro` -> `4/4` pass
   - Impact: the repair plan should stop treating reserves ingest as the top broken contract. The real problem is stale audit output, not a live failing macro path.

3. Gateway verification is strong but still bounded by the no-spend ceiling.
   - Evidence:
     - gateway suite `30/30` passed, including live guard, wallet resolution, error sanitization, paper-run persistence, and proposed-order validation
     - `bot health --json` confirms configured keys, `Truth Machine API` `200 OK`, and `0.00 pUSD`
     - direct read-only fetches to `gamma-api.polymarket.com` and `clob.polymarket.com` still hit DNS resolution failures in this environment
   - Impact: contract confidence is good, but live-submit confidence still depends on explicit user approval plus a funded wallet, and some read-only market/portfolio probes remain environment-limited.

4. Repo-truth test artifacts had drift.
   - Evidence: `workspace/reports/FEATURE_TEST_MATRIX.md` and `workspace/reports/FEATURE_REPAIR_PLAN.md` were still on the 2026-06-08 baseline until this refresh; `docs/engineering/tui_feature_map.md` is updated but currently untracked in git.
   - Impact: future agents could chase retired failures or miss the current status-vs-integrity split.

## Repair Checklist

- [x] Re-run one evidence-backed probe bundle for each major feature family.
  - Evidence:
    - MCP: `node scripts/mcp_stdio_probe.js`
    - CLI: `node --test tests/scripts/module_loading.test.js tests/scripts/backend_cli_human_surfaces.test.js tests/scripts/cli_ui_contract.test.js`
    - TUI: `node --test tests/scripts/tui_terminal_automation.test.js`
    - Data: `npm.cmd run test:data`; `npm.cmd run test:macro`; status + integrity probes
    - Strategy: `node --test tests/scripts/strategy_backtest_contract.test.js tests/scripts/strategy_registry_sync.test.js tests/scripts/prop_firms_contract.test.js`
    - Config: `node --test tests/scripts/tests/settings_contract.test.js tests/scripts/tests/setup_doctor.test.js tests/scripts/tests/run_loop.test.js tests/scripts/tests/sovereign_cli_human_surfaces.test.js`
    - Gateway: `node --test tests/scripts/tests/live_guard.test.js tests/scripts/tests/polymarket_account.test.js tests/scripts/tests/polymarket_paper.test.js tests/scripts/tests/polymarket_errors.test.js tests/scripts/tests/proposed_orders.test.js tests/scripts/tests/proposed_orders_cli.test.js`
    - API/Web: `node --test backend/api/tests/api.test.js backend/api/tests/correlation_contract.test.js backend/api/tests/dashboard_contract.test.js backend/api/tests/charts.test.js`

- [x] Refresh the feature ledger files to the 2026-06-11 baseline.
  - Expected behavior: matrix and repair plan match current command evidence instead of the retired 2026-06-08 state.

- [x] Fix the root-status logic so family-scoped historical ingests no longer masquerade as global `last_fetch` health.
  - Evidence:
    - `node --test tests/scripts/tests/sovereign_cli_human_surfaces.test.js` -> `12/12` pass
    - `node backend/cli/sovereign_cli.js status --json` first reports the scoped snapshot honestly, then recovers the canonical root snapshot from partitioned history

- [x] Refresh the canonical global live snapshot after the old reserves-only file.
  - Evidence:
    - `status --json` now returns `freshness_scope:"last_fetch_snapshot"` with `snapshot_scope.kind:"global"`
    - `last_fetch.json` readback now shows multi-family recovered global data

- [x] Remove stale `VRE` integrity-policy baggage now that the active exception set is only `RNDRUSDT`.
  - Evidence:
    - direct TS probe: `VRE` `1d` cache ends at `2026-06-11T00:00:00.000Z`
    - `backend integrity --json` policy now returns only `RNDRUSDT`

- [x] Decide whether to stage or intentionally ignore `docs/engineering/tui_feature_map.md`.
  - Evidence:
    - the engineering map is now part of the deliberate repo-truth set
    - the feature matrix reflects it as a tracked truth artifact rather than an accidental scratch file
  - Impact: the docs hygiene gap is closed for this pass; the only remaining meaningful verification gap is live gateway spend.

- [ ] Close clean-clone reproducibility for load-bearing untracked files.
  - Expected behavior: a fresh checkout has every source, test, proof script, and fixture that tracked code/tests/docs require.
  - Execution plan: `workspace/DEEP_BLAST_GAP_CLOSURE_PLAN.md` is the current phased plan for the clean-clone repair, notebook contract rewrite, repo-skill truth cleanup, Docker verification, provider stubs, and C++ ML review cleanup.
  - 2026-06-11 mass-implement batch: staged `.dockerignore`, `frame_backtester.{cpp,hpp}`,
    `scripts/classify_strategy_assets.js`, `scripts/mcp_stdio_probe.js`,
    `backend/api/tests/correlation_contract.test.js`, `notebooks/signal_library.json`, and tracked
    notebook fixtures under `tests/fixtures/notebooks/`. `test:structure`, `test:api`, full
    `npm.cmd test` (`272/272`), RSI library probe, and native `sovereign_wealth` build all pass.
  - Remaining closure step: commit this staged batch or prove it from a clean worktree export before
    calling the clean-clone gap fully retired.
  - Minimum decision set:
    - `backend/core/src/backtest/frame_backtester.{cpp,hpp}`
    - `scripts/classify_strategy_assets.js`
    - `scripts/mcp_stdio_probe.js`
    - `backend/api/tests/correlation_contract.test.js`
    - notebook fixtures or `tests/scripts/notebooks_contract.test.js`
    - `.dockerignore`
  - Evidence target: clean checkout or temporary export can run `npm.cmd test` and build `sovereign_wealth` without relying on local-only files.

- [ ] Only with explicit user approval, run a tiny live Polymarket order to move Gateway confidence past the no-spend ceiling.
  - Expected behavior: one real live submit proves the final spend boundary and records the observed wallet/order behavior.
  - Evidence target: live order command output plus post-trade portfolio readback.

## Not Needed Right Now

- The macro/reserves path does not need an emergency repair based on the current rerun; it is green now.
- MCP, CLI, TUI, strategy, config, and API/Web contract suites are green in the current pass.
- The earlier API loopback bind concern is not the active issue in this shell; the current API test bundle passed without escalation.

## Suggested Next Pass

1. Close clean-clone reproducibility first; this is now the highest-leverage repair before any broad commit.
2. If you want gateway confidence above B, explicitly authorize one tiny live Polymarket trade from a funded wallet.
