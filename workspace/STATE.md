# Current Workspace State

## Current Phase
Unified Ingestion, Local Rollup, Fast-Path Live Signal Derivation & HPDesk Soak - ACTIVE

- **Fractional Unit Sizing & Step Enforcement**: Implemented `resolveInstrumentQuantityStep` and integrated `roundDownToStep` in `strategy_presenter.js` and `strategy.js`. Allows fractional order dispatch (`0.001` equity, `0.0001` crypto) for sub-$100 allocations on high-priced assets (SPY, QQQ, BTC), eliminating `below_quantity_step` rejections.
- **Alpaca Tradable Asset Filter**: Added `isAlpacaTradable(symbol)` in `shared/lib/brokers/alpaca_env.js` and candidate pre-filtering in `strategy.js` to skip unsupported broker pairs (e.g. `BNBUSDT`, `EURUSD`).
- **Live Paper Execution & Signatures Verified on HPDesk**: Restarted `sv-bot-alpaca-paper` container on `hpdesk`; live loop placed real fractional orders on Alpaca Paper: `BTC/USD` (0.0006 filled), `SPY` (0.064 accepted), `QQQ` (0.069 accepted) with deterministic client order IDs and pre-trade C++ risk engine validation.
- **Flaw Monitor Log Inspection Mandate**: Enhanced `skills/blast-through/SKILL.md` to require active inspection of runtime logs (`flaw_monitor.log`, `storage/data/logs/*.jsonl`, remote container logs) alongside static test runs across all audit modes.
- **Unified Ingestion & Ascending Timeframe Duration Sorting**: Duration-sorted (`1m` < `5m` < `15m` < `1h` < `1d`) candle ingestion, `INGESTION_TTL_MAP` throttling, and atomic `writeTsIndex` updates directly to `storage/data/ts/`.
- **Local OHLCV Aggregation & Rollup**: Base intraday bars (`5m`) are synthesized locally to higher timeframes (`15m`, `1h`, `1d`) via `rollupFromBase` and `aggregateCandles`, eliminating 26 redundant daily Yahoo Finance API calls per minute.
- **Fast-Path Live Signal Derivation**: Integrated `deriveLiveStrategySignal` into `backend/cli/commands/strategy/strategy.js` to evaluate rolling feature frames directly from pre-warmed binary disk lookback buffers (`storage/data/ts/<SYM>_<TF>.bin`).
- **Sub-Positions Ledger**: Implemented `shared/lib/runtime/sub_positions_ledger.js` for deterministic signatures, atomic sub-position JSON ledger, and auto-attribution of residual broker shares as `[MANUAL]`.
- **Suite Status**: 100% test pass rate across all 197 test files (`npm test`), structural tests (`npm run test:structure`), safety tests (`npm run test:safety`), and hygiene audits (`node scripts/dev/check_hygiene.js`).
