# Current Workspace State

## Current Phase
SV Console Comprehensive Documentation, Safety Hardening & Native C++ Core Integration - ACTIVE

- **SV Console Comprehensive Documentation Suite**: Authored and integrated production-grade architectural and operational documentation across `docs/`:
  - `docs/engineering/DATA_PIPELINE_AND_STORAGE.md`: Complete ingestion lifecycle, multi-market resolutions (Equities 5m to 1w, Crypto 1m from 2017, Prediction 1s/tick), filtration/normalization rules, binary `SOVT` format (8-byte header, 48-byte packed records), and local rollup engine.
  - `docs/engineering/NATIVE_CORE_AND_BACKTESTER.md`: C++20 Sovereign Core architecture, `BinaryTsMerger` streaming algorithm ($O(1)$ memory, $<5\text{MB}$ RSS), `FrameBacktester` execution modes (Mode A Native vs Mode B Annotated), Monte Carlo bootstrap (`xorshift64`), and `PreTradeRisk` engine.
  - `docs/engineering/SUB_POSITIONS_LEDGER.md`: Virtual sub-position accounting, deterministic order signature contracts (`strat_<id>_<tf>_<ts>_<entropy>` and `manual_cli_<sym>_<ts>_<entropy>`), atomic locking, broker physical reconciliation, and residual `[MANUAL]` share isolation.
  - `docs/OPERATIONAL_SOAK_RUNBOOK.md`: Docker Compose multi-service topology (`sv-web`, `sv-bot-alpaca-paper`, `sv-backfill`, `sv-strategy-explorer`), HPDesk Proxmox VM deployment, runtime log monitoring (`flaw_monitor.log`), and single-writer fail-closed safety.
  - `docs/ARCHITECTURE.md`: Master architectural overview and canonical reading order.
  - `docs/documentation_manifest.json`: Registered newly authored documents with valid source ownership mappings.
- **Safety Test Hardening & Environment Manifest**:
  - Registered `EXPLORER_INTERVAL_MINUTES` in `config/system/environment_manifest.json` under allowed runtime configuration members.
  - Restored `shared/fixtures/analysis/sec_companyfacts_aapl_recorded.json` fixture for SEC analysis.
  - Hardened strict equality assertions under Rule 2 (`[RULE_2_STRICT_ASSERTION]`) in `tests/scripts/strategy/strategy_explorer_workflow.test.js`.
  - Achieved 100% pass rate in `npm run test:safety` (43/43 tests) and `npm run test:structure` (12/12 suites).
- **Native C++ Streaming TS Merger (`binary_ts_merger`)**: Engineered `sovereign::BinaryTsMerger` and exposed `sovereign_wealth ts-merge` CLI subcommand. Replaced V8 JavaScript in-memory array concatenation/sorting with a zero-allocation, stream-buffered two-pointer merge algorithm ($O(1)$ memory overhead, $<5\text{MB}$ resident set size vs 954MB V8 heap spike).
- **Storage Layer Bridge Integration**: Integrated native merger into `shared/lib/market/ts_index_storage.js::mergeWriteBinUnlocked()` with atomic temp writes, write-lock enforcement (`requireTsWriteLock`), metadata count synchronization, and seamless JavaScript fallback.
- **Backfill Container Memory Optimization**: Updated `sv-backfill` cgroup memory allocation in `infra/docker/docker-compose.yml` from 1024MB to 3072MB (reservation: 512MB) to prevent container restart loops on 1m historical backfills.
- **Fractional Unit Sizing & Step Enforcement**: Implemented `resolveInstrumentQuantityStep` and integrated `roundDownToStep` in `strategy_presenter.js` and `strategy.js`. Allows fractional order dispatch (`0.001` equity, `0.0001` crypto) for sub-$100 allocations on high-priced assets (SPY, QQQ, BTC), eliminating `below_quantity_step` rejections.
- **Alpaca Tradable Asset Filter**: Added `isAlpacaTradable(symbol)` in `shared/lib/brokers/alpaca_env.js` and candidate pre-filtering in `strategy.js` to skip unsupported broker pairs (e.g. `BNBUSDT`, `EURUSD`).
- **Live Paper Execution & Signatures Verified on HPDesk**: Restarted `sv-bot-alpaca-paper` container on `hpdesk`; live loop placed real fractional orders on Alpaca Paper: `BTC/USD` (0.0006 filled), `SPY` (0.064 accepted), `QQQ` (0.069 accepted) with deterministic client order IDs and pre-trade C++ risk engine validation.
- **Suite Status**: 100% test pass rate across all test suites (`npm run test:safety`, `npm run test:structure`, `npm run test:core` with 34/34 CTests, `npm run test:data`, `npm run test:api`, `npm run hygiene`, `npm run audit:documentation`).
