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
- **Intra-Bar Simulation (Synthetic LTF)**: Deconstruct 1d bars into synthetic 8h/1h/1m bars for noise-robustness backtesting.
