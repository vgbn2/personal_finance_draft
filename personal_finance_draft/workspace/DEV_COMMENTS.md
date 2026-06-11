# Developer Comments Index (gemini-work)

## Intent Harvest - 2026-05-28
- **backend/api/app.js**: Anti-crash foundation (Uncaught Exception/Unhandled Rejection handlers). Rate limiting (IP-based). API Token check for data-modifying routes. Real-time market data streaming via `fs.watchFile`.
- **backend/api/server/services/cli_executor.js**: 5-second memory cache for "dashboard snappiness". Decouples API from C++ core and Node CLI using centralized binary discovery.
- **backend/cli/commands/data.js**: Ingestion logic optimized for incremental fetching. The `universe` command provides interactive symbol discovery. 20-year backfill pipeline correctly merges results into `backtest_history.json`.
- **backend/cli/commands/strategy.js**: Strategy automation engine implemented. Uses `EXECUTION_MEMORY` (Set) to prevent duplicate execution of the same signal. Implements freshness guards (24h limit) for signals. Dynamic position sizing implemented using `risk_weight` and Alpaca balance.
- **backend/cli/commands/trade.js**: MFA/PIN verification for LIVE trades. Supports `--pin` flag for unattended automation with Fail-Closed logic. `fetchBalance` utility created for automation.
- **backend/cli/lib/utils.js**: `resolveSymbols` utility implements fuzzy matching (e.g., BTC -> BTCUSDT) based on the active universe.
- **backend/cli/tui/engine.js**: UX debt: "too many if elses". Sigma band visualization logic. Added type-safety normalization for string-based menu options. Rich Correlation Heatmap visualizer implemented.
- **backend/cli/tui/manifest.js**: TUI manifest dynamically populates symbols from `data_sources.yaml` when the cache is empty, ensuring immediate discoverability.
- **shared/lib/paths.js**: Centralized REPO_ROOT and binary discovery utility. Eliminates redundant candidate lists. Supports `config/tools.yaml` for external tool discovery.
- **shared/lib/market_validation.js**: Strict schema and freshness rules for OHLCV and scalar data families.
- **shared/lib/execution_memory.js**: New persistence layer using local JSON sync with lazy-loading. Prevents duplicate signals across process restarts. (Waterproof)
- **backend/scripts/data_ops/ingest_market_data.js**: Smart Ingestion Engine. Implements "Forward Gap-Filling" by checking the local history before API calls. Bypassing freshness guards during backfills. Normalization expanded to 30+ new symbols.
- **scripts/data_ops/backfill_20_years.js**: 20-year daily historical pipeline via Yahoo Finance.

## Architectural Seams
- **CLI Adapter**: `cli_executor.js` acts as a high-integrity bridge. It is well-decoupled and uses centralized paths.
- **Indicator Scalability**: Adding new indicators requires manual code threading across `IndicatorEngine.cpp`, `research.js`, and `indicators.js`. (System Risk: High Maintenance)
- **Execution Guard**: `EXECUTION_MEMORY` is now persistent via `shared/lib/execution_memory.js`. Ready for cloud hosting.
- **Symbol Resolver Seam**: The fuzzy resolver in `utils.js` is a high-value UX bridge, but needs to stay synced with both the `data_sources.yaml` and the actual historical cache. (System Risk: Logic Drift)
- **Provider Stubs**: `ingest_market_data.js` contains several empty fetcher stubs (OpenSky, Blockchair, SEC Holdings, SP Global, ECB) that need implementation to fulfill the full data universe vision. (Data Gap)

## Migration Readiness
- **Config-Driven Discovery**: Tool paths for MSYS64 and MetaTrader 5 are now centralized in `config/tools.yaml`.
- **Cloud Readiness**: Core logic is portable via `REPO_ROOT` and dynamic tool resolution in `shared/lib/paths.js`.
- **Historical Depth**: Yahoo Finance range parsing optimized for reliable 10-20 year lookbacks.

## Indicator Innovations (Roadmap)
- **Pairwise Correlation Divergence**: Detect when historical correlations break between asset pairs (e.g., BTC/ETH decoupling). 
    - *Logic*: Signal a "Fake Rally" if Symbol A pumps while highly-correlated Symbol B stays flat or diverges.
    - *Implementation*: Requires a rolling Pearson Correlation indicator in `shared/lib/indicators.js`.
- **Crypto-Stable Inverse Correlation**: Monitor total crypto market cap vs. stablecoin dominance/market cap. 
    - *Hypothesis*: Inversely correlated; decoupling indicates capital flight or fresh liquidity injection.
- **Intra-Bar Simulation (Synthetic LTF)**: Deconstruct 1d bars into synthetic 8h/1h/1m bars for noise-robust backtesting.

## Correlation Innovations (Roadmap)
- **Hierarchical Matrix Sorting**: Implement `--sort volume` or `--sort market_cap` in `backend correlation` to group Leaders (Beta) vs. Followers (Outliers) in the heatmap.
- **Correlation Divergence Monitor**: Add a telemetry watcher to the `watch` loop that alerts when a historical correlation "breaks" (e.g. SOL/AVAX dropping from 0.9 to 0.5), signaling a regime shift.

