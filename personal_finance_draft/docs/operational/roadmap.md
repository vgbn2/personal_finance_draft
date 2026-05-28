# Project Roadmap

## Initial Platform Setup (COMPLETE)
- [x] Core directory structure (cpp_core, cli, web)
- [x] Documentation of data contracts
- [x] Config slots
- [x] Build system (CMake)

## Phase 2: Data Contracts And Asset Calculations (COMPLETE)
- [x] Asset identity system (`cpp_core/src/data/data_snapshot.hpp`)
- [x] Universe loading (`loadMarketUniverse()` in `data_snapshot.cpp`)
- [x] OHLCV parsing/validation (`data_validator.cpp`)
- [x] Technical indicators (`indicators/indicator_engine.cpp`: RSI, MACD, ATR, Bollinger Bands, rolling vol)
- [x] Data quality reports (`DataQualityReport`, `data_quality_report.json`)
- [x] Ingestion adapters per family (equity, crypto, FX, index, macro, news, sentiment)
- [x] Stats engine (Sharpe, Sortino, Calmar, drawdown, Monte Carlo)
- [x] Risk guard (drawdown circuit-breaker)
- [x] Correlation engine (Pearson + Spearman matrix)
- [x] Quote feed contracts (MT5/Webull injectable adapters)

## Phase 3: Research, Backtesting, And CNN Features (ACTIVE)
- [x] Backtest engine (`backtester.cpp`, deterministic long-only path)
- [x] Strategy runner / replay (`replay/strategy_runner.cpp`)
- [ ] Transaction cost model
- [ ] CNN tensor builder (`calculateFeatureFrame` to tensor contract)
- [ ] Model inference interface

## Phase 4: Macro/Market Model
- [ ] Macro data ingestion (Node ingestor done; C++ consumer pending)
- [ ] Regime classification
- [ ] Economy health score

## Phase 5: Portfolio Monitoring And Execution
- [ ] CLI/Web dashboard implementations
- [ ] Broker adapters
- [ ] Live execution gates
