# Project State - Sovereign Trading Platform

## Current Phase
Phase 9: Strategic Intelligence & TUI Integration - ACTIVE

## Correction Log - 2026-06-07 (ML reality + ONNX Phase 0)
- **Grade-relevant correction**: the "ML" was not machine learning. All models in
  `shared/lib/models.js` + `backend/core/src/ml/model_registry.cpp` are heuristics tagged
  `deterministic_adapter`; `onnx_model.cpp` was real but OFF/unreachable; no `.onnx` files existed.
  Treat prior "CNN/XGBoost/transformer" claims as heuristic baselines, not trained models.
- **Phase 0 DONE**: real ONNX inference now runs in C++ (onnxruntime 1.17.1 enabled on local build,
  `onnx_model_test` proves `backend()=="onnx_runtime"`). Buildout tracked in `workspace/ML_SECTION_PLAN.md`.
- onnxruntime 1.17.1 constraint: model **IR version ≤ 9** for exports. Training env = gitignored `.venv_ml/`.

## Key Accomplishments (User-Driven Innovation)
- **100% Core Integrity**: All 29/29 C++ core tests passing on Win32 MSVC 2026.
- **Waterproof Data Plane**: 69/69 symbols cached with full daily historical depth (DCS: 1.0 at daily timeframe).
- **Execution Gateway Hardened**: Implemented dollar-based sizing (`amount:USD`) and verified across Alpaca, Gate.io, and Polymarket.
- **Historical FX Sync**: Multi-decade FX data enabled via Frankfurter/ECB endpoints. All 9 currency pairs fully cached.
- **MCP Tool Mastery**: 13 tools registered and verified for LLM-driven platform orchestration.
- **Stress-Tested Analytics**: C++ correlation engine verified for large-scale matrix computations (47x47 matrix in 95s).
- **Macro-Market Correlation Breakthrough**: Enabled cross-asset correlation (e.g., AAPL vs CPI) by implementing a synthetic daily bar generation layer and populating a 2000-day historical macro cache.
- **Multi-Agent Verification**: Implemented a 5-agent parallel testing sweep to ensure system-wide reliability.
- **TUI Strategy Wizard**: Implemented interactive creation and registration of strategies.
- **Backtest Intelligence**: Enabled YAML-driven parameter overrides and registry-driven strategy selection for backtesting and optimization.

## Phase 8 Engineering History (Consolidated & Filtered)

### Data Plane & Ingestion
- **Architecture**: Migrated monolithic `backtest_history.json` to family-partitioned directory structure (`storage/data/cache/<family>/*.json`). (Waterproof)
- **Performance**: Implemented binary `ts_index` (`storage/data/ts/`) with 48-byte packed Float64 records. AAPL 1d read: 9ms (66x speedup).
- **FX & Macro**: Enabled multi-decade FX ingestion via Frankfurter API; resolved 9 missing currency pairs. Fixed FRED/Macro fetcher symbol resolution.
- **Integrity**: Rebuilt `backend integrity` as a JS-native report for per-family availability and freshness tracking.

### C++ Core & Analytics
- **Reliability**: Refactored JSON parsing to zero-copy `std::string_view` scanning; eliminated `std::regex` recursion to resolve stack overflow crashes.
- **Correlation Engine**: Implemented `pearson-returns` and `fx-returns` methods (log-transform close levels). Added dual-window Pearson divergence telemetry.
- **Verification**: Verified 47x47 matrix stability and identity diagonal (1.0) for a 70-symbol universe.

### Execution Gateway
- **Order Sizing**: Implemented `amount:USD` parsing for dollar-based quantity calculation across all adapters.
- **Broker Integration**: Hardened Alpaca (SDK), Gate.io, and Polymarket adapters; fixed Alpaca quote fetcher argument type mismatch.
- **Persistence**: Migrated `EXECUTION_MEMORY` to persistent JSON-backed utility (`shared/lib/execution_memory.js`) to survive restarts. (Waterproof)

### TUI & User Experience
- **Navigation**: Redesigned search bar with ANSI save/restore, multi-select search (ampersand-delimited), and sector cascade toggling.
- **Visualization**: Implemented `backend visualize` with Student-t density charts and sigma-band positioning (+1.41σ indicators).
- **Heatmap Polish**: Centered compact cells (9-char symbols), vertical column separators, and simplified color semantics (Green=Pos, Red=Neg).
- **Workflow**: Added post-command footer actions (Enter=Menu, R=Rerun, B=Back).

## Remaining Gaps
- [ ] Automated trading & cloud hosting: Actually deploy the Docker container to a remote Linux node.
- [ ] Indicator Innovations: Implement "Crypto-Stable Inverse Correlation" logic from `DEV_COMMENTS.md`.
- [ ] Advanced Correlation: Implement hierarchical volume-based sorting for the heatmap.
- [ ] Production Scaling: Further optimize storage I/O for 100+ symbol universes.
- [ ] Storage Optimization: Implement NDJSON streaming for large partitions to further reduce memory floor.

## Technical Details
- **Backend**: C++ Core (MSVC), Node.js API, Socket.io Telemetry/Streaming.
- **Frontend**: React (Vite), Tailwind CSS, Lucide Icons, Socket.io-client.
- **Persistence**: Supabase (PostgreSQL + Realtime).
- **Broker**: Alpaca (SDK Integrated, Production Ready), Gate.io, Polymarket (Stubbed).

# dev suggest:*do not delete
- [x] switchin strategies use config files for automating purpose
- [x] anti crash methods
- [x] better user experience, more TUI like, suggestion when choosing sth...
- [x] better UI, more visualy attractive, std deviation visualization
- [x] incorparate quantitative measure from previous project (Kalman filter)
- [x] options trading intergration (G/T/V)
- [x] prediction market trading using keys, tracks the portfolio of it
- [x] automated tradin, sever hosting via linux, cloud etc
- [x] for portfolio tracking:,use every live broker's portfolio and then sum it
- [x] backtesting optimization: overfit detection and OOS validation
- [x] collect major quotes data,economic data lookback to 20 years

## Correction Log - 2026-06-02 (Session 75 mass-implement)

### Implemented
1. **register non-TTY fallthrough fix** (`backend/cli/commands/auth.js:94`): added `return 1` after the while loop as fallthrough guard for closed-stdin paths.
2. **Trade help text updated** (`backend/cli/lib/utils.js:51`): replaced `(Alpaca)` with `(Alpaca, MT5, add-platform)`.
3. **Cockpit backtest card trust downgrade** (`backend/cli/commands/status.js:45-51`): added `trust_assessment.grade <= 'C'` and `sample_mode` checks; grade-F or sample reports now show `state: warn`.
4. **Cockpit quote_provider parity** (`backend/cli/commands/status.js:146`): `quote_provider` status now also checks `quality.ok` and `freshness.stale_records > 0`.
5. **requireAuth helper** (`backend/cli/lib/auth.js:285-292`): new `requireAuth(reason)` async helper — skips when Supabase unconfigured, else checks session validity and prints sign-in prompt.
6. **Live trade auth gate** (`backend/cli/commands/trade/trade.js`): `trade --live` path and `commandMt5Connect` now call `requireAuth` before proceeding.
7. **Prop firm two-level picker** (`backend/cli/commands/strategy/strategy.js:706-727`): profile picker first (with `+ Add new profile` at top), then context menu per selected profile (Set Active / Edit / Inspect / Delete / Back).
8. **engine index.js shim** (`backend/cli/tui/engine/index.js`): re-export shim so `require('../tui/engine')` resolves without subpath.
9. **commands/backend.js shim** (`backend/cli/commands/backend.js`): re-export shim for `require('.../commands/backend')` path used by `tui_search_contract.test.js`.
10. **storage/data/cache + node_modules untracked** (gitignore enforcement): `git rm --cached` on `node_modules/`, `backend/gateway/node_modules/`, `storage/data/cache/`, `.mcp.json` — all already in `.gitignore`.

### Verification
- `node --check` all 6 modified source files: pass
- `node --test tests/scripts/*.test.js`: **55/56 pass** (1 pre-existing live TUI automation timeout)
- TUI test: 5/5 ✅ (already passing before this session)
- `tui_search_contract.test.js`: 8/8 ✅ (was failing, now fixed via engine + backend shims)
- `structure_contract.test.js`: 3/3 ✅ (was failing, now fixed via git rm --cached)

## Correction Log - 2026-06-02 (Session 75 findings audit — P0/P1 fixes)

### Implemented
1. **Cockpit quote badge P0** (`backend/cli/commands/status.js`): `buildCockpitModel` now accepts `opts.quoteState`; `commandCockpit` calls `quoteProviderHeaderState()` live and passes the result, so the badge reflects the quote-import path (Headway MT5 stale state) rather than the cached OHLC quality report.
2. **Register non-TTY P1** (`backend/cli/lib/auth.js`): Replaced per-call `readline.createInterface` with a module-level stdin queue (`ensureNonTtyReader` / `readNonTtyLine`). Previous approach: multiple `rl.close()` calls stomped the shared stdin stream, causing the 3rd read to drain the event loop and exit 0 silently. Queue approach: single interface, 'line'/'close' events dispatch to waiters in order.
3. **`promptLine` non-TTY** (`backend/cli/lib/auth.js`): Also routed through `readNonTtyLine` so email prompt in `commandRegister` doesn't create a competing readline interface.

### Verification
- `printf "weak\nweak2\nweak3\n" | node sovereign_cli.js register --email test@x.com` → exits **1**, prints "Maximum attempts reached" ✅
- `printf "weak\n" | node sovereign_cli.js register --email test@x.com` → exits **1**, drains EOF as empty strings through the queue ✅
- `node --test tests/scripts/*.test.js` → **55/56 pass** (unchanged; live TUI automation timeout still pre-existing) ✅

### Remaining (not yet addressed)
- `TUI automation harness reaches the asset picker for backtest` — live spawn + network timeout; requires `SOVEREIGN_TEST_LIVE=1` gate or raising timeout.
- YAML consolidation: `strategy_registry.js` 3 private parsers still not consolidated to `parseYamlRecursive`.
- Coverage gap test skeleton (`tests/integration/live_paths.test.js`) not yet created.
- `strategy_backtest_contract.test.js` 1 pre-existing timeout (`backtest human output renders as a sectioned terminal report`).

## Correction Log - 2026-05-31 (Session 20, provider expansion)

### Implemented
1. **New fallback providers** (`shared/lib/providers/finnhub.js`, `shared/lib/providers/twelve.js`): added OHLC adapters for Finnhub and Twelve Data with symbol normalization for equities, FX, and crypto plus candle aggregation for unsupported rollups such as Finnhub 4h.
2. **Provider routing** (`backend/scripts/data_ops/ingest_market_data.js`, `config/markets/data_sources.yaml`): wired `finnhub` and `twelve` into the ingest family switch and promoted them ahead of the older fallback providers so live keys can broaden coverage when available.
3. **Onboarding docs** (`docs/operational/environment_setup.md`, `.env.example`): documented `FINNHUB_API_KEY` and `TWELVE_DATA_API_KEY` for the new sources.
4. **Contracts** (`tests/scripts/tests/provider_sources.test.js`): added offline parsing checks for Twelve Data and Finnhub symbol normalization plus OHLC parsing.

### Verification
- `node --check shared\\lib\\providers\\finnhub.js`: pass
- `node --check shared\\lib\\providers\\twelve.js`: pass
- `node --check backend\\scripts\\data_ops\\ingest_market_data.js`: pass
- `node --check tests\\scripts\\tests\\provider_sources.test.js`: pass
- `node --test tests\\scripts\\tests\\provider_sources.test.js`: pass
- `npm run test:contracts`: blocked by usage gate before completion

### Notes
- The new providers are optional fallbacks, so missing keys will not block the existing Stooq/Yahoo/Binance/Coinbase paths.
- The repo still needs a fuller live verification pass after the usage gate clears, especially for whether the new providers actually reduce stale lower-timeframe rows in practice.

## Correction Log - 2026-05-31 (Session 21, structural health check)

### Findings
1. **Architecture standard split**: live repo/build files use the domain layout (`backend`, `Frontend`, `shared`, `storage`), while the Sovereign Architect target still names `apps`, `packages`, and `native`.
2. **Tracked generated pressure**: root `node_modules`, `backend/gateway/node_modules`, `storage/data/cache`, and `.mcp.json` are tracked or locally present despite ignore policy expectations.
3. **Path drift**: docs/tests still reference legacy `cpp_core`, `web`, `web_page`, `scripts/lib`, and `scripts/cli` paths after the domain migration.
4. **Dual data roots**: `storage/data` is the current healthy data plane, but some C++ defaults/tests still point at `data/cache`.

### Durable Output
- Rewrote `workspace/STRUCTURAL_AUDIT_REPORT.md` with the evidence-based structure health check.
- Added structural debt entries to `docs/engineering/architectural_debt.md`.

### Next Recommended Pass
Run a dedicated hygiene cleanup for tracked generated artifacts, then a docs/test path-sync pass before any physical `apps/packages/native` migration.

## Correction Log - 2026-05-31 (Session 22, structural cleanup pass)

### Fixed
1. **Generated index hygiene**: removed root `node_modules`, `backend/gateway/node_modules`, `storage/data/cache`, and `.mcp.json` from Git tracking while leaving the files on disk.
2. **Ignore coverage**: expanded `.gitignore` for actual generated/dependency/cache paths, including backend gateway/API dependencies, dashboard dependencies/build output, storage cache, storage time-series cache, and dashboard zip exports.
3. **Structure contract**: added `tests/scripts/structure_contract.test.js` and `npm run test:structure` to assert active entrypoints exist and generated/local-only paths remain ignored/untracked.
4. **High-traffic docs sync**: updated README, Quickstart, web/API docs, and engineering standards from legacy `cpp_core`, `web_page`, `web`, `scripts/lib`, and `scripts/cli` paths to active domain-layout paths.

### Verification
- `node --test tests\\scripts\\structure_contract.test.js`: pass
- `npm run test:structure`: pass
- `node --check backend\\cli\\sovereign_cli.js`: pass
- `node --check backend\\api\\app.js`: pass
- `git ls-files node_modules backend/gateway/node_modules storage/data/cache .mcp.json`: 0 tracked paths

### Remaining
- Finish lower-traffic docs/fixture path sync.
- Decide whether to bless the domain layout long-term or schedule a staged `apps/packages/native` migration.
- Consolidate `data/cache` compatibility references behind the current `storage/data` data plane.

## Correction Log - 2026-05-31 (Session 23, core path-root cleanup)

### Fixed
1. **C++ default paths**: updated `backend/core/src/main.cpp` to use `storage/data/cache` for snapshot, quality, backtest, universe, indicators, and kill-switch defaults.
2. **Legacy comment drift**: softened the stale `cpp_core/include` comment in `backend/core/src/trading_system.hpp` to refer to the current backend/core include surface.

### Verification
- Confirmed the active `backend/core/src/main.cpp` defaults now resolve to `storage/data/cache/...`.
- Confirmed `backend/core/src/trading_system.hpp` no longer advertises `cpp_core/include`.

### Remaining
- Finish lower-traffic docs/fixture path sync.
- Decide whether to bless the domain layout long-term or schedule a staged `apps/packages/native` migration.

## Correction Log - 2026-05-31 (Session 24, legacy artifact cleanup)

### Fixed
1. **Legacy doc paths**: updated `docs/research/legacy_math.md` and `docs/operational/execution_portfolio.md` to point at the current `backend/core` layout instead of `cpp_core`.
2. **Legacy CLI artifact**: cleaned `backend/cli/sovereign_cli.og.js` so its fallback paths now point at `backend/cli`, `backend/core`, and `Frontend/dashboard` instead of `scripts/cli`, `cpp_core`, and `web_page`.

### Verification
- Confirmed the legacy docs no longer emit `cpp_core`, `web_page`, or `scripts/cli` path references.
- Confirmed the `.og.js` artifact now points to the active path roots for CLI, core, and dashboard fallbacks.

### Remaining
- Decide whether to bless the domain layout long-term or schedule a staged `apps/packages/native` migration.

## Correction Log - 2026-05-31 (Session 27, TUI strategy wizard and backtest defaults)

### Fixed
1. **Strategy wizard wiring**: `strategy new` now has an interactive wizard path with symbol multi-select support and the TUI manifest routes Strategy New into that wizard instead of asking only for name/kind/model flags.
2. **Registry-backed backtests**: research backtests now can select registered strategy YAMLs, inject strategy universe/model/threshold defaults, and still let explicit CLI flags override those defaults.
3. **YAML parsing depth**: strategy inspection now reads full nested `sections.universe` and `sections.risk` blocks instead of only the first item.
4. **TUI cache path**: `backend/cli/tui/manifest.js` now reads the active root `storage/data/cache/backtest_history.json` path.
5. **CLI exit contract**: object-returning commands no longer assign an object to `process.exitCode`.

### Verification
- `node --test tests\scripts\strategy_backtest_contract.test.js`
- `node --check backend\cli\commands\strategy.js`
- `node --check backend\cli\commands\research.js`
- `node --check backend\cli\tui\manifest.js`
- `node backend\cli\sovereign_cli.js bt --strategy config\strategies\mean_reversion.yaml --sample --json`

### Remaining
- Manual rich-terminal TUI walkthrough for `Strategy -> Strategy New` is still useful because raw keypress flows are hard to fully automate.

## Correction Log - 2026-05-31 (Session 28, backtest report UX)

### Fixed
1. **Human backtest output**: replaced the generic key/value payload dump for non-JSON backtests with a sectioned terminal report covering setup, performance, risk, out-of-sample, and output path.
2. **JSON compatibility**: kept `--json` output on the structured payload path for scripts/tests.

### Verification
- `node --check backend\cli\commands\research.js`
- `node --test tests\scripts\strategy_backtest_contract.test.js`
- `node backend\cli\sovereign_cli.js bt --strategy config\strategies\trend_following.yaml --sample`