## Audit Findings - 2026-05-31 (Session 6)

### [TUI SCALABILITY] Heatmap suppressed for N > 12
- **Context**: `backend/cli/tui/engine.js` -> `renderCorrelationHeatmap`
- **Logic**: Matrices larger than 12x12 are unreadable in CLI. System now switches to a "Correlation Summary" (Top 10 Pos/Neg pairs) automatically. Full data remains accessible via `--json`.
- **Status**: Hardened.

### [QUANT POLISH] Price-based X-Axis for Sigma Bands
- **Context**: `backend/cli/tui/engine.js` -> `renderSigmaSparkline`
- **Enhancement**: Distribution plot now shows actual prices corresponding to sigma ticks (-3σ to +3σ). Added auto-scaling (k/M) for large values.
- **Status**: Implemented.

### [DATA INCONSISTENCY] Backfill --20-years ignores requested timeframe
- **Context**: `scripts/data_ops/backfill_20_years.js` and `backend/scripts/data_ops/ingest_market_data.js`
- **Issue**: The 20-year pipeline is hardcoded to `1d` because Yahoo Finance restricts `1h` data to the last 730 days. Requesting `--20-years` with `--timeframe 1h` results in a silent fallback to `1d`.
- **Note**: "tf choosen to bf=1h, but fill 1 day" logged by user. Implementation of mixed-timeframe merging (e.g. 18y of 1d + 2y of 1h) not yet prioritized.
- **Status**: Logged, pending research on alternative data providers for deep intraday history.

## Audit Findings - 2026-06-01 (Session 53)

### [DATA READINESS] Integrity freshness still blocks promotion
- **Context**: `backend integrity --json`
- **Issue**: Cache coverage is complete (`84/84` configured symbols cached), but required-window freshness is degraded (`60` stale entries). `check --json` is clean for the active live snapshot, so this is not a schema failure; it is an integrity freshness blocker.
- **Status**: Logged in `workspace/DEV_REVIEW.md`; promotion should stay blocked until either stale windows are refreshed or the integrity policy is narrowed.

### [CATALOG DRIFT] Strategy API needed taxonomy parity
- **Context**: `/api/strategies`
- **Issue**: The route lagged the new strategy taxonomy/grade registry and did not expose `family`, `lane`, `role`, or grade fields to dashboard consumers.
- **Status**: Fixed in `backend/api/server/routes/strategies.js` and covered by `backend/api/tests/api.test.js`.

## Audit Findings - 2026-06-10 (Mass Audit & Ingestion Repair)

### [SYSTEM RISK] Indicator Scalability (Manual Threading)
- **Context**: `shared/lib/market/indicators.js` -> `featureFromWindow` and `backend/core/src/indicators/indicator_engine.cpp`.
- **Issue**: Adding a new indicator requires 5+ manual synchronized edits across JS structures and C++ implementations. No central registry exists.
- **Recommended Move**: Transition to a schema-driven `indicator_manifest.yaml` to automate code generation or dynamic lookup for both JS and C++ layers.
- **Status**: Flagged as High Risk debt.

### [DATA UPGRADE] Deep Ingestion Architecture (Waterproof)
- **Context**: `backend/scripts/data_ops/ingest_market_data/index.js` and `shared/lib/providers/binance.js`.
- **Enhancement**: Implemented 'Local Cache Aggregation' (rebuilding 1w/1mo from 1d cache) and 'Deep Paginated Fetching' (bypassing 1,000-bar API limits).
- **Result**: Crypto weekly history restored (e.g. BTCUSDT 4 -> 464 bars). System now capable of "all the way back" recovery for any symbol.
- **Status**: Implemented & Verified (DCS 0.98).

### [SECURITY] Gateway Sanitization
- **Context**: `backend/gateway/src/polymarket_errors.js`.
- **Fix**: Expanded sensitive header redaction to cover `L2-Signature`, `POLY_ADDRESS`, and 12+ other security token variations.
- **Status**: Hardened.

### [INFRA] Artifact Hygiene Restored
- **Context**: `.gitignore`.
- **Action**: Suppressed 2,900+ build artifacts in `backend/cli/target` and root binaries. Git noise reduced by ~90%.
- **Status**: Resolved.


### [CORRECTION - 2026-06-11] to "Audit Findings - 2026-06-10 (Mass Audit & Ingestion Repair)"
- The ingestion claims hold (BTCUSDT 1w 4→464 bars verified against the ts index), but
  "Implemented & Verified (DCS 0.98)" is overstated for the tree as a whole: a full `npm test`
  on 2026-06-11 shows **7 NEW failing test files** vs the 226/232 baseline (polymarket_preflight,
  proposed_orders_cli, polymarket_auth_health, indicators.data_flow, polymarket_errors,
  sovereign_cli_human_surfaces, sovereign_cli_price_action), plus a proven-broken
  `runGatewayCommand` (`backend_bridge.js:72`) that kills all migrated trade/balance/Polymarket
  paths. Recomputed DCS = **0.87**. Full findings + reviewer decisions:
  `workspace/DEV_REVIEW.md` "Focused Audit - 2026-06-11". The 2026-06-10 session also wrote no
  handoff/session-memory entry — its work was only discoverable via `git status`.
