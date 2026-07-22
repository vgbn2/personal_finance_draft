### Blast-Through Focused Audit — 2026-06-14 session 30 (anchor 51b20b6c → d95b92a7)

| Priority | Area | File:line | Finding | Fix | Gate |
|---|---|---|---|---|---|
| P1 | data-depth | `storage/data/ts/*_{30m,4h}.bin` (introduced by rollup commit `217d21e5`, age <1d) | 30m + 4h intraday bins stale/shallow — BTCUSDT 5m=926,357 (2017→2026) & 15m=37,898, but 30m=1,440 / 4h=180 (only 2026-05-11→06-10); AAPL 30m=777 / 4h=859 (end 06-09). The session-29 catch-up rollup refreshed 15m+1h but not 30m+4h. **Code is correct** (`ROLLUP_TARGET_TFS=['15m','30m','1h','4h']`; dry-run confirms intent). | Run `intraday-rollup --family crypto` + `--family equities` (local, idempotent, ~seconds). Verify 30m/4h counts jump to match 5m depth. | data layer B (open); gap is data-state not code |
| P2 | config | `config/markets/asset_mapping.json` (dead since reorg) | Divergent dead duplicate of `config/asset_mapping.json`. Zero readers across js/cpp/hpp/ts/yaml; production reads the root copy (`backend/cli/tui/manifest.js:31`). Diverges in content + keys (`FX` vs `Forex`; `Crypto:[BTC,USDT,ETH]` vs full 21-symbol universe) → edit-wrong-file trap. | Delete `config/markets/asset_mapping.json` (or add a byte-equality contract test if the second copy is intentional). | config C — GATED until removed |

**Reviewer decision needed:** (1) confirm OK to run the catch-up `intraday-rollup` (writes 30m/4h bins);
(2) confirm the `config/markets/asset_mapping.json` stub is dead and can be deleted.
**Verification gate to clear:** post-rollup `readTsIndex` shows 30m/4h spanning the same range as 5m; full suite still green after stub deletion.

##### Centralization Backlog

| Pattern | Files (count) | Proposed unit | Effort | Grade impact |
|---|---|---|---|---|
| ~~ANSI import spelling drift~~ — RESOLVED 2026-06-08 (commit `4d3fb4d`): `auth.js` now imports `shared/lib/ansi` (matches `settings.js`, same shim target) | was 4 files, outlier fixed | — | S | done |

Noted, not flagged: `parseArgs(argv)` in `scripts/strategies/ml_smoke_alpaca.js` and `ml_smoke_polymarket.js` share a ~6-line arg-loop shape. Only 2 files, each parses different flag sets (`--qty` vs none, `--dry` shared) — below the 3-file drift threshold and a shared helper would be more code than the duplication. No action needed.

---

### P0 — `runGatewayCommand` throws on every call (`shared/lib/runtime/backend_bridge.js:72`)
- `require.resolve('../../backend/gateway/src/index.ts')` resolves relative to
  `shared/lib/runtime/` → `shared/backend/gateway/...` which does not exist. The function throws
  before reaching the correct `path.join(REPO_ROOT, ...)` two lines below. Proven live:
  `node -e "...runGatewayCommand(['balance','--json'])"` → `Cannot find module`.
- Blast radius: `trade.js` migrated 5 functions onto it — `fetchPolymarketOrderbookSnapshot`,
  `fetchPolymarketPriceHistorySnapshot`, `submitPolymarketBuyOrder` (**live order path**),
  `fetchBalance`, `fetchAggregatePortfolio`. All dead in this tree.
- Test evidence: NEW failures in `polymarket_preflight.test.js` (buy --preflight),
  `proposed_orders_cli.test.js` (trade process preview), `polymarket_auth_health.test.js`
  (CLI exits 1, expected 0).
- **Reviewer decision**: fix = delete the dead `require.resolve` line (keep the `path.join`),
  AND decide launcher parity — old `buildTradeGatewayLaunch` had a ts-node bootstrap fallback
  (`backend/cli/lib/run_trade_gateway.js`, treated as supported infra per 2026-06-05 note);
  `findNodeCli()` must cover the same matrix or machines without tsx regress.
- **Gate**: the 3 named test files green + a live `sovereign trade balance` smoke.

### P0 — 7 NEW failing test files (suite 12✖ vs 6✖ baseline)
| Test file | Failure | Caused by |
|---|---|---|
| `polymarket_preflight.test.js` | buy --preflight | runGatewayCommand bug |
| `proposed_orders_cli.test.js` | trade process preview | runGatewayCommand bug |
| `polymarket_auth_health.test.js` | exit 1 ≠ 0 | runGatewayCommand bug |
| `lib/indicators.data_flow.test.js` | "Volatility should be positive in real market" | manifest-driven `featureFromWindow` |
| `polymarket_errors.test.js` | redactHeaderMap contract | expanded redaction set not reconciled with test |
| `sovereign_cli_human_surfaces.test.js` | integrity render contract | `tools/backend.js` tf:count format change |
| `sovereign_cli_price_action.test.js` | divergence assertions | indicators/feature change (shares root with data_flow) |
- Pre-existing (unchanged): cli_ui_contract ×2, notebooks_contract, supabase_route_contract,
  crypto_aggregates, tui_search_contract (`commands/backend` shim path).
- **Gate**: suite back to ≤6✖ (baseline) before commit; each contract either fixed in code or
  deliberately updated in the test with a note.

### P0 — tracked code depends on untracked files (drift class, 4th occurrence)
- `backend/cli/lib/utils.js:482` → `shared/lib/market/symbol_resolver.js` (untracked). A
  `git clean -fd` or fresh clone kills the whole CLI at load.
- `shared/lib/providers/index.js` → `./ecb.js` (untracked) — central provider barrel; same blast.
- `shared/lib/market/indicators.js` → `config/system/indicator_manifest.yaml` (untracked dir,
  6 files incl. `feature_flags.yaml`, `app_config.yaml`, `tools.yaml`) — silent fallback if
  absent, but then features differ between machines: train/serve skew vector for ML.
- Also untracked but load-bearing-adjacent: `storage/models/*.onnx` now UN-ignored (the
  `.gitignore` edit removed the `models/*.onnx` rule — direction matches the standing "commit
  the binaries" option) but still uncommitted; `backend/cli/commands/research/{backtest,
  optimize_indicators}.js` (wiring unverified).
- **Reviewer decision**: commit these with the feature work or the branch is self-breaking.

### P1 — `executeSovereignCommand` default 30s timeout (`backend_bridge.js:19`)
- Old `runBackendCommand` had NO timeout; new default kills any spawn >30s. Known long ops:
  frame backtests via `shared/lib/strategy/backtest.js:979,1033` (bridge callers), 47×47
  correlation historically 95s (currently safe only because `tools/backend.js:433` still uses
  its own LOCAL `runBackendCommand` copy). **Decision**: make timeout opt-in (or ≥120s default)
  before migrating any more callers onto the bridge.

### P1 — smart JSON extraction forces `ok: true` (`backend_bridge.js:48`)
- `{ ok: true, ...payload, code }`: payload without an `ok` field is reported ok even when the
  process exited non-zero; and `code: result.status` clobbers any `code` field in the payload.
  **Decision**: gate `ok` on `result.status === 0 && payload.ok !== false`; rename the exit-code
  field (`exit_code`).

### P1 — indicators manifest engine swallows all errors (`indicators.js applyManifestIndicator`)
- Every indicator failure → silent `{}`; when the manifest loads, the legacy feature set is
  entirely replaced (early return), so a bad manifest silently changes the ML feature contract.
  Failing test proves a live mismatch (volatility not positive). **Decision**: surface per-
  indicator errors (warn + count), add a key-parity contract test (manifest output keys ==
  legacy keys for the default manifest). This is the serving side of the ML skew gate.

### P1 — `research.js loadHistoricalSources` filter strictened (line ~319)
- Candle filter went from `(tf || '1d' || 'point' || untagged)` to strict `=== tf`. Backtests
  requesting a timeframe with only 1d/macro('point') records now silently get zero candles
  where they previously fell back. **Decision**: confirm intended for OHLCV, and verify macro
  ('point') consumers — correlation-with-CPI paths — still resolve.

### P2 — answers to the inline `//dev review` questions left in `quote_router.js`
- "higher=worse or higher=better?" — **higher = better.** `selectPreferredQuoteRecords` sorts by
  `rank*1e9 + count*1000 + quality*10 + volume` descending; `DEFAULT_PROVIDER_PRIORITY` rank is
  the dominant term. The edit (coinbase 80→85, polygon 86→80) therefore promotes coinbase ABOVE
  binance (82) and polygon for crypto quotes — note coinbase has documented geo-fragility (451s,
  2026-06-06 sessions). Reconsider or document.
- "per symbol or per router?" — **per symbol-timeframe group** (`groupQuoteRecords` →
  selection per key), so per-symbol fallback exists; "mostly YF in cache" just means Yahoo won
  rank for those symbols/timeframes (or was the only fetcher that succeeded).
- Hardcoded crypto list in `inferFamily` — real but pre-existing; candidate to derive from
  `data_sources.yaml` universe. Backlog, not a regression.

### P2 — smaller flags
- `polymarket_history.js:95` — `'1wk': 86400*30` is a WEEKLY key with a MONTHLY (30-day)
  fidelity, and the key style (`1wk`) mismatches the `1w` used elsewhere. Likely typo.
- `.gitignore` — blanket `*.jsonl` would prevent ever tracking paper-trading ledgers
  (`fills.jsonl`, `resolved_positions.jsonl`); duplicate lines (`repo_tree.txt`,
  `strucure_report.txt` twice); root `.graphify_*.json` artifacts remain unignored.
  `backend/cli/target/` ignore (old carryover) IS now added — good.
- `validation.js` — comment placeholder only; `FRESHNESS_RULES_MS` has no `1w`/`1mo` entries,
  so new-timeframe staleness uses fallback behavior. Add rules.
- Ingest derive-before-fetch ordering: 1w/1mo are aggregated from the PRE-refresh 1d cache in
  the same run that then refreshes 1d — derived bars lag one cycle.