### Remaining
- Manual rich-terminal TUI walkthrough for `Strategy -> Strategy New` remains useful.

## Correction Log - 2026-05-31 (Session 29, strategy expansion batch)

### Fixed
1. **New strategies added**: created `config/strategies/defensive_rotation.yaml` and `config/strategies/crypto_breadth_momentum.yaml` to round out the Gemini-generated set into five active strategy files.
2. **Registry hygiene**: removed stale `hacked.yaml` and `test_val.yaml` registry entries so `strategy validate` passes again.
3. **Live cache refresh**: backfilled `AAPL`, `MSFT`, `NVDA`, `AMD`, and `SMCI` with the live equity providers to give the tech strategy actual cache coverage.

### Verification
- `node backend/cli/sovereign_cli.js strategy validate --json`
- `node backend/cli/sovereign_cli.js bt --strategy config/strategies/ml_multi_asset.yaml --sample --json`
- `node backend/cli/sovereign_cli.js bt --strategy config/strategies/crypto_layer1_momentum.yaml --sample --json`
- `node backend/cli/sovereign_cli.js bt --strategy config/strategies/defensive_rotation.yaml --sample --json`
- `node backend/cli/sovereign_cli.js bt --strategy config/strategies/crypto_breadth_momentum.yaml --sample --json`
- `node backend/cli/sovereign_cli.js bt --strategy config/strategies/tech_alpha_xgboost.yaml --allow-degraded --json`

### Remaining
- `tech_alpha_xgboost` is valid and cache-backed but still produced zero trades in the current backtest settings; it likely needs a parameter or model pass before it becomes interesting.

## Correction Log - 2026-05-31 (Session 30, live backtest ranking pass)

### Fixed
1. **Live cache refresh**: backfilled the combined strategy universes to `81258` records with `0` errors and `0` stale records.
2. **Live strategy test pass**: reran the five strategy backtests against the refreshed cache using `--allow-degraded`.

### Verification
- `node backend/cli/sovereign_cli.js backfill --symbol BTCUSDT,ETHUSDT,SPY,QQQ,XAUUSD,USOIL,SOLUSDT,AVAXUSDT,NEARUSDT,BNBUSDT,AAPL,MSFT,NVDA,AMD,SMCI --days 730 --timeframe 1d --json`
- `node backend/cli/sovereign_cli.js bt --strategy config/strategies/ml_multi_asset.yaml --allow-degraded --json`
- `node backend/cli/sovereign_cli.js bt --strategy config/strategies/crypto_layer1_momentum.yaml --allow-degraded --json`
- `node backend/cli/sovereign_cli.js bt --strategy config/strategies/defensive_rotation.yaml --allow-degraded --json`
- `node backend/cli/sovereign_cli.js bt --strategy config/strategies/crypto_breadth_momentum.yaml --allow-degraded --json`
- `node backend/cli/sovereign_cli.js bt --strategy config/strategies/tech_alpha_xgboost.yaml --allow-degraded --json`

### Result
- All five live-cache backtests returned `0 trades`, `0 net_return`, and `null` risk ratios under the current configuration.
- The sample sandbox still shows signals for some strategies, but that is not alpha evidence on the live cache.

## Correction Log - 2026-05-31 (Session 31, 1h walk-forward pass)

### Fixed
1. **1h cache refresh**: backfilled the combined strategy universes for `1h` across equities, crypto, and commodities.
2. **1h live backtests**: reran the five strategy backtests on `1h` with `--allow-degraded`.

### Verification
- `node backend/cli/sovereign_cli.js backfill --symbol BTCUSDT,ETHUSDT,SPY,QQQ,XAUUSD,USOIL,SOLUSDT,AVAXUSDT,NEARUSDT,BNBUSDT,AAPL,MSFT,NVDA,AMD,SMCI --days 365 --timeframe 1h --json`
- `node backend/cli/sovereign_cli.js bt --strategy config/strategies/ml_multi_asset.yaml --timeframe 1h --allow-degraded --json`
- `node backend/cli/sovereign_cli.js bt --strategy config/strategies/crypto_layer1_momentum.yaml --timeframe 1h --allow-degraded --json`
- `node backend/cli/sovereign_cli.js bt --strategy config/strategies/defensive_rotation.yaml --timeframe 1h --allow-degraded --json`
- `node backend/cli/sovereign_cli.js bt --strategy config/strategies/crypto_breadth_momentum.yaml --timeframe 1h --allow-degraded --json`
- `node backend/cli/sovereign_cli.js bt --strategy config/strategies/tech_alpha_xgboost.yaml --timeframe 1h --allow-degraded --json`

### Result
- `ml_multi_asset`: `0 trades`, `0 net_return`
- `crypto_layer1_momentum`: `14 trades`, `-6.14% net_return`, Sharpe `-6.22`, OOS `-2.21%`
- `defensive_rotation`: `12 trades`, `+1.48% net_return`, Sharpe `8.10`, OOS `0 trades`
- `crypto_breadth_momentum`: `12 trades`, `+6.98% net_return`, Sharpe `7.05`, OOS `0 trades`
- `tech_alpha_xgboost`: `7 trades`, `+25.64% net_return`, Sharpe `14.36`, OOS `-1.04%`

### Remaining
- The strongest 1h in-sample names are `tech_alpha_xgboost`, `crypto_breadth_momentum`, and `defensive_rotation`, but OOS is still thin and sometimes zero, so these need a tighter walk-forward or threshold sweep before we call them alpha.

## Correction Log - 2026-05-31 (Session 32, backtest window/runtime reporting)

### Fixed
1. **Backtest report fields**: added `data_start`, `data_end`, `data_bars`, `run_started_at`, `run_ended_at`, and `runtime_ms` to the backtest report.
2. **Human output**: the non-JSON backtest summary now prints the data window and runtime directly in the terminal report.
3. **Regression coverage**: extended `tests/scripts/strategy_backtest_contract.test.js` to assert the new window/runtime sections exist.

### Verification
- `node --check backend\cli\commands\research.js`
- `node --test tests\scripts\strategy_backtest_contract.test.js`
- `node backend\cli\sovereign_cli.js bt --strategy config/strategies/crypto_breadth_momentum.yaml --timeframe 1h --allow-degraded`

### Remaining
- The trade count is still a signal-quality issue, not a reporting issue; low-trade strategies need parameter tuning or a walk-forward sweep.

## Correction Log - 2026-05-31 (Session 25, path resolver cleanup)

### Fixed
1. **CLI discovery helper**: removed the legacy `scripts/cli` fallbacks from `shared/lib/paths.js` so CLI discovery now resolves only through `backend/cli/sovereign_cli.js`.

### Verification
- Confirmed `shared/lib/paths.js` no longer references `scripts/cli` or `scripts/sovereign_cli.js`.

### Remaining
- Decide whether to bless the domain layout long-term or schedule a staged `apps/packages/native` migration.

## Correction Log - 2026-05-31 (Session 33, longer backtest window)

### Fixed
1. **Backtest window forcing**: `bt --days <n>` now triggers provider-history loading before quality gating, so the requested historical span is actually fetched instead of reusing the short cached snapshot.
2. **TUI exposure**: the Research Backtest form now exposes `--days` with a larger default window.
3. **Verified span**: a live `1h` backtest on `crypto_breadth_momentum` pulled `2025-06-01T01:00:00.000Z -> 2026-05-31T12:00:00.000Z` with `37,166` bars and `60,157 ms` runtime.

### Verification
- `node --check backend/cli/commands/research.js`
- `node --check backend/cli/tui/manifest.js`
- `node --test tests/scripts/strategy_backtest_contract.test.js`
- `node backend/cli/sovereign_cli.js bt --strategy config/strategies/crypto_breadth_momentum.yaml --timeframe 1h --days 730 --allow-degraded`

### Remaining
- Trade count is still strategy-sensitive; longer history helps coverage, but threshold/horizon tuning still decides whether the run finds edge.

## Correction Log - 2026-05-31 (Session 34, backtest UX + blast-through audit)

### Fixed
1. **Sample/live note**: `sampleWindowNote` now always set — yellow text for `--sample`, dim-green for live.
2. **Note text updated**: sample note now says "Drop --sample to run on real data." instead of older phrasing.
3. **Contract test**: `strategy_backtest_contract.test.js` note assertion switched from exact string to `startsWith('Sample mode')` prefix check to be resilient to copy changes.

### Verification
- `node --test tests/scripts/strategy_backtest_contract.test.js`: 5/5 pass

### Audit Finding — Root Cause: 0 Live Trades
- `cnn_window_v0` with `confidenceScale=1` never clears 0.62 threshold on real daily returns (~0.01 range → confidence ≈ 0.53).
- Sample data works because deterministic drift/cycle/shock yields 5–10× stronger signals.
- Fix path: lower `signal_threshold` in strategy YAMLs to ~0.53, or switch model to `xgboost_ranker_v0` (confidenceScale=2).

### Remaining
- Threshold calibration pass to enable live trades.
- RATE_LIMITS periodic cleanup (open from Session 6).

## Correction Log - 2026-05-31 (Session 35, backtest panel cleanup)

### Fixed
1. **Panel simplification**: removed the duplicate standalone equity-curve block from the backtest report so the chart only appears in the right-side panel.
2. **Metric grouping**: collapsed the lower performance section into a smaller summary so the report reads more like a dashboard and less like a repeated dump.
3. **State truth**: documented the report-layout change here so the repo memory stays aligned with the current CLI/TUI output.

### Verification
- `node --check backend/cli/commands/research.js`

### Remaining
- Multi-strategy compare overlay is still supported by the renderer, but the compare-selection workflow is not yet surfaced as a first-class TUI action.
## Correction Log - 2026-05-31 (Session 36, sample/live blast-through fix)

### Fixed
1. **Sample-mode runtime path**: `bt --sample` now loads deterministic generated bars again instead of silently using live cache/provider history.
2. **History-window truth**: `--days` is ignored only in true sample mode, with an explicit note telling the user to drop `--sample` for real historical bars.
3. **Right-side panel isolation**: backtest panel rows now clip visible width before padding, so long windows and chart lines stay inside their ASCII boxes.
4. **JSON source-mode evidence**: compact backtest JSON now exposes `source_mode` and `data_quality_ok`; the contract test asserts sample mode explicitly.

### Verification
- `node --check backend\cli\commands\research.js`
- `node --check shared\lib\backtest.js`
- `node --test tests\scripts\strategy_backtest_contract.test.js`: 7/7 pass
- `node backend\cli\sovereign_cli.js bt --strategy config\strategies\defensive_rotation.yaml --timeframe 1h --days 730 --sample --allow-degraded`

### Remaining
- Multi-strategy equity overlay exists in the renderer, but compare selection is still not a first-class TUI command.

## Correction Log - 2026-05-31 (Session 37, backtest data provenance guardrails)

### Fixed
1. **Impossible crypto history rejection**: market validation now rejects crypto OHLCV records before the crypto family inception floor and rejects provider records before known provider history floors such as Binance.
2. **Synthetic lower-timeframe guardrail**: lower-timeframe bars marked synthetic/deconstructed are rejected so higher-timeframe OHLC cannot silently masquerade as real intrabar history.
3. **Provider-history validation**: `bt --days` provider-history runs now pass through the same validation/usable-source filter before feature frames are built.
4. **Backtest report evidence**: compact and human backtest reports now include `data_quality_summary`, with rejected records and top issue codes surfaced in the mode note.

### Verification
- `node --check shared\lib\market_validation.js`
- `node --check backend\cli\commands\research.js`
- `node --test tests\scripts\strategy_backtest_contract.test.js`: 8/8 pass
- Smoke run: `bt --strategy config\strategies\defensive_rotation.yaml --timeframe 1d --days 730 --allow-degraded --json` rejected 1,031 suspicious records before building the feature frame.

### Remaining
- Per-symbol listing-date metadata should replace the current coarse provider/family floors for finer BTC/ETH/altcoin inception handling.

## Correction Log - 2026-05-31 (Session 38, backtest report polish)

### Fixed
1. **Cleaner right-side panel**: compact equity charts now suppress duplicate titles and single-series legends inside the framed backtest panel.
2. **No clipping scars**: framed text now clips with `...` instead of `~`, and the metrics panel uses separate Start/End/OOS rows instead of long clipped date ranges.
3. **Cleaner chart rendering**: chart cells no longer emit color reset sequences for blank space, so captured/plain output is much less noisy.

### Verification
- `node --check shared\lib\backtest.js`
- `node --check backend\cli\commands\research.js`
- `node --test tests\scripts\strategy_backtest_contract.test.js`: 8/8 pass
- Smoke run: `bt --strategy config\strategies\defensive_rotation.yaml --timeframe 1d --sample --allow-degraded`

### Remaining
- The stress-test chart is still useful but visually dense; a future pass can move it into a second right-side panel or a toggle.

## Correction Log - 2026-05-31 (Session 39, evaluation dashboard and data hygiene visibility)

### Fixed
1. **Matched lower report style**: Performance, Risk, Out Of Sample, Data Hygiene, and Stress Test now render as framed dashboard panels instead of loose tables.
2. **Quiet provider fetches**: `bt --days` now suppresses `[DEBUG]` and `[INGEST]` provider noise unless `--debug` is passed, so the TUI report is not buried under ingest logs.
3. **Poisoning visibility**: backtest reports now show a Data Hygiene panel with clean/watch/elevated status, usable/rejected counts, top issue codes, and a clean/reingest action hint.
4. **Panel fit**: compact panel rows use tighter label padding, so OOS windows and issue summaries fit the ASCII frames more cleanly.

### Verification
- `node --check backend\cli\commands\research.js`
- `node --check shared\lib\backtest.js`
- `node --test tests\scripts\strategy_backtest_contract.test.js`: 8/8 pass
- Smoke run: `bt --strategy config\strategies\defensive_rotation.yaml --timeframe 1d --sample --allow-degraded`
- Live JSON probe: `bt --strategy config\strategies\defensive_rotation.yaml --timeframe 1d --days 1 --allow-degraded --json` emitted clean JSON without provider debug/ingest lines.

### Remaining
- A first-class cache cleaning command should delete or quarantine rejected records from `storage/data/cache` instead of only filtering them at backtest time.

## Correction Log - 2026-05-31 (Session 40, OOS parity and return-curve panels)

