# Next Session Goal

## Primary Objective: Strategy Specifications & Parameter Calibration Refinement

1. **Strategy Specification Refinement (`config/strategies/`)**:
   - Refine strategy parameter specifications across registered and automated YAML configs (`config/strategies/*.yaml`, `config/strategies/automated/*.yaml`).
   - Calibrate low-timeframe momentum and ML specs (`5m`, `15m`, `30m`, `1h`): entry signal thresholds, minimum hold duration, and volume surge filters to reduce fee/spread drag.
   - Standardize spec schema definitions across timeframes, asset universes, and risk parameters.

2. **Mass-BT Job Spec & Metric Expansion**:
   - Expand `specsPayload` in `backend/cli/commands/research/research_mass_bt.js` and `MassBtJobSpec` in C++ `frame_backtester.hpp` to forward per-strategy risk and cost parameters.
   - Surface profit-factor and trade duration metrics in C++ mass-bt JSON and CLI matrix.

3. **Continuous Verification & Quality Assurance**:
   - Keep 100% test integrity across `npm run test:core` (34 CTests), `npm run test:safety` (43 tests), `npm run test:structure` (12 suites), and `npm run hygiene`.
   - Preserve zero-key development invariants and fail-closed safety guards.
