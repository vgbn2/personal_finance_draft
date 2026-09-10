# Next Session Goal

## Primary Objective: Strategy Alpha Tuning & Intraday Execution Optimization

1. **Intraday Strategy Parameter Calibration**:
   - Refine parameter configurations and thresholds for low-timeframe momentum strategies (`5m`, `15m`, `30m`, `1h`) to reduce spread/fee drag observed during mass-bt matrix evaluation.
   - Investigate volume filters and regime detection (`CorrelationEngine`, `TechnicalFeatures`) to prune unprofitable chop trades.

2. **C++ Native Backtest Engine Feature Expansion**:
   - Add trade duration and profit-factor metrics to `mass-bt` JSON payload and CLI renderer.
   - Profile Monte Carlo bootstrap resampling engine integration with multi-strategy matrix evaluations.

3. **Continuous Verification & Safety Integrity**:
   - Maintain 100% green status across `npm run test:core` (34 CTests), `npm run test:safety` (43 tests), `npm run test:structure` (12 suites), and `npm run hygiene`.
   - Preserve fail-closed single-writer and zero-key development invariants.