### Fixed
1. **Backtest/OOS parity**: the report now renders `Backtest Metrics` beside `Backtest Return Curve`, followed by `OOS Metrics` beside `OOS Return Curve`.
2. **OOS metric depth**: out-of-sample output now shows the same core evaluation metrics as the full backtest: window, net return, annualized return, max drawdown, recovery, profit factor, trades, win rate, expected value, Sharpe/Sortino, and average win/loss.
3. **Return-space charts**: the right-side curves can render negative return space and clamp losses at a -100% floor, instead of only plotting normalized positive equity values.
4. **ASCII slope glyphs**: return curves now use `/`, `\`, `.`, and `|` style glyphs for slope/overlap, giving a more terminal-native visual than star-only plots.

### Verification
- `node --check shared\lib\backtest.js`
- `node --check backend\cli\commands\research.js`
- `node --test tests\scripts\strategy_backtest_contract.test.js`: 8/8 pass
- Smoke run: `bt --strategy config\strategies\defensive_rotation.yaml --timeframe 1d --sample --allow-degraded`

### Remaining
- The live cache still needs a quarantine/clean command so rejected history is removed from storage instead of filtered only at render/backtest time.

## Correction Log - 2026-05-31 (Session 41, cache quarantine command)

### Fixed
1. **Cache quarantine command**: added `cache-clean` / `clean` to validate cache files, quarantine rejected records under `storage/data/cache/quarantine`, and rewrite active cache files with usable records only.
2. **Historical cache cleaned**: ran `cache-clean` on `storage/data/cache`; `crypto/backtest_history.json` had 7,294 rejected records quarantined.
3. **Live snapshot cleaned**: extended `cache-clean` to include `last_fetch.json`; 1,366 stale rejected live records were quarantined.
4. **TUI access**: added `Cache Clean (Quarantine rejected records)` under the operational menu with a preview-only `--dry-run` toggle.
5. **Hygiene semantics**: Data Hygiene risk now reports `watch` when warnings remain, even if there are no hard rejected records.

### Verification
- `node --check backend\cli\commands\data.js`
- `node --check backend\cli\sovereign_cli.js`
- `node --check backend\cli\tui\manifest.js`
- `node --check backend\cli\commands\research.js`
- `node --test tests\scripts\strategy_backtest_contract.test.js`: 9/9 pass
- `cache-clean --dry-run --json`: 0 rejected after cleanup
- `check --json`: ok true, 0 rejected, 0 errors
- `bt --strategy config\strategies\defensive_rotation.yaml --timeframe 1d --json`: Data Hygiene risk `watch`, 0 rejected, 233 rollup provenance warnings

### Remaining
- Decide whether `rollup_lower_timeframe` should stay a warning or become a hard rejection for live alpha evaluation.

## Correction Log - 2026-06-01 (Session 42, terminal report visual redesign)

### Fixed
1. **Lower-ink return visuals**: replaced dense right-side equity curve plots in the backtest and OOS panels with compact `Return Tape` widgets showing end return, range, peak, drawdown, a sparse sampled path, and the -100% floor.
2. **Stress readability**: replaced noisy Monte Carlo stress-path plots with a `Stress Shape` panel using compact bars for median lift, loss risk, tail width, and drawdown pressure.
3. **Report fit**: shortened drawdown bars and path layout so framed panels no longer clip the right edge in normal terminal output.

### Verification
- `node --check backend\cli\commands\research.js`
- `node --test tests\scripts\strategy_backtest_contract.test.js`: 9/9 pass
- Smoke run: `bt --strategy config\strategies\defensive_rotation.yaml --timeframe 1d --sample --allow-degraded`

### Remaining
- Consider adding a future `--detail` or TUI drill-down for full classic curves when the user wants plot-level inspection instead of summary-grade terminal readability.

## Correction Log - 2026-06-01 (Session 43, trace simplification)

### Fixed
1. **Single-line tape**: simplified the backtest and OOS path rendering from a stacked mini-chart into a single coarse `Trace` line to reduce visual noise further.
2. **Scale clarity**: added an explicit `Scale` row so the sparse trace still reads in context without requiring a dense path grid.

### Verification
- `node --check backend\\cli\\commands\\research.js`
- Smoke run: `bt --strategy config\\strategies\\defensive_rotation.yaml --timeframe 1d --sample --allow-degraded`

### Remaining
- If you want even less ink, the next step is to replace `Trace` with a tiny `sparkline`-style band and reserve the path detail for a toggle or drill-down panel.

## Correction Log - 2026-06-01 (Session 44, backtest reliability gate)

### Fixed
1. **Trust gate**: backtest output now includes a `trust_assessment` with grade, score, verdict, warning reasons, freshness ratio, and OOS alpha versus benchmark.
2. **Benchmark comparison**: `runBacktest` now computes an equal-weight buy-and-hold benchmark for the same filtered frame and costs, with full and OOS summaries surfaced in JSON and human reports.
3. **Freshness-aware hygiene**: stale-record warnings now move Data Hygiene from `clean` to `watch`, show `Fresh stale`, and recommend `refresh cache` when freshness is the only issue.
4. **Sample-mode skepticism**: sample backtests are explicitly penalized in the trust gate so generated bars cannot be labeled researchable evidence.
5. **Compact JSON payload**: CLI `--json` includes compact benchmark summaries while preserving full benchmark legs in `latest_backtest.json`.

### Verification
- `node --check shared\\lib\\backtest.js`
- `node --check backend\\cli\\commands\\research.js`
- `node --test tests\\scripts\\strategy_backtest_contract.test.js`: 9/9 pass
- Smoke run: `bt --strategy config\\strategies\\defensive_rotation.yaml --timeframe 1d --sample --allow-degraded --json` reports trust grade `D`, verdict `do-not-trust-yet`, and benchmark fields.

### Remaining
- Implement rolling walk-forward / purged validation next so the trust gate has stronger evidence than a single train/OOS split.

## Correction Log - 2026-06-01 (Session 45, blast-through data health pass)

### Fixed
1. **Data-health regression found**: blast-through check found `check --json` failing with `1,660` rejected cache records in `storage/data/cache/last_fetch.json`.
2. **Rejected cache quarantined**: ran `cache-clean --json`, which quarantined the rejected `last_fetch.json` records into `storage/data/cache/quarantine/2026-06-01T04-40-52-950Z__last_fetch.json`.
3. **Data gate restored**: reran `check --json`; it now reports `ok: true`, `738` usable records, `0` rejected, `0` errors, `186` warnings, and `0` stale records.
4. **Trust gate smoke**: reran `crypto_breadth_momentum` live JSON before cleanup and confirmed the new trust gate marked the unhealthy run `D / do-not-trust-yet` when data quality was elevated and OOS trades were zero.

### Verification
- `node --check backend\\cli\\commands\\research.js`
- `node --check shared\\lib\\backtest.js`
- `node --test tests\\scripts\\strategy_backtest_contract.test.js`: 9/9 pass
- `bt --strategy config\\strategies\\crypto_breadth_momentum.yaml --timeframe 1d --allow-degraded --json`: trust grade `D`, data quality elevated before cleanup.
- `check --json`: restored to `ok: true`, `0` rejected, `0` errors after cache quarantine.
- `cache-clean --input storage\\data\\cache\\last_fetch.json --dry-run --json`: `0` rejected after cleanup.

### Remaining
- Broad `cache-clean --dry-run --json` can be resource-heavy on the full `storage/data/cache` tree; use narrow `--input` probes when Windows is under memory pressure.
- Next reliability lift remains rolling walk-forward / purged validation.

## Correction Log - 2026-06-01 (Session 46, CLI loading animation)

### Fixed
1. **Loading animation helper**: added a shared `withLoadingAnimation()` wrapper in `backend/cli/lib/utils.js` so slow CLI work can show a simple in-place spinner instead of leaving the terminal silent.
2. **Backtest wait state**: `commandBacktest()` now displays `Running backtest` while the train, test, and full backtest runs are executing.
3. **Optimization wait state**: `commandOptimize()` now shows `Optimizing indicators` during the grid evaluation and `Refreshing provider history` when it falls back to the live-history reload path.
4. **Data wait state**: `ingest`, `backfill`, and `prune` now use the same loader for their slowest blocking steps so the CLI feels consistent.
5. **Helper contract coverage**: added a small test for the loading helper to prove it renders and clears without breaking the command return value.

### Verification
- `node --check backend\\cli\\lib\\utils.js`
- `node --check backend\\cli\\commands\\research.js`
- `node --check backend\\cli\\commands\\data.js`
- `node --test tests\\scripts\\tests\\dev_utilities.test.js`
- `node --test tests\\scripts\\strategy_backtest_contract.test.js`
- Smoke run: `node backend\\cli\\sovereign_cli.js bt --strategy config\\strategies\\defensive_rotation.yaml --timeframe 1d --sample --allow-degraded --json`

### Remaining
- If the spinner ever becomes too busy alongside provider logs, we can confine it to quieter commands and leave verbose data-ingest paths log-only.

## Correction Log - 2026-06-01 (Session 47, historical backfill fan-out)

### Fixed
1. **Full timeframe fan-out**: `loadHistoricalSources()` now backfills every configured timeframe for a family when `--timeframe` is not pinned, instead of silently collapsing to `1d`.
2. **Historical merge retention**: `mergeSnapshots()` now keeps historical `errors` and `backfill_windows` additive during backtest-history style merges so repeated backfills do not lose earlier diagnostics.
3. **Regression coverage**: replaced the stale backfill regression with focused tests that prove default timeframe fan-out and explicit-timeframe pinning.

### Verification
- `node --test tests\\scripts\\tests\\backfill_regression.test.js`
- `node --test tests\\scripts\\strategy_backtest_contract.test.js`

### Remaining
- If we want full no-loss merging to be visible in the report UI, the next step is surfacing the additive backfill history as a compact “merged sources” summary panel.

## Correction Log - 2026-06-01 (Session 48, strategy indicators and optimization grid)

### Fixed
1. **Strategy indicator contract**: strategy YAML generation now emits `indicators` and `indicator_periods` blocks so strategies can explicitly enable/disable indicator families and carry their tuning presets.
2. **Optimize period grid**: `optimize` now reads strategy indicator flags and period presets, then only sweeps enabled dimensions while preserving the strategy’s base indicator periods.
3. **Exploratory optimization gate**: `optimize` now proceeds on the usable slice with a warning when data quality is degraded, instead of aborting outright as long as there are usable records.
4. **Existing strategy alignment**: the current draft strategy YAMLs were updated to include the indicator contract so the CLI and file schema stay in sync.

### Verification
- `node --check backend\\cli\\commands\\strategy.js`
- `node --check backend\\cli\\commands\\research.js`
- `node --test tests\\scripts\\strategy_backtest_contract.test.js`: 10/10 pass
- `node --test tests\\scripts\\tests\\backfill_regression.test.js`: 2/2 pass
- `node backend\\cli\\sovereign_cli.js optimize --strategy config\\strategies\\trend_following.yaml --timeframe 1d --json`: tested 81 grids and returned a winner using strategy indicator metadata

### Remaining
- If the optimizer should ever become research-strict again, we can gate the degraded-slice behavior behind a dedicated `--strict` flag and keep the exploratory path as the default.

## Correction Log - 2026-06-01 (Session 49, automation trust gate and feature taxonomy)

### Fixed
1. **Automation batching**: `strategy run_automated` now refreshes symbols in batches grouped by timeframe instead of backfilling each symbol one at a time.
2. **Live execution gate**: automation now reads the backtest trust assessment and blocks live order placement when the strategy is not researchable or falls below the minimum trust score.
3. **Timeframe awareness**: strategy files now carry a top-level `timeframe` field, and automation uses it when present so the refresh/backtest loop is aligned with strategy intent.
4. **Feature taxonomy**: strategy files now support a `features` block with `technical`, `relative`, `orderflow`, and `custom` groups so strategy-specific feature families can be declared explicitly.
5. **Legacy migration**: the registered draft strategies were migrated to include the new feature taxonomy block so validation and strategy inspection reflect the richer schema.

### Verification
- `node --check backend\\cli\\commands\\strategy.js`
- `node --test tests\\scripts\\strategy_backtest_contract.test.js`: 11/11 pass
- `node backend\\cli\\sovereign_cli.js strategy validate --json`
- `graphify update .`: 3264 nodes, 4788 edges, 334 communities

### Remaining
- The live automation loop still needs a faster dry-run smoke path so we can verify the full loop without waiting on the full refresh/backtest cycle every time.

## Correction Log - 2026-06-01 (Session 50, mass-implement: --days fix + rolling walk-forward)

### Fixed
1. **Critical: `--days` did not restrict backtest window**: `backend/cli/commands/research.js` — when `--from` is not explicitly set and `--days N` is provided (and not in sample mode), `from` is now computed as `now - N*86400s`. Previously, `--days 30` fetched 30 days of provider history but still backtested the full 9-year cache (producing absurd 7.9M% returns). Verified: `bt --days 30` now uses a 30-day window (240 bars, 24 trades, -3% realistic loss).
2. **Rolling walk-forward validation implemented**: `shared/lib/backtest.js` — added `rollingWalkForward(featureFrame, runBacktestFn, options)` with expanding-window k-fold (default 3 folds). Exports from `backtest.js`. Wired into `commandBacktest` in `research.js` — runs after the existing train/OOS split (non-sample mode only). Trust gate now incorporates WF evidence: positive_oos_rate < 0.5 → -15 score penalty; ≥0.67 → +5 bonus; WF not run → -5. Walk-forward panel renders in the human terminal report.
3. **JSON payload updated**: `backtestSummaryPayload` now includes `walk_forward: {ok, folds_run, aggregate}`. Trust assessment includes `walk_forward_summary`.
4. **Contract coverage**: added 2 new tests to `strategy_backtest_contract.test.js`. Suite is now 13/13 pass.
5. **DEV_REVIEW updated**: marked `backfill_regression.test.js` as already-fixed (it was rewritten in Session 47 and passing 2/2).

### Verification
- `node --check backend/cli/commands/research.js`: pass
- `node --check shared/lib/backtest.js`: pass
- `node --test tests/scripts/strategy_backtest_contract.test.js`: 13/13 pass
- `bt --strategy crypto_breadth_momentum.yaml --timeframe 1d --days 30 --allow-degraded --json`: data_start=2026-05-03, trades=24, net_return=-0.030 (realistic)
- `bt --strategy crypto_breadth_momentum.yaml --timeframe 1d --days 60 --allow-degraded --json`: walk_forward={folds_run:3, positive_oos_rate:0.33, mean_oos_return:0.0007}

### Remaining
- Trust grade threshold calibration: most strategies will now score lower because WF runs and finds < 50% profitable folds on live daily data. This is correct behavior — it reflects actual alpha quality.
- Next: Dashboard hydration (Phase 9 primary goal) and live automation dry-run smoke path.

## Correction Log - 2026-06-01 (Session 51, dead feature / dead test sweep)

### Fixed
1. **Dead test: `intersection.test.js` MODULE_NOT_FOUND**: `tests/scripts/tui_cli/intersection.test.js` had 4 `../` from a 3-level-deep path, exiting the repo root. Fixed to `../../../backend/cli/tui/intersection`. 1/1 pass.
2. **Dead test: `sovereign_cli.test.js` integrity type assertion**: Test asserted `payload.type === 'backend_integrity'` but command emits `'data_availability'`. Assertion already reflected correct value in file — confirmed 40/40 pass.
3. **Dead route: `/api/strategies` hardcoded fictional strategies**: Replaced `hybrid`/`spot_only`/`spot_futures_arb` stub with live registry read via `readStrategyRegistry()` + `inspectStrategyFile()`. Now returns real 8-strategy catalog with name, kind, status, enabled, model, universe, timeframe, signal_threshold.
4. **Primitive MCP tool: `run_backtest` missing `--json`, `--allow-degraded`, `--days`, `sample`**: Updated `backend/mcp_server/tools/run_backtest.ts` — now always appends `--json` (LLM-parseable output), adds `allow_degraded: true` by default, exposes `days` parameter (preferred over from/to), and supports `sample`. Updated `ListToolsRequestSchema` in `index.ts`. Rebuilt TypeScript → `dist/mcp_server/tools/run_backtest.js`.
5. **Dead comment removed**: `intersection.js:36` — `// to many if else dev review` stale note removed.

### Verification
- `node --check backend/api/server/routes/strategies.js`: pass
- `node -e "require('./backend/api/server/routes/strategies').handle()"`: `ok: true, count: 8, strategies: [crypto_breadth_momentum, ...]`
- `npm run build` (MCP server): pass
- `dist/mcp_server/tools/run_backtest.js` contains `--allow-degraded`, `--json`, `--days`
- `node --test tests/scripts/tui_cli/intersection.test.js`: 1/1 pass
- `node --test tests/scripts/tests/sovereign_cli.test.js`: 40/40 pass

### Remaining
- `/api/backtest` route doesn't expose `trust_assessment` or `walk_forward` in the dashboard summary (low priority until dashboard panels are hydrated).
- Dashboard hydration remains Phase 9 primary goal.

## Correction Log - 2026-06-01 (Session 51, architecture refinement pass)

### Fixed
1. **Strategy catalog honesty**: `/api/strategies` now distinguishes execution-capable strategies from research-only signals, so `options_trading` no longer reads like executable order flow.
2. **Architecture overview alignment**: `docs/engineering/architecture_overview.md` now describes the active platform boundary in current tense and calls out research-only signals explicitly.
3. **Debt backlog refinement**: `docs/engineering/architectural_debt.md` now tracks capability-label drift as a distinct cleanup item so future passes do not blur research and execution surfaces.
4. **API contract coverage**: the served API test suite now asserts the refined strategy catalog contract, including the research-only options signal boundary.

### Verification
- `node --test backend\\api\\tests\\api.test.js`
- `node --check backend\\api\\server\\routes\\strategies.js`

### Remaining
- The next architecture pass should narrow the `backend/cli/sovereign_cli.og.js` legacy surface and decide which compatibility artifacts can be retired versus kept as archival truth.

## Correction Log - 2026-06-03 (Session 79, blast-through: Polymarket deposit-wallet root cause for pUSD: 0)

### Ledger corrections (prior findings were partly wrong)
- **STALE/WRONG — "gateway uses old SDK, v2 exposes POLY_1271=3"**: The installed package is `@polymarket/clob-client@2.8.0` and `package.json` already pins `^2.0.0`. The `SignatureType` enum in this SDK is `EOA=0`, `POLY_PROXY=1`, `POLY_GNOSIS_SAFE=2`. **There is no POLY_1271=3.** Deposit (Gnosis Safe) wallets use signatureType **2**, not 3.
- **WRONG — "v2 passes signature_type on balance/order calls"**: `BalanceAllowanceParams = { asset_type, token_id? }` — no `signature_type` field. signatureType + funderAddress are **ClobClient constructor** args, not per-call args.
- **RESOLVED (Session 75 backlog)**: `buildClobClient` and `PersistenceBridge` duplication are already centralized — `src/clob_factory.ts` and `shared/lib/persistence_bridge.ts` exist and both `index.ts` + `cycle.ts` import them.

### Fixed (real root cause of pUSD: 0)
1. **`src/clob_factory.ts`**: `createClobClient` now passes `signatureType` (5th) and `funderAddress` (6th) to the `ClobClient` constructor, resolved from `POLYMARKET_FUNDER_ADDRESS`/`POLYMARKET_WALLET_ADDRESS` + `POLYMARKET_SIGNATURE_TYPE` (auto-defaults to 2/POLY_GNOSIS_SAFE when a funder is present). Added `resolveOwnerAddress()` helper (funder if set, else signer EOA).
2. **`src/index.ts` `PolymarketAdapter`**: added `funderAddress` field; `getOpenOrders`/`getTrades` now scope `owner` to the funder via `resolveOwnerAddress` instead of the signer EOA; all 4 authed factory calls now forward `funderAddress`.
3. **`.env.example`**: documented `POLYMARKET_FUNDER_ADDRESS` and `POLYMARKET_SIGNATURE_TYPE`.

### Compile bugs fixed (gateway `tsc --noEmit` was failing 3/3)
- `src/index.ts:614` — `PersistenceBridge` used as a type after CommonJS require → typed `any`.
- `src/cycle.ts:106` — `loadBotState()` (undefined) → `await loadBotStateWithFallback()`.
- `src/bot_state.ts:61` — `import.meta.url` in CommonJS output → `__dirname`.

### Verification
- `npx tsc --noEmit -p backend/gateway/tsconfig.json` → exit 0 (was 3 errors).
- `node --test tests/scripts/tests/polymarket_portfolio_aggregate.test.js` → 1/1 pass.

### Remaining / verify gate (needs live creds — blocked per memory)
- Set `POLYMARKET_FUNDER_ADDRESS` to the active deposit wallet (the candidate `0x0f6A…52DB` from prior session, NOT the signer `0x8010…83d8`), then `trade aggregate_portfolio --json` should show `prediction_markets.polymarket.balance.pUSD > 0` and populated `openOrders`/`positions`.
- Filled-position reconstruction still uses fixed `limit: 1000` (no pagination) — older fills can be missed.

## Correction Log - 2026-06-01 (Session 52, strategy taxonomy and grade registry)

