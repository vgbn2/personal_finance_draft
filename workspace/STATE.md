# Current Workspace State

## Current Phase
Engineering Documentation Overhaul (7-Section Architecture Suite), SV Console Review & Soak Verification - ACTIVE

- **7-Section Modular Engineering Architecture Suite**:
  - Engineered and integrated a complete 7-section canonical engineering documentation suite across `docs/engineering/` equipped with visual ASCII diagrams, quantified triple-metric Load Indices (CPU/Threads, RAM Heap vs RSS, Disk I/O & Network SLAs, Big-O Complexity), and rigorous LaTeX mathematical formulations:
    - `01_ARCHITECTURE_AND_CODEBASE.md`: Multi-tier system topology map, directory taxonomy, boundary dependency graph, execution call flows, and core architectural invariants (fail-closed, single-writer `central-host`, zero-key development, virtual ledger isolation).
    - `02_DATA_PIPELINE_AND_STORAGE.md`: Multi-market ingestion lifecycle (Equities 5m to 1w, Crypto 1m from 2017, Prediction 1s L2 orderbooks), SOVT binary packed format (8-byte header `SOVT\x01\x00\x00\x00`, 48-byte packed records), zero-allocation streaming two-pointer TS merger ($O(1)$ memory, $<5\text{MB}$ RSS), and local multi-resolution rollup synthesis.
    - `03_NATIVE_CORE_AND_BACKTESTER.md`: C++20 Sovereign Core engine (`sovereign_wealth`), dual-mode `FrameBacktester` (Mode A Native vs Mode B Annotated), execution drag model (spread, slippage, maker/taker fees), and Monte Carlo bootstrap resampling (`xorshift64` PRNG, 1,000–10,000 resamples).
    - `04_QUANTITATIVE_ALPHA_AND_ML_WORKBENCH.md`: Autonomous AI Strategy Explorer 30-minute discovery loop, 6D parameter hypercube space, $\ge 50\%$ Manhattan novelty distance metric, SHA-256 parameter fingerprinting, rolling feature frames, automated YAML registry generation (`config/strategies/<name>.yaml`), and Model Context Protocol (MCP) `explore_strategy` workbench tool.
    - `05_EXECUTION_SUB_POSITIONS_AND_RISK.md`: Virtual sub-positions ledger (`sub_positions.json`), deterministic order attribution signatures (`strat_<id>_<tf>_<ts>_<entropy>` and `manual_cli_<sym>_<ts>_<entropy>`), atomic `.lock` file concurrency, broker physical reconciliation with residual `[MANUAL]` isolation, C++ PreTradeRisk gate ($<15\mu s$), and fractional step sizing (`0.001` equity, `0.0001` crypto).
    - `06_PREDICTION_MARKETS_AND_ORDERBOOK_ARCHIVE.md`: Polymarket Gamma/CLOB ingestion, 1-second L2 orderbook snapshot archiving, virtual prediction paper trading simulator (`paper_ledger.js`), and oracle resolution settlement payout engine.
    - `07_SECURITY_API_TESTING_DEPLOYMENT.md`: RBAC capability authorization, Express REST & WebSocket API mesh, zero-key local test matrix (`test:safety`, `test:structure`, `test:core` 34 CTests), Docker Compose multi-service topology, and Proxmox Ubuntu VM (`hpdesk-1`) operational soak runbook.
  - Purged obsolete legacy documentation files (`architecture_overview.md`, `codebase_org.md`, duplicate unnumbered engineering markdown files).
  - Synchronized `docs/documentation_manifest.json` with all 7 canonical sections, registered Code Atlas records, preserved historical corpus roots, and updated `docs/ARCHITECTURE.md` and `docs/README.md`.
- **TUI Complete Flicker Elimination**:
  - Implemented DEC Mode 2026 Synchronized Output (`BSU` `\x1b[?2026h` / `ESU` `\x1b[?2026l`) across `shared/lib/ui/ansi.js`, `backend/cli/tui/engine/engine.js`, and `backend/cli/commands/tools/backend_visualize.js` to lock GPU frame buffers during terminal repaint cycles.
  - Configured Ink v7 engine in `backend/cli/sovereign_dashboard.mjs` with `incrementalRendering: true`, `patchConsole: true`, and `maxFps: 60` for line-level diff updates.
  - Eliminated racy out-of-order `\x1b[?25l` cursor manipulation writes across async command lifecycle points in `sovereign_dashboard.mjs` (lines 641, 655, 814).
  - Implemented 16ms animation-frame throttled chunk buffering for in-pane child process streaming stdout to prevent high-frequency render queue thrashing.
  - Updated `tests/scripts/architecture/tui_components/tui_phase_b_contract.test.js` to assert `BSU` and `ESU` contract exports.
- **TUI Dashboard Optimization**: Implemented double buffering and diff rendering in `backend/cli/tui/engine/engine.js` and `backend/cli/sovereign_dashboard.mjs` to eliminate terminal flickering during high-frequency repaint loops.
- **Central Environment Test Hardening**: Updated `tests/scripts/operational/prepare_central_env.test.js` to dynamically assert against `EXPECTED_COMPOSE_SERVICES.length` across all 9 Compose services.
- **Cloudflare & Remote Rsync Security Audit**: Audited backward rsync artifacts for Cloudflare configuration to enforce private-origin boundaries and zero-key development policy.
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
