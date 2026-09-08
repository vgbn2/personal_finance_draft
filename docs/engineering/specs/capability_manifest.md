# Capability Manifest

This repository is an active trading-platform prototype with a few remaining legacy seams. The manifest below is a map of the current code and data surfaces, not a promise that every module is fully production ready.

The personal-finance and wealth code is legacy context. It should not drive the platform architecture except where a variable becomes useful as a macro, consumer-sentiment, or purchasing-power input.

## Core Trading Modules

Asset identity and market data:

- `backend/core/src/assets/asset.hpp`
- `backend/core/src/assets/asset_universe.hpp`
- `backend/core/src/assets/instrument_type.hpp`
- `backend/core/src/data/market_event.hpp`
- `backend/core/src/data/ohlcv_bar.hpp`
- `backend/core/src/data/order_book_snapshot.hpp`
- `backend/core/src/data/corporate_action.hpp`
- `backend/core/src/data/data_quality_report.hpp`
- `backend/core/src/data/validated_market_frame.hpp`

Data ingestion adapters:

- `backend/core/src/ingestion/ingestion_adapter.hpp`
- `backend/core/src/ingestion/equity_ingestion.cpp`
- `backend/core/src/ingestion/index_ingestion.cpp`
- `backend/core/src/ingestion/fx_ingestion.cpp`
- `backend/core/src/ingestion/crypto_ingestion.cpp`
- `backend/core/src/ingestion/macro_ingestion.cpp`
- `backend/core/src/ingestion/news_ingestion.cpp`
- `backend/core/src/ingestion/sentiment_ingestion.cpp`
- `backend/core/src/ingestion/stream_router.cpp`

Feature and CNN pipeline:

- `backend/core/src/features/feature_frame.hpp`
- `backend/core/src/features/technical_features.cpp`
- `backend/core/src/features/macro_features.cpp`
- `backend/core/src/features/sentiment_features.cpp`
- `backend/core/src/features/label_builder.cpp`
- `backend/core/src/features/lookahead_guard.cpp`
- `backend/core/src/ml/cnn_tensor_builder.hpp`
- `backend/core/src/ml/cnn_inference.cpp`
- `backend/core/src/ml/model_registry.cpp`
- `models/cnn_v3.onnx`
- `models/regime_classifier.onnx`
- `models/metadata.json`
- `models/feature_config.yaml`

Backtesting and research:

- `backend/core/src/backtest/backtester.hpp`
- `backend/core/src/backtest/equity_curve.hpp`
- `backend/core/src/backtest/trade.hpp`
- `backend/core/src/research/research_hypothesis.hpp`
- `backend/core/src/research/promotion_gate.hpp`
- `backend/core/src/research/walk_forward_split.hpp`
- `backend/core/src/research/cost_model.hpp`

Portfolio and risk:

- `backend/core/src/portfolio/portfolio_state.hpp`
- `backend/core/src/portfolio/position.hpp`
- `backend/core/src/portfolio/pnl_calculator.cpp`
- `backend/core/src/portfolio/exposure_monitor.cpp`
- `backend/core/src/risk/risk_limits.hpp`
- `backend/core/src/risk/pre_trade_risk.cpp`
- `backend/core/src/risk/drawdown_guard.cpp`

Execution:

- `backend/core/src/execution/execution_interface.hpp`
- `backend/core/src/execution/order.hpp`
- `backend/core/src/execution/order_state.hpp`
- `backend/core/src/execution/paper_broker.cpp`
- `backend/core/src/execution/live_broker_adapter.hpp`
- `backend/core/src/execution/twap_vwap.cpp`
- `backend/core/src/execution/kill_switch.cpp`

Monitoring and surfaces:

- `backend/cli/commands/data.js`
- `backend/cli/commands/research.js`
- `backend/cli/commands/portfolio.js`
- `backend/cli/commands/trade.js`
- `backend/cli/commands/strategy.js`
- `backend/api/server/routes/signal.js`
- `backend/api/server/routes/portfolio.js`
- `backend/api/server/routes/backtest.js`
- `backend/api/server/routes/strategies.js`
- `Frontend/dashboard/src/components/portfolio`
- `Frontend/dashboard/src/components/backtest`
- `Frontend/dashboard/src/components/charts`

## Data Files

Repository data artifacts:

- `data/market_data.db`
- `storage/data/cache/last_fetch.json`
- `data/portfolio.json`
- `data/trades/trade_log_YYYY_MM.sqlite`
- `data/backtests/backtest_YYYYMMDD_strategy.json`

Production data should not be committed unless it is tiny sample data for tests.

## Configuration Files

- `config/markets/data_sources.yaml`
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
