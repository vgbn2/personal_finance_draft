# Capability Manifest

This repository is an active trading-platform prototype with a few remaining legacy seams. The manifest below is a map of the current code and data surfaces, not a promise that every module is fully production ready.

The personal-finance and wealth code is legacy context. It should not drive the platform architecture except where a variable becomes useful as a macro, consumer-sentiment, or purchasing-power input.

## Core Trading Modules

Asset identity and market data:

- `cpp_core/src/assets/asset.hpp`
- `cpp_core/src/assets/asset_universe.hpp`
- `cpp_core/src/assets/instrument_type.hpp`
- `cpp_core/src/data/market_event.hpp`
- `cpp_core/src/data/ohlcv_bar.hpp`
- `cpp_core/src/data/order_book_snapshot.hpp`
- `cpp_core/src/data/corporate_action.hpp`
- `cpp_core/src/data/data_quality_report.hpp`
- `cpp_core/src/data/validated_market_frame.hpp`

Data ingestion adapters:

- `cpp_core/src/ingestion/ingestion_adapter.hpp`
- `cpp_core/src/ingestion/equity_ingestion.cpp`
- `cpp_core/src/ingestion/index_ingestion.cpp`
- `cpp_core/src/ingestion/fx_ingestion.cpp`
- `cpp_core/src/ingestion/crypto_ingestion.cpp`
- `cpp_core/src/ingestion/macro_ingestion.cpp`
- `cpp_core/src/ingestion/news_ingestion.cpp`
- `cpp_core/src/ingestion/sentiment_ingestion.cpp`
- `cpp_core/src/ingestion/stream_router.cpp`

Feature and CNN pipeline:

- `cpp_core/src/features/feature_frame.hpp`
- `cpp_core/src/features/technical_features.cpp`
- `cpp_core/src/features/macro_features.cpp`
- `cpp_core/src/features/sentiment_features.cpp`
- `cpp_core/src/features/label_builder.cpp`
- `cpp_core/src/features/lookahead_guard.cpp`
- `cpp_core/src/ml/cnn_tensor_builder.hpp`
- `cpp_core/src/ml/cnn_inference.cpp`
- `cpp_core/src/ml/model_registry.cpp`
- `models/cnn_v3.onnx`
- `models/regime_classifier.onnx`
- `models/metadata.json`
- `models/feature_config.yaml`

Backtesting and research:

- `cpp_core/src/backtest/backtester.hpp`
- `cpp_core/src/backtest/equity_curve.hpp`
- `cpp_core/src/backtest/trade.hpp`
- `cpp_core/src/research/research_hypothesis.hpp`
- `cpp_core/src/research/promotion_gate.hpp`
- `cpp_core/src/research/walk_forward_split.hpp`
- `cpp_core/src/research/cost_model.hpp`

Portfolio and risk:

- `cpp_core/src/portfolio/portfolio_state.hpp`
- `cpp_core/src/portfolio/position.hpp`
- `cpp_core/src/portfolio/pnl_calculator.cpp`
- `cpp_core/src/portfolio/exposure_monitor.cpp`
- `cpp_core/src/risk/risk_limits.hpp`
- `cpp_core/src/risk/pre_trade_risk.cpp`
- `cpp_core/src/risk/drawdown_guard.cpp`

Execution:

- `cpp_core/src/execution/execution_interface.hpp`
- `cpp_core/src/execution/order.hpp`
- `cpp_core/src/execution/order_state.hpp`
- `cpp_core/src/execution/paper_broker.cpp`
- `cpp_core/src/execution/live_broker_adapter.hpp`
- `cpp_core/src/execution/twap_vwap.cpp`
- `cpp_core/src/execution/kill_switch.cpp`

Monitoring and surfaces:

- `cli/src/commands/data.rs`
- `cli/src/commands/signal.rs`
- `cli/src/commands/backtest.rs`
- `cli/src/commands/portfolio.rs`
- `cli/src/commands/execute.rs`
- `cli/src/commands/paper_trade.rs`
- `cli/src/commands/retrain.rs`
- `web/server/routes/signal.js`
- `web/server/routes/portfolio.js`
- `web/server/routes/backtest.js`
- `web/server/routes/strategies.js`
- `web/public/js/portfolio.js`
- `web/public/js/backtest.js`
- `web/public/js/charts.js`

## Data Files

Repository data artifacts:

- `data/market_data.db`
- `data/cache/last_fetch.json`
- `data/portfolio.json`
- `data/trades/trade_log_YYYY_MM.sqlite`
- `data/backtests/backtest_YYYYMMDD_strategy.json`

Production data should not be committed unless it is tiny sample data for tests.

## Configuration Files

- `config/data_sources.yaml`
- `config/feature_engineering.yaml`
- `config/strategies.yaml`
- `config/risk_management.yaml`
- `config/regime_routing.yaml`
- `config/alerts.yaml`
- `config/app_config.yaml`

Configs should describe sources, symbols, schedules, feature windows, risk limits, and model references. They should not contain credentials.

## Personal Finance Boundary

Do not add new wage, mortgage, tax, or retirement workflows unless they directly support market modeling.

Allowed examples:

- wage growth as a macro labor-market feature
- employment strength as a consumer-sentiment proxy
- inflation and currency depreciation as macro regime inputs

Disallowed examples:

- salary budgeting UI
- household spending planner
- mortgage amortization as a main product surface
