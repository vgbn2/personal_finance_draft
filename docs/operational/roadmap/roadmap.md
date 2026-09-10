# Project Roadmap

## Initial Platform Setup (COMPLETE)
- [x] Core directory structure (backend, shared, Frontend)
- [x] Documentation of data contracts
- [x] Config slots
- [x] Build system (CMake)

## Phase 2: Data Contracts And Asset Calculations (COMPLETE)
- [x] Asset identity system (`backend/core/src/data/data_snapshot.hpp`)
- [x] Universe loading (`loadMarketUniverse()` in `data_snapshot.cpp`)
- [x] OHLCV parsing/validation (`data_validator.cpp`)
- [x] Technical indicators (`indicators/indicator_engine.cpp`: RSI, MACD, ATR, Bollinger Bands, rolling vol)
- [x] Data quality reports (`DataQualityReport`, `data_quality_report.json`)
- [x] Ingestion adapters per family (equity, crypto, FX, index, macro, news, sentiment)
- [x] Stats engine (Sharpe, Sortino, Calmar, drawdown, Monte Carlo)
- [x] Risk guard (drawdown circuit-breaker)
- [x] Correlation engine (Pearson + Spearman matrix)
- [x] Quote feed contracts (MT5/Webull injectable adapters)

## Phase 3: Research, Backtesting, And Quantitative ML (COMPLETE)
- [x] Backtest engine (`backtester.cpp`, deterministic long-only & annotated paths)
- [x] Strategy runner / replay (`replay/strategy_runner.cpp`)
- [x] Transaction cost model (slippage drag and per-side fee deductions in backtester)
- [x] Feature frame builder (`backend/core/src/features/feature_frame.cpp`)
- [x] Model candidate registry (`backend/cli/sovereign_cli.js model compare`)
- [x] Autonomous Strategy Explorer daemon (6D novelty hypercube search)
- Canonical Spec: [03_NATIVE_CORE_AND_BACKTESTER.md](../../engineering/architecture/03_NATIVE_CORE_AND_BACKTESTER.md), [04_QUANTITATIVE_ALPHA_AND_ML_WORKBENCH.md](../../engineering/architecture/04_QUANTITATIVE_ALPHA_AND_ML_WORKBENCH.md)

## Phase 4: Macro/Market Model & Prediction Markets (COMPLETE)
- [x] Macro data ingestion (FRED, World Bank, news/sentiment adapters)
- [x] Regime classification (`backend/core/src/research/regime_classifier.cpp`)
- [x] Economy health scoring (`backend/core/src/research/economy_health.cpp`)
- [x] Polymarket Gamma & CLOB 1s L2 orderbook snapshotting
- [x] Prediction market virtual paper trading simulator (`backend/gateway/src/paper_ledger.js`)
- Canonical Spec: [06_PREDICTION_MARKETS_AND_ORDERBOOK_ARCHIVE.md](../../engineering/architecture/06_PREDICTION_MARKETS_AND_ORDERBOOK_ARCHIVE.md)

## Phase 5: Portfolio Monitoring, Dashboards & Execution (COMPLETE)
- [x] Sovereign Ink v7 TUI Terminal Dashboard (`backend/cli/sovereign_dashboard.mjs`)
- [x] React 19 + Vite Web Dashboard (`Frontend/dashboard/`) & Native HTTP API bridge (40 routes)
- [x] Broker adapters (Alpaca Paper/Live, Gate.io, Polymarket)
- [x] Virtual Sub-Positions Ledger (`shared/lib/trade/sub_positions_ledger.js`)
- [x] Pre-Trade Risk gates (<15µs C++ check, max drawdown circuit breakers, hardware PIN authorization)
- Canonical Spec: [05_EXECUTION_SUB_POSITIONS_AND_RISK.md](../../engineering/architecture/05_EXECUTION_SUB_POSITIONS_AND_RISK.md), [07_SECURITY_API_TESTING_DEPLOYMENT.md](../../engineering/architecture/07_SECURITY_API_TESTING_DEPLOYMENT.md)
