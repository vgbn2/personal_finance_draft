# Capability Manifest

> **Diátaxis Type**: Reference & Specification | **Status**: Canonical | **Owner**: Platform Engineering | **Review**: Continuous

This manifest catalogs the verified capabilities, source module locations, and disk artifacts across the Sovereign trading platform.

---

## 1. Native C++20 Core Subsystem (`backend/core/`)

The native engine is compiled via CMake 3.15+ as `sovereign_wealth` and tested via 34 CTest targets (`backend/core/CMakeLists.txt` lines 181–214):

### Time-Series Ingestion & Storage Merger
- `backend/core/src/data/binary_ts_merger.hpp` & `src/data/binary_ts_merger.cpp`: Zero-allocation, stream-buffered two-pointer binary TS merger ($O(1)$ memory overhead, $<5\text{MB}$ RSS).
- `backend/core/src/data/binary_ts_reader.hpp` & `src/data/binary_ts_reader.cpp`: High-speed sequential and index-seeking reader for SOVT v1 binary format.
- `backend/core/src/data/data_validator.hpp` & `src/data/data_validator.cpp`: Rigorous IEEE-754 price/volume integrity checks.

### Analytics, Indicators & Correlation
- `backend/core/src/indicators/indicator_engine.hpp` & `src/indicators/indicator_engine.cpp`: Rolling indicators (RSI, MACD, Bollinger Bands, ATR, Exponential Averages).
- `backend/core/src/correlation/correlation_engine.hpp` & `src/correlation/correlation_engine.cpp`: Clamped Pearson cross-asset correlation matrix.
- `backend/core/src/stats/stats_engine.hpp` & `src/stats/stats_engine.cpp`: Quantitative performance statistics and Monte Carlo bootstrap resampling (`xorshift64`).

### Backtesting & Strategy Execution
- `backend/core/src/backtest/frame_backtester.hpp` & `src/backtest/frame_backtester.cpp`: High-throughput dual-mode vector backtester (OpenMP accelerated, Mode A Native vs Mode B Annotated).
- `backend/core/src/backtest/equity_curve.hpp`: Bar-by-bar drawdown tracking and high-water mark peak equity ledger.
- `backend/core/src/risk/cost_model.hpp` & `src/risk/cost_model.cpp`: Three-component execution drag modeling (spread bps, broker maker/taker fees, linear market impact slippage).

### Pre-Trade Risk Engine
- `backend/core/src/risk/pre_trade_risk.hpp` & `src/risk/pre_trade_risk.cpp`: Microsecond risk gate (<15µs evaluation) validating position limits, drawdown thresholds, and price freshness fences.
- `backend/core/src/execution/kill_switch.hpp`: Header-only emergency halt and execution suspension.

---

## 2. Command Line Interface Subsystem (`backend/cli/`)

The CLI provides entrypoints via `backend/cli/sovereign_cli.js` and Ink TUI via `backend/cli/sovereign_dashboard.mjs`, structured into functional command modules:

| Subdirectory | Responsibilities | Key Command Handlers |
|---|---|---|
| `backend/cli/commands/data/` | Historical bar ingestion & cache management | `data.js`, `data_accumulate.js`, `data_rollup.js`, `backfill_daemon.js` |
| `backend/cli/commands/research/` | Alpha research, backtests & mass simulation | `research.js`, `research_mass_bt.js`, `research_optimization.js` |
| `backend/cli/commands/strategy/` | Strategy registry inspection & execution | `strategy.js`, `automation_guard.js`, `prop_firm_profiles.js` |
| `backend/cli/commands/trade/` | Trade dispatch & broker adapters | `trade.js`, `trade_polymarket.js`, `trade_mt5.js` |
| `backend/cli/commands/account/` | Credentials, PIN security & authentication | `auth.js` |
| `backend/cli/commands/operational/` | Service health, soak runs & remote monitoring | `status.js`, `market_monitor.js`, `portfolio_monitor.js`, `remote.js`, `setup.js` |
| `backend/cli/commands/settings/` | Platform configuration & runtime toggles | `settings.js` |
| `backend/cli/commands/runner/` | Background task loop runner | `run.js` |
| `backend/cli/commands/tools/` | Terminal visualizations & risk diagnostics | `backend.js`, `backend_visualize.js`, `backend_correlation.js`, `kill_switch.js`, `risk.js` |

