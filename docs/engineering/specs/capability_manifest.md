# Capability Manifest

> **Diátaxis Type**: Reference & Specification | **Status**: Canonical | **Owner**: Platform Engineering | **Review**: Continuous

This manifest catalogs the verified capabilities, source module locations, and disk artifacts across the Sovereign trading platform.

---

## 1. Native C++20 Core Subsystem (`backend/core/`)

The native engine is compiled via CMake 3.20+ as `sovereign_wealth` and tested via 34 CTest targets (`backend/core/CMakeLists.txt` lines 181–214):

### Time-Series Ingestion & Storage Merger
- `backend/core/include/data/binary_ts_merger.hpp` & `src/data/binary_ts_merger.cpp`: Zero-allocation, stream-buffered two-pointer binary TS merger ($O(1)$ memory overhead, $<5\text{MB}$ RSS).
- `backend/core/include/data/binary_ts_reader.hpp` & `src/data/binary_ts_reader.cpp`: High-speed sequential and index-seeking reader for SOVT v1 binary format.
- `backend/core/include/data/data_validator.hpp` & `src/data/data_validator.cpp`: Rigorous IEEE-754 price/volume integrity checks.

### Analytics, Indicators & Correlation
- `backend/core/include/indicators/indicator_engine.hpp` & `src/indicators/indicator_engine.cpp`: Rolling indicators (RSI, MACD, Bollinger Bands, ATR, Exponential Averages).
- `backend/core/include/stats/correlation_engine.hpp` & `src/stats/correlation_engine.cpp`: Clamped Pearson cross-asset correlation matrix.
- `backend/core/include/stats/stats_engine.hpp` & `src/stats/stats_engine.cpp`: Quantitative performance statistics and Monte Carlo bootstrap resampling (`xorshift64`).

### Backtesting & Strategy Execution
- `backend/core/include/backtest/frame_backtester.hpp` & `src/backtest/frame_backtester.cpp`: High-throughput dual-mode vector backtester (OpenMP accelerated, Mode A Native vs Mode B Annotated).
- `backend/core/include/backtest/equity_curve.hpp`: Bar-by-bar drawdown tracking and high-water mark peak equity ledger.
- `backend/core/include/risk/cost_model.hpp` & `src/risk/cost_model.cpp`: Three-component execution drag modeling (spread bps, broker maker/taker fees, linear market impact slippage).

### Pre-Trade Risk Engine
- `backend/core/include/risk/pre_trade_risk.hpp` & `src/risk/pre_trade_risk.cpp`: Microsecond risk gate (<15µs evaluation) validating position limits, drawdown thresholds, and price freshness fences.
- `backend/core/include/risk/kill_switch.hpp` & `src/risk/kill_switch.cpp`: Emergency halt and execution suspension.

---

## 2. Command Line Interface Subsystem (`backend/cli/`)

The CLI provides entrypoints via `backend/cli/sovereign_cli.js` and Ink TUI via `backend/cli/sovereign_dashboard.mjs`, structured into functional command modules:

| Subdirectory | Responsibilities | Key Command Handlers |
|---|---|---|
| `backend/cli/commands/data/` | Historical bar ingestion & cache management | `data_fetch.js`, `data_fetch_binance.js`, `data_summary.js`, `data_clean.js` |
| `backend/cli/commands/research/` | Alpha research, backtests & mass simulation | `research_backtest.js`, `research_mass_bt.js`, `research_correlation.js`, `research_signal.js` |
| `backend/cli/commands/strategy/` | Strategy registry inspection & execution | `strategy_run.js`, `strategy_explore.js`, `strategy_promote.js` |
| `backend/cli/commands/trade/` | Manual trade dispatch & order management | `trade_order.js`, `trade_positions.js`, `trade_cancel.js` |
| `backend/cli/commands/account/` | Credentials, PIN security & environment checks | `account_status.js`, `account_pin.js` |
| `backend/cli/commands/operational/` | Service health, soak runs & log streaming | `operational_soak.js`, `operational_status.js` |
| `backend/cli/commands/settings/` | Platform configuration & runtime toggles | `settings_view.js`, `settings_set.js` |
| `backend/cli/commands/runner/` | Background task loop runner | `runner_start.js`, `runner_daemon.js` |
| `backend/cli/commands/tools/` | Terminal visualizations & diagnostic helpers | `backend_visualize.js`, `chart_viewer.js` |

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

- `shared/lib/trade/sub_positions_ledger.js`: Virtual sub-position accounting with deterministic order signatures (`strat_<id>_<tf>_<ts>_<entropy>` and `manual_cli_<sym>_<ts>_<entropy>`).
- `shared/lib/trade/process_lock.js`: POSIX atomic `.lock` file concurrency via `O_EXCL` flags.
- `shared/lib/market/ts_index_storage.js`: Binary SOVT v1 storage abstraction and native merger bridge.
- `shared/lib/market/quote_feed.js`: Multi-broker quote router with fallback mechanisms.
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
- `config/strategies/curated/*.yaml`: Hand-curated algorithmic trading strategies.
- `config/strategies/automated/*.yaml`: Machine-discovered strategies produced by the Autonomous Strategy Explorer.
- `config/system/environment_manifest.json`: System environment variables, allowed runtime keys, and secret masks.
- `config/risk/risk_policy.yaml`: Global portfolio drawdown gates, position limits, and execution rules.
