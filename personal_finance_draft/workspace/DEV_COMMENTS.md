# Developer Comments Index (gemini-work)

## Intent Harvest - 2026-05-28
- **backend/api/app.js**: Anti-crash foundation (Uncaught Exception/Unhandled Rejection handlers). Rate limiting (IP-based). API Token check for data-modifying routes. Real-time market data streaming via `fs.watchFile`.
- **backend/api/server/services/cli_executor.js**: 5-second memory cache for "dashboard snappiness".
- **backend/cli/commands/research.js**: OOS overfitting detection and score penalization. `commandBacktest` refactored to return structural report objects for automation.
- **backend/cli/commands/strategy.js**: Strategy automation engine implemented. Uses `EXECUTION_MEMORY` (Set) to prevent duplicate execution of the same signal. Implements freshness guards (24h limit) for signals.
- **backend/cli/commands/trade.js**: MFA/PIN verification for LIVE trades.
- **backend/cli/tui/engine.js**: UX debt: "too many if elses". Sigma band visualization logic.
- **shared/lib/paths.js**: Centralized REPO_ROOT and binary discovery utility.
- **scripts/data_ops/backfill_20_years.js**: 20-year daily historical pipeline via Yahoo Finance.

## Architectural Seams
- **Indicator Scalability**: Adding new indicators requires manual code threading across `IndicatorEngine.cpp`, `research.js`, and `models.js`.
- **Data Quality**: Sentinel-based summaries (e.g., `summarizeStates`) could benefit from strict schema validation.
- **Execution Guard**: `EXECUTION_MEMORY` is currently in-memory; it will be cleared if the process restarts. For true cloud robustness, this should be moved to a persistent store (e.g., Supabase or a local `last_signals.json`).