- `data.js` mass-backfill defaults: 365→7300 days, concurrency 5→10 (user-annotated "dev
  suggest"). Rate-limit exposure on free tiers (Yahoo/CoinGecko); deliberate choice to confirm.
- `trade.js:400` mid-file `require` + unused `executeSovereignCommand` import.

### Verified-good in the same tree (credit where due)
- `binance.js` pagination (1000-bar cap bypass, MAX_CALLS 20, no-overlap paging) — clean logic;
  live evidence: BTCUSDT ts index now 1w=464 bars (2017-07-20→2026-06-04), 1mo=109 bars — the
  DEV_COMMENTS "4 → 464 bars" claim is REAL.
- `deriveHighTfFromLocalDaily` local aggregation — `TS_INDEX_PATH`/`aggregateCandles` both
  defined in-module; syntax-clean; works per ts-index evidence above.
- `polymarket_errors.js` expanded redaction — right direction, just reconcile its contract test.
- All 19 modified JS files pass `node --check`.

## Centralization Backlog (2026-06-11 additions)

| Pattern | Files (count) | Proposed unit | Effort | Grade impact |
|---|---|---|---|---|
| Gateway launch path (2 impls, 1 broken) | trade.js `buildTradeGatewayLaunch` (5 call sites) + bridge `runGatewayCommand` (5 migrated fns) | fix bridge, then migrate remaining 5 sites, delete local launcher | M | trade D→B |
| `runBackendCommand` duplicate | `tools/backend.js:433` local copy (8 call sites) + `backend_bridge.js:59` | migrate onto bridge AFTER timeout default fixed | M | tools C→B |
| JSON-from-stdout extraction | bridge smart-extract + `trade.js parseGatewayJsonOutput` | one `parseJsonPayload` util in bridge | S | — |

### Deep Blast-Through - 2026-06-11 live dirty-tree audit

Scope: hard-reading audit of the current `feat/ml-onnx-section` worktree after graph refresh.
The graph was rebuilt from `6eea7b77` to 9205 nodes / 14200 edges / 730 communities. Runtime
verification is strong locally, but repository reproducibility is not clean because several
tracked files depend on local-only or ignored files.

### P0 - tracked C++ build depends on untracked `frame_backtester` sources
- `backend/core/CMakeLists.txt:94` includes `src/backtest/frame_backtester.cpp`.
- `backend/core/src/main.cpp:7` includes `backtest/frame_backtester.hpp` and calls
  `FrameBacktester` at `main.cpp:700`, `main.cpp:715`, and `main.cpp:797`.
- `git ls-files backend/core/src/backtest/frame_backtester.cpp backend/core/src/backtest/frame_backtester.hpp`
  returns no tracked files. A clean clone has tracked references to files that are absent.
- Local verification is green only because the untracked files exist in this checkout.
  `cmake --build backend/core/build --config Release --target sovereign_wealth` builds after
  cleaning this shell's duplicate `Path`/`PATH` environment key. The first build attempt failed
  before compilation with MSBuild `Item has already been added. Key in dictionary: 'Path'`.
- Required fix: either track `frame_backtester.{cpp,hpp}` with the C++ work or remove the tracked
  references. Do not treat the current native build as clone-safe until this is closed.

### P0 - full test suite is green locally but relies on untracked/ignored test assets
- `tests/scripts/strategy_asset_classification.test.js:7` executes
  `scripts/classify_strategy_assets.js`, but that script is untracked.
- `workspace/FEATURE_TEST_MATRIX.md:9` and `workspace/FEATURE_REPAIR_PLAN.md:37` use
  `scripts/mcp_stdio_probe.js` as the MCP proof command, but that script is untracked.
- `workspace/FEATURE_TEST_MATRIX.md:16` and `workspace/FEATURE_REPAIR_PLAN.md:44` list
  `backend/api/tests/correlation_contract.test.js`, but that test file is untracked.
- `tests/scripts/notebooks_contract.test.js:7-27` asserts notebooks exist and are parseable.
  `.gitignore:125` ignores `notebooks/*.ipynb`, and `git ls-files notebooks/*.ipynb` returns
  nothing. The local notebooks make the suite pass; a clean clone would not have them.
- Required fix: decide which of these are source/test fixtures and track them, or rewrite the
  contracts so local-only artifacts are skipped or generated before test execution.

### P1 - repo-local skill inventory should stay trimmed to the three umbrella skills
- `GEMINI.md:11` now points at `skills/gemini/SKILL.md`, which matches the live repo-local bootstrap path.
- The repo-local skill tree has been reduced to `codex`, `claude`, and `gemini` only; the older secondary skill directories were removed from both `skills/` and `.agents/skills/`.
- Impact: bootstrap and blast-through behavior should rely on the three umbrella skills plus handoff files, not a fragmented skill set.
- Required fix: keep the docs and bootstrap paths pinned to the three umbrella skills only.

### P1 - Docker context hygiene is untracked while Dockerfile remains a blocked carryover
- `.dockerignore` is untracked. It excludes `.env*`, cache, build outputs, notebooks, workspace
  state, and generated data from Docker build context, but a clean clone would not have that
  protection.
- `infra/docker/Dockerfile` still has the deliberate uncommitted ONNX flag edit:
  `-DSOVEREIGN_ENABLE_ONNX_RUNTIME=ON`. This remains blocked on Docker Desktop verification per
  the existing handoff.
- Required fix: track `.dockerignore` if Docker build hygiene is considered part of the repo, and
  keep the Dockerfile edit uncommitted until the container rebuild plus in-container `ml compare`
  proves `onnx_runtime`.

### P2 - real provider/data gaps remain behind green no-spend tests
- `backend/scripts/data_ops/ingest_market_data/index.js:1162-1167` still returns empty objects for
  OpenSky, Blockchair, SEC holdings, SP Global PMI, and ECB FX fetchers. Their registry entries
  are wired at `index.js:1269-1299`, so the seam is active but provider extraction is incomplete.
- `shared/lib/providers/tradingview.js:78` still explicitly says the screener search is stubbed.
- These are not breaking current tests because the no-spend verification suite focuses configured
  cache health and mocked provider contracts. They are product-scope gaps, not runtime regressions.

### P2 - stale developer-review comments remain in active C++ ML code
- `backend/core/src/ml/cnn_inference.cpp:61`, `backend/core/src/ml/model_registry.cpp:52`, and
  `backend/core/src/ml/onnx_model.cpp:18` still contain `dev review` comments in active source.
- These do not break compile or tests, but they keep the ML section below an A cleanliness grade
  because the comments are unresolved design questions in production code.

### Verified good in this audit
- `graphify update .` succeeded: 9205 nodes, 14200 edges, 730 communities.
- Modified JS syntax checks passed for API executor, status, trade, asset picker, ingestion, and
  user settings.
- Focused no-spend gates passed:
  - CLI/settings/TUI/status bundle: 25/25.
  - API/correlation/dashboard bundle: 4/4.
  - Macro/reserves ingest contract: 2/2.
  - Gateway no-spend contract bundle: 30/30.
  - Strategy/prop-firm/backtest bundle: 22/22.
  - MCP stdio probe: 17 tools listed.
  - CLI/module-loading bundle: 16/16.
- Full `npm.cmd test` passed: 269/269.
- Native C++ target built locally after the duplicate environment key workaround:
  `sovereign_core.lib` and `sovereign_wealth.exe`.
- `status --json` reports `cache_mode:"recovered_live"`, 293 usable records, 0 stale records.
- `backend integrity --json` remains policy-green: 84/84 cached, 0 missing, 0 stale, only
  `RNDRUSDT` as the active exception.

### Section grades from this pass
| Section | Grade | Reason |
|---|---:|---|
| CLI/TUI/status/settings | B+ | Runtime tests green; current feature work is covered, but dirty-tree docs/tests depend on untracked artifacts. |
| API/Web contracts | B+ | API correlation fallback tests pass; new correlation contract is untracked. |
| C++ core | C | Local build passes; tracked source graph depends on untracked frame backtester files. |
| Data/ingestion | B- | Status/integrity green; scoped snapshot handling works; provider stubs remain. |
| Gateway/Polymarket | B | No-spend tests green; live spend still intentionally unverified. |
| Infra/Docker | C | ONNX flag edit still unverified; `.dockerignore` is untracked. |
| Repo workflow/skills | C- | Instructions advertise skill files that are empty or absent in the live repo. |
| Docs/workspace truth | B- | Current ledgers are useful, but some proof commands name untracked files. |

### Next cleanup move
Close clean-clone reproducibility before any broad commit: track or deliberately demote
`frame_backtester.{cpp,hpp}`, `scripts/classify_strategy_assets.js`, `scripts/mcp_stdio_probe.js`,
`backend/api/tests/correlation_contract.test.js`, and the notebook fixtures/contracts. Then rerun
`npm.cmd test` and the native C++ build from a clean clone or temporary export.

### Gap Closure Plan - 2026-06-11
- Durable plan: `workspace/DEEP_BLAST_GAP_CLOSURE_PLAN.md`.
- Recommended order: clean-clone reproducibility first, notebook/research contract second, repo
  protocol/skill truth third, then Docker ONNX verification, provider extraction, and C++ ML review
  cleanup.
- Key planning decision: do not bulk commit local research/data state. Track load-bearing source and
  proof assets, keep heavyweight `.ipynb` and generated `storage/data/*` outputs local, and replace
  tests that require ignored artifacts with tracked fixtures or manifests.

### Update - 2026-06-11 mass-implement clean-clone repair batch
- Implemented the Phase 1 and minimal Phase 2 reproducibility slice:
  - staged `.dockerignore`
  - staged `backend/core/src/backtest/frame_backtester.{cpp,hpp}`
  - staged `scripts/classify_strategy_assets.js`
  - staged `scripts/mcp_stdio_probe.js`
  - staged `backend/api/tests/correlation_contract.test.js`
  - staged `notebooks/signal_library.json`
  - added tracked notebook fixtures under `tests/fixtures/notebooks/`
  - rewired `test:api`, expanded `structure_contract.test.js`, and rewrote
    `notebooks_contract.test.js` to validate tracked fixtures instead of ignored live notebooks
- Verification:
  - `npm.cmd run test:structure` pass
  - `npm.cmd run test:api` pass
  - `node --test tests/scripts/notebooks_contract.test.js` pass
  - `node -e` RSI library probe: `35` actionable signals from tracked `notebooks/signal_library.json`
  - `cmake --build backend/core/build --config Release --target sovereign_wealth` pass
  - `npm.cmd test` pass `272/272`
- Additional blocker found during verification and fixed inline:
  - TUI boot was refreshing Supabase auth on menu startup, which made
    `tests/scripts/tui_terminal_automation.test.js` fail under network-restricted conditions.
  - Fix: `backend/cli/sovereign_cli.js` now reads auth locally only during TUI boot via
    `getAuthenticatedUser({ refreshExpired: false })`; explicit auth flows still refresh normally.
- Remaining nuance: this closes the reproducibility gap in the current staged index, but a true
  clean-clone proof still needs commit or clean-worktree/export verification.

### Findings (reviewer decisions required)

| # | Severity | File:Line | Finding | Required decision / gate |
|---|---|---|---|---|
| 1 | High | backend/api/app.js:128 + server/routes/system/kill_switch.js:6 | Unauthenticated GET /api/kill-switch?command=<engage|release|status> reaches the C++ kill switch -- state-changing safety control on the exposed web port. Route is in neither the public list nor PROTECTED_GET_ROUTES. | Add /api/kill-switch to PROTECTED_GET_ROUTES (one line) or make engage/release POST-only. Fold into roadmap item 5 (login barrier). Gate: app.js stays GATED until landed. |
| 2 | High | backend/gateway/src/index.ts:723-748 | ExecutionGateway.execute() swallows live order failures: logs to stderr, sets status FAILED, exits 0. Bridge then reports ok:true (proven live: 422 probes returned ok:true + status failed). Callers cannot distinguish success from failure. | Decide envelope: non-zero exit on failed execution vs ok:false JSON. Then update bridge consumers. |
| 3 | High (live path) | backend/gateway/src/cycle.ts:207-227, 405-437 | FOK intent silently lost: timeInForce:'FOK' is not a UserOrder field; postOrder(signed) defaults GTC. Unmatched GTC sells REST on the book while code treats them as failed and keeps the position -> dangling live orders + duplicate-sell stacking on retry. Pre-existing; relevant before any liveTrading enable. | Use postOrder(signed, OrderType.FAK) or createAndPostMarketOrder(FOK), cancel on unmatched. BLOCKS liveTrading enablement. |
| 4 | Medium | backend/gateway/src (classifyPolymarketGatewayError) | CLOB business rejections (e.g. the V2 "invalid order version") classified as invalid_token with misleading suggestion. | Add explicit categories for CLOB 400-with-error-body rejections. |
| 5 | Medium | backend/gateway/src/index.ts:2267-2269 | polymarket derive-creds prints L2 API secret/passphrase plaintext to stdout (by design for setup; lands in any captured log). | Confirm by-design or add --reveal flag + masked default. |
| 6 | Low | backend/gateway/src (bot health) | pUSD balance printed in micro-units ("9305985.00 pUSD"). | Divide by 1e6 in display. |
| 7 | Note | bot cycle engine | Top dry-run pick was a past-deadline market at 78.9% claimed edge (resolution-lag trap). | Candidate filter needs endDate/liquidity guards before liveTrading. |

### Centralization Backlog (additions)

| Pattern | Files (count) | Proposed unit | Effort | Grade impact |
|---|---|---|---|---|
| Raw fetch without transport retry (host egress flaps connect EACCES) | gateway index.ts gamma/data-api fetches, polymarket_paper.js, CLI fetch sites (3+) | shared/lib/runtime/fetch_retry.js (2-3 attempts, expo backoff on connect-class errors) | M | gateway error-handling B->A |
| submitPolymarketOrder / preflightPolymarketOrder ~80% duplicated | index.ts (2 fns) | single prepare+optionally-post helper | S | drift containment |
| Hand-rolled L2 HMAC headers in clob_factory authedGet | clob_factory.ts vs clob-client-v2 createL2Headers/updateBalanceAllowance exports | adopt SDK helpers, drop local copy | S | drift containment |
| (carryover, user-deprioritized) trade.js 5 launcher call sites + tools/backend.js local runBackendCommand | 2 files | bridge | M | unchanged |

### Orphans / parity
- Orphan: AlpacaAdapter.placeBracketOrder (index.ts:568) -- no caller anywhere (below >3 threshold; note only).
- Parity nit: bot unknown-subcommand error lists "cycle, status, run, sell, config" but omits implemented "health".

### Resolved this pass
- app.js GET-auth question (carried since 2026-06-06): design is public-read + token-write + PROTECTED_GET_ROUTES; verified sound EXCEPT finding #1. /api/supabase/config exposes URL only (no keys) -- acceptable.
- Stub scan: no new stubs on reachable paths. Dev-marker scan: gateway src clean (0 markers).

#### C++ backend verification (roadmap item 6) - findings

Verdict: core engines REAL and healthy; test harness has fixture-path debt.

| # | Severity | Finding | Decision needed |
|---|---|---|---|
| 1 | Evidence | ml compare reproduces the Phase-3 parity numbers EXACTLY (xgboost 0.666376 {7061,1275,11144}, logistic 0.468378, regime 0.456982; backend onnx_runtime, 19,480 rows). Correlation + risk engines respond correctly. | none -- strongest possible health proof |
| 2 | Low | C++ `indicators` default --input is the pre-partition monolith path (main.cpp:522, storage/data/cache/backtest_history.json -- gone). Works with explicit --input; API route serves indicators via Node CLI anyway. | S fix: default to equities partition or require --input |
| 3 | Medium | ctest 27/29: ingestion_adapter_test fails (looks for config/data_sources.yaml relative to build dir; real file = repo-root config/markets/data_sources.yaml) and kronos_integration_test fails (needs >=4 empirical data points, fixture absent). Fixture/CWD debt, NOT logic failures. | S fix: resolve config path from repo root / ship fixture; then STATE.md 29/29 claim true again |
| 4 | Note | STATE.md "All 29/29 C++ core tests passing" is STALE (currently 27/29). Also carryover: core test mains are assert-only -> no-ops under Release NDEBUG; green Release ctest is weak evidence. Behavioral anchors (finding #1) are the real gate. | run ctest in Debug config when fixing #3 |

### Resolved in this pass

| Severity | Classification | File:Line | Finding | Resolution / evidence |
|---|---|---|---|---|
| High | production | `shared/lib/market/validation.js:620`, `shared/lib/market/validation.js:718` | `writeTsIndex` still used a fixed `<bin>.tmp` path for every process. Session 25 already proved two separate deep-backfill processes can race the shared temp name and crash with EPERM. | Replaced fixed temp paths with process-unique atomic temp paths for bin and meta writes. Added `tests/scripts/tests/backfill_regression.test.js:128` to prove an existing `BTCUSDT_1d.bin.tmp` from another writer is not overwritten. Gates: `node --check shared/lib/market/validation.js`, focused backfill test, `npm.cmd run test:data`, `npm.cmd run test:structure`, and full `npm.cmd test` all passed. |
| High | production | `backend/scripts/data_ops/ingest_market_data/index.js:2009` | Crypto native subdaily provider routing bug where Coinbase still called Binance base fetcher. | Fixed to route to `fetchCoinbaseBaseCandles` if provider is `coinbase`. Added unit test in `tests/scripts/tests/crypto_5m_backfill.test.js`. All tests passed. |
| Medium | runtime-artifact | `storage/data/backtests/latest_backtest.json`, `storage/data/strategy_grade_index.json` | Runtime report JSON was tracked in Git and caused constant git status noise. | Untracked both files via `git rm --cached` and added them to `.gitignore`. |
| Low | production | `backend/core/src/ml/cnn_inference.cpp:61`, `backend/core/src/ml/model_registry.cpp:52`, `backend/core/src/ml/onnx_model.cpp:18` | Active C++ ML source files contained legacy inline `dev review`/IDE comments. | Purged the comments from all three C++ source files and verified the release build compiles. |
| P1 | production | `backend/cli/commands/research/ml.js:66`, `shared/lib/ml/dataset.js:169` | ML dataset builder lacked caps for intraday (5m) timeframes, risking O(n^2) memory/time blowup. | Implemented `--max-bars-per-symbol` and added a default 50,000 bar cap for intraday timeframes. Verified via new unit test in `ml_dataset.test.js`. |
| P1 | production | `shared/lib/strategy/backtest.js:286`, `772`, `778` | Backtest annualization assumed 24/7 for equities and lacked session-gap checks (overnight/weekends). | Implemented active session periodsPerYear for equities (252 days * 6.5 hours) and calendar date session-gap guards. All tests passed. |
| P2 | git-config | `data/skills/` | Stale broken symbolic directory junctions caused `warning: could not open directory` in git status. | Cleaned up all broken symlinks under `data/skills/` using PowerShell, resolving the warnings completely. |

### Active findings

| Severity | Classification | File / surface | Finding | Required next move |
|---|---|---|---|---|
| High | production/runtime-data | `backend integrity --json`, `storage/data/ts` | Current configured-cache integrity is red despite `status --json` being green. Fresh run: `ok:false`, `92/92 cached`, `0 missing`, `total_stale:3`, `total_exceptions:1`; stale symbols are `GBPUSD`, `USDJPY`, and `AUDUSD` on `1d`. `status --json` still reports last-fetch snapshot quality `ok`, so the health split is working, but the Phase-9 data posture is not fully green. | Refresh or repair FX daily cache, then rerun `backend integrity --json`. If provider data remains stale, record explicit exceptions with rationale instead of leaving integrity red. |
| Medium | production | `shared/lib/providers/tradingview.js:78` | TradingView screener search remains explicitly stubbed. Tests can stay green because this is outside the mocked no-network suite, but the provider surface is not a complete live implementation. | Either implement metadata discovery or mark the command/provider as research-only/partial in the user-facing surface. |

### Verified good

- Clean-clone gap from 2026-06-11 is closed under the current structure contract: tracked `frame_backtester.{cpp,hpp}`, `scripts/classify_strategy_assets.js`, `scripts/mcp_stdio_probe.js`, `backend/api/tests/correlation_contract.test.js`, `.dockerignore`, notebook fixture set, and `notebooks/signal_library.json`.
- `graphify update .` refreshed graph context to `9635` nodes / `14796` edges / `747` communities, built from `973656a9`.
- Verification after the FW1 fix: `npm.cmd test` passed `431/431`.

### Remaining findings and fix plan

| Priority | Area | File / surface | Finding | Fix plan |
|---|---|---|---|---|
| P1 | Logic correctness | `backend/cli/commands/data/data.js:923`, `backend/cli/commands/data/data.js:1068`, `backend/cli/commands/data/data.js:1317` | Deep 5m commands mark a symbol OK when `fiveMBars.length > 0 || snapErrors.length === 0`. A silent empty provider response can report success with zero bars. Existing tests only cover zero bars with explicit errors. | Treat explicit backfill jobs as failed on zero target-timeframe bars unless the symbol is intentionally skipped/unsupported. Add crypto, equity, and five-min accumulate tests for zero bars with no errors. |
| P1 | Runtime algorithm | `shared/lib/data/backfill.js:61`, `shared/lib/data/backfill.js:71`, `shared/lib/data/backfill.js:77` | `fetchPaginated` always walks the full requested window backward from the requested end. It does not inspect existing ts-index coverage, so resume/backfill work refetches already-covered history instead of fetching only missing windows. | Add a gap planner that reads existing symbol/timeframe coverage, emits missing windows, and fetches only gaps plus a small forward-refresh window. Keep full-window mode available for forced rebuilds. |
| P1 | Runtime algorithm | `backend/cli/commands/data/data.js:453`, `backend/cli/commands/data/data.js:567` | `mass-backfill` accumulates all records across all jobs, then writes one large merged ts-index snapshot. This is memory-heavy and O(all history) at the end of every large run. | Persist per job or per symbol/timeframe incrementally, retain only counters/errors in memory, and make resumability explicit. |
| P2 | UI | `backend/cli/tui/manifest.js:164`, `backend/cli/tui/manifest.js:170`, `backend/cli/tui/manifest.js:176`, `backend/cli/tui/manifest.js:182` | TUI exposes dry-run defaults, but not estimated runtime, provider entitlement/cap warnings, current integrity state, or "serialize large backfills" guidance. FW3 15m/30m/1h/4h native-poll is not exposed because it is not implemented yet. | Add preflight summary metadata for long-running data commands, including estimated calls/windows, provider, dry-run/execute distinction, and integrity warnings. Add FW3 command once implemented. |
| P2 | Structure | `backend/scripts/data_ops/ingest_market_data/index.js` | Data ingestion remains a 1,982-line monolith spanning provider routing, derivation, quality filtering, persistence, and CLI orchestration. | Split by provider family and persistence boundary: crypto/equity-index/commodity/fx snapshot modules, `persist_snapshot`, and a thin orchestrator. Preserve current tests during extraction. |

### Verification from this pass

- `node --test tests/scripts/tests/crypto_5m_backfill.test.js tests/scripts/tests/equity_5m_backfill.test.js tests/scripts/tests/five_min_accumulate.test.js tests/scripts/tests/ml_dataset.test.js tests/scripts/strategy_backtest_contract.test.js` passed `56/56`.
- `node --test tests/scripts/tui_terminal_automation.test.js` passed `6/6`.
- The green tests cover current happy paths and explicit-error paths, but not the new silent-zero, Coinbase-routing, session-gap, intraday-cap, or gap-resume cases listed above.

---

## Blast-Through Audit — 2026-06-13 session 29 (Claude orchestrator)

Focused audit of the sessions 26-28 merge to `main` (commits `e232c4b5..51b20b6c`): FW3 intraday,
P3 equity session guard, P4 ML 5m cap, config alias. DCS 0.97. Suite baseline 438/438 (carried).

### P1 — P3 equity session guard is implemented but INERT (never called on any consumer path)
- `shared/lib/market/equity_session.js` `filterEquitySessionGaps` is correct and unit-tested (6/6),
  but `shared/lib/strategy/backtest.js` only **imports it (line 14) and re-exports it (line 1073)** —
  `runBacktest` / `filterFeatureFrame` never invoke it, and the ML dataset builder
  (`shared/lib/ml/dataset.js`) does not call it either. Grep proof: the only non-test references are
  the import + the re-export.
- **Impact:** the standing carryover "equity 5m session-gap guard BEFORE indicator/backtest
  consumption" is **NOT closed**. STATE.md / SESSION_MEMORY / handoff say "guard implemented (6 tests)"
  which overstates — the helper exists, the guard does not run. Equity intraday bars still reach
  indicators/backtests un-filtered.
- **Reviewer decision:** wire `filterEquitySessionGaps` into the equity branch of
  `filterFeatureFrame`/`runBacktest` (and/or the ml dump loader) gated on family=equities/indices +
  sub-daily timeframe, OR explicitly downgrade the docs to "helper available, integration pending."
- **Gate:** a backtest/feature-frame test that feeds pre/post-market equity bars and asserts they are
  dropped by the real consumer path (not the helper in isolation).

### P2 — `intraday_yahoo.js` fetch/records/aggregate functions are dead exports (test-only)
- `fetchYahooIntradayBars`, `candlesToRecords`, `aggregate1hTo4h` are referenced ONLY by
  `tests/scripts/tests/intraday_native_poll.test.js`. The production command `commandIntradayAccumulate`
  routes through `ingestMarketData({provider:'yahoo'})` → the pre-existing
  `selectYahooBase`→`fetchYahooBaseCandles`→`aggregateCandles` path, which already handled 15m/30m/1h/4h.
- The module's headline rationale — "Yahoo uses '60m' not '1h'" — is **empirically false**: a live probe
  of `^GSPC?interval=1h` and `?interval=60m` both return valid candles. The production path sends `1h`
  un-translated and works. So the `1h→60m` translation + the parallel fetch/aggregate logic are
  unnecessary duplication of `selectYahooBase` (4h→1h base) and `aggregateCandles`.
- The only production-consumed exports are the constants `SUPPORTED_INTRADAY_TFS` and
  `INTRADAY_MAX_DAYS` — and `INTRADAY_MAX_DAYS` **duplicates** `YAHOO_MAX_DAYS` in `constants.js`
  (both `{15m:60,30m:60,1h:730,4h:730}`; they will drift if one is edited).
- **Reviewer decision:** keep `intraday_yahoo.js` as the constants-only home (re-export
  `YAHOO_MAX_DAYS` instead of redefining) and delete the dead fetch/records/aggregate trio + their
  shape tests, OR actually route the command through this module and retire the duplicate index.js
  branch. Pick one owner for the Yahoo-intraday interval knowledge.

### P2 — `commandIntradayAccumulate` replicates the known silent-zero success pattern
- `backend/cli/commands/data/data.js:1725`: `const symbolOk = intradayBars.length > 0 || snapErrors.length === 0;`
  — identical to the P1 "silent empty provider → reported OK with zero bars" finding already filed
  above for `crypto/equity/five-min` deep commands. A symbol that returns no bars and no explicit
  error is counted as success.
- **Fix plan:** same as the existing silent-zero entry — an explicitly-requested job with zero
  target-timeframe bars and no skip reason should be a failure. Add a zero-bars-no-errors test for
  `intraday-accumulate`.

### P3 — `config/data_sources.yaml` root alias is a dead 208-line duplicate
- Commit `51b20b6c` added `config/data_sources.yaml` as a "backward-compat safety net" after a
  `crypto-deep-backfill` ENOENT. The commit message itself concludes the backend "already uses
  `config/markets/data_sources.yaml` correctly" and the ENOENT was "a stale process that had cached
  the pre-reorg path." Grep confirms **zero code reads the root path**.
- **Impact:** two full copies of `data_sources.yaml` now exist with nothing keeping them in sync —
  a future edit to canonical `config/markets/data_sources.yaml` silently leaves the root copy stale,
  and any code that later (re)acquires the root path would read drift.
- **Reviewer decision:** delete `config/data_sources.yaml` (the stale process was the real cause, and
  it is gone), OR if a safety net is genuinely wanted, replace the copy with a generated/symlinked
  artifact + a structure-contract test asserting byte-equality with canonical.

### P1 — Deep 5m depth was never generalized to coarser intraday timeframes (data-depth gap)
- The "all-the-way to inception" deep backfill is **5m-only**: `commandCryptoDeepBackfill` /
  `commandEquityDeepBackfill` hard-code `timeframe:'5m'`. Live bin evidence (`storage/data/ts/`):
  `BTCUSDT_5m.bin`=44.5MB (to 2017) but `_1h.bin`=420KB (~730d Yahoo native), `_15m.bin`=1.8MB (~1yr),
  and `_30m.bin`/`_4h.bin` are **stale from Jun 10** (untouched by sessions 25/28). Same shape for AAPL.
- The deep 5m is **not rolled up** into coarser bins, even though `aggregateCandles`
  (`ingest_market_data/index.js:394`) already does `5m→15m/30m/1h/4h`. Rollup is **lossless** (separate
  per-TF bins; 5m preserved; merge-protected write; coarser-from-finer so the synthetic-5m guard doesn't
  fire). No `intraday-rollup` command exists; `intraday-accumulate` even tells the user to "aggregate
  from 1h bars" for 4h but provides no way to do it.
- **Reviewer decision (approved):** add `intraday-rollup` to derive deep 15m/30m/1h/4h from the existing
  deep 5m for crypto + US equities; refresh the stale 30m/4h bins.

### P2 — shared/lib reorg shims are LOAD-BEARING, not dead (corrected 2026-06-13 s29)
- Initial hygiene sweep using only `require('.../shared/lib/<name>')` literal-grep reported the 8 root
  shims (`paths/ansi/indicators/backtest/backend_bridge/backfill/feature_builder/ai_client`) as dead
  or near-dead. **That was wrong.** Deleting them broke the suite via THREE resolution layers the
  literal grep missed:
  1. **Sibling-relative requires** inside `shared/lib/<subdir>/` — e.g. `shared/lib/ml/feature_builder.js`
     → `require('../indicators')`, `shared/lib/settings/user_settings.js` → `require('../paths')`,
     `shared/lib/compat/adapters.js` → `require('../backfill')`.
  2. **Subpath-import aliases** — `package.json` maps `#shared/*` → `./shared/lib/*.js`, so
     `#shared/ansi`/`#shared/ai_client`/`#shared/indicators`/`#shared/backtest` all resolve to the root
     shims (used by `trade.js`, `setup.js`, `module_loading.test.js`).
  3. **Compiled build artifacts** — gitignored `dist/mcp_server/lib/{bridge,agent_gate}.js`
     `require("../../../shared/lib/paths")` (compiled from the MCP TypeScript source).
- **Resolution:** shims restored; they are intentional compatibility re-exports, NOT dead code. Direct
  source callers WERE migrated to canonical category paths (14 literal sites + the relative + alias
  sites), so the shims now have fewer consumers, but they must stay until the `#shared/*` alias map and
  the MCP TS source are repointed and `dist/` rebuilt. **Durable lesson for the Hygiene Sweep:** a
  module is only "dead" if it has no consumer across literal requires, sibling-relative requires,
  `#shared/*`/subpath aliases, AND compiled `dist/` artifacts — grep all four before deleting.
- `config/data_sources.yaml` (the root yaml dup) WAS genuinely dead (0 readers across code + dist) and
  was deleted.

### Verified good this pass
- P4 ML 5m cap (`backend/cli/commands/research/ml.js`): clean — 100k default, `--max-rows-5m`
  override, `[VISIBILITY]` log; `ml_dataset` test updated 50k→100k. 27/27 on the touched test trio.
- `commandIntradayAccumulate` core: provider-pinned (`provider:'yahoo'`), real dry-run, `--days`
  validated against the TF cap, loud per-symbol `[VISIBILITY]` logging, dedupe via ts-index merge.
- No security findings in scope (no eval / dynamic require / secrets / exec in the changed files).
- Yahoo accepts `interval=1h` (live-verified) — production FW3 path is functionally correct.

#

## Focused Audit - 2026-06-15 session 35 (blast-through, anchor 483d45cc -> e0cb6aa2)

Tier 1 = the session-34 daemon/gate work. DCS 0.96. Hygiene sweep clean (no dup basenames, no dup
configs). Manifest↔handler parity OK (`backfill-daemon`, `clear-api-cache` both registered,
sovereign_cli.js:52/54). Priority guard verified correct; ingest freshness gate verified net-safe.

### FINDING (Medium, data integrity) — dead-symbol marker clobbers an existing bin's enriched meta
- **File:** `backend/cli/commands/data/data.js:1080-1089` (`commandCryptoDeepBackfill`, introduced
  `e0cb6aa2`, age <1d).
- **Finding:** the 0-bar "not found" marker is written with `fs.writeFileSync(<sym>_<tf>.meta.json, ...)`
  **unconditionally**, with no check for an existing `.bin`. If a crypto symbol that ALREADY has a real
  bin returns 0 bars from a deep backfill (transient Binance outage / 429 storm / temporary empty
  response, not a true delisting), the marker overwrites the real meta sidecar and strips
  `coordinate_id`, `config_market`, `config_sector`, and `derived_from`. The `.bin` (OHLCV) survives,
  but every subsequent `readTsIndex` of that symbol returns those enrichment fields as `undefined`
  until the next *successful* backfill rewrites full meta. If the symbol stays 0-bar, the loss is
  permanent for the retained historical bars.
- **Empirical proof (temp-dir probe, real writeTsIndex/readTsIndex):**
  `BEFORE -> coordinate_id: crypto:TESTUSDT | config_sector: Layer1 | count: 1`
  `AFTER  -> coordinate_id: undefined | config_sector: undefined | bin count: 1 | ohlcv intact: true`
- **Reviewer decision:** confirm the intended invariant — the not-found marker should only exist when
  there is genuinely NO bin (that is the case `readCoverage` keys on: `!existsSync(bin) && existsSync(meta)`).
- **Fix (S):** guard the marker write with the bin path — only write when the `.bin` is absent:
  `if (!fsSync.existsSync(path.join(DEFAULT_TS_DIR, \`${safe}_${baseTf}.bin\`))) { ...writeFileSync... }`.
  Semantically correct (a symbol with real bars is not "dead") and removes the clobber entirely.
- **Gate to clear:** add a regression test (existing enriched bin + 0-bar result → meta retains
  coordinate_id/config_sector; bin-absent + 0-bar → marker written) and re-run the data suite.

### Verified good this pass
- `shared/lib/market/coverage.js` (new): read-only, cheap header+tail probe, no security surface,
  8/8 tests. Minor cosmetic: the `count===0` *bin-present* return path omits the `notFoundCheckedMs`
  field that the empty/`exists:false` path includes — harmless (`isFresh` treats `undefined` as falsy).
- `writeTsIndex` PROVIDER_PRIORITY guard (`validation.js`, `74b0ec67`): correct. `rollupFromBase`
  (data.js:1914) stamps the base bin's provider, so crypto-derived coarser bins carry `provider:'binance'`
  (priority 3) and a yahoo poll (priority 1) cannot overwrite them. Equal-priority yahoo→yahoo falls to
  the new-wins-on-conflict merge (gaps still filled). `derived_from` round-trips through the meta sidecar.
- Ingest ts/bin freshness gate (`index.js`, `f405263c`): net-safe. It only fires when the snapshot check
  already set `skipItem=true`; a fresh bin `continue`s (same outcome as before), a stale bin flips
  `skipItem=false` to force a fetch — so the change can only *add* fetches or confirm an existing skip,
  never newly suppress one. On `isFresh` error it falls through to the provider (fail-open).
- `global.suppressLogs = true` in the daemon: established repo pattern (setup.js/run.js/strategy.js);
  the daemon owns its whole process, so never resetting it is correct, not a leak.

## Deep blast follow-up - 2026-06-15 session 35 (optimization + dead-code scan)

### RESOLVED — dead-symbol marker clobber (was Medium finding above)
- Fix applied at `data.js` (`commandCryptoDeepBackfill`): the not-found marker is now written
  **only when no `.bin` exists** (`if (!fsSync.existsSync(binPath))`). A 0-bar result for a symbol
  that already has bars is a transient provider failure, not a delisting — the guard stops it from
  stripping `coordinate_id`/`config_*`/`derived_from` off a real sidecar.
- Regression tests added to `coverage.test.js` (2): the not_found marker is honored for 7d then
  re-probed; a real bin always wins over a marker (count from header, marker ignored). 6/6 green.

### OPTIMIZATION — `backend integrity` 57s → 0.4s (144×), behavior-identical
- `runBackendIntegrity` (`backend/cli/commands/tools/backend.js`) looped `readTsIndex(sym, tf)` over
  every (symbol × timeframe), materializing the ENTIRE bin into record objects (a deep 1m crypto bin
  is ~525k objects + ISO-string conversions) only to read count + first/last timestamp.
- Swapped to `readCoverage` (header + two 8-byte head/tail reads, bin never loaded). Extended
  `coverage.js` with `firstBarMs` (one head read) so the coverage span (`from`/`to`) is available.
- **Verified:** live `backend integrity --json` 57,069 ms → 396 ms, same `ok:false` / 92 cached /
  4 stale. Per-bin equivalence probe over ALL 1009 real bins: `{bars, from, to}` from readCoverage ==
  readTsIndex, **0 mismatches**. Full suite 467/467. Also removed a pre-existing unused `firstTs` var.

### BACKLOG (low) — shared/lib over-exports (public-surface bloat, NOT dead logic)
- A scan of every `shared/lib/**/*.js` export vs all tracked `.js`/`.ts` found **94 exported names
  with zero external importer**. Spot-checks (isValidTimestamp, bollingerBands, executeTool,
  readTsSources, buyHoldBenchmark) all show the function is alive — called 3-4× *within its own
  module* — but the `module.exports` entry has no consumer. These are unnecessary exports, not dead
  code; the functions must NOT be deleted.
- Caveat (four-layer rule): the raw list mixes in known false-positive classes — MCP exports
  (`mcp/agent.js`, `mcp/gate.js`) can be consumed via compiled `dist/` (gitignored, not in the scan),
  and root shims re-export whole objects without naming members. Any prune must verify per-item across
  literal/sibling/alias/dist layers and re-run the suite. Recommend a dedicated debt-clearing pass
  (trim export lists only, keep all function bodies); not done this session.

#### UPDATE (same session) — bulk prune attempted, REVERTED; only the 1 genuine dead export removed
- **Removed (kept):** `market/polymarket_features.js` redundant alias `generatePolymarketFeatures:
  buildPolymarketFeatureRows` — the real fn `buildPolymarketFeatureRows` stays exported and is what
  `polymarket_history.js` + the test actually import. Safe, suite green.
- **Attempted + REVERTED:** a regex-driven prune of the 87 non-MCP over-exports broke
  `indicators.manifest_parity.test.js`. **DURABLE LESSON:** an exported name frequently ALSO appears
  in a *second internal object literal* in the same file (here `bollingerBands` is a member of the
  `IndicatorMethods` registry that drives manifest-mode feature computation, not just `module.exports`).
  A line-oriented "remove the line matching NAME" removed the FIRST match (the `IndicatorMethods`
  member), silently corrupting the internal registry while leaving the export intact → `bollinger_*`
  feature keys vanished. **Conclusion:** trimming `module.exports` members safely requires AST-scoped
  editing (only the `module.exports` object node), not text/line matching. Given these exports are
  provably harmless (zero importers) the cost/risk isn't worth a hand pass — left as backlog. All 30
  bulk-touched files reverted to HEAD; suite restored to 467/467.

#### Rigorous testing pass (same session)
- Refactored the marker write into an exported, tsDir-injectable helper `writeDeadSymbolMarker(tsDir,
  symbol, tf, family, provider)` (data.js) so the clobber guard is tested through the REAL function,
  not a copy. `commandCryptoDeepBackfill` now records `entry.marker_written`.
- New `tests/scripts/tests/dead_symbol_marker.test.js` (2): (a) no-bin → marker written, readCoverage
  sees not_found, isFresh skips 7d then re-probes; (b) bin-present → write REFUSED (returns false),
  readTsIndex still returns coordinate_id/config_sector for all bars (clobber fix proven end-to-end).
- New `tests/scripts/tests/integrity_coverage_equivalence.test.js` (1): adversarial bins the 1009 real
  bins don't cover — single-bar (firstBarMs===lastBarMs), empty-header (count 0), meta-only marker,
  truncated (header says 10, file holds 2), and absent symbol — proving the integrity readCoverage path
  derives `{bars,from,to}` byte-identical to the old readTsIndex path (or skips identically) on every branch.
- Gate: **suite 470/470** (was 467; +3). Live `backend integrity --json` re-run post-refactor: 383 ms,
  ok:false / 92 cached / 4 stale (unchanged). All shared/lib + data/daemon modules load.

## Full Blast-Through - 2026-07-15 session 82

**Mode:** full audit / Hard Reading Mode. **Anchor:** `49560981` plus the current dirty worktree.
**DCS:** `0.635 -> 0.590` (`freshness=0.40`, `schema=0.95`, `coverage=0.30` at close).
Promotion remains halted: the recorded schema-v3 catalog has 7 rows, 0 eligible, 4 degraded,
3 excluded, 10 synthetic-parity evidence ids, and two unavailable official evidence families.

### Strongest findings

| Priority | Classification | Files | Finding and impact | Required decision / repair | Verification gate |
|---|---|---|---|---|---|
| **P0** | **Dangerous** | `backend/gateway/src/index.ts:653-665,718-725,1844-1924,2498-2506`; `backend/cli/commands/trade/trade_polymarket.js:288-293,583-602` | Merge `49560981` removed broker-backed `buildRiskContext`, explicit Polymarket price validation, native pre-trade validation before `adapter.placeOrder()`, gateway `--live` authorization, and the CLI session/PIN authorization handoff. Current market-order notional is zero when price is absent; equity is replaced by a static volatility proxy; omitted drawdown defaults to zero. | Restore the session-73/81 fail-closed execution contract from merge parent `49560981^1`, preserving later legitimate lifecycle work. Block all live-capital use until reviewed. | Gateway TypeScript; risk-context, Polymarket auth/live-guard/preflight/lifecycle, proposed-order, and bot authorization tests pass; source probe shows order placement only after explicit live authorization and native risk approval. |
| **P0** | **Dangerous** | `shared/lib/runtime/env.js`, `shared/lib/data/ingestion.js`, `shared/lib/data/macro_store.js`, `shared/lib/ml/models.js`; untracked root shims | The committed `HEAD` blobs begin with literal merge markers. The dirty tree removes those markers and supplies four one-line untracked shims, so local module probes pass while `git archive HEAD` fails all four modules with `SyntaxError: Unexpected token '<<'`. | Reconcile the merge explicitly and track the intended shims. Do not discard the current repairs. | Archive `HEAD` to a temp directory, require all eight canonical/shim modules, then run structure and full test gates. |
| **P1** | **Incomplete / false health** | `package.json:16`; missing `tests/run_node_tests.js`; `scripts/dev/check_hygiene.js:18-65,341-374` | `npm test` exits before discovery because its runner was deleted. Direct `node --test` found 815 tests but ended 747 pass / 59 fail / 9 skip. Hygiene still exits 0 and says the dirty workspace is pristine because it does not check missing script targets, committed conflict markers, or load-bearing untracked files. | Restore the canonical runner from the correct parent and extend hygiene/structure checks to validate `HEAD`, npm script targets, and required tracked files. | `npm test` starts the intended runner and is green; a conflict-marked HEAD fixture or missing script target makes hygiene/structure fail. |
| **P1** | **Dangerous archive drift** | `workspace/DEV_REVIEW.md`, `workspace/PROMPT_LOG.md`, `workspace/SESSION_MEMORY.md`, `workspace/STATE.md`, `workspace/handoff/2026-06-19.md` | Merge `49560981` violated append-only history: relative to parent 1 it removed 4,896 lines across workspace state, including session 73-81 review detail. `DEV_REVIEW.md` dropped from 1,971 to 562 lines. | Recover missing history from `49560981^1` without overwriting post-merge notes; use a reviewed append/merge restoration. | Session 73-81 heading parity, chronological check, and no loss of this session-82 block. |
| **P1** | **Dangerous data seam** | `backend/cli/commands/tools/backend_integrity.js:129-134,270-289`; `shared/lib/market/coverage.js:22-45`; `backend/cli/commands/research/scorecard.js:6,80-108` | Local integrity reports 92/92 cached, 0 missing, 0 stale, but 9 grain suspects and still returns `ok:true`. CPER 5m has 15,984 rows over 2,175 days with a 10-minute median gap; SOYB 5m has 4,615 rows with a 55-minute median gap. `grain_suspect` is consumed only by integrity, not scorecard/data consumers. | Treat suspect bins as degraded until source-classified or rebuilt. Decide whether integrity `ok` and research consumers must include grain health. | Per-bin source/gap evidence, zero unexplained suspects, and a scorecard rejection test for a suspect bin. |
| **P1** | **Incomplete** | `backend/api/tests/api.test.js:44-90`; `backend/api/tests/correlation_contract.test.js:25-40` | Canonical `npm run test:api` is 5/7: authenticated data summary returns 503 and weekly/monthly local correlation fallback returns unavailable. `npm run test:contracts` is 30/31 for the same summary regression. | Restore the post-session-81 API/CLI fallback contract without reopening caller-controlled path access. | API and contract scripts pass; unauthenticated path overrides remain 401. |
| **P2** | **Incomplete** | `backend/cli/tui/manifest.js:153-158,213-220`; TUI contract tests | The merge re-exposed six unavailable ingest lanes and removed legacy `bias`/`scorecard` parity. Focused TUI contracts are 32/37. Direct unavailable ingest still fails visibly, so this is user-visible drift rather than silent synthetic data. | Restore current manifest parity and omit unavailable lanes until implemented. | Focused TUI contract/automation bundle passes; both manifests expose the same supported commands and flags. |
| **P3** | **Stale** | `backend/cli/commands/data/data_rollup.js:218-219` | Inline examples document `sovereign data intraday-rollup`, but `data` is unknown; the actual top-level dry-run succeeds for 24 symbols. | Correct examples to the top-level command. | Smoke the documented command. |

### Connective-tissue / orphan matrix

| Classification | Surface | Evidence | Decision / gate |
|---|---|---|---|
| **Dangerous** | Four canonical shared modules + four root shims | Committed canonical blobs contain merge markers; working copies and shims are uncommitted. | Reconcile and track; clean-tree require gate. |
| **Incomplete** | Six enabled ingest provider lanes | Config and TUI advertise lanes whose canonical manifest returns structured `not_implemented`. | Implement real providers or disable/omit them; direct no-write contract stays green. |
| **Incomplete** | `searchTradingViewScreener` | Exported from `shared/lib/providers/tradingview.js`, zero runtime callers, always warns and returns `[]`. | Keep as explicitly unavailable or remove the export; add a caller only with real behavior. |
| **Stale** | `scripts/dev/run_automated_strategies.js` | Zero consumers since its 2026-05-29 add; scans strategies but only logs placeholder execution. | Delete in cleanup or wire to a dry-run-only dispatcher with tests. |
| **Stale** | API middleware/service scaffold | Express-style middleware and helper services remain outside the active custom `node:http` route graph; no new production consumers surfaced. | Remove only after a current import/route test confirms zero consumers. |
| **Intentional** | Schema-v3 recorded/synthetic fixtures and schema-v2 default | Fixtures are labeled, validated, research-only, and readiness returns false; focused analysis tests pass 19/19. | Keep until real evidence/promotion gates exist; do not retire schema v2. |

### Section grades

| Section | Grade | Evidence |
|---|---:|---|
| repo bootstrap / dependencies | **D** | Installs resolve, but clean `HEAD` is unloadable and `npm test` points at a missing runner. |
| `backend/gateway` | **F / live blocked** | Live authorization and broker-backed/native risk gates were removed from reachable production paths. |
| `backend/cli` / TUI | **D** | Polymarket PIN/auth handoff regressed; focused TUI contracts 32/37. |
| `backend/api` | **C-** | Security rejection checks pass, but focused API is 5/7 and contracts 30/31. |
| `shared/lib` root/canonical paths | **D** | Dirty runtime works; committed canonical modules do not parse and shims are untracked. |
| `shared/lib/market` + local data | **C / degraded** | 92/92 coverage and 0 stale, but 9 unresolved grain suspects are advisory-only. |
| analysis contracts/services | **A- / promotion blocked** | Focused 19/19 and strict parity/provenance, but 0/7 eligible and real evidence gaps remain. |
| `Frontend/dashboard` | **B-** | Typecheck/build pass; Supabase remains in main chunk and live browser soak is open. |
| `supabase` / macro contracts | **B** | Point-in-time/auth contracts pass locally; remote migration/RLS remains unverified. |
| `infra/deployment` | **B** | Deployment manifest contract passes and the real API entrypoint remains aligned. |
| `tests` | **D** | Missing runner; fallback discovery 747/815 passing with 59 failures and 9 skips. |
| workspace continuity | **D** | Files exist, but merge-time append-only loss removed recent audit history. |

### Verification and visible data flow

- All five active npm roots resolve; gateway TypeScript passes.
- Analysis: 9 component fixtures accepted, 0 rejected; catalog emits 7 rows -> 0 eligible / 4 degraded / 3 excluded. AAPL coverage is 0.95 but remains degraded with recorded SEC plus synthetic parity evidence.
- Macro tests: ingest produced 22 macro and 9 reserves records; point-in-time selection accepted 3/4 rows, rejected one legacy row, and selected one early observation.
- Local ts-index: 92 configured -> 92 cached -> 0 missing / 0 stale, with 9 grain suspects. No data was transformed or overwritten.
- Gates: analysis 19/19; grain/equivalence 8/8; cloud live guard 2/2; frontend typecheck/build pass; secret scan 805 files / 0 violations; `npm test` cannot start; fallback 747 pass / 59 fail / 9 skip.
- Code LOC scanned: backend 345 files / 44,396 lines; shared 112 / 14,188; frontend 28 / 3,257; scripts 36 / 4,072; tests 134 / 20,265. Large recorded JSON artifacts are excluded.

### Next cleanup move

Run one merge-recovery `mass-implement` batch before research evidence work: restore live execution
guards and clean-clone parseability first, then restore the test runner and archive history. Do not
run or approve live trading until the P0 gateway gate is closed and independently re-audited.

## Data-Integrity Blast-Through - 2026-07-15 session 82 - schema-2/schema-3 composition seam

**Mode:** data-integrity / Fast Reading Mode. **Anchor:** `98bd86c3` plus the current dirty worktree.
**DCS:** `0.571 -> 0.571` (`freshness=4/7`, `schema=1.0`, `coverage=0/7`). Promotion remains halted.

### Findings

| Priority | Classification | Files | Finding and impact | Required decision / repair | Verification gate |
|---|---|---|---|---|---|
| **P1** | **Incomplete** | `shared/lib/analysis/analyzers/technical_v2_adapter.js`; `shared/lib/analysis/services/recorded_family_shadows.js` | A validated fail-closed adapter can turn a fresh schema-2 row into a schema-3 technical factor, but no production service calls it. Recorded family shadows substitute `synthetic-parity:technical` factors, so schema 2 and schema 3 are not actually composed. | Build one research-only composition service that accepts an exact-identity schema-2 row plus schema-3 factors. Keep `decision_ready=false`. | Same-symbol fixture proves v2 row -> technical factor -> v3 row, stale/incomplete v2 rejects, and CLI/API/MCP parity remains deterministic. |
| **P1** | **Incomplete** | `shared/lib/data/macro_store.js`; `shared/lib/analysis/analyzers/recorded_provider_factors.js`; `shared/lib/analysis/services/recorded_family_shadows.js` | Macro ingestion preserves point-in-time revisions, but `selectMacroObservationsAsOf` has no production analysis consumer. Schema 3 reads checked-in recorded JSON directly, not the live macro store. | Add a macro factor builder over canonical point-in-time observations with provenance and explicit availability timestamps. | Ingest 22 rows -> point-in-time selector rejects unavailable revision -> factor validates -> exact asset composition fails closed when macro is absent/stale. |
| **P1** | **Incomplete** | `shared/lib/analysis/services/shadow_catalog.js`; recorded family fixtures | The catalog is a fixed seven-row inventory with no live same-symbol join. The current schema-2 FX lead is `EURJPY`, while schema 3 contains only recorded `EURUSD`; combining their directions would be an identity error. | Join only by canonical `asset_id`, never by family or broad FX category. Expand coverage through explicit provider identifiers. | Mismatched EURJPY/EURUSD test rejects composition; matching asset ids compose; duplicate/bare-symbol collisions remain rejected. |
| **P2** | **Review decision** | `shared/lib/analysis/policies/family_shadow.js` | Composite score uses `factor.score * policy.weight`; factor `strength` and factor-level `coverage` do not affect score magnitude. Row coverage counts present domain weights, not each factor's internal coverage. This is internally consistent but must be an explicit calibration decision before promotion. | Decide and document whether strength/coverage are diagnostics or score multipliers; do not change the formula without out-of-sample evidence. | Baseline comparison and calibration report on point-in-time target returns, with turnover/cost sensitivity. |

### Grades

| Section | Grade | Evidence |
|---|---:|---|
| schema-2 technical scorecard and adapter | **B+** | Freshness and completeness fail closed; adapter preserves direction/score/strength and rejects 3/3 bad inputs, but has no production composition caller. |
| schema-3 contracts and policies | **A- / promotion blocked** | Strict identity, provenance, factor, applicability, stale-factor, and decision-state validation; 27/27 focused analysis tests pass. |
| macro ingestion and point-in-time store | **B+ / integration-gated** | 22 macro records and 9 reserve records preserved; 3/4 revisions eligible and one unavailable legacy row rejected; no analysis consumer. |
| recorded schema-3 services/catalog | **C / fixture-only** | Seven rows, zero eligible, four degraded, three excluded, ten synthetic evidence ids; parity is strong but runtime coverage is absent. |
| combined actionable decision path | **D / nonexistent** | No exact-asset schema-2 + live-macro composition service, no calibration, no target-return baseline, and no cost model. |

### Verification and visible data flow

- Analysis contracts: 9 fixture inputs -> 9 accepted / 0 rejected; catalog -> 7 rows -> 0 eligible / 4 degraded / 3 excluded; 27/27 tests passed.
- Technical adapter: one complete two-timeframe schema-2 row -> two evidence ids -> one validated technical factor; three malformed/stale inputs -> 0 accepted / 3 rejected.
- Macro storage: ingest -> 22 macro and 9 reserve rows; point-in-time selection -> 4 revisions -> 3 eligible / 1 rejected -> one early value selected; 8/8 tests passed.
- No provider was contacted and no data was transformed or overwritten during this audit.

### Next cleanup move

Hand off to `mass-implement`: add a research-only exact-asset composition service using the existing
technical adapter and a new canonical macro-store factor builder. Do not replace schema 2, expose buy/sell,
or change factor-weight semantics in the first batch.

## Triage Blast-Through - 2026-07-16 session 83 - merge-recovery execution gate

**Mode:** triage / Fast Reading Mode. **Anchor:** `98bd86c3` plus the current dirty worktree.
**DCS:** `0.590 -> 0.590` (`freshness=0.40`, `schema=0.95`, `coverage=0.30`). Promotion and live
execution remain halted; no data was transformed.

### Findings

| Priority | Classification | Files | Finding and impact | Required repair | Verification gate |
|---|---|---|---|---|---|
| **P0** | **Dangerous** | `backend/gateway/src/index.ts:2533-2546`; `backend/gateway/src/cycle.ts:156-160,242-251,372-381,465-483`; `backend/cli/commands/trade/trade.js:398-413` | The new gateway bot guard rejects only when `--live` is present, but cycle and force-sell treat `LIVE_TRADING=true` as live. A direct gateway or CLI bot invocation inheriting that environment can therefore reach `client.postOrder(...)` without `SOVEREIGN_EXECUTION_AUTHORIZED=true`; these bot orders also bypass the restored `ExecutionGateway.validateOrder()` native-risk path. The new 5-test preflight file covers `--live` without authorization, not env-only live mode. | Resolve live mode once at the gateway boundary and fail closed for every submitting bot subcommand unless explicit CLI authorization is present. Route bot orders through equivalent broker/native risk approval or document and implement an equally strict bot-specific gate. | With `LIVE_TRADING=true`, `bot cycle`, `bot run`, and `bot sell` without authorization must exit before cycle/network/order code. Authorized tests must prove pre-trade approval before each `postOrder`, including force-sell. |
| **P0** | **Broken committed state** | `shared/lib/runtime/env.js`; `shared/lib/data/ingestion.js`; `shared/lib/data/macro_store.js`; `shared/lib/ml/models.js`; `package.json`; missing `tests/run_node_tests.js` | A clean `git archive HEAD` still fails all four canonical module loads with `SyntaxError: Unexpected token '<<'`, and the root `npm test` target is absent. The working-tree repairs and shims load, but clean-clone verification remains impossible. | Complete merge-recovery Batch 2: track marker-free canonical modules/shims, restore the canonical runner and only provenance-backed fixtures, then validate the committed archive. | Clean archive loads all eight canonical/shim paths; every package-script target exists; root test discovery records total/pass/fail/skip counts. |

### Dismissed false positives / verified islands

- The local direct Polymarket buy/sell guard is materially restored: explicit live authorization, positive
  limit price, broker quote/equity/drawdown context, and native risk approval precede `placeOrder`.
- Focused verification passed: Polymarket preflight/auth `5/5`, risk-context/backend-bridge `6/6`, gateway
  TypeScript, current-tree eight-module load, and `git diff --check`.
- Those passes do not close the P0 grade because the env-only bot path and committed archive remain unsafe.

### Section grades

| Section | Grade | Evidence |
|---|---:|---|
| `backend/gateway` execution | **F / live-blocked** | Direct orders are locally gated, but env-driven bot cycle/force-sell can submit without authorization or native risk approval. |
| `backend/cli` bot handoff | **D / safety-gated** | Authorization is forwarded only when `--live` is present; inherited live mode is not rejected. |
| repo bootstrap / shared canonical paths | **D / clean-clone-gated** | Current tree loads; archived `HEAD` has four syntax errors and depends on untracked shims. |
| tests | **D / runner-and-coverage-gated** | Focused 11/11 passes, but `npm test` cannot start and the env-only live bot case is absent. |

### Next cleanup move

Continue merge-recovery Batch 1, adding the env-driven bot path to its P0 scope and independent tests.
Then complete Batch 2 and prove the resulting commit from a clean archive before any live execution,
research promotion, evidence acquisition, or TUI cleanup.

## Recovered Merge History - 2026-07-16 session 83



Source: `49560981^1:workspace/DEV_REVIEW.md`. These sections were restored additively after merge-history loss; existing entries were not rewritten.



## Connective-Tissue Production Readiness Audit - 2026-07-11 session 73

Mode: `connective-tissue`, Hard Reading Mode. Refined objective: determine whether the active
production paths are trustworthy enough for real trading decisions by verifying execution gates,
data provenance/freshness, user-data boundaries, UI truthfulness, and dangerous or incomplete stubs.
No production code was changed in this audit.

### Findings

| Priority | Classification | Area | Evidence | Finding | Clearance gate |
|---|---|---|---|---|---|
| **P0 / gating** | **Dangerous** | Polymarket execution | `backend/cli/sovereign_cli.js:83`; `backend/cli/commands/trade/trade_polymarket.js:584-603,770-779`; `backend/gateway/src/index.ts:1923-1926,2523-2532`; `README.md:98-102` | Top-level `polymarket buy/sell` reaches a real CLOB submit without requiring `--live`, Supabase auth, the trade PIN, runtime-mode approval, or the C++ risk engine. The Polymarket feature flag is checked at the CLI wrapper, but direct gateway invocation bypasses even that. The README claim that all live paths use PIN + `ai_agent_trading` + fail-closed risk is false for this path. | Route every order through one execution guard. A subprocess contract test must prove CLI and direct gateway buy/sell reject without explicit live authorization, PIN/auth handoff, enabled feature/runtime mode, and an approved risk result; no broker call may occur on rejection. |
| **P1 / gating** | **Dangerous** | Public API filesystem boundary | `backend/api/app.js:138-152`; `backend/api/server/routes/market/signal.js:1-7`; `backend/api/server/routes/data/data_summary.js:1-7`; `backend/api/server/routes/market/correlation.js:1-7`; `backend/api/server/services/cli_executor.js:261-274,357-396,424-479,679-731,791-810,920-957` | Public GET routes accept caller-controlled `input`, `model_report`, and `backtest_report` paths. The data-summary fallback spreads and returns complete input records, so a readable JSON file with a `sources`/`records`/`bars`/`data` array can cross the HTTP boundary. Cache keys also omit input/timeframe/limits on several routes, allowing response mixing for five seconds. | HTTP contract tests prove path parameters are ignored or restricted to canonical allowlisted artifacts, public routes cannot read arbitrary files, and cache keys include every response-shaping parameter. |
| **P1 / gating** | **Dangerous** | Browser/admin authorization | `Frontend/dashboard/src/lib/api.ts:6-43`; `Frontend/dashboard/src/components/panels/BotPanel.tsx:42-79`; `backend/api/app.js:136-159`; `backend/api/server/routes/bot/bot_cycle.js:1-9`; `backend/api/server/routes/bot/bot_sell.js:1-9` | `VITE_API_TOKEN` is compiled into browser JavaScript, while bot cycle/sell routes trust that shared token and do not verify the Supabase user. Any dashboard user who receives the bundle can recover the admin-style token and invoke protected bot mutations. | Remove browser-held server secrets. Mutating routes must authenticate the Supabase bearer token, authorize the user/action server-side, and use a server-only execution credential. Multi-user tests must prove one user cannot operate another user's bot or orders. |
| **P1 / gating** | **Incomplete, fail-closed** | Decision data | Local probes: model report generated `2026-06-21`; latest backtest `source_mode: sample`, zero trades; scorecard 36/36 crypto symbols excluded; backend integrity `ok:false`, 15 stale symbols and 9 grain suspects | The current checkout is not usable for real trading decisions. The scorecard correctly returns no rows, and signal schema v2 correctly expires all candidates, but the fallback correlation path still returns `ok:true` with an identity matrix and `sample_size:0`. Its standalone contract fails against the canonical snapshot and is not executed by `npm test`. | Freshness/integrity must be green for the requested horizon; model and out-of-sample reports must be regenerated from live data; non-empty sample/trade floors must be enforced; `npm test` or `verify:strict` must execute the API correlation contract. |
| **P1** | **Dangerous UI** | Operational-state truth | `Frontend/dashboard/src/components/layout/TopBar.tsx:14-38,93-99`; `Frontend/dashboard/src/components/layout/Sidebar.tsx:5-24,179-217` | The global green `LIVE` badge is hardcoded. Safety state only reacts to future realtime `risk_rejected` events and never hydrates the current kill switch. Circuit-breaker, max-drawdown, execution-mode, provider/model/timeframe, and ingest controls are decorative or local-only. The interface can imply a backend state that was never established. | Replace decorative controls with read-only labeled placeholders or wire them to authenticated state. Browser tests must cover disconnected, stale, paper, live, and kill-switch-engaged states. |
| **P1** | **Incomplete** | Signal review UI | `Frontend/dashboard/src/components/panels/SignalPanel.tsx:52-62`; `Frontend/dashboard/src/pages/LoginPage.tsx:23,32` | Standalone frontend type-checking fails. `SignalPanel` serializes undefined `signalIds` instead of `selectedIds`, so recording a review throws before the request. Two React namespace errors also remain in login handlers. Vite emits JavaScript because it does not type-check. | `npm run lint --prefix Frontend/dashboard` passes and an interaction test proves selected fresh signal IDs reach the authenticated review route. |
| **P1** | **Dangerous under concurrency** | Time-series persistence | `shared/lib/market/validation.js:739-788,826-911`; session-72 concurrency note in `workspace/SESSION_MEMORY.md` | Atomic temp names and flush-before-count make one writer crash-safe, but there is no per-bin writer lock. Two appenders, or an append racing an overlap rewrite, can read the same old count/state and lose or overwrite each other's data. | Add a per-bin cross-process lock or single-writer queue and adversarial overlap tests covering append/append and append/merge races. |
| **P2** | **Stale/incomplete** | UI and Rust surface bloat | `Frontend/dashboard/src/App.tsx:9-21`; dead legacy shell files under `Frontend/dashboard/src/components`; `backend/cli/src/main.rs:28-55`; `backend/cli/Cargo.toml:1-22` | Dashboard loads every panel eagerly and retains a second unused shell. Production bundle is one 945.88 kB JS chunk (270.94 kB gzip). The Rust CLI has 30 files/883 lines, 22 files under 20 lines, and explicitly returns `mirrored-contract-only`; it adds a parallel dependency-heavy surface without operational execution. | Delete/archive unused React shell files, lazy-load major panels, and set a bundle budget. Either define funded Rust parity milestones or move the mirror out of the production CLI tree and dependency story. |
| **P2** | **Incomplete safety** | Destructive maintenance | `backend/cli/commands/data/data.js:1086-1163`; `backend/cli/tui/manifest.js:178-183` | The TUI defaults cache clearing to dry-run, but direct `clear-api-cache --ts` can delete all 4.1 GB of canonical bins without an interactive confirmation, backup check, or typed scope acknowledgement. | Require explicit destructive confirmation for all-bin deletion, print exact count/bytes first, and add a restore/backup prerequisite or immutable quarantine path. |

### Orphan and stub matrix

| Surface | Classification | Evidence / decision |
|---|---|---|
| Six unavailable ingest families | **Intentional** | Canonical `not_implemented` metadata, zero dry-run fetches, all-family skip, and TUI omission are tested. Honest roadmap gap, not synthetic production data. |
| `searchTradingViewScreener` | **Stale** | Explicit stub warning/empty return in `shared/lib/providers/tradingview.js:75-85`; no non-definition consumer found. Remove the export or create a real owned caller. |
| React legacy `Shell` / `SideBar` / `TopBar` / `DashboardPanel` | **Stale** | Only the legacy shell imports its paired components; active `App.tsx` uses `components/layout/*`. Four files plus legacy CSS add dead maintenance surface. |
| Rust CLI mirror | **Incomplete** | `main.rs` labels every matched command `mirrored-contract-only`; package scripts and runtime use Node. Keep only with an explicit parity plan. |
| API `local_fixture` fallbacks | **Dangerous** | Callable production fallbacks report `ok:true`, fixed zero quality errors, and sometimes zero-sample identity data. They must not be presented as live decision data. |

### Grades

| Section | Grade | Reason |
|---|---|---|
| `backend/cli` execution | **D / gated** | Active Polymarket live-order bypass and parallel Rust mirror bloat. |
| `backend/gateway` | **D / gated** | Alpaca execution risk path is structured, but direct Polymarket submit bypasses the shared execution/risk gateway. |
| `backend/api` | **D / gated** | Public caller-controlled file paths, incomplete cache keys, and browser-shared mutation token boundary. |
| `Frontend/dashboard` | **C- / gated** | Misleading decorative safety controls, broken signal-review action, dead shell, failed type-check, and oversized single chunk. |
| `shared/lib/market` persistence | **B- / gated for concurrent writers** | Strong single-writer atomicity/equivalence tests; no cross-process serialization. |
| `supabase` local schema | **B+** | Own-user RLS exists for orders/audit/private tables; remote migration/policy state was not verified in this offline pass. |

### Verification evidence

- `npm test`: 706 tests, 704 pass, 0 fail, 2 skip.
- Standalone API contracts: 3 pass, 1 fail; weekly/monthly correlation fails at `sample_size > 0`.
- Polymarket preflight: passes outside the sandbox; sandbox-only nested spawn failure dismissed.
- Frontend build: passes, 2,413 modules, one 945.88 kB JS chunk; chunk-size warning emitted.
- Frontend `tsc --noEmit`: fails with three errors, including undefined `signalIds`.
- Gateway `tsc --noEmit`, hygiene, secret scan (829 files / 0 violations), and scoped diff check: pass.
- Data: 1,012 ts-index bins / 4.1 GB; 92/92 configured symbols cached, 15 stale, 9 grain suspects; scorecard 0/36 eligible.
- `graphify-out/` is absent, so graph refresh/connectivity evidence was unavailable.

### Next cleanup move

Close the P0 Polymarket execution bypass first, then remove caller-controlled API paths and browser-held
admin tokens. Do not promote real-money decisions while those gates or the current freshness/integrity
failures remain open.

## Connective-Tissue Follow-up - 2026-07-11 session 73 - remaining sections and language boundary

Mode remains `connective-tissue`, Fast Reading Mode. This pass reviewed native risk, ML/model naming,
MCP, Supabase alerting, deployment variants, package dependencies, and the C++/Rust/JS ownership split.
No production code or data was changed. The carried DCS remains 0.95; promotion remains halted by the
security/execution gates and live `backend integrity: ok=false`, which DCS does not override.

### Additional findings

| Priority | Classification | Area | Evidence | Finding | Clearance gate |
|---|---|---|---|---|---|
| **P0 / gating** | **Dangerous** | Native risk contract | `backend/gateway/src/index.ts:653-667`; `backend/core/src/main.cpp:599-630`; `backend/core/src/risk/pre_trade_risk.cpp:7-34` | Gateway notional is `(order.price || 0) * quantity`. Market orders deliberately omit price, so live market orders reach C++ risk with zero notional and pass concentration checks. The denominator called `volatility` is actually a static env proxy defaulting to 50,000, while drawdown defaults to zero; neither is hydrated from the broker portfolio. Direct probe confirmed `notional=0` is approved. | Preflight must resolve a bounded executable price and current portfolio equity/exposure/drawdown from broker state, reject missing/stale inputs, and test market and limit orders through the real JS-to-C++ boundary. |
| **P1 / gating** | **Dangerous decision labeling** | ML/model comparison | `shared/lib/ml/models.js:78-255,352-410`; current `storage/data/models/latest_model_comparison.json` | `cnn_window_v0`, `xgboost_ranker_v0`, random forest, SVM, LSTM, Transformer, etc. are hand-coded deterministic formulas, not trained instances of those algorithms. `compareModels()` ranks only these adapters; the real ONNX candidates are excluded. Reports and UI can therefore present architecture names and a "winner" that imply training which never occurred. Current per-symbol winners also use samples as small as one trade. | Rename adapters as heuristics/baselines, exclude them from ML promotion, add minimum OOS trade/sample floors, and make the promoted model report include only versioned trained artifacts with dataset/model hashes. |
| **P1** | **Incomplete / unsafe default** | MCP research and execution | `backend/mcp_server/tools/run_backtest.ts:5-38`; `backend/mcp_server/tools/polymarket.ts:21-94`; `backend/mcp_server/package.json:11-17` | MCP backtests default `allow_degraded=true`, reversing the CLI's fail-closed research default. MCP live Polymarket adds confirm/feature checks but forwards into the already-gated direct Polymarket path without PIN or native risk. The MCP SDK is declared as `latest`, making clean installs non-reproducible. | Default degraded research to false, pin MCP dependencies, and prove all MCP live tools terminate at the same centralized execution authorization/risk gate. |
| **P1** | **Stale / broken** | Deployment variants | `infra/deployment/kubernetes/deployment.yaml:21-46`; `infra/deployment/terraform/main.tf:76-83`; `infra/deployment/heroku/Procfile:1`; `infra/deployment/heroku/app.json:22-24` | Kubernetes, Terraform, and Heroku launch `web/app.js`, which does not exist. Kubernetes also injects a Supabase secret key into the web pod. The deployment contract checks port/secret strings but never checks the command path. Docker Compose is the only aligned runtime. | Retire the variants or generate them from the Docker contract; assert the real `backend/api/app.js` entrypoint, least-privilege secrets, health command, storage mounts, and native binary availability. |
| **P2** | **Incomplete** | Supabase risk alert | `supabase/functions/risk-alert/index.ts:5-30`; `supabase/migrations/202605280001_risk_alert_trigger.sql:5-40` | The Edge Function only logs; Slack/email/webhook delivery is commented out. The SQL trigger only raises a database notice because `net.http_post` is commented out. This is a scaffold, not an alerting system. | Choose and test one real authenticated delivery channel with retry/idempotency, or remove alerting claims and classify the files as examples. |
| **P2** | **Stale/overbuilt** | C++ execution and strategy shells | `backend/core/src/execution/live_broker_adapter.cpp:7-29`; `backend/core/src/strategies/{spot_only,spot_futures_arb,options_trading}.cpp`; nine `placeholder.hpp` files | The live broker adapter always rejects and has only a test consumer. Three compiled strategy evaluators are toy formulas consumed only by a C++ test. Nine three-line placeholder headers have zero consumers. These are compiled future architecture, not active runtime capability. | Remove placeholder aliases and move test-only/reference strategies out of the production library, unless an active CLI/API consumer and ownership plan are added. |
| **P2** | **Dependency bloat** | Node package roots | `Frontend/dashboard/package.json:13-38`; `backend/api/package.json:10-15` | Dashboard source has no use of `@google/genai`, Express, dotenv, Motion, `@types/express`, autoprefixer, or esbuild. The API is native `node:http` plus Socket.IO and does not import Express, EJS, or dotenv. These dependencies enlarge install/security surface and obscure the real stack. | Remove packages with zero source/config consumers, regenerate locks, build/type-check, and enforce a dependency-usage contract per package root. |

### Language decision

**Recommendation: TypeScript control plane + a narrow optional C++ compute kernel; retire Rust.**

| Layer | Recommended language | Reason |
|---|---|---|
| React UI, API, CLI, broker/provider adapters, orchestration, auth, config | **TypeScript** | Most of the product is already JS/TS and depends on Node broker/Supabase/MCP ecosystems. Static types catch real payload and gate errors while preserving JS runtime flexibility. |
| Pre-trade authorization and simple risk policy | **TypeScript in the gateway** | These checks require current broker/user state and are cheap. Keeping them in-process removes the error-prone subprocess/env proxy contract. C++ may independently audit the same typed snapshot. |
| Heavy scans, correlation, simulation, portfolio optimization, binary transforms | **C++ only after benchmark evidence** | Retain existing tested kernels where they materially beat Node. Expose a small versioned JSON/binary contract; do not put providers, auth, broker execution, or UI concepts in C++. |
| Rust CLI mirror | **Retire/archive** | It is 30 files of `mirrored-contract-only` behavior, has no active runtime advantage, and creates a third implementation language plus another dependency/build graph. |

Raw JavaScript is the **most dynamic** language here, but TypeScript is the best operational choice:
it compiles to the same dynamic runtime while adding contract checks. A pure TypeScript implementation
would be the least-bloated greenfield design. In this existing repo, keeping only proven C++ kernels is
less risky than rewriting them, but no new Rust or C++ surface should be added without a measured need.

### Follow-up grades

| Section | Grade | Reason |
|---|---|---|
| `backend/core` | **C / execution-gated** | Broad tested compute surface, but live market-order risk receives zero notional and compiled test-only shells remain. |
| `shared/lib/ml` | **C- / promotion-gated** | Real ONNX inference exists, but the canonical comparison/report path ranks architecture-named heuristics instead. |
| `backend/mcp_server` | **C / live-gated** | Builds and has explicit confirms, but degraded research is opt-out and live Polymarket inherits the direct execution bypass. |
| `infra/deployment` variants | **D / stale** | Three deployment starters launch a nonexistent path and are not valid alternatives to Compose. |
| `supabase/functions` | **C / scaffold** | RLS schema is useful; risk alert delivery is not implemented. |
| package dependency hygiene | **C** | Multiple clear zero-consumer dependencies across frontend/API package roots. |

### Verification evidence

- C++ risk probes: zero notional approved; 20,000 / 50,000 concentration rejected.
- CMake: 52 of 53 C++ implementation files are compiled; the sole uncompiled `.cpp` is
  `src/ingestion/sentiment_ingestion.cpp`. Nine placeholder headers have zero consumers.
- MCP TypeScript build passed. Focused MCP tests cover confirm/price/cost checks, but no test proves
  common PIN/native-risk termination.
- Active source LOC: about 40.4k JS, 7.4k TS/TSX, 11.5k C++/headers, and 1.0k Rust. LOC is not a quality
  metric, but it shows that a Rust rewrite would duplicate the dominant Node control plane.

### Revised critical path

1. Centralize all order submission and fix real market-order risk inputs.
2. Remove public/browser authorization defects from the prior audit.
3. Relabel and gate heuristic "models" before regenerating any signal report.
4. Make Docker Compose the sole supported deployment until other manifests are generated and tested.
5. Consolidate on TypeScript and prune Rust, compiled shells, placeholders, and unused dependencies.

## Focused TUI, Polymarket Lifecycle, and Maintainability Review - 2026-07-12 session 74

Mode: focused review, production code unchanged. Scope: the Ink dashboard's bottom command input,
responsive terminal density, the live Polymarket portfolio lifecycle, and maintainability of the code
behind those surfaces.

### Ranked findings

| Priority | Classification | Area | Evidence | Finding | Clearance gate |
|---|---|---|---|---|---|
| **P1 / decision-output gated** | **Incorrect lifecycle and valuation** | Polymarket portfolio | `backend/gateway/src/index.ts:123-190,1130-1233,1368-1421`; `backend/gateway/src/polymarket_portfolio.js:50-66` | Positions are reconstructed from historical buy/sell fills. A resolved token with remaining shares therefore stays positive forever unless a sell fill exists. The second Gamma pass fetches resolved markets only to recover question text; it does not retain active/closed/winner status. Failed resolved-market quotes then fall back to cost basis as `marketValue` with zero PnL, every named row is printed under **Active Positions**, and that fallback reaches aggregate equity. This can overstate resolved losers, understate winners, and flood the active list with ended positions. | Introduce explicit `active` / `ended` / `unknown` lifecycle data. Only verified-active positions belong in the active list and marked equity. Ended positions should collapse to a short redeem/history summary, with payout included only when resolution ownership/value is verified. Add buy-only resolved-winner, resolved-loser, sold-out, unknown-market, and pagination-truncation fixtures. |
| **P1** | **Responsive-layout defect** | Ink TUI density | `backend/cli/sovereign_dashboard.mjs:1244-1303`; `tests/scripts/tui/dashboard/_harness.js:41-52` | The body always reserves 20 columns for the menu and 76 for content before giving any space to output. A real 80-column PTY rendered a 100-column body; the output pane collapsed to roughly two columns and printed text vertically through the frame. Controlled renders confirmed body width 100 at an 80-column viewport; at 100 columns the `COMMAND OUTPUT` heading still cannot render; only the fixed 120-column test viewport reaches the intended three-pane shape. Borders and repeated 72/40-character rules amplify the flood, but fixed minimum width is the root defect. | Add a viewport policy and tests at 80x24, 100x30, 120x30, and 160x40. Below the three-pane threshold, hide or stack output and collapse the sidebar; use flexible widths and truncated rules rather than fixed 20+76 columns. No rendered line may exceed viewport width. |
| **P1** | **Partially broken input control** | Bottom command bar | `backend/cli/sovereign_dashboard.mjs:460-488,873-898,1185-1189`; `node_modules/ink-text-input/build/index.js:62-80` | Ordinary ASCII typing, end-of-line Backspace, Enter submission, Tab focus, and PIN routing work. Mid-line editing does not: the dashboard sets `showCursor:false`, while this `ink-text-input` version changes its internal cursor on Left/Right only when `showCursor` is true. A direct `statuus`, Left, Left, Backspace, Enter probe left `statuu` and ran nothing; `statusx`, Backspace, Enter correctly ran `status`. Hardware-cursor X also uses unbounded `chatInput.length`, so long or wide Unicode input can misplace it. | Extract a tested `CommandInput` with an explicit cursor offset, display-width-aware and viewport-clamped positioning, or wrap/fork the input component so hardware and logical cursors share one offset. Cover Left/Right, Home/End, Backspace/Delete, paste, long input, CJK/emoji width, and submit. |
| **P1** | **Resize defect** | TUI viewport/cursor | `backend/cli/sovereign_dashboard.mjs:471-488,1052,1226,1244`; local Ink `useWindowSize` support in `node_modules/ink/build/hooks/use-window-size.js:5-20` | Terminal dimensions are read from mutable `process.stdout` values during React render, but no reactive window-size hook is used. Ink recalculates Yoga width on resize without recreating the component's numeric height or rerunning the cursor effect. A controlled resize from 30 rows to 12 still emitted 28 rows. Short viewports also clip the six-row slash menu while cursor math still subtracts all six requested rows. | Drive root height, responsive mode, output page size, picker rows, and cursor placement from one reactive viewport state. Add live resize tests in both directions, including an open slash menu and long input. |
| **P2** | **Process-global error suppression** | Polymarket adapter reliability | `backend/gateway/src/index.ts:1205-1231` | `getPositions()` assigns `console.error = () => {}` around concurrent quote reads and restores it only on the success path. If client construction or any uncaught step throws, `console.error` remains muted for the rest of the process, hiding unrelated failures and becoming unsafe under concurrent work. | Remove global mutation. If SDK noise cannot be configured at source, scope interception with `try/finally` and serialize it, or capture errors at the client boundary. A forced client-construction failure test must prove `console.error` identity is restored. |
| **P2** | **Duplicated schema and monolith debt** | TUI readability/maintenance | `backend/cli/sovereign_dashboard.mjs:91-388,393-1349`; `backend/cli/tui/manifest.js`; `docs/codebase_tour/05_tui_cli_dashboard.md:16-28` | The modern dashboard has a 51-command inline manifest while the legacy TUI has a separate 49-command manifest. A direct comparison found modern-only `stop-backfill-daemon`, `backend chart`, and `trade favorites`; legacy-only `favorites`; and 11 shared commands with different flag-name sets (`watch`, `backfill-daemon`, `backend correlation`, `backend visualize`, `bt`, `optimize`, `scorecard`, `alpaca`, `settings favorites`, `login`, `register`). The 957-line `App` owns 25 state hooks, process spawning, safety gates, parsing, navigation, input, scrolling, and all rendering. Long resolved-history comments embedded in manifest rows further obscure the active contract. The codebase tour already records that this duplication caused a real missing-menu bug. | Define one canonical command schema with adapters for Ink and legacy renderers. Split process execution, viewport policy, command input, navigation reducer, panes, and PIN gate into bounded modules. Move historical incident notes out of production rows into the review ledger. Add a parity contract that rejects command/flag drift. |

### Confirmed behavior versus UX judgment

- **Confirmed good:** 19 focused dashboard/chat tests passed. Basic character entry, end Backspace,
  deterministic submission, focus switching, PIN routing, abort, picker behavior, and output scrolling work.
- **Confirmed broken:** mid-line Left/Right editing, height resize, 80-column rendering, and ended-position
  classification/valuation contracts described above.
- **UX judgment:** at 120 columns the interface is usable but still dense. Multiple nested borders,
  full-width rules, a permanent three-pane body, persistent help/status lines, and verbose labels compete
  with decision output. The proposed breakpoint behavior is a design recommendation, not a test failure.
- **Environment boundary:** no live Polymarket API was polled in this review. The ended-position finding
  follows directly from the local fill reducer, resolved-market metadata discard, quote fallback, renderer,
  and aggregate-equity code paths.

### Grades

| Section | Grade | Reason |
|---|---|---|
| Ink command input | **C / interaction-gated** | Common append/backspace/submit path works; mid-line editing and resize/cursor behavior fail. |
| Ink dashboard layout | **D at <=100 columns; C at >=120** | No responsive breakpoint; default 80-column terminals are structurally flooded. |
| Polymarket portfolio projection | **D / decision-output gated** | Ended positions are labeled active and assigned a non-authoritative value that reaches aggregate equity. |
| TUI maintainability | **C-** | Strong focused tests, but duplicated manifests and a 957-line 25-state component create recurring drift. |

### Verification evidence

- `node --test tests/scripts/tui/dashboard/chat_ui.test.js tests/scripts/tui/dashboard/sovereign_dashboard.test.js`:
  19 tests, 19 pass, 0 fail.
- Real PTY at its default 80-column size reproduced the flooded three-pane frame and unusable output pane.
- Controlled width matrix: body width was 100 at 80 columns; output heading absent at 80 and 100;
  intended three-pane heading visible from 120 upward.
- Controlled resize: 30-row initial render resized to 12 rows still emitted 28 rows.
- Input probes: end Backspace+submit passed; Left/Right mid-line correction failed exactly as the installed
  input component's `showCursor:false` branch predicts.
- No production code or live external API state changed. `graphify-out` remains unavailable.

### Recommended implementation order

1. Fix and fixture the Polymarket lifecycle projection so ended positions cannot contaminate active
   holdings or equity.
2. Extract `CommandInput` plus a pure viewport policy, then add edit/resize/80-column contracts before
   changing visual styling.
3. Apply responsive breakpoints and remove redundant border/rule rows based on viewport tests.
4. Canonicalize both manifests and split the dashboard controller/render/process concerns after behavior
   is locked by tests.

## Blast-Through Connective Tissue Sweep - 2026-07-13 session 75

Mode: connective-tissue, fast reading. Scope: the resumed TUI/Polymarket implementation batch, the
new dashboard input/layout modules, and the deployment/package wiring around the current diff.

### Connectivity matrix

| Path / symbol | Classification | Evidence | Why it matters | Gate to clear |
|---|---|---|---|---|
| `backend/api/package.json` dependencies `express`, `ejs`, `dotenv` | **Stale / dependency bloat** | `backend/api/app.js` uses `node:http` directly and `rg` found no production imports of `express`, `ejs`, or `dotenv` under `backend/api/` | The package advertises a heavier stack than the code actually uses, which obscures the real runtime surface and widens install/security area for no runtime gain. | Remove the unused dependencies or add a real consumer, then regenerate the lock and rerun the package-root dependency check. |
| `backend/mcp_server/package.json` `@modelcontextprotocol/sdk: "latest"` | **Incomplete / non-reproducible** | `backend/mcp_server/package.json` still pins the MCP SDK to `latest` | A moving dependency makes clean installs and future regressions non-reproducible, especially for a live bridge service. | Pin the SDK to a tested semver range and verify the build/test gate against that exact version. |
| `backend/cli/tui/command_input.mjs` + `backend/cli/tui/dashboard_layout.js` | **Intentional** | Focused dashboard/input tests passed 26/26, including mid-line editing, resize behavior, and viewport width checks | The new split is justified: the editor and viewport policy are isolated, tested, and imported by the dashboard. | None; keep the current module boundary. |
| `backend/gateway/src/polymarket_positions.js` | **Intentional** | Polymarket lifecycle tests covered active, ended, unknown, and truncated-history cases; gateway test confirms global error suppression is gone | The new projection module is a real runtime seam, not a dead stub, and it now fails closed for unresolved lifecycle data. | None; keep the current fail-closed behavior and fixtures. |
| `infra/deployment/{heroku,kubernetes,terraform}` | **Intentional / aligned** | Direct read shows all three variants now launch `node backend/api/app.js` instead of the stale `web/app.js` path | The previously stale entrypoint drift is resolved in the current tree. | Keep the contract tests around the real entrypoint path. |

### Section grades

| Section | Grade | Reason |
|---|---|---|
| `backend/api` | **D / dependency-bloat gated** | Runtime is the lean native HTTP server, but the package file still declares unused Express/EJS/dotenv dependencies. |
| `backend/mcp_server` | **C / reproducibility-gated** | Buildable and tested, but the MCP SDK pin to `latest` prevents stable clean installs. |
| `backend/cli` | **C- / interaction gated** | The new command input and viewport split are sound, but the dashboard remains a large interactive controller with known maintainability debt outside this batch. |
| `backend/gateway` | **B+ / fail-closed** | The Polymarket lifecycle seam is now isolated and the focused tests show fail-closed behavior for ended/unknown/truncated positions. |
| `infra/deployment` | **B** | The deployment manifests now align with the real API entrypoint and no longer point at the stale `web/app.js` path. |

### Verification evidence

- Focused test gate: 26/26 passing across dashboard input/layout, Polymarket lifecycle, risk context, and scorecard freshness.
- `rg` check under `backend/api/` found no production imports of `express`, `ejs`, or `dotenv`.
- Direct file read confirmed `backend/api/app.js` uses `node:http` and the current deployment manifests point at `node backend/api/app.js`.
- No production code was changed in this audit pass.

## Mass-Implement Resolution - 2026-07-13 session 75

The two session-75 connective-tissue blockers are resolved, and the implementation pass also repaired a
verification-contract break exposed by the cleanup.

| Surface | Resolution evidence | Grade movement |
|---|---|---|
| `backend/api` package | Removed unused Express/EJS/dotenv declarations; offline lock regeneration pruned 846 stale lockfile lines; clean package root resolves only Socket.IO. | **D dependency-bloat gated -> C trust-gated**. Dependency truth and correlation false health are fixed; broader API readiness gates remain. |
| `backend/mcp_server` | SDK package and lock now pin `1.29.0`; `npm ls` and `tsc` pass. | **C reproducibility-gated -> C+ policy-gated**. Reproducibility is fixed; degraded-backtest policy remains. |
| Root verification scripts | Repointed 15 missing test references after test-tree reorganization; added a contract over all 22 explicit `.test.js` references. | **Contract truth improved**. Advertised npm gates execute again instead of failing at path resolution. |
| Correlation fallback | Requires two aligned observations; zero-overlap payloads return `ok:false`, `available:false`, and `insufficient_aligned_observations`. | **Runtime safety improved**. Zero-sample matrices no longer report healthy. |
| API docs | README, package README, stack manifest, and codebase organization now describe native HTTP + Socket.IO and current infra paths. | **Doc alignment improved**. Active docs no longer advertise Express or a nonexistent `public/` shell. |

Verification evidence:

- `npm run test:api`: 6/6 pass.
- `npm run test:contracts`: 23/23 pass; integration evidence includes 22 macro rows and 9 reserves rows.
- `node --test tests/scripts/operational/portfolio_monitor.test.js`: 8/8 pass.
- `npm test`: full Node suite completed without failures.
- `npm run hygiene` and `git diff --check`: pass.
- Package lock probe: API has no Express/EJS/dotenv nodes; MCP lock resolves SDK `1.29.0`.

## Blast-Through + Mass-Implement - 2026-07-13 session 76

Mode: connective-tissue, Fast Reading Mode. Scope: the deferred authentication, UI-density, and
duplicate/stub baseline. DCS **0.95 -> 0.95**: no market-data transformation or model promotion changed,
so the carried data score remains promotion-gated despite improved auth and UI verification.

### Findings and resolutions

| Priority | Finding | Evidence | Resolution / gate |
|---|---|---|---|
| **P0 fixed** | Supabase auth decisions were cached for 30 seconds, so a same token could remain authorized after revocation. | `backend/api/server/services/supabase_client.js:53-94`; middleware trust at `backend/api/app.js:92-158`. | Removed auth-decision caching; protected requests now revalidate. Database status authenticates before its per-user table-result cache. Same-token valid-to-revoked contract proves two provider calls and immediate denial. |
| **P0 fixed** | Dashboard boot trusted a local persisted session; provider failure could also leave `loading=true` indefinitely. | Former `Frontend/dashboard/src/App.tsx:30-43`. | Added `Frontend/dashboard/src/lib/session.js:1-34`; restore and auth-change paths validate the candidate token with `getUser(token)`, provider/revocation failures resolve unauthenticated, and logout is locally confirmed before user state clears. |
| **P1 fixed** | The responsive TUI stayed within width but clipped `Data`, `Trade`, and `cockpit` at 80/100 columns and selected rows in wide-short terminals. | `backend/cli/tui/dashboard_layout.js:3-67`; hidden pane overflow in `backend/cli/sovereign_dashboard.mjs`. | Row capacity is height-aware at every width; short navigation windows keep first/middle/last selections visible and expose bounded more markers. |
| **P1 fixed** | Kalshi historical adapters silently returned empty success while the caller already supported provider errors. | `backend/scripts/data_ops/ingest_market_data/manifests.js:64-68,183`; caller catch at `backend/cli/commands/research/research_sources.js:301-325`. | Kalshi history now throws structured `not_implemented`; existing Polymarket history tests remain green. |
| **P1 open** | Web dashboard navigation is desktop-only: fixed 260px sidebar, nine-tab single-row header, and fixed panel grids have no mobile contract. | `Frontend/dashboard/src/App.tsx:57-82`; `components/layout/Sidebar.tsx:26-27`; `components/layout/TopBar.tsx:41-99`; no frontend browser/component test script. | Add a browser/component harness at 375/768/1440 before redesign; prove tab reachability, sidebar collapse, grid reflow, overflow, and accessible navigation. |

### UI baseline

Corrected post-fix TUI baseline, ANSI stripped, at 30 rows:

| Viewport | Lines | Occupied cells | Non-whitespace | Border/rule | Other visible | Widest |
|---|---:|---:|---:|---:|---:|---:|
| `80x30` | 29 | 2,231 | 1,493 | 1,060 | 433 | 80 |
| `100x30` | 29 | 2,771 | 1,755 | 1,320 | 435 | 100 |
| `120x30` | 29 | 3,311 | 1,657 | 1,236 | 421 | 120 |

All eight categories and all four Operational commands are present at each width. These are the valid
before-values for a later 25% chrome reduction; the earlier lower narrow-width text counts were clipping,
not simplification.

### Duplicate/stub inventory

| Candidate | Classification | Current decision |
|---|---|---|
| React `components/{Shell,TopBar,SideBar}.tsx` | Dead duplicate | Zero external consumers; defer deletion until the browser baseline/build gate is in place. |
| Inline Ink `M` vs legacy `COMMAND_MANIFEST` | Divergent implementations | 51 vs 49 routes and 11 shared flag-set drifts; existing parity permits legacy-subset drift. Consolidate behind one schema only after adapter contracts. |
| `shared/lib/{polymarket_history,run_loop}.js` and ingest root wrapper | Compatibility shims | Keep; each still has direct consumers. |
| Six unavailable ingest families | Honest unavailable | Keep structured `not_implemented`; do not replace with synthetic success. |
| `shared/lib/data/ingestion.js` and `searchTradingViewScreener` | Dead duplicate/stub | Zero consumers; deletion remains deferred by the saved baseline-first plan. |
| Duplicate test-output fixture trees | Generated/divergent fixtures | 24 exact pairs and 9 divergent pairs; choose a canonical fixture layout before deletion. |
| Rust CLI mirror | Divergent scaffold | Separate broad-deletion approval still required. |

### Grades and verification

| Section | Grade | Movement |
|---|---|---|
| `backend/api` | **B- / deployment-gated** | C -> B-: revocation freshness and protected-route coverage fixed; remote RLS and live-provider soak remain open. |
| `Frontend/dashboard` | **C / responsive-gated** | C- -> C: verified restore/logout and clean build/typecheck; mobile navigation remains unimplemented. |
| `backend/cli` | **C / duplication-gated** | C- -> C: narrow and wide-short navigation are reachable and tested; two manifest owners remain. |
| ingest manifest | **B+ / provider-roadmap** | B -> B+: silent Kalshi history success removed; unavailable providers remain honest roadmap gaps. |

Verification: contracts **28/28**; focused TUI **19/19**; auth/session **6/6**; ingest **4/4**;
full Node suite **730 total / 728 pass / 0 fail / 2 skip**; frontend typecheck/build; hygiene; secret
scan **829 files / 0 violations**; `git diff --check`. No API bind widening or code deletion occurred.

## Blast-Through + Mass-Implement - 2026-07-13 session 78

Mode: triage, Fast Reading Mode. Scope: the deferred frontend viewport contract only. Scoped responsive
DCS **0.61 -> 1.00**: freshness `1.00`, contract schema `0.70 -> 1.00`, executable coverage
`0.10 -> 1.00`. No market-data transform or model promotion changed.

### Confirmed finding and resolution

| Priority | Finding | Baseline evidence | Resolution / gate |
|---|---|---|---|
| **P1 fixed** | The dashboard had no executable mobile contract: unnamed navigation, persistent 260px controls at 375px, and four overview columns at 768px. | First production-build Chrome run: **1/6 pass, 5/6 fail** at 375/768/1440. | Added a dependency-free local Chrome/CDP harness and responsive layout. Final gate: **6/6 pass**; ten destinations activate at every viewport, no document/main overflow is exposed, controls collapse/reopen below 1024px, and overview grids reflow 1/2/4. |

Dismissed candidates: the old `src/styles/{Layout,TopBar}.css` files belong to zero-consumer duplicate
components and are not imported by the active Vite entrypoint; broad duplicate deletion and CLI manifest
consolidation remain separately gated and were not mixed into this batch.

### Grade and verification

| Section | Grade | Movement |
|---|---|---|
| `Frontend/dashboard` | **B- / live-browser-gated** | C -> B-: production-build browser coverage now proves responsive navigation, sidebar behavior, grid reflow, overflow bounds, and accessible current-page state. An authenticated live-provider browser soak remains open. |

Verification: `npm run test:responsive` **6/6** with the production build and local Chrome;
`npm run lint`; `npm run hygiene`; `git diff --check`. The Vite static/dynamic Supabase chunk warning is
unchanged. API binding stayed on loopback and no duplicate files were deleted.

## Mass-Implement - Family-Aware Analysis Batches 1-2 - 2026-07-13 session 79

Planning Mode converted the family-aware scorecard design into eight phase-gated batches in
`workspace/plans/ASSET_ANALYSIS_IMPLEMENTATION_BATCHES.md`. A `gpt-5.6-luna` worker implemented the two
bounded additive batches; the main thread retained integration, corrected delegated contract drift, and
verified live-v2 isolation.

### Implemented

| Batch | Evidence | Result |
|---|---|---|
| Canonical contract kernel | Synthetic fixtures: 9 family/subtype descriptors; 11 explicit factor domains; invalid timestamp/range/provenance/policy/applicability cases. | Runtime validators for `AssetDescriptor`, `Observation`, `FactorResult`, and `ScorecardRow v3`; weight-free family section registry; focused tests 5/5. |
| Shadow asset/evidence taxonomy | Real `config/markets/data_sources.yaml`: 116 matrix entries, 92 raw entries, 108 evidence dimensions. | 122 unique scoreable candidates, 108 non-scoreable evidence descriptors, 30 unsupported/ambiguous entries, 45 repeated declarations, 57 repeated legacy-symbol declarations, 0 identity conflicts, 0 cross-asset symbol collisions; focused tests 4/4. |

The audit rejected invented nested provenance, negative composite strength, policy/asset mismatch, and
inapplicable factor domains. It also corrected the worker's misleading duplicate-identity label: the real
45 count is repeated declarations, not contradictory identities.

### Grade and gates

`shared/contracts/analysis` + `shared/lib/analysis/assets`: **B / shadow-gated**. Contract truth and path
clarity improved, but no live score, provider, API, or UI behavior changed. Technical v2-to-v3 parity,
point-in-time macro truth, SEC normalization, and a reviewed equity policy remain required.

Verification: analysis/taxonomy **9/9**; live scorecard compatibility **2/2**; structure **1/1**; hygiene;
secret scan **829 files / 0 violations**; `git diff --check`. Full Node suite: **739 total / 736 pass /
1 fail / 2 skip** due a parallel strategy-label mismatch in `dashboard_exec.test.js`; the failing file
passes **16/16** in isolation and no analysis batch touched strategy/TUI state.

## Blast-Through + Mass-Implement - Technical v2-to-v3 Adapter - 2026-07-13 session 80

### Triage result

| Candidate | Classification | Evidence |
|---|---|---|
| Missing technical shadow adapter | Confirmed incomplete, fixed | The saved Batch 3 owned no implementation. The real v2 freshness fixture now feeds the adapter and preserves `long`, score `0.208`, and strength `0.21`. |
| Parallel TUI strategy-label mismatch | Dismissed for this pass | `dashboard_exec.test.js` passes 16/16 alone and the full Node suite passes with Batch 3 included. |

### Grade and gates

`shared/contracts/analysis` + `shared/lib/analysis`: **B+ / macro-gated**. Technical contract truth and
verification improved from B: complete fresh v2 rows adapt to valid v3 factors, while stale/incomplete
rows fail closed. Live scorecard behavior remains isolated.

Scoped fixture DCS: **1.00** at start and end (freshness 1.00, schema 1.00, coverage 1.00). Input was
60 synthetic OHLCV records across two timeframes; v2 accepted 2/2 timeframe outputs, the adapter emitted
one validated technical factor with two evidence ids, and 3/3 degraded variants were rejected.

Verification: focused analysis/freshness **12/12**; TUI strategy **16/16**; full Node suite; hygiene;
syntax; `git diff --check`. Remaining highest-impact gap: point-in-time macro observation truth.

## Mass-Implement - Point-in-Time Macro Repair - 2026-07-13 session 80

### Confirmed gap and resolution

| Priority | Finding | Resolution evidence |
|---|---|---|
| P1 / backtest trust | Macro storage treated period date as observation time, omitted release/availability/vintage, and overwrote rows on `(family,series,observed_at)`. A historical consumer could not distinguish the initial value from a later revision. | Revision-aware rows preserve period, release, availability, ingestion, and vintage. As-of selection uses only revisions available and ingested by the decision timestamp. |

Data-flow evidence: 4 synthetic revision records entered normalization; 3 had complete ordered timing and
1 period-only legacy row was retained but excluded. At 2026-05-01, one revision was visible with value
100; a value 101 record already provider-available but not locally ingested was hidden; the later value
102 revision was also hidden. At 2026-06-01, the latest visible value was 102.

### Grades and gates

| Section | Grade | Movement |
|---|---|---|
| `shared/lib/data/macro_store.js` + macro migration | **B+ / remote-migration-gated** | C -> B+: revision loss and look-ahead ambiguity are fixed at source/contract level; remote schema application remains unverified. |
| `shared/lib/analysis` shadow path | **B+ / equity-policy-gated** | Macro prerequisite cleared; no family weights, SEC composer, live scorecard, API, or UI behavior exists yet. |

Verification: focused **12/12**; contracts **29/29**; full Node **743/741/0fail/2skip**; hygiene;
syntax; migration-shape contract; `git diff --check`. Next gate: Batch 5 research-only equity policy.

## Mass-Implement - Recorded SEC Equity 3m Shadow Policy - 2026-07-13 session 81

| Priority | Finding | Resolution evidence |
|---|---|---|
| P1 / fabricated fundamentals | Batch 5 had no recorded SEC artifact or adapter. | Official Apple Company Facts HTTP 200 artifact: 503 `us-gaap` concepts; 1,392 normalized observations; 8/8 metric concepts found; provenance retained. |
| P1 / lookahead and duration mixing | Company Facts contains later restatements and quarter/YTD values sharing period ends. | Facts require filing availability by `asOf`; future filings are excluded. Revenue compares `CY2026Q1` with `CY2025Q1`, producing 16.6%, rather than comparing quarter to YTD. |
| P1 / missing-data confidence | A composer could renormalize around absent fundamentals. | Missing revenue rejects the fundamental factor; missing fundamentals exclude the row; absent weight stays absent. |

`shared/contracts/analysis` + `shared/lib/analysis`: **A- / service-parity-gated**, from B+ /
equity-policy-gated. Batch 5 is additive, research-only, and explicitly not decision-ready; no live
schema-v2, service, API, CLI, or TUI behavior changed.

Verification: focused analysis **11/11**; recorded fixture HTTP **200**, bytes **8,128,534**, `us-gaap`
facts **503**; hygiene; syntax; `git diff --check`. The first full Node run passed. A second confirmation
run encountered unrelated parallel TUI file-level failures. Next gate: Batch 6 service plus CLI/API parity.

## Mass-Implement - Analysis Batches 6-8 - 2026-07-13 session 81

| Surface | Evidence | Verdict |
|---|---|---|
| Canonical service parity | Direct service, real CLI JSON subprocess, API adapter, and authenticated HTTP route return the same named schema-v3 fixture envelope. | Pass; v2 remains default. |
| Family expansion | ECB/Treasury: 8 records; EIA: 6; DefiLlama: 10. S&P and Coin Metrics official requests returned HTTP 403/unavailable. | 7 rows: 0 eligible, 4 degraded, 3 excluded. No substitution. |
| Terminal research UI | Existing scorecard manifest owns schema/fixture/family/state/symbol selection; renderer exposes factor, reason, and evidence details within 80/100/120 columns. | Pass; no second UI registry/provider call. |
| Promotion | Readiness covers distributions, coverage, evidence composition, and missing-data sensitivity. No targets, OOS baseline, costs/turnover, or calibration exist. | `promotion_approved=false`; v2 retirement prohibited. |

Grade remains **A- / promotion-blocked**: implementation and verification are strong, but data/model
evidence intentionally prevents readiness promotion. Focused phase gates passed 4 + 4 + 4 + 24 + 3.
Serialized full Node suite passed **755 total / 753 pass / 0 fail / 2 skip**. Hygiene and diff integrity
passed; tracked secret scan 829/0 and direct new-file pattern scan were clean. `graphify-out` remains absent.

### Completion audit correction

The final requirement-by-requirement audit added explicit pre-retrieval rejection for recorded artifacts,
family-policy factor-applicability assertions, within-family state/ranking coverage, and a real Ink launch
test for the canonical `all-recorded` v3 catalog. The post-repair serialized suite passed **758 total / 756
pass / 0 fail / 2 skip**. Focused analysis, authenticated API, TUI/manifest, hygiene, syntax, diff, and
secret gates all pass. Grade remains **A- / promotion-blocked** because the correct outcome is still zero
eligible rows and `promotion_approved=false`, not because an implementation phase is unfinished.

## Full Blast-Through - Recent Work Review - 2026-07-13 session 81

DCS start/end: **0.95 -> 0.95**. Archive integrity is coherent and `graphify-out` is still absent, so this
pass used fast-reading review against the current state files, the active dirty diff, direct production-file
reads, targeted test/fixture reads, and one broad hygiene gate.

### Findings

| Priority | Area | File:line | Finding | Impact | Required fix / gate |
|---|---|---|---|---|---|
| **Medium** | Analysis recorded-provider freshness | `shared/lib/analysis/analyzers/recorded_provider_factors.js:29-33`, `:45-48`, `:67-70` | The new recorded FX, EIA, and DefiLlama factors stamp `data_as_of` and derive `valid_until` from the fixture retrieval time (`asOf` / `provenance.retrieved_at`), not from the latest observation timestamp in the payload. Direct probe shows the mismatch: FX is labeled `data_as_of=2026-07-13T01:44:44Z` while the underlying Treasury and ECB evidence is dated `2026-07-10`; EIA is labeled `2026-07-13T01:44:31Z` while the latest periods are `2026-07-03`; DefiLlama is likewise freshness-labeled by retrieval time. | The v3 shadow catalog overstates evidence freshness and extends factor validity windows from fetch time rather than observation time. That weakens the "point-in-time" and freshness semantics the recent analysis work claims to preserve, even though promotion remains blocked. | Set factor `data_as_of` from the latest underlying source observation timestamp, keep retrieval/availability in separate provenance/diagnostics fields, and add a contract that fails when retrieval time is newer than the latest evidence date but becomes the reported `data_as_of`. |
| **Medium-Low** | Authenticated signal review route | `backend/api/server/routes/market/signal_promote.js:27-45`, `:67-79` | The route "sanitizes" `signalIds` by deleting non `[A-Za-z0-9_-]` characters instead of validating exact IDs. A malformed payload like `abc!` becomes `abc` before the active-signal check and audit-event write. | An authenticated caller can submit a malformed ID that is coerced into a different live signal ID, causing the wrong review decision to be recorded and telemetered. This is not an order-execution bug, but it corrupts review audit integrity. | Reject any ID that changes under validation instead of mutating it, and add a route contract proving `['abc!']` is rejected even when `abc` is active. |

### Reviewed section grades

| Section | Grade | Movement |
|---|---|---|
| `shared/lib/analysis` recorded-provider family shadow path | **B+ / freshness-truth-gated** | A- -> B+: policy applicability, service parity, and promotion blocking are strong, but recorded-provider freshness is currently retrieval-time-labeled rather than evidence-time-labeled. |
| `backend/api` authenticated review/config surfaces | **B- / audit-integrity-gated** | no letter change: auth freshness and protected-route behavior still hold, but the signal-promotion route now needs exact-ID validation before its audit trail can be treated as fully trustworthy. |

### Verification used

- Direct fixture probe against `fx_macro_recorded.json`, `eia_energy_recorded.json`, and
  `defillama_aave_recorded.json` confirmed source observation dates older than the emitted factor
  `data_as_of` timestamps.
- Direct code-path review of the authenticated `/api/signal/promote` route confirmed lossy ID mutation
  before active-signal validation and audit-event persistence.
- `npm run hygiene` passed.

### Next cleanup move

Fix the recorded-provider factor freshness labeling first. That is the highest-signal trust gap in the
new analysis surface because it affects the semantics of every non-equity recorded family row. Then lock
down exact signal-ID validation in `/api/signal/promote` so the review audit trail stays one-to-one with
the source signal set.

## Blast-Through Triage - Execution and Config Seams - 2026-07-13 session 81

Mode: **triage**, Fast Reading Mode. Scoped DCS start/end: **0.62 -> 0.62** (freshness 0.50,
schema 0.90, coverage 0.35). This was an audit-only pass, so promotion remains halted below 0.95.

### Findings

| Priority | Area | File:line | Finding | Impact | Required fix / gate |
|---|---|---|---|---|---|
| **High** | Strategy live automation | `backend/cli/commands/strategy/strategy.js:821-829`, `:866-907`; `backend/cli/commands/research/research_render.js:329-416` | Every automation backtest is run with `--allow-degraded`, including live passes. The later trust gate treats elevated data risk as a 35-point penalty rather than a hard rejection. A direct probe produced `score=70`, `verdict=researchable` while retaining the warning `data rejects/errors present`, which meets the default live threshold. | A favorable degraded-data backtest can reach `commandTrade(... --live)` and submit a real Alpaca order. Freshness checks and OOS alpha do not restore the missing data-integrity invariant. | Remove unconditional `--allow-degraded` from automation and hard-reject `report.data_quality_ok !== true` before trust scoring for live execution. Add a contract proving an otherwise grade-B report with elevated data risk cannot reach `commandTrade`. |
| **High** | Polymarket bot live authorization | `backend/cli/commands/trade/trade.js:519-548`; `backend/cli/commands/trade/trade_polymarket.js:306-340`; `backend/gateway/src/cycle.ts:156-159`, `:242-255`, `:372-429` | The Polymarket CLOB bot checks only `bot_autopilot`, evaluates `canLiveExecute('alpaca')`, and calls only `requireAuth`; it does not apply the `polymarket` feature gate or the PIN/fail-closed authorization used by direct Polymarket orders. | An API/dashboard caller with an authenticated session can request `live=true` and enter the Polymarket bot order path while the Polymarket feature flag is disabled and without satisfying the trade-PIN boundary. The wrong broker label also makes capability decisions drift from the executor. | Route bot live authorization through the canonical Polymarket authorization helper, require both `bot_autopilot` and `polymarket`, and add negative tests for disabled Polymarket, wrong/missing PIN, and noninteractive API-triggered live cycles. |
| **Medium** | Account config persistence | `backend/api/server/routes/account/config.js:53-66`; `backend/api/server/services/supabase_client.js:161-179`; `supabase/migrations/` | `/api/config` reads and upserts `public.user_config`, but no checked-in Supabase migration creates that table, its unique key, or own-user RLS. The route also has no focused storage contract for the table. | Fresh deployments cannot use dashboard settings reproducibly; GET/POST will fail at the database seam even though the frontend exposes the page and API route. Remote ad-hoc state, if it exists, is not a deployable contract. | Add a forward migration for `user_config` with `(user_id, config_key)` uniqueness and own-user RLS, then test a POST/GET round trip against the declared schema. Validate known keys and value shapes before persistence. |

### Reviewed section grades

| Section | Grade | Movement |
|---|---|---|
| `backend/cli` strategy and bot execution shells | **C- / live-integrity-gated** | C -> C-: current feature/auth gates exist, but two live paths can cross the wrong data or broker authorization boundary. |
| `backend/gateway` Polymarket bot cycle | **B- / caller-auth-gated** | B+ -> B- for the reviewed bot seam: CLOB order mechanics are explicit, but the owning caller does not apply the canonical Polymarket live authorization contract. |
| `backend/api` + `supabase` account config | **C+ / schema-contract-gated** | API route shape is simple, but its required table is absent from the migration history and has no executable round-trip contract. |

### Verification used

- Direct trust-score probe confirmed elevated data risk can still produce grade B, score 70, and
  `researchable`, matching the default live threshold.
- Focused settings and strategy contracts passed **25/25**; their passing inventory confirms they do not
  cover degraded-data live automation, Polymarket bot PIN/feature parity, or the `user_config` schema.
- Migration inventory contains profiles, portfolios, holdings, watchlist, backtests, audit events,
  orders, macro observations, and bot state, but no `user_config` table.
- `npm run hygiene` and `git diff --check` passed.

### Next cleanup move

Hard-stop live strategy automation on failed data quality first. Then unify Polymarket bot authorization
with the direct-order path before creating the missing `user_config` migration and route contract.

## Mass-Implement Correction - 2026-07-13 session 81 - audit backlog closure

All five actionable findings from the two session-81 blast-through reports are fixed and covered by
focused contracts.

| Area | Resolution | Verification |
|---|---|---|
| Strategy live automation | Removed unconditional `--allow-degraded`; live trust decisions now reject a report unless data quality is explicitly verified. | A grade-B / score-95 report with elevated quality now fails the live gate. |
| Polymarket bot authorization | Bot cycles require both feature flags and reuse the direct Polymarket capability, session, and PIN/fail-closed helper. | Disabled Polymarket and missing noninteractive PIN each block a live cycle. |
| Account config persistence | Added a forward `user_config` migration with composite identity, own-user RLS, and update timestamp trigger; the route now rejects unknown keys and malformed shapes. | Mocked authenticated POST/GET round trip plus migration-shape assertions. |
| Signal review IDs | Replaced lossy sanitization with exact ID validation. | A malformed ID is rejected before active-signal lookup and audit persistence. |
| Recorded factor freshness | Factors now use the earliest required source observation as `data_as_of`; retrieval remains an availability/provenance diagnostic. | FX, EIA, and DefiLlama fixtures expose evidence timestamps older than their retrieval times, with validity anchored to evidence time. |

Final verification: focused execution/settings **10/10**, Supabase route **4/4**, signal/analysis
**9/9**, full `npm test` exit **0**, `npm run hygiene` exit **0**, and `git diff --check` exit **0**.

Grade recovery: `backend/cli` returns to **C / duplication-gated**; reviewed `backend/gateway` returns
to **B+ / fail-closed**; `backend/api` and `supabase` return to **B- / deployment-gated** and
**B / remote-RLS-gated** respectively; recorded analysis returns to **A- / promotion-blocked**. These
are code and contract grades only. Real-capital promotion remains blocked by live data, model validation,
remote RLS verification, and broker soak evidence.

## Mass-Implement Recovery Review - 2026-07-16 session 83

### Findings closed

| Prior finding | Resolution | Evidence |
|---|---|---|
| Polymarket bot could inherit live mode without CLI authorization/native risk | `bc9ce6de` requires explicit live authorization and native pre-trade approval. | Focused execution/risk 45/45, gateway TypeScript, full Node 0-fail. |
| Clean `HEAD` contained conflict-marked modules and no test runner | `713b1f98` restored canonical modules/shims, runner, fixtures, and integrity guards. | Clean archive loaded 15 modules and found `tests/run_node_tests.js`. |
| Session 73-81 continuity was truncated | `d851d7c6` additively recovered 90 sections with exact parent parity. | Ordered-subsequence and heading-parity checks passed. |
| TUI/ingest contracts advertised unavailable or drifted behavior | `8e08ab6d` restored visible `not_implemented`, dry-run-before-write, and manifest parity. | TUI 218/218, contracts 31/31. |
| Grain suspects were advisory-only | `d8d78545` classifies bounded recent cadence and blocks unexplained seams. | 8 plausible / 1 unexplained; `SOYB 5m` excluded before scorecard analysis. |
| Residual merge seams kept the root suite red | `cb1c349f` restored ts-index reads, gap-aware backfill, durable append/rename, research fallback, trade flags/PIN stripping, and scheduler dispatch. | Former failure set 44/44 pass plus 2 skip; full Node 817 pass / 0 fail / 4 skip. |

### Final grades

| Section | Before | After | Remaining gate |
|---|---|---|---|
| Repository bootstrap/tests | D | B+ | Host portability beyond this Linux toolchain. |
| Gateway/CLI live safety | F/D | B- | Independent review and live soak; no real-capital approval. |
| API/contracts | C- | B | Deployment/remote service verification. |
| Market integrity | C | B- | Provider-backed repair of unexplained `SOYB 5m`. |
| Workspace continuity | D | B+ | Keep append-only closeout discipline. |
| Combined actionable engine | D / nonexistent | D / nonexistent | Implement exact-asset research-only composition; no synthetic promotion. |

### Verification

- `npm test`: 821 total / 817 pass / 0 fail / 4 skip.
- `npm run test:api`: 7/7; `npm run test:contracts`: 31/31.
- `npm run test:core`: CMake build and CTest 29/29.
- Gateway/MCP/frontend TypeScript and frontend production build pass.
- Six package-root dependency trees pass; secret scan 814/0; hygiene and diff checks pass.
- Clean archive smoke: 15 modules plus root runner. `graphify` is unavailable.

The session-82 C+/B- recovery ceiling is achieved. Promotion remains blocked because one data seam is
unexplained, no independent live soak exists, remote RLS is unverified, and the combined actionable engine
still has no production composition caller.

## Blast-Through Triage - 2026-07-17 session 84

**Mode:** triage / Fast Reading Mode. **DCS:** `0.95 -> 0.95` (carried repository confidence;
no data transformation or promotion occurred).

### Findings

| Priority | Classification | Evidence | Impact | Required gate |
|---|---|---|---|---|
| **High** | **Confirmed blocking data seam** | Live `backend integrity --json`: 92/92 cached, 0 required-window stale, 8 cadence-plausible grain suspects, and 1 blocking suspect. `SOYB 5m` has 4,648 rows from Twelve Data over 2020-07-27 through 2026-07-16; the recent 512-row sample has 8.81 bars/active-day and a 15-minute median gap for a 5-minute label. Current checksum: `0745ebcaf40fb5e047043d8f6b2a085de8cb5a27ed2e2c1fc0558da40d6c0a8a`. | Integrity correctly returns `ok:false`; `SOYB 5m` cannot be promoted into scorecard analysis. | Repair only through an existing provider/backfill path. Record provider, pre/post row count, first/last timestamp, gap percentiles, and checksums; reject any repair that shrinks history. |
| **Medium** | **Confirmed unverified policy drift** | Dirty `config/trading/research.yaml:34` changes `fallback_days` from 1,825 to 365. `research_sources.js:47-49,176,284` applies this default to both provider-history and prediction-market history. Commit `251677bc` established 1,825 days to match the five-year deep-backfill target; current tests cover explicit `--days` but not the configured default. | Default research and prediction-market requests silently lose four years of history, reducing sample depth unless callers pass `--days`. | Restore 1,825 unless the one-year policy is intentional; if intentional, document it and add a default-window contract for both loaders. |

### Dismissed candidates

- **Scorecard leakage:** dismissed. `bias.js` checks grain integrity before reading/scoring bars, and the
  focused coverage/scorecard gate passes 21/21, including unexplained-grain rejection.
- **Active writer corruption:** dismissed for this pass. Three `SOYB` `.tmp` files date from 2026-07-04,
  no backfill/ingest process is running, and canonical reads resolve only exact `.bin`/`.meta.json` paths.
  The stale files are cleanup debt, not evidence that the active bin is being overwritten.

### Scoped grades

| Section | Grade | Reason |
|---|---|---|
| `shared/lib/market` + local data | **B- / one-grain-blocked** | The detector and downstream fail-closed behavior are verified, but one source-backed repair is still required. |
| `config/trading` + research history loaders | **B- / default-contract-gated** | The path is simple and explicit, but a production default changed without matching policy or regression evidence. |

### Next narrow check

Run a provider-backed `SOYB 5m` repair with preservation evidence. Do not mutate the cache during an
audit-only pass, and do not treat the one-year research default as accepted policy without an owner decision.

## Mass-Implement Closeout - 2026-07-17 session 84

Both actionable session-84 triage findings are closed.

| Finding | Resolution | Evidence |
|---|---|---|
| Blocking `SOYB 5m` grain | A restricted fetch worker used the existing Yahoo 5-minute provider path and wrote a structured candidate. The main process applied 1,775 session-valid rows through the canonical merge-protected ts-index writer. | Candidate: 1,776 rows, 1,661 source rows rejected before handoff, 1 session-close row dropped locally, 0 schema rejections. Merge: 4,648 -> 6,052 rows, +1,404, with 371 timestamp overlaps. First/last stayed `2020-07-27T14:45:00Z` / `2026-07-16T19:55:00Z`. |
| One-year research default drift | Restored `historical_defaults.fallback_days: 1825` and added a contract covering both the provider-history and prediction-market default windows. | Focused research/backfill/CLI gate passes 46/46; full Node discovers the two new contracts. |

### Data preservation evidence

- Provider: Yahoo native 5-minute data through the existing provider adapter; the initial delegated
  Alpaca attempt returned no rows and never touched the cache.
- Candidate artifact: `storage/data/staging/soyb_5m_yahoo_candidate_2026-07-17.json`,
  SHA-256 `783d940016c1b4ce5e8a3f9cf243c3efde2065c30998260aa4a6526c5e8041ad`.
- Bin checksum: `0745ebcaf40fb5e047043d8f6b2a085de8cb5a27ed2e2c1fc0558da40d6c0a8a`
  -> `c73f8c5d3df8a111f2bcae6fedf30816fa9aad4e96cc01bbe6a55ed8679dbed9`.
- Full-history within-day gap percentiles improved from p50/p90/p95/p99
  `25/150/210/310` minutes to `15/125/175/295`; maximum remained 420 minutes because older sparse
  history was preserved instead of deleted.
- Integrity's bounded recent sample improved from 8.81 bars/active-day with a 15-minute median gap to
  39.08 bars/active-day with a 5-minute median gap.
- Post-repair integrity: `ok:true`, 92/92 cached, 0 missing, 0 stale, 9 cadence-plausible grain
  suspects, 0 unexplained, and 0 exceptions.

### Verification and grades

- Research/default focused gate: 46/46.
- Writer/equity-backfill gate: 33 pass / 0 fail / 4 expected skips.
- Coverage/scorecard fail-closed gate: 21/21.
- Full Node: 823 total / 819 pass / 0 fail / 4 skip.
- `npm run hygiene` and `git diff --check` pass.

Grade movement: `shared/lib/market` + local data **B- / one-grain-blocked -> B / integrity-green**.
`config/trading` + research history loaders **B- / default-contract-gated -> B+ / contracted**.
Real-capital execution remains blocked pending independent review and live soak; this data repair does
not approve schema-v3 promotion or the combined actionable engine.

## Rigorous Test Triage and Debugging - 2026-07-22 session 87

Blast-through `triage` used Hard Reading Mode for test claims, followed by focused repair and broad proof.
The dirty-tree boundary was preserved throughout; working-tree results are not presented as committed-HEAD
proof.

### Confirmed findings and resolutions

| Finding | Resolution | Evidence |
|---|---|---|
| Prediction-market history silently omitted the interest signal because `fetchPredictionInterestSignal` was never imported into the loader. The existing helper-only test could not see it. | Lazy-imported the fetcher beside the other ingest functions and extended the focused contract through both real loader boundaries. | The strengthened test failed 3/4 before the source repair and passes 4/4 after it; it verifies the 1,825-day window and one returned interest record. |
| Root and strict gates did not cover the complete API surface; TTL cache was active but absent from `test:api`, and `verify:strict` skipped API tests entirely. | Added TTL cache to `test:api`, added the API gate to `verify:strict`, and made the structure contract enumerate every active API test. | API 8/8, contracts 31/31, and the complete strict gate pass. |
| Native `cost_model_test.cpp` was dormant and asserted an obsolete linear formula; only 29 of 30 native test sources were registered. | Registered it in both CMake manifests, matched its numeric expectations to production, and added cross-manifest source-registration parity. | Native CTest 30/30; structure contract 11/11; sample values 2.0, 5.0, 11.0, and 11.1. |
| Dashboard scrolling could pass while the real host command returned an error or zero inventory. | Added a narrow injectable in-pane execution seam and drove the test with 16 deterministic universe entries, nonzero record counts, and actual overflow. | Dashboard 13/13; the contract verifies argv, source, counts, and PageUp/PageDown/End movement. |

### Dismissed or bounded observations

- Concurrent full-suite executions produced transient file-level failures in the shared checkout; isolated
  reruns and the final plain gates were green. They were shared-run interference, not a reproduced repo defect.
- The first unapproved strict run could not bind the local API test socket in the sandbox. The approved
  identical gate passed; this is a host permission boundary, not an application failure.
- Frontend production build retains the known Vite static/dynamic Supabase import warning. Build,
  typecheck, lint, and responsive browser coverage pass; no new regression was established.
- The dashboard injectable proves deterministic success/nonzero output for this contract. Existing dashboard
  tests continue to own abort, streaming, and nonzero-exit behavior; no production spawn default changed.

### Scoped grades

| Section | Grade | Reason |
|---|---|---|
| Research history loader/tests | **B+ / caller-contracted** | Both production loaders are exercised at their dependency boundary and lock the five-year default; wider research composition remains gated. |
| API and strict test harness | **B+ / complete-active-gate** | Every active API file is enumerated into the gate and strict now invokes it. |
| Native test surface | **B+ / manifest-parity-gated** | All 30 sources are registered through both manifests and execute, while broader native execution debt remains. |
| Dashboard test surface | **B+ / deterministic** | The scroll contract proves real overflow with injected data and no host inventory dependency. |
| Testing guidance | **B+ / aligned** | Commands and discovery boundaries match the verified repository topology. |

### Verification

- Strict gate: API 8/8; contracts 31/31; secrets 818 files / 0 violations; full Node ultimately 826 total /
  822 pass / 0 fail / 4 intentional skip after the final architecture contract.
- Native: CMake/CTest 30/30. Dashboard: 13/13. Responsive Chrome: 6/6 at 375, 768, and 1440 widths.
- Frontend lint/typecheck/build, gateway TypeScript, MCP build, all package dependency roots, JS/MJS syntax,
  hygiene, and diff integrity pass.
- A clean-HEAD archive passed canonical runner and entrypoint syntax smoke only; the full repaired suite is
  working-tree proof. DCS moved 0.95 -> 0.98. No commit or graph refresh was made.

### Next narrow check

Repair only the low-severity focused-runner argument-order seam if test ergonomics are selected next:
`tests/run_node_tests.js` appends user flags/selectors after its discovery globs, so they do not reliably
narrow a run. Until then, use direct `node --test`. Preserve the existing real-capital and schema-v3 blocks.

## Private Central Host Implementation Review - 2026-07-22 session 88

### Findings closed

| Prior finding | Resolution | Proof |
|---|---|---|
| Canonical append/overlap writes had no per-bin cross-process exclusion. | Added an atomic ownership-token sidecar lock with timeout, bounded stale reclaim, deep-merge refresh, lost-ownership failure, and ownership-checked release. | Held-lock production writer blocks; concurrent append/append ends at 200 unique rows; append/merge ends at 150; metadata matches; no residue. |
| Broad Compose startup included a bot and inherited execution-capable configuration. | Default stack is web + backfill; bot requires `paper`; every central service forces cloud-compute/non-live/no-execution authorization. | Deployment manifest contract and clean-archive focused tests pass. |
| Manual updates could deploy dirty, divergent, locally-ahead, or unintended services. | Updater takes `flock`, requires clean expected branch and exact fetched-remote equality after `--ff-only`, builds web, recreates explicit web/backfill, and checks both health and poller state. | Shell syntax and static updater contract pass from working tree and clean archive. |
| General `.env` could bleed execution credentials into a selected central env. | Central preflight parses only the selected `.env.central` plus explicit process overrides; it never imports the general auto-loader. | Regression fixture places a private key in adjacent `.env`; central validation stays green and the value is absent. |
| Focused Node runner arguments followed broad discovery globs. | Runner separates options from targets, puts options first, and substitutes explicit test files for default discovery. | Runner contract 3/3; focused file invocation and full npm discovery pass. |

### Current boundary

The repository is usable as a private research/data system, and its central-host deployment path is now
reproducible in committed code. It is not yet an operating central service on this workstation: Docker
Compose and daemon checks fail, no external target host was supplied, and no provider polling was run.
Current integrity is 92/92 cached, 72 stale, 9 cadence-plausible, and 0 unexplained. Live-money use,
public exposure, schema-v3 promotion, and remote Supabase/RLS approval remain unapproved.

### Verification and publication

- Working tree: Node 838/834/0fail/4skip; API 8/8; contracts 31/31; native 30/30; dashboard 13/13;
  responsive 6/6; frontend/gateway/MCP builds; dependencies; skills; hygiene; diff.
- Clean archive `59045be7`: runner, preflight, lock, validation, and updater syntax plus focused runner,
  deployment, preflight, and lock contracts pass.
- Pushed: `f9119729`, `cb47a921`, and `59045be7` to `origin/main`.
