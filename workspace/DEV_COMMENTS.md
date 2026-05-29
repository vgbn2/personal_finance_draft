# Developer Comments Index (gemini-work)

## Intent Harvest - 2026-05-28
- **backend/api/app.js**: Anti-crash foundation (Uncaught Exception/Unhandled Rejection handlers). Rate limiting (IP-based). API Token check for data-modifying routes. Real-time market data streaming via `fs.watchFile`.
- **backend/api/server/services/cli_executor.js**: 5-second memory cache for "dashboard snappiness". Decouples API from C++ core and Node CLI using centralized binary discovery.
- **backend/cli/commands/research.js**: OOS overfitting detection and score penalization. `commandBacktest` refactored to return structural report objects for automation. Note: Indicator registration is currently manual and needs better scaling.
- **backend/cli/commands/strategy.js**: Strategy automation engine implemented. Uses `EXECUTION_MEMORY` (Set) to prevent duplicate execution of the same signal. Implements freshness guards (24h limit) for signals. **TODO:** Add sizing logic from strategy risk weight.
- **backend/cli/commands/trade.js**: MFA/PIN verification for LIVE trades. Supports `--pin` flag for unattended automation with Fail-Closed logic.
- **backend/cli/tui/engine.js**: UX debt: "too many if elses". Sigma band visualization logic. Added type-safety normalization for string-based menu options.
- **shared/lib/paths.js**: Centralized REPO_ROOT and binary discovery utility. Eliminates redundant candidate lists.
- **shared/lib/market_validation.js**: Strict schema and freshness rules for OHLCV and scalar data families.
- **scripts/data_ops/backfill_20_years.js**: 20-year daily historical pipeline via Yahoo Finance.

## Architectural Seams
- **CLI Adapter**: `cli_executor.js` acts as a high-integrity bridge. It is well-decoupled.
- **Indicator Scalability**: Adding new indicators requires manual code threading across `IndicatorEngine.cpp`, `research.js`, and `models.js`. (System Risk: High Maintenance)
- **Execution Guard**: `EXECUTION_MEMORY` is currently in-memory; it will be cleared if the process restarts. (System Risk: Cloud Stability)

## Migration Readiness
- **Config-Driven Discovery**: Tool paths for MSYS64 and MetaTrader 5 are now centralized in `config/tools.yaml`.
- **Cloud Readiness**: Core logic is portable via `REPO_ROOT` and dynamic tool resolution in `shared/lib/paths.js`.