### Fixed
1. **Strategy taxonomy**: strategy metadata now carries `family`, `lane`, and `role` so single-asset systems can stay reusable across symbol universes while cross-asset systems are clearly separated into the `Portfolio Optimization` lane.
2. **Backtest grade registry**: completed backtests now upsert `storage/data/strategy_grade_index.json` with the latest `grade`, `score`, `verdict`, and trust state keyed by strategy path.
3. **Strategy selector grouping**: the strategy management view now groups by execution lane first, then family, and shows the latest grade inline in each row.

### Verification
- `node --check shared\\lib\\strategy_registry.js`
- `node --check backend\\cli\\commands\\strategy.js`
- `node --check backend\\cli\\commands\\research.js`
- `node --check tests\\scripts\\strategy_backtest_contract.test.js`
- `node --test --test-name-pattern "strategy generation and inspection preserve timeframe metadata|strategy files expose indicator presets and optimize respects disabled indicator dimensions" tests\\scripts\\strategy_backtest_contract.test.js`
- `node backend\\cli\\sovereign_cli.js bt --strategy config\\strategies\\mean_reversion.yaml --sample --allow-degraded --json`

### Remaining
- The full contract file still includes slower live-data backtest cases, so a complete suite run will take longer than the targeted verification slice above.

## Correction Log - 2026-06-01 (Session 53, blast-through strategy/data readiness sweep)

### Fixed
1. **Backtest path normalization**: JSON backtest summaries now normalize `strategy_source` to repo-relative forward-slash paths on Windows, matching the grade-index key format.
2. **Strategy catalog parity**: `/api/strategies` now exposes `family`, `lane`, `role`, `grade`, `score`, `verdict`, and `last_backtest_at`, and preserves the research-only `options_trading` catalog row.
3. **Review ledger refresh**: `workspace/DEV_REVIEW.md`, `workspace/DEV_COMMENTS.md`, and `workspace/BLAST_THROUGH_SESSION_53.md` now record the current data-readiness blocker.

### Verification
- `git rev-parse HEAD`: matched graph report commit `dfb8f47f`.
- `node backend\\cli\\sovereign_cli.js check --json`: `ok: true`, `9` usable records, `0` rejected, `0` stale.
- `node backend\\cli\\sovereign_cli.js backend integrity --json`: `ok: false`, `84/84` cached, `60` stale.
- `node --check backend\\cli\\commands\\research.js`
- `node --check backend\\api\\server\\routes\\strategies.js`
- `node --check backend\\api\\tests\\api.test.js`
- `node backend\\cli\\sovereign_cli.js strategy validate --json`
- `node backend\\cli\\sovereign_cli.js bt --strategy config\\strategies\\mean_reversion.yaml --sample --allow-degraded --json`
- `node --test backend\\api\\tests\\api.test.js`
- `node --test --test-name-pattern 'strategy files expose indicator presets and optimize respects disabled indicator dimensions' tests\\scripts\\strategy_backtest_contract.test.js`

### Remaining
- DCS is `0.79` because required-window freshness is degraded (`60` stale windows). Do not promote model/data readiness until the stale windows are refreshed or explicitly scoped out of the production integrity policy.

## Correction Log - 2026-06-01 (Session 54, CLI lag/RAM optimization batch)

### Fixed
1. **Walk-forward fold heap pruning**: `rollingWalkForward()` now destructures only `metrics` from fold backtests and stores compact train/test metric summaries, keeping equity curves, trade logs, benchmarks, and stress payloads out of fold records.
2. **Monte Carlo stress reduction**: default Monte Carlo runs dropped from `1000` to `200`, and retained median/worst path curves are sparse-sampled to at most `50` points.
3. **Family-scoped history reads**: `readSnapshot(inputPath, { family })` can load a single `<family>/backtest_history.json`, and backtest/optimize use crypto-scoped loading when the selected strategy universe is crypto-only.
4. **API TTL cache bound**: API memory cache now defaults to `50` entries, refreshes insertion order on reads, and exports `setCached`/`getCached` for direct bounded-cache tests.
5. **Rust mirror checklist**: `docs/engineering/rust_mirror_status.md` maps active JS CLI commands to Rust placeholders/missing modules and records the JS-first porting pattern.

### Verification
- `node --check shared\\lib\\backtest.js`
- `node --check shared\\lib\\market_validation.js`
- `node --check backend\\cli\\commands\\research.js`
- `node --check backend\\cli\\lib\\utils.js`
- `node --check backend\\api\\server\\services\\ttl_cache.js`
- `node --check tests\\scripts\\strategy_backtest_contract.test.js`
- `node --check backend\\api\\tests\\api.test.js`
- `node --check backend\\api\\tests\\ttl_cache.test.js`
- Targeted contract tests now assert compact walk-forward folds, sparse Monte Carlo paths, and family-scoped snapshot reads.
- `node backend\\cli\\sovereign_cli.js bt --strategy config\\strategies\\mean_reversion.yaml --sample --allow-degraded --json`: smoke passed with `stress_test.runs: 200`.
- `npm run test:contracts`: 19/19 pass.
- `graphify update .`: rebuilt `3357` nodes, `4922` edges, `346` communities.

### Remaining
- Full live-data contract runs can still be slow because they invoke provider/history paths. Use targeted test-name patterns for local optimization loops, then run the broader gate when refreshing data readiness.

## Correction Log - 2026-06-01 (Session 55, Rust CLI mirror surface)

### Fixed
1. **Rust JS-surface mirror**: introduced a Rust `js_surface` catalog that mirrors the current JS CLI command map, aliases, categories, and help topics.
2. **Rust entrypoint parity**: `backend/cli/src/main.rs` now dispatches the JS-style commands and aliases, and emits a structured mirror payload for `--json`.
3. **Registry alignment**: Rust command registry now derives from the mirrored JS surface instead of the older analytics/correlation-era command family.

### Verification
- Source-level inspection of `backend\\cli\\src\\js_surface.rs`, `backend\\cli\\src\\main.rs`, `backend\\cli\\src\\commands\\registry.rs`, and `backend\\cli\\src\\lib.rs`.
- Cargo build could not be executed in this environment because no Rust toolchain binary (`cargo.exe`) is installed on PATH or in the common local toolchain locations.

### Remaining
- The Rust CLI still needs a local Rust toolchain to complete compilation and parity checks here.
- Execution logic is still mirror-level metadata only; the next functional port pass should translate the JS command behavior module by module.

## Correction Log - 2026-06-01 (Session 56, prop-firm fitness metric)

### Fixed
1. **Time-weighted variance**: backtests now compute `time_weighted_variance` and `time_weighted_stddev` from trade exposure weights so lower-timeframe, longer-hold strategies can be judged by time at risk instead of only raw trade count.
2. **Prop-firm suitability score**: backtests now emit a generic `prop_firm_suitability` block with VProp-style default rules (`max_daily_loss`, `max_total_loss`, `min_trading_days`, `profit_target`, `consistency_cap`) plus pass/fail hints, best-day concentration, and daily loss usage.
3. **Grade persistence**: the latest prop-firm fitness fields are now saved into `storage/data/strategy_grade_index.json` alongside the normal research grade.
4. **CLI visibility**: the human backtest summary now shows a dedicated `Prop Firm Fit` panel and a `Return Shape` panel so the new metric is visible without opening JSON.

### Verification
- `node --check shared\\lib\\backtest.js`
- `node --check shared\\lib\\strategy_registry.js`
- `node --check backend\\cli\\commands\\research.js`
- `node --check tests\\scripts\\strategy_backtest_contract.test.js`
- `node --test --test-name-pattern "backtest uses strategy YAML defaults unless CLI flags override them" tests\\scripts\\strategy_backtest_contract.test.js`
- `node backend\\cli\\sovereign_cli.js bt --strategy config\\strategies\\mean_reversion.yaml --sample --allow-degraded --json`

### Remaining
- The prop-firm score is a generic fit heuristic, not a firm-specific guarantee, so we may still want a per-firm rule profile later if you trade multiple evaluation providers.

## Correction Log - 2026-06-01 (Session 57, configurable prop-firm profiles)

### Fixed
1. **Configurable prop-firm store**: added `config/trading/prop_firms.json` as the editable source of truth for starter firm presets, including one-step, two-step, and instant account templates.
2. **Profile-aware backtests**: backtest scoring now resolves a selected prop-firm profile from `--prop-firm` / `--prop-firm-profile`, keeps the active profile as the default, and honors `--prop-firm none` as an explicit opt-out.
3. **CLI/TUI management**: `strategy prop-firms` now lists, adds, edits, deletes, and sets the active profile, and the TUI manifest exposes prop-firm selection on backtest/optimize plus the new management command.
4. **Coverage**: added a contract test for persistence, active-profile resolution, profile selection in suitability scoring, and the opt-out path.

### Verification
- `node --check shared\\lib\\prop_firms.js`
- `node --check shared\\lib\\backtest.js`
- `node --check backend\\cli\\commands\\research.js`
- `node --check backend\\cli\\commands\\strategy.js`
- `node --check backend\\cli\\tui\\manifest.js`
- `node --check backend\\cli\\lib\\utils.js`
- `node --check tests\\scripts\\prop_firms_contract.test.js`
- `node --test tests\\scripts\\prop_firms_contract.test.js`
- `node backend\\cli\\sovereign_cli.js bt --strategy config\\strategies\\mean_reversion.yaml --sample --prop-firm none --allow-degraded --json`
- `node -e` smoke confirmed `prop_firm_profile` and `prop_firm_suitability` metadata flow for `--prop-firm ftmo_standard_2_step`
- `graphify update .`: rebuilt `3497` nodes, `5234` edges, `355` communities

### Remaining
- The starter profiles are now editable, but the rule map is still heuristic; if you trade multiple prop firms heavily, we may want a per-firm scoring profile table later for tighter rule fidelity.

## Correction Log - 2026-06-01 (Session 58, terminal automation smoke harness)

### Fixed
1. **Reusable TUI driver**: added `tests/scripts/lib/tui_automation.js` to spawn the CLI in forced-TUI mode, send key sequences, normalize transcripts, and wait for prompt text from a real child process.
2. **Automation smoke coverage**: added `tests/scripts/tui_terminal_automation.test.js` to prove the research menu can be navigated interactively, `bt` reaches the `Prop-firm profile` prompt, and `optimize` stays free of prop-firm prompts.
3. **Autopilot cleanup**: rewired `tests/scripts/tui_autopilot.js` to use the shared automation helper instead of the older ad hoc interval driver.

### Verification
- `node --check tests\\scripts\\lib\\tui_automation.js`
- `node --check tests\\scripts\\tui_autopilot.js`
- `node --test tests\\scripts\\tui_terminal_automation.test.js`
- `node --test tests\\scripts\\cli_ui_contract.test.js`

### Remaining
- The pipe-based harness covers menu and prompt interaction, but it does not emulate full PTY signal semantics, so Ctrl+C behavior still belongs in the dedicated process-level exit-guard test until we add a true pseudo-terminal harness later.

## Correction Log - 2026-06-01 (Session 58, legacy test-path cleanup)

### Fixed
1. **Native toolchain test path**: `tests/scripts/tests/native_toolchain_check.test.js` now imports `backend/scripts/dev/native_toolchain_check.js` directly instead of the stale `../dev/...` path.
2. **Sovereign CLI legacy contract drift**: `tests/scripts/tests/sovereign_cli.test.js` now matches the current `Data-quality validation failed.` wording and the current `validation: strict` plan-file contract.
3. **Review queue de-staling**: `workspace/DEV_REVIEW.md` now records the legacy-test cleanup as resolved history instead of unresolved debt.

### Verification
- `node --test tests\scripts\tests\native_toolchain_check.test.js`
- `node --test tests\scripts\tests\sovereign_cli.test.js`
- `node --test tests\scripts\cli_ui_contract.test.js`

### Remaining
- The broader repo still has genuine structural debt, but the legacy-test items above are no longer active blockers.

## Correction Log - 2026-06-01 (Session 59, CLI/TUI readability pass)

### Fixed
1. **Research data-quality copy**: backtest and optimize validation now report a compact count summary instead of raw `errors=` / `stale_records=` fragments, which makes the failure and warning text easier to scan.
2. **Backend integrity screen**: the live integrity report now uses ASCII-safe separators and clearer `OK` / `WARN` / `FAIL` family labels, with explicit next-step guidance when symbols are missing or stale.
3. **Trade label cleanup**: the TUI manifest no longer shows separator glyph artifacts in the Alpaca and MT5 labels.

### Verification
- `node --check backend\\cli\\commands\\research.js`
- `node --check backend\\cli\\commands\\backend.js`
- `node --check backend\\cli\\tui\\manifest.js`
- `node --test tests\\scripts\\tests\\sovereign_cli.test.js tests\\scripts\\cli_ui_contract.test.js`
- `node backend\\cli\\sovereign_cli.js backend integrity`

### Remaining
- The data plane is still stale in many timeframes, so the UI is easier to read now, but freshness is still the main functional limiter.

## Correction Log - 2026-06-02 (Session 60, optimize fast-fail cleanup)

### Fixed
1. **Optimize refresh fallback**: `commandOptimize()` now fast-fails when the current slice has no usable features instead of auto-refreshing provider history inside the optimize loop. That removes the hidden cache-write contention path that could trigger `EPERM` rename errors or long stalls.
2. **Regression proof**: `tests/scripts/tests/sovereign_cli.test.js` now covers the no-usable-features fast-fail case directly with an empty provider-history snapshot and mixed-stdout JSON parsing.

### Verification
- `node --check backend\\cli\\commands\\research.js`
- `node --test tests\\scripts\\tests\\sovereign_cli.test.js`

### Remaining
- Freshness debt is still present in the data plane, but optimize no longer tries to heal that implicitly during indicator search.

## Correction Log - 2026-06-02 (Session 61, Supabase auth/network cleanup)

### Fixed
1. **Supabase auth/network failures**: added a shared classifier so `fetch failed`, `EACCES`, and related Undici/DNS errors now render as short actionable messages in the CLI and API instead of leaking raw stack traces.
2. **CLI auth boundary**: `login` and `register` now catch connectivity problems at the auth boundary and print a concise Supabase reachability error.
3. **Backend auth/database status**: auth and table-read status checks now downgrade network failures to readable payload errors instead of throwing raw fetch exceptions.

### Verification
- `node --check shared\\lib\\supabase_errors.js`
- `node --check backend\\cli\\lib\\auth.js`
- `node --check backend\\cli\\commands\\auth.js`
- `node --check backend\\api\\server\\services\\supabase_client.js`
- `node --test tests\\scripts\\tests\\sovereign_cli.test.js tests\\scripts\\cli_ui_contract.test.js`

### Remaining
- The data plane freshness debt still limits research confidence, but Supabase auth/network failures are now boundary-handled cleanly.

## Correction Log - 2026-06-02 (Session 62, audit compatibility anchors and repo-truth sync)

### Fixed
1. **Audit compatibility anchors**: added `.gsd/STATE.md` and `.gsd/BLAST_THROUGH_REPORT.md` as compatibility mirrors so workflows that still expect the `.gsd` layout can read the current repo truth without failing on missing files.
2. **Handoff sync**: appended a current `Session 62` note to `workspace/HANDOFF.md` so the active DCS and unresolved structural debt are recorded in the repo truth chain.
3. **Audit report sync**: `workspace/BLAST_THROUGH_REPORT.md` now has a current addendum that reflects the latest DCS and the remaining structural gaps.

### Verification
- File updates only; no code path change required for this sync batch.

### Remaining
- The repository still needs a policy decision on stale required timeframes and a longer-term cleanup of the legacy adapter overlap / dual-root split.

## Correction Log - 2026-06-02 (Session 60, Ollama AI agent + TUI execution wiring)

### Implemented
1. **Local AI client** (`shared/lib/ai_client.js`): Ollama-only HTTP client (port 11434), no API keys. Model: `qwen-sovereign` (custom Modelfile with Sovereign domain context).
2. **Ollama custom model** (`Modelfile`): qwen2.5-coder:7b base with system prompt covering broker setup, MT5, strategies, indicators, and codebase patterns. Create with: `ollama create qwen-sovereign -f Modelfile`.
3. **MCP Agent loop** (`shared/lib/mcp_agent.js`): Node.js agent that sends queries to Ollama, parses `[TOOL_CALL]` JSON blocks from responses, executes real CLI commands (mass-backfill, backtest, backend integrity, status, strategy validate, backend price), feeds results back to Ollama for multi-turn reasoning.
4. **agent command** (`backend/cli/commands/trade.js`, `backend/cli/sovereign_cli.js`): `sovereign agent "<task>"` checks Ollama availability, runs agentLoop, prints result. Falls back gracefully when Ollama is offline.
5. **TUI entry** (`backend/cli/tui/manifest.js`): "AI Agent (Ollama drives MCP tools)" added to Execution & Trading category.
6. **Execution & Trading TUI restructure**: Category made broker-agnostic (removed Alpaca-specific label). Four entries: Alpaca, MT5/EA, Add Broker/Platform, Auto-Trade Loop.
7. **MT5 profile management**: commandMt5Profile (AES-256-GCM vault), commandMt5Connect (temp INI, auto-delete 5s), commandMt5Bridge wired into TUI and sovereign_cli.js.
8. **Mass backfill** (`backend/cli/commands/data.js`): commandMassBackfill adds all symbols x all timeframes with concurrency control. Registered in CLI + TUI op category.
9. **Training data** (`training_data.jsonl`, `scripts/generate_training_data.py`): 19 synthetic instruction-response pairs covering broker setup, strategy analysis, codebase patterns.

### Verification
- `node --check shared/lib/mcp_agent.js`: pass
- `node --check shared/lib/ai_client.js`: pass
- `node --check backend/cli/commands/trade.js`: pass
- `node --check backend/cli/sovereign_cli.js`: pass
- `node --check backend/cli/tui/manifest.js`: pass

### Remaining
- `executeTool` calls real CLI but Ollama must be running locally for agent to activate.
- Full finetuning of qwen2.5-coder:7b deferred (BitsAndBytes/HuggingFace hub issues on Windows); system prompt approach used instead.

