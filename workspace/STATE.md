# Current Workspace State

## Current Phase
Unified Ingestion, Local Rollup, Fast-Path Live Signal Derivation & HPDesk Soak - ACTIVE

- **Unified Ingestion & Ascending Timeframe Duration Sorting**: Replaced naive `commandBackfill` in `runAutomationPass` with duration-sorted (`1m` < `5m` < `15m` < `1h` < `1d`) candle ingestion, `INGESTION_TTL_MAP` throttling, and atomic `writeTsIndex` updates directly to `storage/data/ts/`.
- **Local OHLCV Aggregation & Rollup**: Base intraday bars (`5m`) are synthesized locally to higher timeframes (`15m`, `1h`, `1d`) via `rollupFromBase` and `aggregateCandles`, eliminating 26 redundant daily Yahoo Finance API calls per minute.
- **Fast-Path Live Signal Derivation**: Integrated `deriveLiveStrategySignal` into `backend/cli/commands/strategy/strategy.js` to evaluate rolling feature frames directly from pre-warmed binary disk lookback buffers (`storage/data/ts/<SYM>_<TF>.bin`).
- **Live Paper Execution Verified on HPDesk**: Dispatched real orders via Alpaca Paper API from `sv-bot-alpaca-paper` (e.g. SPY market order `a40dc7ef-edbe-4364-bcc5-c1feae577404` accepted).
- **Sub-Positions Ledger**: Implemented `shared/lib/runtime/sub_positions_ledger.js` for deterministic signatures, atomic sub-position JSON ledger, and auto-attribution of residual broker shares as `[MANUAL]`.
- **Anti-Recurrence & Bayesian Skill Knowledge**: Recorded comprehensive root cause diagnoses and anti-recurrence patterns in session memory (`alpaca-paper-pipeline-troubleshooting-and-anti-recurrence.md`) and updated repo-local & global `bayesian-troubleshooter/SKILL.md`.
- **Background Flaw Monitor**: Spawned detached log flaw scanner daemon on HPDesk writing structured diagnostic alerts to `storage/logs/flaw_monitor.log`.
- **Suite Status**: 100% test pass rate across all 197 test files (`npm test`), structural tests (`npm run test:structure`), safety tests (`npm run test:safety`), and hygiene audits (`node scripts/dev/check_hygiene.js`).