---

## 3. Web Dashboard & API Bridge (`backend/api/`)

The web API runs a native `node:http` server on port 8787 across 40 active route keys in `backend/api/server/routes/index.js`:

- `backend/api/server/routes/status/`: Health probes (`health.js`), system status (`status.js`, `client_status.js`), runner state (`run_status.js`).
- `backend/api/server/routes/data/`: Data summary (`data_summary.js`), universe (`universe.js`), indicators (`indicators.js`), quotes (`quotes.js`), cache lists (`cache_list.js`).
- `backend/api/server/routes/market/`: Backtest (`backtest.js`), correlation (`correlation.js`), signals (`signal.js`, `signal_promote.js`), combined analysis (`combined_analysis.js`, `combined_promote.js`, `combined_paper_cycle.js`).
- `backend/api/server/routes/bot/`: Bot status (`bot_status.js`), cycle execution (`bot_cycle.js`), emergency sell (`bot_sell.js`).
- `backend/api/server/routes/system/`: System status (`system.js`, `service_health.js`), portfolio (`portfolio.js`), kill-switch (`kill_switch.js`), container infra (`infra.js`).
- `backend/api/server/routes/account/`: Auth (`auth.js`, `session_reauth.js`), database status (`database.js`), config (`config.js`, `supabase_config.js`).
- `backend/api/server/routes/public/`: Public market summaries (`public_market_summary.js`, `public_freshness.js`, `public_research_summary.js`).

---

## 4. Shared Domain Logic (`shared/lib/`)

- `shared/lib/runtime/sub_positions_ledger.js`: Virtual sub-position accounting with deterministic order signatures (`strat_<id>_<tf>_<ts>_<entropy>` and `manual_cli_<sym>_<ts>_<entropy>`).
- `shared/lib/runtime/process_lock.js`: POSIX atomic `.lock` file concurrency via `O_EXCL` flags.
- `shared/lib/market/ts_index_storage.js`: Binary SOVT v1 storage abstraction and native merger bridge.
- `shared/lib/market/quote_router.js`: Multi-broker quote router with fallback mechanisms.
- `shared/lib/ui/ansi.js`: ANSI terminal formatting and DEC Mode 2026 synchronized output escapes.

---

## 5. Storage Layout & Data Artifacts (`storage/data/`)

| Path | Format | Description |
|---|---|---|
| `storage/data/ts/*.bin` | SOVT v1 Binary | High-density OHLCV time-series (48 bytes/record). |
| `storage/data/cache/*.json` | JSON Cache | Cached universe, indicators, and last-fetch snapshots. |
| `storage/data/paper/` | JSONL / JSON | Virtual paper trading state, sub-position ledgers, order records. |
| `storage/data/locks/*.lock` | POSIX Locks | Atomic zero-byte lockfiles for single-writer authority. |

---

## 6. Active Configuration Manifests (`config/`)

- `config/trading/strategies.yaml`: Master strategy registry linking curated and automated strategy definitions.
- `config/strategies/curated/*.yaml`: Hand-curated algorithmic trading strategies (15 strategies).
- `config/strategies/automated/*.yaml`: Machine-discovered strategies produced by the Autonomous Strategy Explorer (34 automated strategies).
- `config/system/environment_manifest.json`: System environment variables, allowed runtime keys, and secret masks.
- `config/trading/risk_management.yaml`: Global portfolio drawdown gates, position limits, and execution rules.