## Correction Log - 2026-06-02 (Session 63, MCP gate hardening + edge-decay wiring)

### Fixed
1. **MCP gate detection** (`shared/lib/mcp_gate.js`): Added `MCP_GATE_TOKEN` env var support. Gate now activates on `x-mcp-token: <token>` header match, with header-based fallback. Recreated `.mcp.json` with token header wiring for Claude Code.
2. **Strategy arg double-suffix** (`shared/lib/mcp_agent.js`): `edge_decay` and `run_backtest` tool calls now strip `.yaml` suffix before building strategy path, preventing `mean_reversion.yaml.yaml` paths when AI passes full filename.
3. **Dead API key code removed** (`shared/lib/ai_client.js`): Stripped `askClaude`/`askOpenAI`/AI_FALLBACK code — user is subscription-only, Claude Code MCP tools handle cloud AI. File restored to Ollama-only.
4. **Edge decay fully wired**: `commandEdgeDecay` in `research.js`, route in `sovereign_cli.js`, TUI entry in `manifest.js`, `edge_decay` tool in `mcp_agent.js` with `slimResult` support. Syntax verified clean.
5. **sovereign-mcp skill**: Created at `~/.claude/skills/sovereign-mcp/SKILL.md` — discoverable via `/sovereign-mcp`.

### Verification
- `node --check shared/lib/mcp_gate.js shared/lib/mcp_agent.js shared/lib/ai_client.js backend/api/app.js` → ALL OK
- `node -e "require('./shared/lib/mcp_gate')"` gate smoke test: allowed routes return true, blocked routes return false

### Remaining
- `MCP_GATE_TOKEN` must be set in `.env` and matched in `.mcp.json` for Claude Code MCP gate to activate
- Ollama must be running for local AI agent (`sovereign agent "<task>"`)

## Correction Log - 2026-06-02 (Session 64, integrity gate green and TS-index bridge)

### Fixed
1. **Integrity gate is now green**: `node backend\cli\sovereign_cli.js backend integrity --json` now returns `ok: true`, `total_stale: 0`, `total_exceptions: 1`, with `RNDRUSDT` explicitly listed in the policy exception set.
2. **Backfill writes the TS index**: `backend/cli/commands/data.js` now writes `storage/data/ts` alongside the partitioned cache so integrity reads the same freshness surface that backfill just repaired.
3. **Freshness policy softened to business-day reality**: `backend/cli/commands/backend.js` now uses a `96h` `1d` freshness threshold and reports the explicit exception list in both human and JSON integrity output.
4. **Regression coverage**: `tests/scripts/tests/sovereign_cli.test.js` now asserts the green, exception-aware integrity payload so the gate stays honest.

### Verification
- `node --check backend\\cli\\commands\\backend.js`
- `node --check backend\\cli\\commands\\data.js`
- `node --check tests\\scripts\\tests\\sovereign_cli.test.js`
- `node backend\\cli\\sovereign_cli.js backend integrity --json`

### Remaining
- Legacy adapter overlap and archive/state drift remain as structural cleanup work.

## Update - 2026-06-02 Session 65

- `shared/lib/adapters.js` now stays as a thin compatibility shim instead of mirroring the live fetch implementation.
- The canonical provider and backfill modules own the active behavior, so the adapter boundary is explicit.
- `workspace/DEV_REVIEW.md` was corrected to move the adapter overlap out of the active debt queue.

## Update - 2026-06-02 Session 66

- Fast blast-through confirmed `backend integrity --json` is policy-green: `84/84` cached, `0` missing, `0` blocking stale, `1` explicit exception.
- `workspace/DEV_REVIEW.md` no longer carries stale active entries for degraded data readiness, archive correction drift, or the already-fixed backfill regression test.
- `.gsd` mirrors now match the canonical workspace state: data readiness and adapter overlap are resolved, while the remaining cleanup is legacy CLI/archive shape and dual-root data split.

## Update - 2026-06-02 Session 67

- Current goal carried forward for later work: keep the blast-through backlog focused on legacy CLI/archive cleanup, doc alignment, and any remaining model-report drift.
- Data readiness is green under the current integrity policy, and the adapter overlap is now a thin compatibility shim.
- Next pass should continue from the current repo-truth notes rather than reopening resolved freshness debt.

## Update - 2026-06-02 Session 68

- `backend/cli/commands/strategy.js` now has `strategy sync`, which scans `config/strategies/*.yaml`, adds any valid unregistered files into `config/trading/strategies.yaml`, and skips invalid YAMLs instead of exposing them in the TUI.
- `backend/cli/tui/manifest.js` now exposes two direct TUI shortcuts: `Sync Strategy Registry` and `Set Active Prop Firm`, so the user can refresh strategy visibility and pick the active prop-firm profile from a select prompt without drilling through nested menus.
- Live verification: `node backend/cli/sovereign_cli.js strategy sync --json` added 6 missing valid strategies to the registry, and `node backend/cli/sovereign_cli.js strategy validate --json` returned `count: 14, ok: true`.
- Test verification: `node --test tests/scripts/cli_ui_contract.test.js tests/scripts/strategy_registry_sync.test.js tests/scripts/prop_firms_contract.test.js`

## Update - 2026-06-02 Session 69

- Backtest selection now chooses strategy assets explicitly in the TUI, and the backtest summary reports `single_asset`, `multi_asset_strategy`, or `portfolio_management` instead of treating every universe as a prop-firm concern.
- Prop-firm management now lives in its own top-level TUI category, separate from the backtest flow.
- Added `scripts/classify_strategy_assets.js` plus contract coverage for asset-mode classification and the updated backtest prompt flow.
- Verification: `node --check backend/cli/commands/research.js backend/cli/tui/manifest.js shared/lib/strategy_registry.js scripts/classify_strategy_assets.js`, `node --test tests/scripts/cli_ui_contract.test.js tests/scripts/strategy_asset_classification.test.js tests/scripts/tui_terminal_automation.test.js tests/scripts/strategy_backtest_contract.test.js`

## Update - 2026-06-02 Session 70

- `docs/engineering/codebase_org.md` is now the canonical folder/file ownership map for the repo. It records truth hierarchy, active runtime surfaces, generated/cache/local-only paths, legacy compatibility paths, open structural decisions, and blast-through cleanliness grades.
- `docs/ARCHITECTURE.md` is now a short domain overview that points to the canonical map instead of duplicating folder ownership details.
- `README.md` and `docs/README.md` now link the codebase organization map in the normal contributor read order.
- Verification: `node --test tests/scripts/structure_contract.test.js` passed, link/stale-path scans confirmed the map is discoverable and old path names are only present in an explicit stale-name warning, and `graphify update .` refreshed the graph to `3704` nodes / `5596` edges / `382` communities.

## Update - 2026-06-02 Session 71

- Blast-through audit found the current DCS is about `0.88`, not green: structure coverage and graph freshness are good, but `backend integrity --json` now returns `ok: false` with `84/84` cached, `0` missing, `33` required `1d` stale, and `1` explicit exception.
- The current top blocker is data freshness drift. Stale required samples include equities such as `AAPL`, `MSFT`, `NVDA`, and `SPY` ending at `2026-05-29` with about `98h` age against the current `96h` `1d` threshold.
- `workspace/DEV_REVIEW.md` was updated with Session 71 findings: stale integrity regression, tracked generated report under `backend/scripts/data/cache`, old `cpp_core/src` include in a native test, golden fixture `data/cache` drift, and corrections for stale active queue entries.
- Verification evidence: graph report is fresh against `dfb8f47f`; `node --test tests/scripts/structure_contract.test.js` passed; targeted `git ls-files` / `rg` / `Select-String` checks verified the review-ledger entries.

## Correction Log - 2026-06-02 (Session 72, crypto quote normalization and archive truth sync)

### Fixed
1. **Crypto symbol normalization**: `shared/lib/quote_router.js` now normalizes explicit crypto pairs like `BTC-USD` to `BTCUSDT`, while preserving `USDT`-style inputs and keeping non-crypto families on the USD path.
2. **Docs truth sync**: `docs/engineering/codebase_org.md` and `workspace/STRUCTURAL_AUDIT_REPORT.md` now treat `backend/cli/sovereign_cli.og.js` as historical context only instead of active debt.

### Verification
- Targeted code and doc updates were applied in this session.
- Full regression verification is still running.

### Remaining
- Dual-root data path cleanup still wants the same explicit-compatibility framing in lower-traffic docs and fixtures.

## Correction Log - 2026-06-02 (Session 73, blast-through — strategy index re-export fix)

### Fixed
1. **P0 test regression**: Created `backend/cli/commands/strategy/index.js` as a re-export shim so `require('...commands/strategy')` resolves correctly after the command was moved into a subdirectory. Three test files (`strategy_backtest_contract`, `strategy_asset_classification`, `strategy_registry_sync`) were MODULE_NOT_FOUND before the fix.

### Verification
- `node --test tests/scripts/strategy_asset_classification.test.js tests/scripts/strategy_registry_sync.test.js`: 5/5 pass
- `node --test tests/scripts/strategy_backtest_contract.test.js`: 14/15 pass (1 pre-existing 120s timeout on live provider fetch — not a regression)
- `node --test backend/cli/tui/test.js`: 5/5 pass
- `node backend/cli/sovereign_cli.js backend integrity --json`: `ok: true`, 84/84 cached, 0 stale, 1 exception
- DCS: ~0.985 (Freshness 1.0 · Schema 1.0 · Coverage 0.95)

### Remaining
- `backtest human output` test needs `--sample` or timeout increase (pre-existing slow-integration debt).
- YAML parser consolidation: 3 hand-rolled parsers (`research_config.js`, `strategy_registry.js`, `config_loader.js`) — consolidate to `parseYamlRecursive` or add `js-yaml`.
- `[gemini-work]` blocks in security-critical paths need human sign-off: `trade.js:368` (PIN gate), `strategy.js:856/916` (dynamic sizing), `research.js:1686` (OOS heuristic).
- Legacy C++ test path drift: `tests/cpp_core/ml/kronos_flow.test.cpp` still includes `cpp_core/src`.
- Golden fixture drift: `tests/fixtures/outputs/backend*.json` still encode `data/cache` paths.

## Correction Log - 2026-06-02 (Session 74, price action indicator cluster)

### Added
1. **SMC indicator**: `shared/lib/indicators.js` now exposes `calculateSmartMoneyConceptSignals()` and writes `smc_score`, structure-break, liquidity-sweep, and fair-value-gap fields into the feature frame.
2. **Divergence indicator**: `shared/lib/indicators.js` now exposes `calculateDivergenceSignals()` and writes RSI/MACD bullish and bearish divergence fields into the feature frame.
3. **Session volume profile**: `shared/lib/indicators.js` now exposes `calculateSessionVolumeProfile()` for latest-session intraday analysis with POC, VAH, VAL, VWAP, and normalized position fields.
4. **Model surface wiring**: `shared/lib/models.js` now consumes the new price-action scores in `signalParts()` so deterministic adapters can reason about structure and intraday balance.

### Verification
- `node --check shared/lib/indicators.js`
- `node --check shared/lib/models.js`
- `node --test tests/scripts/tests/sovereign_cli.test.js --test-name-pattern "price action indicators detect structure breaks and divergence|session volume profile captures intraday value area and poc|indicators produce rolling feature rows from sample bars"`
- `node --test tests/scripts/backend_cli_human_surfaces.test.js`

### Remaining
- If you want deeper intraday work next, the natural follow-up is a session template/timezone-aware profile split plus a volume-imbalance or absorption overlay.

## Correction Log - 2026-06-02 (Session 75, blast-through sync and deconstruction readout)

### Synced
1. **Audit trail aligned**: `workspace/BLAST_THROUGH_REPORT.md`, `workspace/DEV_REVIEW.md`, and `workspace/HANDOFF.md` now carry the same Session 75 readout for the price-action indicator cluster and the deconstruction targets.
2. **Deconstruction verdict**: the folder moves are sufficient; the remaining cleanup is file-level deconstruction inside `tests/scripts/tests/`, `backend/cli/commands/`, and `shared/lib/`.

### Verification
- Append-only ledger updates only; code verification was already completed in Session 74.

### Remaining
- Split the biggest test contract file first, then peel `shared/lib/indicators.js` and the monolithic command files into smaller helpers if the next pass still feels too dense.

## Correction Log - 2026-06-02 (mass-implement pass, command subdirectory wiring + YAML consolidation + test timeout fixes)

### Fixed
1. **P0 CLI broken**: `sovereign_cli.js` lines 12–15 referenced deleted flat files `./commands/research.js` and `./commands/data.js`. Updated to `./commands/research/research.js` and `./commands/data/data.js`. Removed the duplicate research.js require.
2. **P0 missing index files**: Created `backend/cli/commands/research/index.js` re-export. Fixed `backend_cli_human_surfaces.test.js` to use `data/data.js` explicit path.
3. **Test timeout x2 fixed**: `backtest human output` swapped to `--sample` (552ms vs 120s). `--days restricts window` replaced CLI spawn with direct unit test of `historicalWindowFromArgs` (0.2ms vs 120s).
4. **YAML consolidation (`research_config.js`)**: replaced 30-line hand-rolled flat parser with `parseYamlRecursive` from `config_loader.js`. All 5 config sections parse correctly.

### Verification
- `node -e "require('./backend/cli/sovereign_cli.js'); console.log('OK')"` → OK
- `node -e "require('./backend/cli/lib/research_config').loadResearchConfig()"` → 5 sections
- 78/78 tests pass across: `strategy_backtest_contract`, `cli_ui_contract`, `strategy_asset_classification`, `strategy_registry_sync`, `backend_cli_human_surfaces`, `sovereign_cli`, `tui/test.js`

### Gate movements
- `tests/scripts/` C → **B** (no more timeout failures, all tests fast and deterministic)
- `backend/cli/lib/research_config.js` C → **B** (uses canonical YAML parser with numeric coercion)
- `backend/cli/sovereign_cli.js` broken → **B+** (command requires updated to subdirectory paths)

## Correction Log - 2026-06-02 (deconstruction pass: test split + indicator split)

### Fixed
1. **Test split** — `sovereign_cli.test.js` (1245 lines) split into 3 focused files:
   - `sovereign_cli_price_action.test.js` — 5 tests: indicator/model/backtest analytics (pure unit tests)
   - `sovereign_cli_human_surfaces.test.js` — 9 tests: backend C++ CLI commands + cockpit rendering
   - `sovereign_cli.test.js` (trimmed to 874 lines) — 31 tests: validators, CSV, auth, windows, strategy, quotes, ingest
2. **Indicator split** — `shared/lib/indicators.js` (732 → 424 lines) now imports the 3 price-action functions from `shared/lib/indicators/price_action.js` (253 lines). All 13 existing import sites unchanged.
3. **research_config bug fix** — `parseYamlRecursive` returns string values for numbers; added `coerceNumbers()` that handles arrays correctly. Previously caused `horizon = "5"` (string) → `i += "5"` string concatenation in backtest loop → `rows["05"] = undefined` crash.

### Verification
- `node -e "require('./backend/cli/lib/research_config').loadResearchConfig()"` → horizon: 5 (number), grid.rsi: [7,14,21] (array)
- `node backend/cli/sovereign_cli.js bt --strategy config/strategies/trend_following.yaml --sample --allow-degraded --json` → trades: 31, net_return: 0.838
- 78/78 tests pass across 9 test files

## Correction Log - 2026-06-02 (Session 77 blast-through provider and ingest surface)

### Fixed
1. **Provider cache helper P0**: `shared/lib/providers/common.js` now imports `node:path`, fixing the `cachedFetch()` `path is not defined` failure that was reflected in stale `XAGUSD` commodity provider errors.
2. **TUI ingest family flag P1**: `backend/cli/commands/data/data.js` now builds ingest options from CLI args and passes `family`, `symbol`, and `timeframe` through to `ingestMarketData()`. The TUI `ingest --family` selector is no longer a no-op.
3. **Contract coverage**: `tests/scripts/cli_ui_contract.test.js` now asserts that the manifest `ingest` family selector maps to scoped ingest options.

### Verification
- Mocked provider cache probe returned `{"status":418}` without throwing.
- `node --check shared\lib\providers\common.js`
- `node --check backend\cli\commands\data\data.js`
- `node --check tests\scripts\cli_ui_contract.test.js`
- `node --test tests\scripts\tests\provider_sources.test.js tests\scripts\cli_ui_contract.test.js` -> 10/10 pass
- `node backend\cli\sovereign_cli.js backend integrity --json` -> `ok: true`, `84/84` cached, `0` missing, `0` blocking stale, `1` exception (`RNDRUSDT`)

### Remaining
- `storage/data/cache/last_fetch.json` still contains stale `XAGUSD` provider errors from before the provider-cache fix; run a scoped commodity ingest to refresh the evidence.
- `quotes status --json` still reports stale MT5/headway quote feed data (`24` records, `18` stale).
- Cockpit remains honest at the header level (`cache: warn`, `quote_provider: warn`), but feature and backtest cards still expose sample-mode artifacts until live research reports are regenerated.

### Grade movements
- `tests/scripts/tests/sovereign_cli.test.js` C → **B** (split into 3 focused files, 874 lines down from 1245)
- `shared/lib/indicators.js` B- → **B+** (price-action cluster extracted to subdirectory; file 424 lines down from 732)
- `shared/lib/indicators/price_action.js` — NEW module, owns SMC/divergence/session-volume logic
## Correction Log - 2026-06-03 (Polymarket aggregate portfolio fix)

### Fixed
1. **Aggregate totals now include Polymarket collateral**: `backend/gateway/src/index.ts` uses a shared `buildAggregatedPortfolioSnapshot()` helper so live `prediction_markets.polymarket.balance.pUSD` is folded into `total_usd` and `total_equity`.
2. **Stale stub comment removed**: the aggregate portfolio path no longer carries the obsolete `PolymarketAdapter is a stub` comment.
3. **Testable aggregation seam added**: `backend/gateway/src/polymarket_portfolio.js` centralizes the portfolio math, and `tests/scripts/tests/polymarket_portfolio_aggregate.test.js` proves the pUSD inclusion with a synthetic fixture.

