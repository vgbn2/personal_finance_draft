# Current Workspace State

## Current Phase
Native C++ Streaming Binary TS Merge Engine, Ingestion Pipeline & HPDesk VM Soak - ACTIVE

- **Native C++ Streaming TS Merger (`binary_ts_merger`)**: Engineered `sovereign::BinaryTsMerger` and exposed `sovereign_wealth ts-merge` CLI subcommand. Replaced V8 JavaScript in-memory array concatenation/sorting with a zero-allocation, stream-buffered two-pointer merge algorithm ($O(1)$ memory overhead, $<5\text{MB}$ resident set size vs 954MB V8 heap spike).
- **Storage Layer Bridge Integration**: Integrated native merger into `shared/lib/market/ts_index_storage.js::mergeWriteBinUnlocked()` with atomic temp writes, write-lock enforcement (`requireTsWriteLock`), metadata count synchronization, and seamless JavaScript fallback.
- **Backfill Container Memory Optimization**: Updated `sv-backfill` cgroup memory allocation in `infra/docker/docker-compose.yml` from 1024MB to 3072MB (reservation: 512MB) to prevent container restart loops on 1m historical backfills.
- **CTest & Structural Test Verification**: Added `binary_ts_merger_test` to root and test CMakeLists manifests (34/34 CTests passing 100%, `npm run test:core`, `npm run test:data`, `npm run test:structure` passing).
- **Fractional Unit Sizing & Step Enforcement**: Implemented `resolveInstrumentQuantityStep` and integrated `roundDownToStep` in `strategy_presenter.js` and `strategy.js`. Allows fractional order dispatch (`0.001` equity, `0.0001` crypto) for sub-$100 allocations on high-priced assets (SPY, QQQ, BTC), eliminating `below_quantity_step` rejections.
- **Alpaca Tradable Asset Filter**: Added `isAlpacaTradable(symbol)` in `shared/lib/brokers/alpaca_env.js` and candidate pre-filtering in `strategy.js` to skip unsupported broker pairs (e.g. `BNBUSDT`, `EURUSD`).
- **Live Paper Execution & Signatures Verified on HPDesk**: Restarted `sv-bot-alpaca-paper` container on `hpdesk`; live loop placed real fractional orders on Alpaca Paper: `BTC/USD` (0.0006 filled), `SPY` (0.064 accepted), `QQQ` (0.069 accepted) with deterministic client order IDs and pre-trade C++ risk engine validation.
- **Flaw Monitor Log Inspection Mandate**: Enhanced `skills/blast-through/SKILL.md` to require active inspection of runtime logs (`flaw_monitor.log`, `storage/data/logs/*.jsonl`, remote container logs) alongside static test runs across all audit modes.
- **Unified Ingestion & Ascending Timeframe Duration Sorting**: Duration-sorted (`1m` < `5m` < `15m` < `1h` < `1d`) candle ingestion, `INGESTION_TTL_MAP` throttling, and atomic `writeTsIndex` updates directly to `storage/data/ts/`.
- **Local OHLCV Aggregation & Rollup**: Base intraday bars (`5m`) are synthesized locally to higher timeframes (`15m`, `1h`, `1d`) via `rollupFromBase` and `aggregateCandles`, eliminating 26 redundant daily Yahoo Finance API calls per minute.
- **Fast-Path Live Signal Derivation**: Integrated `deriveLiveStrategySignal` into `backend/cli/commands/strategy/strategy.js` to evaluate rolling feature frames directly from pre-warmed binary disk lookback buffers (`storage/data/ts/<SYM>_<TF>.bin`).
- **Sub-Positions Ledger**: Implemented `shared/lib/runtime/sub_positions_ledger.js` for deterministic signatures, atomic sub-position JSON ledger, and auto-attribution of residual broker shares as `[MANUAL]`.
- **Suite Status**: 100% test pass rate across core test suites (`npm run test:data`, `npm run test:structure`, `npm run test:core` with 34/34 CTests).