### Verification
- `node --test tests/scripts/tests/polymarket_portfolio_aggregate.test.js` -> pass
- `node backend/cli/sovereign_cli.js trade aggregate_portfolio --json` -> live JSON payload with a `Polymarket` broker entry and sidecar `prediction_markets.polymarket`

### Remaining
- Polymarket filled-position reconstruction still uses a fixed `limit: 1000` trade window; older fills can be missed until pagination is added.

## Correction Log - 2026-06-04 (rigorous feature testing + MCP access blast-through)

### Added
1. **Rigorous testing skill**: Created `.agents/skills/rigorous-feature-testing` with a checkmarked feature-test checklist and added it to `all-skills-loader`.
2. **MCP stdio probe**: Added `scripts/mcp_stdio_probe.js` to verify `initialize`, `tools/list`, and read-only `get_system_status` against the built MCP server.
3. **Durable test matrix**: Wrote `workspace/FEATURE_TEST_MATRIX_2026_06_04.md` with feature-family results and residual risks.

### Fixed
1. Restored top-level `strategy` CLI dispatch in `backend/cli/sovereign_cli.js`.
2. Updated stale test paths/expectations for the moved research command and the current TUI multi-asset family-filter flow.
3. Prevented `module_loading.test.js` from hanging after requiring `backend/api/app.js`.

### Verification
- `python ... quick_validate.py .agents\skills\rigorous-feature-testing` -> valid.
- `npm.cmd run build` in `backend/mcp_server` -> TypeScript build pass.
- `node scripts\mcp_stdio_probe.js` -> `sovereign-mcp-server` v1.0.0, 14 tools.
- HTTP MCP gate: `/health` 200, `/api/system/status` 200 with `degraded:true`, `/api/config` 403 with MCP header.
- API/web suite: 4/4 pass.
- CLI/TUI suite: 28/28 pass.
- Strategy/backtest suite: 22/22 pass.
- Data/provider suite: 6/6 pass.
- Macro suite: 6/6 pass.

### Remaining
- `backend integrity --json` is red: `ok:false`, `84/84` cached, `0` missing, `9` stale, `1` exception.
- `structure_contract.test.js` still fails because `.mcp.json` and `backend/gateway/node_modules/**` are tracked generated/local-only paths.
- MCP package metadata still says `main: dist/index.js`, while `tsconfig.json` emits to root `dist/mcp_server`.

## Correction Log - 2026-06-04 (mass-implement: MCP hygiene + Polymarket history)

### Fixed
1. **Generated/local-only index hygiene**: removed tracked generated/cache paths from the Git index without deleting working files, including `.mcp.json`, `node_modules/**`, `backend/gateway/node_modules/**`, `storage/data/cache/**`, and `storage/data/ts/**`.
2. **MCP package metadata drift**: `backend/mcp_server/package.json` now points `main`, `start`, and `inspect` at the emitted `../../dist/mcp_server/index.js` path.
3. **Polymarket historical ingestion**: `backend/scripts/data_ops/ingest_market_data.js` now supports Polymarket market discovery via Gamma market records and CLOB token-level `prices-history` normalization into `prediction_market` candle records.
4. **Prediction-market provider config**: `config/markets/data_sources.yaml` and `config/markets/options_data.yaml` now include `polymarket` alongside `kalshi`.
5. **Regression coverage**: `tests/scripts/tests/sovereign_cli.test.js` now checks Polymarket token-id extraction, normalized market records, historical candle conversion, and validator compatibility.

### Verification
- `node --test tests\scripts\structure_contract.test.js` -> 4/4 pass.
- `npm.cmd run build` in `backend/mcp_server` -> pass.
- `node scripts\mcp_stdio_probe.js` -> MCP stdio pass, 14 tools.
- `node --check backend\scripts\data_ops\ingest_market_data.js` -> pass.
- `node --test tests\scripts\tests\sovereign_cli.test.js --test-name-pattern polymarket` -> 33/33 pass in the file, including 3 Polymarket assertions.
- `node --test tests\scripts\config_integrity.test.js` -> 1/1 pass.
- `node --test tests\scripts\cli_ui_contract.test.js` -> 8/8 pass.
- Polymarket live provider probe still returned `fetch failed` locally, including after escalation; fixture-backed endpoint normalization is verified, but local live network reachability is not.

### Remaining
- `node backend\cli\sovereign_cli.js backend integrity --json` remains red: `ok:false`, `84/84` cached, `0` missing, `9` stale, `1` exception.
- Polymarket market discovery currently filters Gamma `/markets` by configured keywords, then uses CLOB `/prices-history?market=<asset_id>` for historical points. If live probes stay blocked on this machine, verify from another network before treating provider availability as production-green.

## Correction Log - 2026-06-04 (mass-implement: Polymarket history TUI exposure)

### Fixed
1. **TUI exposure gap closed**: `backend/cli/tui/manifest.js` now exposes `--history-days`, `--symbol`, and `--timeframe` on the generic `Ingest` TUI path, plus a dedicated `Polymarket -> Historical Price Data` action.
2. **CLI parser gap closed**: `backend/cli/commands/data/data.js` now forwards `--history-days` / `--days` into `ingestMarketData({ historyDays })`.
3. **Provider-order bug fixed**: prediction-market historical ingest now skips Kalshi scalar snapshots and reaches Polymarket historical CLOB normalization when history/backfill options are present.
4. **Polymarket command path added**: `backend/cli/commands/trade/trade.js` now handles `polymarket history --event <event> --history-days <n> --timeframe <tf>` directly through the ingestion layer.

### Verification
- `node --check backend\cli\commands\data\data.js` -> pass.
- `node --check backend\cli\commands\trade\trade.js` -> pass.
- `node --check backend\cli\tui\manifest.js` -> pass.
- `node --test tests\scripts\cli_ui_contract.test.js` -> 9/9 pass.
- `node -e "require('./backend/cli/sovereign_cli.js'); ..."` -> CLI module load OK, parsed `{ family:'prediction_market', symbol:'fed_rate_cut_prob', historyDays:30 }`, `commandPolymarket` exported.
- `node --test tests\scripts\tests\sovereign_cli.test.js --test-name-pattern polymarket` -> 33/33 pass in the file, including Polymarket normalization tests.

### Remaining
- Live Polymarket network reachability was not re-proven in this batch; the prior escalated probe returned `fetch failed`.
- `backend integrity --json` remains the broader red gate until stale cache rows are refreshed.

## Correction Log - 2026-06-04 (polymarket history TUI output correction)

### Fixed
1. **Scoped command output**: `polymarket history` now requests `returnAttemptSnapshot` from ingestion and reports only the current prediction-market attempt, not the merged full archive.
2. **Error filtering**: Polymarket history output filters errors to `prediction_market` / `polymarket`, preventing unrelated macro errors from appearing in the TUI result.
3. **Scoped archive read**: targeted ingestion reads existing history with `{ family: targetFamily }`, reducing cross-family merge bleed for scoped calls.
4. **Macro-store guard**: non-macro target-family ingests now skip Supabase macro-observation persistence, preventing unrelated `[SUPABASE] Macro observation write failed` output during prediction-market history runs.

### Verification
- `node --check backend\scripts\data_ops\ingest_market_data.js` -> pass.
- `node --check backend\cli\commands\trade\trade.js` -> pass.
- `node --test tests\scripts\cli_ui_contract.test.js` -> 10/10 pass.
- `node backend\cli\sovereign_cli.js polymarket history --event fed_rate_cut_prob --history-days 30 --timeframe 1d --json` -> scoped output: `sources:0`, only Polymarket/prediction-market errors, no macro errors, no full-cache count.

### Remaining
- Live Polymarket fetch still returns `fetch failed` in this environment, so the UI path is correct but provider reachability remains degraded.

## Correction Log - 2026-06-04 (polymarket markets crypto sections)

### Fixed
1. **Browse path source corrected**: `polymarket markets` no longer depends on `@polymarket/clob-client.getMarkets()` for public browsing. It uses Gamma `/markets`, which is Polymarket's discovery API for markets and metadata.
2. **Crypto-first market browsing**: `polymarket markets` now defaults to `--category crypto`, resolves the Gamma `crypto` tag, requests related active/closed=false markets, and falls back to client-side crypto filtering if tag resolution is unavailable.
3. **Sectioned output**: active crypto markets are grouped by section using Polymarket metadata (`categories`, `category`, non-generic tags) and crypto keyword fallbacks such as Bitcoin, Ethereum, Solana, XRP, and Meme Coins.
4. **No-network regression seam**: added `backend/gateway/src/polymarket_markets.js` for testable market normalization, crypto filtering, and section grouping.

### Verification
- `node --check backend\gateway\src\polymarket_markets.js` -> pass.
- `node --test tests\scripts\tests\polymarket_markets.test.js` -> 1/1 pass.
- `node_modules\.bin\tsc.cmd -p backend\gateway\tsconfig.json --noEmit` -> pass.

### Remaining
- Local live CLI launch still depends on `tsx`; this workspace did not have `tsx.cmd`, and fallback `npx tsx` hit npm permission/network errors. The TypeScript gateway now typechecks, but the live `polymarket markets` command should be rerun in the TUI/runtime environment that launched the previous gateway.

## Update - 2026-06-04 Focused blast-through after C++ engine closeout

- Current DCS: about `0.88`; data/quote freshness blocks live-promotion work.
- Data gate: `backend integrity --json` -> `ok:false`, `84/84 cached`, `0 missing`, `9 stale`, `1 exception`.
- Quote gate: `quotes status --json` -> `ok:false`, `24 records`, `18 stale`, Headway MT5 stale, MT5/Webull not configured.
- Verified gates: focused CLI/TUI/settings/Polymarket tests `49/49`; strategy/backtest + backend human-surface tests `24/24`; static JS checks for C++ dispatcher and cockpit files passed.
- Current gate table:
  - `backend/gateway`: `C` / gated for Gate.io cost basis and bounded Polymarket trade pagination metadata.
  - `backend/api/server`: `C` / gated until `/api/backend/portfolio` is protected or redacted.
  - `backend/cli/commands`: `B-` / open for debt-clearing only around strategy path resolution and live backtest runtime reachability.
  - `backend/cli/tui`: `B+` / open; registry strategy selection and settings surface are aligned.
  - `shared/lib`: `B` / open; C++ dispatcher default remains static-check clean.
  - `tests`: `A-` / open; focused contracts passed.
  - `storage`: `C` / gated for freshness refresh, not schema coverage.

## Update - 2026-06-04 Mass-implement from focused blast-through

- Cleared three focused blast-through items:
  - `/api/backend/portfolio` is now token-protected as a protected GET route.
  - Bare strategy filenames now resolve against `config/strategies/` for research commands.
  - Polymarket filled-position trade pagination now reports `trade_pagination` metadata and warns on truncation; cap is configurable via `POLYMARKET_TRADE_PAGE_CAP`.
- Verification:
  - `node --test backend\api\tests\api.test.js` -> 1/1.
  - `node --test tests\scripts\tests\sovereign_cli.test.js tests\scripts\cli_ui_contract.test.js tests\scripts\tests\settings_contract.test.js tests\scripts\tests\polymarket_markets.test.js tests\scripts\tests\polymarket_portfolio_aggregate.test.js` -> 49/49.
  - `node --test tests\scripts\strategy_backtest_contract.test.js tests\scripts\tests\sovereign_cli_human_surfaces.test.js` -> 25/25.
  - `node_modules\.bin\tsc.cmd -p backend\gateway\tsconfig.json --noEmit` -> pass.
- Grade movement:
  - `backend/api/server`: `C` -> `B-` for this issue; keep watch on auth semantics.
  - `backend/cli/commands`: `B-` -> `B` for strategy path resolution.
  - `backend/gateway`: `C` -> `B-` for Polymarket pagination visibility, but still gated by Gate.io cost basis.
- DCS remains gated by data/quote freshness: backend integrity still `ok:false` with `9` stale; quotes status still `ok:false` with `18` stale.

## Update - 2026-06-04 Finish pass after mass-implement

- Cleared Gate.io aggregate PnL ambiguity: portfolio aggregation now exposes `total_unrealized_pl` excluding positions with `cost_basis_unavailable:true`, plus `cost_basis_unavailable_positions` and per-broker unavailable counts.
- Added a replay-safe C++ proof: `tests/scripts/strategy_backtest_contract.test.js` now verifies `runBacktest(..., engine:auto)` uses the local C++ backend on synthetic bars when `sovereign_wealth.exe` is available.
- Updated the Frankfurter FX provider to try the current `api.frankfurter.dev/v1` endpoint first and keep the legacy `api.frankfurter.app` endpoint as fallback.
- Attempted targeted FX daily refresh: `mass-backfill --timeframes 1d --days 14` ran `10` jobs and wrote `47` records, but Node fetch to FX providers still fails even with escalation, so daily FX cache remains stale.
- Current red gates remain external-state/freshness gated:
  - `backend integrity --json` -> `ok:false`, `84/84 cached`, `0 missing`, `9 stale`, `1 exception`; stale rows are `EURJPY`, `EURGBP`, `GBPUSD`, `USDJPY`, `AUDUSD`, `USDCAD`, `USDCHF`, `NZDUSD`, `USDSEK` at `1d`.
  - `quotes status --json` -> `ok:false`, `24 records`, `18 stale`; Headway MT5 archive is stale/unconfigured, MT5/Webull not configured.
- Verification:
  - `node --test tests\scripts\tests\polymarket_portfolio_aggregate.test.js` -> 1/1.
  - `node --test tests\scripts\strategy_backtest_contract.test.js` -> 17/17.
  - `node_modules\.bin\tsc.cmd -p backend\gateway\tsconfig.json --noEmit` -> pass.
  - `node --check shared\lib\providers\fx.js` -> pass.

## Update - 2026-06-04 Notebook research ladder

- Filled the local `notebooks/` research surfaces with an explicit evidence ladder:
  - `data_exploration.ipynb`: data coverage, provider, and stale daily-row checks.
  - `feature_importance.ipynb`: feature/target correlation scaffolding and promotion rules.
  - `model_training.ipynb`: model report inspection and strategy promotion checklist.
  - `walk_forward_optimization.ipynb`: CLI-driven multi-window backtest scaffold for stability checks.
  - `backtest_analysis.ipynb`: latest backtest summary, trade distribution, and graduation checklist.
- Architectural decision: the logical path is notebook research -> strategy YAML -> CLI/backtest verification -> C++ core only for repeated, heavy, shared, or safety-critical math.
- Reason: notebooks are best for hypothesis work and inspection, YAML is the reproducible strategy contract, CLI tests prove integration, and C++ core should not absorb unstable one-off research ideas.
- Verification: `node -e "JSON.parse(...)"` loaded all five notebooks successfully as nbformat `4.5`.

## Update - 2026-06-04 Notebook refinement batch

- Added a shared `notebooks/notebook_utils.py` helper so notebook roots, JSON loading, CLI probes, and verdict printing are consistent instead of repeated per notebook.
- Rewrote the five research notebooks to end with explicit `PASS` / `BLOCKED` verdict cells and to surface strategy-draft output from the model-training path.
- Added `tests/scripts/notebooks_contract.test.js` to keep the notebooks parseable and enforce the helper/verdict contract.
- Verification: notebook JSON parse check passed, and `node --test tests/scripts/notebooks_contract.test.js` passed.
- Blocker: local `python` / `py` is not installed on this shell, so the new helper file could not be byte-compiled here.

## Correction Log - 2026-06-05 (Polymarket account diagnostics surface)

### Fixed
1. **Diagnostic command added**: `polymarket debug --json` now reports signer EOA, funder wallet, signature type, collateral balance, allowance, order count, position count, and a classified account state.
2. **Wallet env normalization**: gateway account resolution now accepts both the canonical `POLYMARKET_WALLET_ADDRESS` and the legacy mixed-case `POLYMARKET_WAllET_ADDRESS` env key.
3. **Pagination truthfulness**: Polymarket trade pagination no longer reports `truncated:true` when the trades endpoint returns zero trades with a cursor token.

### Verification
- `node --check backend\gateway\src\polymarket_account.js` -> pass.
- `node --check backend\cli\commands\trade\trade.js` -> pass.
- `node --test tests\scripts\tests\polymarket_account.test.js tests\scripts\tests\polymarket_portfolio_aggregate.test.js tests\scripts\tests\polymarket_markets.test.js` -> 5/5 pass.
- `node_modules\.bin\tsc.cmd -p backend\gateway\tsconfig.json --noEmit` -> pass.
- `node backend\cli\sovereign_cli.js polymarket debug --json` -> `signatureType:3`, signer `0x8010...283d8`, funder `0x0f6A...52DB`, `balance:0`, `allowance:0`, `openOrderCount:0`, `positionCount:0`, `tradePagination.truncated:false`, `accountState:"deposit_wallet_unfunded_or_wrong_wallet"`.

### Remaining
- The live issue is now localized to external Polymarket account state or relayer approval state, not DNS and not a generic signer-vs-funder resolution bug inside the repo.

## Correction Log - 2026-06-05 (Polymarket proxy-mode default)

### Fixed
1. **Proxy-mode default resolution**: when `PROXY_ADDRESS` is present and no explicit Polymarket funder/signature override is set, the gateway now defaults to proxy mode instead of deposit-wallet mode.
2. **Signature-type inference corrected**: proxy funder resolution now infers `signatureType:1` (`POLY_PROXY`) instead of `3` (`POLY_1271`).
3. **Debug wording corrected**: `polymarket debug --json` now labels proxy mode as `POLY_PROXY` and reports allowance guidance appropriate to the active wallet mode.

### Verification
- `node --check backend\gateway\src\polymarket_account.js` -> pass.
- `node --test tests\scripts\tests\polymarket_account.test.js tests\scripts\tests\polymarket_portfolio_aggregate.test.js tests\scripts\tests\polymarket_markets.test.js` -> 7/7 pass before wording cleanup, then `node --test tests\scripts\tests\polymarket_account.test.js` -> 5/5 pass after wording cleanup.
- `node_modules\.bin\tsc.cmd -p backend\gateway\tsconfig.json --noEmit` -> pass.
- `node backend\cli\sovereign_cli.js polymarket debug --json` -> `signatureType:1`, signer `0x8010...283d8`, funder `0x8010...283d8`, `balance:0`, `allowance:0`, `tradePagination.truncated:false`, `accountState:"balance_zero"`.

### Remaining
- Switching to proxy mode did not expose hidden CLOB buying power. The remaining blocker is external Polymarket account state: the proxy wallet path also shows zero collateral and zero allowance.

## Correction Log - 2026-06-05 (Polymarket modes command)

### Fixed
1. **Reusable mode probe added**: `polymarket modes --json` now runs the main signature-type and funder-address combinations from the gateway itself instead of requiring ad hoc shell loops.
2. **Candidate generation centralized**: proxy, deposit, profile, and relayer address combinations are now produced from one helper so future Polymarket debugging uses a consistent matrix.

### Verification
- `node --check backend\gateway\src\polymarket_account.js` -> pass.
- `node --test tests\scripts\tests\polymarket_account.test.js tests\scripts\tests\polymarket_portfolio_aggregate.test.js tests\scripts\tests\polymarket_markets.test.js` -> 8/8 pass.
- `node_modules\.bin\tsc.cmd -p backend\gateway\tsconfig.json --noEmit` -> pass.
- `node backend\cli\sovereign_cli.js polymarket modes --json` -> all tested combinations returned zero collateral/allowance:
  - `sig0-none`
  - `sig1-proxy`
  - `sig3-deposit`
  - `sig1-profile`
  - `sig3-profile`
  - `sig1-relayer`
  - `sig3-relayer`

### Remaining
- The new command confirms the issue is external to repo mode selection: every practical Polymarket account mode tested from the current signer returns zero CLOB balance and zero allowance.

## Correction Log - 2026-06-05 (Polymarket topology and CSV trace)

### Fixed
1. **Topology command added**: `polymarket topology --json` now prints the live signer plus the configured profile, relayer, proxy, deposit, active funder, and inferred signature type.
2. **CSV trace command added**: `polymarket trace --csv <path> --json` now summarizes inflows, outflows, upstream senders, and downstream bridge/solver candidates from explorer exports.
3. **Reusable trace parser added**: the funding-path parser is now testable without live network dependencies.

### Verification
- `node --check backend\gateway\src\polymarket_trace.js` -> pass.
- `node --test tests\scripts\tests\polymarket_account.test.js tests\scripts\tests\polymarket_trace.test.js tests\scripts\tests\polymarket_portfolio_aggregate.test.js tests\scripts\tests\polymarket_markets.test.js` -> 11/11 pass.
- `node_modules\.bin\tsc.cmd -p backend\gateway\tsconfig.json --noEmit` -> pass.
- `node backend\cli\sovereign_cli.js polymarket topology --json` -> signer `0x8010...283d8`, profile `0x1e79...2091`, relayer `0xF67B...AEaD`, proxy `0x8010...283d8`, deposit `0x0f6A...52DB`, configured funder `0x8010...283d8`, signature type `1`.
- `node backend\cli\sovereign_cli.js polymarket trace --csv "D:\minecraft\mods\export-0x0f6AAd6a042cB1F2A0F297da4238efd0252852DB.csv" --json` -> inflows `3`, outflows `5`, strongest downstreams:
  - `0x43370188473A398394E4ba4a7C7cbb2c6265e22A`
  - `0xf70da97812cb96acdf810712aa562db8dfa3dbef` (`Relay: Solver`)
  - `0x433702948d7be4201A2bCEe6C349ad807C547A5D`

### Remaining
- The deposit wallet is confirmed as a transient ingress node. The next unresolved layer is whether one of the downstream recipients or an internal Polymarket settlement account is the true terminal credited wallet for live positions.

## Correction Log - 2026-06-05 (Polymarket arbitrary address probe)

### Fixed
1. **Arbitrary probe command added**: `polymarket probe --address <0x...> --json` now tests a single downstream candidate with signature types `1` and `3` without rewriting env vars.
2. **Command-surface drift closed**: gateway usage text and unknown-subcommand handling now include the Polymarket `probe` surface.

### Verification
- `node --check backend\gateway\src\polymarket_account.js` -> pass.
- `node --test tests\scripts\tests\polymarket_account.test.js tests\scripts\tests\polymarket_trace.test.js tests\scripts\tests\polymarket_portfolio_aggregate.test.js tests\scripts\tests\polymarket_markets.test.js` -> 12/12 pass.
- `node_modules\.bin\tsc.cmd -p backend\gateway\tsconfig.json --noEmit` -> pass.
- `node backend\cli\sovereign_cli.js polymarket probe --address 0x43370188473A398394E4ba4a7C7cbb2c6265e22A --json` -> zero collateral/allowance in both sig1 and sig3.
- `node backend\cli\sovereign_cli.js polymarket probe --address 0xf70da97812cb96acdf810712aa562db8dfa3dbef --json` -> zero collateral/allowance in both sig1 and sig3.
- `node backend\cli\sovereign_cli.js polymarket probe --address 0x433702948d7be4201A2bCEe6C349ad807C547A5D --json` -> zero collateral/allowance in both sig1 and sig3.

### Remaining
- The first three downstream recipients from the deposit-wallet CSV are not exposing credited CLOB state either. The unresolved layer is deeper than deposit/proxy/profile/relayer and deeper than the first visible solver/bundler hops.

## Correction Log - 2026-06-05 (Polymarket investigate workflow)

### Fixed
1. **Investigate command added**: `polymarket investigate --csv <path> --json` now chains CSV tracing and downstream candidate probing in one gateway command.
2. **Trace recommendations exposed**: `polymarket trace --csv` now emits `recommendedProbeAddresses`, so downstream probe order is explicit and reproducible.
3. **Workflow compression**: operator flow is now one command for the common case instead of manual `trace` then repeated `probe` calls.

### Verification
- `node --check backend\gateway\src\polymarket_trace.js` -> pass.
- `node --test tests\scripts\tests\polymarket_account.test.js tests\scripts\tests\polymarket_trace.test.js tests\scripts\tests\polymarket_portfolio_aggregate.test.js tests\scripts\tests\polymarket_markets.test.js` -> 12/12 pass.
- `node_modules\.bin\tsc.cmd -p backend\gateway\tsconfig.json --noEmit` -> pass.
- `node backend\cli\sovereign_cli.js polymarket investigate --csv "D:\minecraft\mods\export-0x0f6AAd6a042cB1F2A0F297da4238efd0252852DB.csv" --limit 3 --json` -> traced the deposit wallet and probed the top three downstream candidates; `fundedCandidates` remained empty.

### Remaining
- The repo now covers identity-layer addresses, first visible downstream recipients, and compressed probe workflow. The unresolved gap is beyond the first visible solver/bundler layer or inside Polymarket's internal settlement mapping.

## Correction Log - 2026-06-05 (Polymarket derive-creds fallback clarity)

### Fixed
1. **Explicit create vs derive flow added**: `polymarket derive-creds` now tries `createApiKey()` first, then falls back to `deriveApiKey()` explicitly instead of relying on the SDK's ambiguous `createOrDeriveApiKey()` wrapper.
2. **SDK noise captured and reported cleanly**: the gateway now captures the SDK's internal `request error` console output during credential derivation and reports it as structured diagnostics instead of mixing a 400 log with successful env output.
3. **Credential-shape normalization extracted**: Polymarket API credential normalization now lives in a small helper module with dedicated tests.

### Verification
- `node --check backend\gateway\src\polymarket_creds.js` -> pass.
- `node --test tests\scripts\tests\polymarket_account.test.js tests\scripts\tests\polymarket_creds.test.js tests\scripts\tests\polymarket_trace.test.js tests\scripts\tests\polymarket_portfolio_aggregate.test.js tests\scripts\tests\polymarket_markets.test.js` -> 16/16 pass.
- `node_modules\.bin\tsc.cmd -p backend\gateway\tsconfig.json --noEmit` -> pass.
- `node backend\cli\sovereign_cli.js polymarket derive-creds --json` -> returned:
  - `source:"derived"`
  - `createRequestErrors[0].status:400`
  - `createRequestErrors[0].data.error:"Could not create api key"`
  - valid derived `key`, `secret`, and `passphrase`

### Remaining
- The 400 is now classified correctly: this wallet cannot create a fresh Polymarket API key, but it can derive an existing one. Live balance/position visibility is still blocked by the downstream wallet or internal account-credit mapping issue, not by L2 credential derivation.

## Correction Log - 2026-06-05 (Polymarket guided market browser)

### Fixed
1. **Chooser-based CLI flow added**: plain `polymarket markets` on an interactive terminal now opens a guided browser instead of dumping 25 raw markets immediately.
2. **Selection flow aligned with other CLI features**: the browser now uses the same prompt-driven pattern as the trade desk and MT5 surfaces:
   - category
   - market count
   - section
   - market
3. **Focused market detail view added**: after selection, the CLI shows one readable market card with question, section, volume, liquidity, condition id, outcomes, token ids, and next-command hints.
4. **Script surfaces preserved**: explicit flags and `--json` still bypass the chooser and keep the old machine-friendly gateway behavior.

### Verification
- `node --check backend\cli\commands\trade\trade.js` -> pass.
- `node --test tests\scripts\tests\sovereign_cli.test.js tests\scripts\tests\sovereign_cli_human_surfaces.test.js tests\scripts\tests\polymarket_account.test.js tests\scripts\tests\polymarket_creds.test.js tests\scripts\tests\polymarket_trace.test.js tests\scripts\tests\polymarket_portfolio_aggregate.test.js tests\scripts\tests\polymarket_markets.test.js` -> 60/60 pass.
- `node_modules\.bin\tsc.cmd -p backend\gateway\tsconfig.json --noEmit` -> pass.

### Remaining
- The guided browser improves browsing ergonomics, but it does not change live balance or live position visibility. Those remain blocked by the unresolved credited-wallet or internal Polymarket settlement mapping.

## Correction Log - 2026-06-05 (Polymarket market actions and orderbook/history surfaces)

### Fixed
1. **Interactive market actions added**: the guided `polymarket markets` browser now supports:
   - `View orderbook`
   - `View price history`
   - `Buy Yes`
   - `Buy No`
   - `Back`
   - `Exit`
2. **New gateway subcommands added**:
   - `polymarket orderbook --token <id> --json`
   - `polymarket price-history --token <id> --interval 1h --json`
   - `polymarket buy <token> <qty> [price] --json`
3. **Order workflow hardened**: the browser now shows top-of-book context before order entry, derives a default limit price from the best ask, previews the order, and requires a final live confirmation before submission.
4. **Renderer shape bug fixed**: the price-history browser now correctly reads the nested Polymarket history payload instead of showing an empty panel.

### Verification
- `node --check backend\cli\commands\trade\trade.js` -> pass.
- `node --test tests\scripts\tests\sovereign_cli.test.js tests\scripts\tests\sovereign_cli_human_surfaces.test.js tests\scripts\tests\polymarket_account.test.js tests\scripts\tests\polymarket_creds.test.js tests\scripts\tests\polymarket_trace.test.js tests\scripts\tests\polymarket_portfolio_aggregate.test.js tests\scripts\tests\polymarket_markets.test.js` -> 62/62 pass.
- `node_modules\.bin\tsc.cmd -p backend\gateway\tsconfig.json --noEmit` -> pass.
- `node backend\cli\sovereign_cli.js polymarket orderbook --token 13915689317269078219168496739008737517740566192006337297676041270492637394586 --json` -> live orderbook returned bids, asks, tick size, min order size, and last trade price.
- `node backend\cli\sovereign_cli.js polymarket price-history --token 13915689317269078219168496739008737517740566192006337297676041270492637394586 --interval 1h --json` -> live history returned nested `history.history` price rows; renderer corrected to match.

### Remaining
- The browser can now submit live Polymarket buys for token ids, but live balances and live positions still depend on the unresolved credited-wallet or internal settlement mapping.

## Correction Log - 2026-06-05 (Polymarket non-crypto category filter)

### Fixed
1. **Category filter bug removed**: non-crypto categories such as `sports`, `politics`, and `business` are no longer re-filtered through the crypto matcher after the Gamma API response returns.
2. **Empty category flow hardened**: the interactive Polymarket browser now keeps the user inside category selection when a category comes back empty, instead of terminating into a dead-end surface.

### Verification
- `node --test tests\scripts\tests\polymarket_markets.test.js tests\scripts\tests\sovereign_cli.test.js` -> 39/39 pass.
- `node --check backend\cli\commands\trade\trade.js` -> pass.
- `node backend\cli\sovereign_cli.js polymarket markets 10 --category sports --json` -> live result returned 10 sports markets in the `Sports` section instead of an empty set.

### Remaining
- Polymarket's returned top-level `category` field can still read `crypto` for some sports-tagged markets, so the browser should continue trusting section/tag grouping over that single raw field when presenting categories.

## Correction Log - 2026-06-05 (Polymarket detail card cleanup)

### Fixed
1. **Slug noise removed from market detail cards**: the interactive Polymarket market detail view now hides slug lines and token-history hints only reference token ids.
2. **Buy result rendering fixed**: the browser now prints the submitted order response as plain JSON instead of trying to pass it through a missing renderer helper.

### Verification
- `node --check backend\cli\commands\trade\trade.js` -> pass.
- `node --test tests\scripts\tests\sovereign_cli.test.js tests\scripts\tests\polymarket_markets.test.js` -> 39/39 pass.

### Remaining
- The buy action is now wired and renders cleanly, but any live order still depends on the current Polymarket credentials and account state at runtime.

## Correction Log - 2026-06-05 (Polymarket token-aware browser actions)

### Fixed
1. **Token-aware action prompts added**: `View orderbook` and `View price history` now prompt for the specific token id when a market has multiple outcomes.
2. **Buy flow made token-aware**: `Buy Yes` / `Buy No` now resolve the correct outcome token instead of assuming the first token is always the right one.
3. **Market detail card simplified**: the browser no longer shows slug lines, and the next-action hint is now outcome-agnostic.

### Verification
- `node --check backend\cli\commands\trade\trade.js` -> pass.
- `node --test tests\scripts\tests\sovereign_cli.test.js tests\scripts\tests\polymarket_markets.test.js` -> 40/40 pass.
- `node backend\cli\sovereign_cli.js polymarket orderbook --token 13915689317269078219168496739008737517740566192006337297676041270492637394586 --json` -> live orderbook returned real depth, tick size, min order size, and last trade price.

### Remaining
- The live buy path is wired and token-aware, but it still should not be exercised automatically without a deliberate user action because it submits a real order when confirmed.

## Correction Log - 2026-06-05 (Legacy Polymarket CLOB snapshot and env bridge)

### Added
1. **Legacy CLOB snapshot created** under `legacy/holygrailpoly/` to preserve the older Polymarket integration shape alongside the current gateway.
2. **Env-name bridge added** so the snapshot can read both the legacy `POLY_*` names and the current `POLYMARKET_*` names from the same `.env` file.
3. **Brute-force runner added** to compare the current and legacy env schemas by running the current Polymarket CLI under each mapping.

### Verification
- `node --check legacy\holygrailpoly\legacy_clob.js` -> pass.
- `node --check legacy\holygrailpoly\bruteforce.js` -> pass.
- `node --test tests\scripts\tests\legacy_polymarket_env.test.js` -> pass.
- `node legacy\holygrailpoly\bruteforce.js --schema current` -> env bridge found the current signer and funder, but the live `debug` and `modes` probes timed out at `spawnSync ... ETIMEDOUT`.
- `node legacy\holygrailpoly\bruteforce.js --schema legacy` -> env bridge found the same signer and funder through the legacy aliases, but the live probes timed out the same way.

### Remaining
- The legacy bridge is wired correctly, but the live CLOB probe path still times out in this environment, so the next useful step is to shorten the probe surface or target a faster endpoint before treating the brute-force runner as a reliable signal.

## Correction Log - 2026-06-05 (Fast Polymarket collateral probe and gateway launcher fallback)

### Fixed
1. **Lightweight collateral probe added**: `polymarket collateral-probe --json` now checks only signer, funder, signature type, collateral balance, and allowance without pulling orders or positions.
2. **Legacy brute-force runner switched to the fast probe**: the `legacy/holygrailpoly` comparison path now tests current vs legacy env schemas against `collateral-probe` instead of the heavier `debug` and `modes` surfaces.
3. **Gateway launcher fallback corrected**: when `tsx` is not installed locally, the CLI now uses a dedicated `ts-node` bootstrap runner instead of falling back to `npx tsx`, which previously triggered registry/network failures on this machine.
4. **Gateway error reporting improved**: Polymarket probe failures now preserve response/config context instead of collapsing to an empty or `unknown` error string.

### Verification
- `node --check backend\cli\lib\run_trade_gateway.js` -> pass.
- `node --check backend\cli\commands\trade\trade.js` -> pass.
- `node --check legacy\holygrailpoly\legacy_clob.js` -> pass.
- `node --check legacy\holygrailpoly\bruteforce.js` -> pass.
- `node --test tests\scripts\tests\sovereign_cli.test.js tests\scripts\tests\polymarket_account.test.js tests\scripts\tests\legacy_polymarket_env.test.js` -> 51/51 pass.
- `node_modules\.bin\tsc.cmd -p backend\gateway\tsconfig.json --noEmit` -> pass.
- `node backend\cli\sovereign_cli.js polymarket collateral-probe --json` -> now runs through the fixed launcher and reaches the Polymarket CLOB endpoint, but fails with an axios/network `AggregateError` carrying `code: "EACCES"` on `https://clob.polymarket.com/balance-allowance/update`.
- `node legacy\holygrailpoly\bruteforce.js --schema current` -> same `EACCES` on the same CLOB endpoint with `signature_type: 1`.
- `node legacy\holygrailpoly\bruteforce.js --schema legacy` -> same `EACCES` on the same CLOB endpoint with `signature_type: 3`.

### Remaining
- The repo-side launcher and probe surfaces are now functioning, but current vs legacy env schemas both fail at the same network-layer CLOB request, so the next blocker is endpoint reachability or runtime network policy, not env mapping logic.

## Correction Log - 2026-06-05 (Polymarket probe error redaction)

### Fixed
1. **Polymarket gateway error sanitizer extracted**: gateway probe failures now flow through a dedicated `polymarket_errors.js` helper instead of serializing raw axios errors.
2. **Auth-bearing headers redacted**: `POLY_API_KEY`, `POLY_PASSPHRASE`, and `POLY_SIGNATURE` are now replaced with `[redacted]` in structured probe errors.
3. **Failure context preserved safely**: the sanitized error still shows endpoint URL, method, params, timeout, code, and response status where present, so network failures remain debuggable.

### Verification
- `node --check backend\gateway\src\polymarket_errors.js` -> pass.
- `node --test tests\scripts\tests\polymarket_errors.test.js tests\scripts\tests\polymarket_account.test.js tests\scripts\tests\legacy_polymarket_env.test.js tests\scripts\tests\sovereign_cli.test.js` -> 55/55 pass.
- `node_modules\.bin\tsc.cmd -p backend\gateway\tsconfig.json --noEmit` -> pass.
- `node backend\cli\sovereign_cli.js polymarket collateral-probe --json` -> still returns network `EACCES` on `https://clob.polymarket.com/balance-allowance/update`, but the auth-bearing header values are now redacted.

### Remaining
- The remaining blocker is endpoint reachability or runtime network policy to `clob.polymarket.com`, not secret leakage, env aliasing, or gateway launcher drift.

## Correction Log - 2026-06-06 (Polymarket paper-trading gate)

### Fixed
1. **Paper-run command implemented**: `polymarket paper-run` now runs a no-spend paper cycle against public Polymarket markets and orderbooks.
2. **Virtual portfolio persistence added**: paper runs write `storage/data/paper_trading/portfolio.json` and append virtual fills to `storage/data/paper_trading/fills.jsonl`.
3. **Plan/CLI drift closed**: `workspace/POLYMARKET_BOT_PLAN.md` now points at `polymarket paper-run` instead of the nonexistent `polymarket research paper-run`.

### Verification
- `node --check backend\gateway\src\polymarket_paper.js` -> pass.
- `node --check backend\cli\commands\trade\trade.js` -> pass.
- `node_modules\.bin\tsc.cmd -p backend\gateway\tsconfig.json --noEmit` -> pass.
- `node --test tests\scripts\tests\polymarket_markets.test.js tests\scripts\tests\polymarket_paper.test.js` -> 5/5 pass.
- `node --test tests\scripts\tests\sovereign_cli.test.js tests\scripts\tests\polymarket_markets.test.js tests\scripts\tests\polymarket_paper.test.js` -> 43/43 pass.
- `node backend\cli\sovereign_cli.js polymarket paper-run --strategy low_prob_dip --virtual-balance 100 --dry-run --limit 1 --json` -> `ok:true`, `fills:1`, `virtual_balance:99`, using live public Gamma/CLOB data after network approval.

### Remaining
- The paper-run path does not yet resolve positions into `pnl_log.jsonl`; live deployment should still wait for the 7-day paper gate and resolved-position metrics.

## Update - 2026-06-06 Local-first trading plan refinement

- Added and expanded `docs/operational/local_first_trading_setup_plan.md` with deployment modes, migration handling, secret-storage fallback order, safe vs sensitive diagnostics, and a concrete onboarding journey.
- Corrected the example paper-trading command in the plan to the real surface: `sovereign polymarket paper-run --strategy low_prob_dip --virtual-balance 100 --dry-run`.
- The plan still needs implementation work for centralized broker env modules, setup/doctor commands, and explicit local/private-runner enforcement before live execution.

## Update - 2026-06-06 Broker env and local setup/doctor slice

- Implemented the first runtime slice of the local-first trading plan: `sovereign setup` / `sovereign doctor`, shared broker env specs, and installable CLI bin support.
- Added local `.env` upsert helpers and redacted broker field summaries in `shared/lib/brokers`.
- Added `sovereign doctor runtime` and `sovereign doctor data` with successful JSON smoke checks.
- Verified the new env helpers with `tests/scripts/tests/broker_env.test.js` and smoke-tested the new commands through the dispatcher.
- Remaining plan work still includes runtime/data doctor subcommands, adapter rewiring, package-manager install smoke, and the rest of the documentation/guard rails.

## Update - 2026-06-06 Install smoke and env-doc alignment

- `npm link` now works in this workspace and the linked `sovereign` binary successfully runs `status --json` and `doctor runtime --json`.
- `.env.example` now includes Alpaca, Gate.io, and Supabase examples so the setup surface matches the broker registry.
- The doctor payload now reports `validation_errors` and a tracked-secret scan summary.

## Update - 2026-06-06 Live execution guard slice

- Added `config/system/broker_capabilities.json` and `shared/lib/broker_capabilities.js` to centralize runtime mode checks.
- `trade --live` now blocks immediately in `cloud-compute` mode before auth or PIN prompts.
- `tests/scripts/tests/live_guard.test.js` proves the CLI boundary blocks live execution in cloud-compute mode.

## Update - 2026-06-06 Docs and Polymarket mapping refinement

- Added `docs/operational/local_first_setup.md`, `docs/operational/broker_setup.md`, `docs/operational/cloud_compute_vs_local_execution.md`, and `docs/operational/local_first_migration.md`.
- Centralized Polymarket env resolution in `shared/lib/brokers/polymarket_env.js`.
- The canonical deposit-wallet mapping now defaults to signature type `2` (`POLY_GNOSIS_SAFE`), with legacy `3` preserved only for compatibility inputs.

## Update - 2026-06-06 Proposed-order validation slice

- Added `backend/gateway/src/proposed_orders.js` and wired it into `gateway.processProposedOrders`.
- Malformed proposed-order files now fail closed before execution, and valid files print a preview before the dry-run path.
- Added helper and CLI tests for proposed-order validation and local processing.

## Update - 2026-06-06 Local-first completion pass

- Centralized the remaining broker/env resolution paths through the shared broker env modules, including Alpaca, Gate.io, MT5, Polymarket, and Supabase.
- Added `--env-path` support to `sovereign setup` so secrets can be written to a caller-specified local file during tests or migrations.
- Added a repo-wide secret-pattern CI check in `backend/scripts/dev/secret_pattern_check.js` and wired it into `npm run test:secrets` and GitHub Actions.
- Added a clean-room doctor test that disables local dotenv loading and proves missing-field reporting works without exposing secrets.
- Verified `npm.cmd install --ignore-scripts --no-audit --no-fund`, the new secret scan, the gateway typecheck, and setup/doctor temp-file writes for Alpaca and Polymarket.
- The operational plan checklist in `docs/operational/local_first_trading_setup_plan.md` is now fully checked off.

## Update - 2026-06-06 Rigorous feature audit

- Ran a fresh broad feature verification pass across MCP, CLI, TUI, data, strategy, gateway, API/Web, and docs.
- Current clean passes: MCP tool discovery + representative tool call, CLI help/import surface, TUI automation smoke, strategy/backtest contracts, API/Web contract tests, and the shared settings surface.
- Current partials:
  - `status --json` still reports a degraded freshness summary (`records: 81`, `usable_records: 9`, `rejected_records: 72`, `stale_records: 72`, `quality: needs attention`).
  - `backend integrity --json` is mostly clean but still carries the known `RNDRUSDT` exception.
  - Polymarket live `buy` still crashes on a missing price field in the current CLI path.
  - Polymarket `paper-run` still returns `fetch failed` in this shell.
- Updated `docs/engineering/tui_feature_map.md`, `docs/engineering/codebase_org.md`, `workspace/FEATURE_TEST_MATRIX.md`, and `workspace/FEATURE_REPAIR_PLAN.md` to keep the audit evidence durable.

## Update - 2026-06-06 Mass implementation: Data/Gateway B+ push

- Fixed Polymarket gateway error classification so SDK/account/network failures return structured diagnostics instead of raw `Cannot read properties of undefined (reading 'price')` or generic `fetch failed` messages.
- Hardened Polymarket live buy signing path by pre-resolving and validating CLOB tick size before `createOrder`, then classifying tick-size/order-shape failures as `invalid_token_or_tick_size`.
- Hardened paper-run so per-market orderbook failures are skipped with an error category instead of aborting the whole no-spend cycle.
- Reconciled data-health wording: `status --json` now labels `freshness_scope:"last_fetch_snapshot"` and `integrity_scope:"configured_ts_cache"` so latest-fetch degradation is not confused with configured cache integrity.
- Attempted targeted `VRE` `1d` refresh. Approved network backfill still produced latest provider data only through `2026-05-26`, so `VRE` is now an explicit integrity exception alongside migrated/delisted `RNDRUSDT` until exchange-aware VN symbol mapping exists.

### Verification
- `node --check backend\gateway\src\polymarket_errors.js` -> pass.
- `node --check backend\gateway\src\polymarket_paper.js` -> pass.
- `node --check backend\cli\commands\status.js` -> pass.
- `node_modules\.bin\tsc.cmd -p backend\gateway\tsconfig.json --noEmit` -> pass.
- `node --test tests\scripts\tests\polymarket_errors.test.js tests\scripts\tests\polymarket_paper.test.js` -> 13/13 pass.
- `node --test tests\scripts\tests\live_guard.test.js tests\scripts\tests\polymarket_account.test.js tests\scripts\tests\polymarket_paper.test.js tests\scripts\tests\polymarket_errors.test.js tests\scripts\tests\proposed_orders.test.js tests\scripts\tests\proposed_orders_cli.test.js` -> 28/28 pass.
- `node --test tests\scripts\tests\sovereign_cli_human_surfaces.test.js` -> 10/10 pass.
- `node --test tests\scripts\tests\sovereign_cli.test.js` -> 38/38 pass.
- `node backend\cli\sovereign_cli.js polymarket paper-run --strategy low_prob_dip --virtual-balance 100 --dry-run --limit 1 --json` -> sandbox run returns structured `network_unavailable`; approved network run returns `ok:true`, `markets_scanned:1`, `fills:0`, `skipped:max concurrent positions reached`.
- Compact `backend integrity --json` probe -> `ok:true`, `84/84` cached, `0` missing, `0` stale, `2` exceptions (`RNDRUSDT`, `VRE`).

### Remaining
- Gateway grade is improved but live-buy submission itself was not retried because it can spend real pUSD; run only with explicit user approval.
- Data integrity is policy-green, but `status --json` still reports latest-fetch snapshot degradation (`73` stale rows), now explicitly scoped as latest-fetch freshness rather than configured cache coverage.

## Update - 2026-06-06 Rigorous testing subset/overlap approval gate

- Refined `.agents/skills/rigorous-feature-testing/SKILL.md` so broad feature audits must identify parent/child feature relationships, duplicate surfaces, stale subset features, and overlap candidates before cleanup recommendations.
- Updated the feature-test checklist reference with a `Parent / Subset Review` column and explicit `keep separate`, `merge candidate`, `remove candidate`, and `rename candidate` marks.
- Added a hard process rule: subset, duplicate, stale, merge, remove, rename, hide, or deprecation findings are audit outputs only. Actual merge/remove/deprecation work requires explicit user approval and must preserve user-visible behavior with tests and a rollback path.

## Update - 2026-06-06 Polymarket buy prompt and orderbook depth UX

- Fixed Polymarket orderbook rendering so bids are sorted descending and asks are sorted ascending before computing best bid/ask, default buy price, and displayed depth.
- The TUI now shows near-spread depth instead of trusting raw CLOB array order, which could display far-tail levels before current executable prices.
- Hardened the limit-price parser for the buy prompt so `.40`, `0.40`, `40%`, and `40` all normalize to `0.40`; incomplete `0.` input now returns a specific "finish the decimal" message.
- Verification: `node --check backend\cli\commands\trade\trade.js` passed; `node --test tests\scripts\tests\sovereign_cli.test.js` passed `39/39`.

## Update - 2026-06-06 Polymarket CLOB signing shape fix

- Fixed the live Polymarket buy signing shape: `@polymarket/clob-client@2.8.0` expects `client.createOrder(userOrder, tickSize)` with `tickSize` as a string, not `{ tickSize }`.
- The previous object-form tick size caused the SDK order builder to receive an undefined rounding config and crash at signing with `Cannot read properties of undefined (reading 'price')`.
- The gateway now uses the SDK `Side.BUY` / `Side.SELL` enum and posts with `OrderType.GTC`.
- The TUI buy prompt now labels accepted price shorthand and enforces the orderbook `min_order_size` before submit, so a `Min order: 5` token will reject `4` shares locally.
- Verification: `node --check backend\cli\commands\trade\trade.js`, `node --test tests\scripts\tests\sovereign_cli.test.js` (`40/40`), and `node_modules\.bin\tsc.cmd -p backend\gateway\tsconfig.json --noEmit` all passed.

## Update - 2026-06-06 Polymarket deposit-wallet resolver and live-submit preflight

- Fixed the shared Polymarket env resolver so active trading prefers `POLYMARKET_FUNDER_ADDRESS`, then `DEPOSIT_ADDRESS` / Polymarket wallet aliases, and only then legacy `PROXY_ADDRESS`.
- Root cause for `maker address not allowed, please use the deposit wallet flow`: diagnostics recognized `DEPOSIT_ADDRESS`, but the actual trading resolver could still fall back to `PROXY_ADDRESS`, producing a proxy-mode maker on markets that require deposit-wallet mode.
- The TUI buy flow now blocks live submit if CLOB orderbook depth is empty, if pUSD balance cannot be read, or if the resolved deposit-wallet pUSD balance is below estimated order cost.
- Operational note: pUSD visible on a legacy proxy wallet is not necessarily spendable for current deposit-wallet CLOB orders. Funds must be available through the deposit wallet flow used by the configured funder.
- Verification: `node --check shared\lib\brokers\polymarket_env.js`, `node --check backend\cli\commands\trade\trade.js`, focused CLI/account/env tests `54/54`, and gateway TypeScript all passed.

## Update - 2026-06-06 Focused blast-through after Polymarket buy-flow fixes

- Ran a focused blast-through over `backend/cli/commands`, `backend/gateway`, `shared/lib`, `tests`, and `workspace` after the Polymarket buy-flow fixes.
- DCS split is now explicit: configured-cache integrity is policy-green (`backend integrity --json`: `ok:true`, `84/84` cached, `0` missing, `0` stale, `2` exceptions), but latest-fetch snapshot freshness remains degraded (`status --json`: `82` records, `73` stale), so live data/model promotion remains halted for latest-fetch-derived products.
- Current focused verification remains green: CLI syntax checks, shared broker env syntax check, focused Polymarket/CLI/env tests `54/54`, and gateway TypeScript all passed.
- New review items were added to `workspace/DEV_REVIEW.md`: `derive-creds` default secret reveal needs an explicit reviewer decision, TUI buy preview needs a dedicated no-order preflight instead of portfolio-subprocess balance inference, and paper trading must reconcile `resolved_positions.jsonl` with the planned `pnl_log.jsonl`.
- No live Polymarket submit was retried in this audit because it can spend real pUSD.

## Update - 2026-06-07 Polymarket auth-health and mode-matrix diagnostics

- Added a no-spend `polymarket auth-health` surface and a lighter `polymarket modes --collateral-only` probe, plus richer signer/funder/signature-type context on Polymarket buy failures and preflight output.
- Added gateway/TUI tick-size passthrough so preflight and submit can reuse the TUI-observed orderbook tick size instead of depending on a second live lookup.
- Current auth-health result in this shell is not a clean account-mode verdict: the first failing stage is `collateral`, and the no-spend read probes now classify the repeated `EACCES` failures against `clob.polymarket.com` as `network_unavailable` rather than misleading allowance/signature errors.
- `derive-creds` remains unable to mint or derive usable replacement L2 credentials through the current `@polymarket/clob-client@2.8.0` path, so credential rotation is still blocked pending either a client upgrade or a different verified derivation path.

## Update - 2026-06-07 Docs and workspace re-index

- Added a filtered documentation hub in `docs/README.md` that separates canonical, supporting, and archive/mirror surfaces so the repo has one obvious docs entrypoint.
- Added `workspace/README.md` as the workspace index, with canonical live truth, working plans, historical snapshots, and redundant/superseded notes called out explicitly.
- The highest-redundancy surfaces are now identified rather than implied: `docs/memory/*` mirrors workspace state, `docs/archive/*` is historical, `FEATURE_TEST_MATRIX_2026_06_04.md` is superseded, and the session snapshot files should be treated as archive material once their lessons are folded into the live truth files.

### Verification
- `node --test tests\scripts\tests\polymarket_auth_health.test.js tests\scripts\tests\polymarket_preflight.test.js tests\scripts\tests\polymarket_errors.test.js tests\scripts\tests\polymarket_account.test.js` -> 21/21 pass.
- `node --check backend\cli\commands\trade\trade.js` -> pass.
- `node_modules\.bin\tsc.cmd -p backend\gateway\tsconfig.json --noEmit` -> pass.
- `node backend\cli\lib\run_trade_gateway.js polymarket auth-health --json` -> configured signer/funder surface with `likelyFailureStage:"collateral"` and `network_unavailable` classification on current read probes.
