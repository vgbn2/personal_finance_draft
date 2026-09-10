# Next Session Goal

## Primary Objective: Remote Review, Strategy Specification Refinement & Gated Verification

1. **Remote Proxmox Review & Gated Verification**:
   - Review and verify synchronized documentation files, standalone filter tool, and build health on the HPDesk Proxmox VM (`hpdesk:~/personal_finance_draft/`).
   - Execute gated verification checks (`npm run docs:filter -- --strict`, `npm run hygiene`, `npm run test:structure`, `npm run test:safety`) on the remote host before any operational tasks.

2. **Strategy Specification Review & Calibration (`config/strategies/`)**:
   - Review and calibrate parameter specifications across registered and automated YAML configs (`config/strategies/*.yaml`, `config/strategies/automated/*.yaml`).
   - Calibrate low-timeframe momentum and ML specs (`5m`, `15m`, `30m`, `1h`): entry signal thresholds, minimum hold duration, and volume surge filters to reduce fee/spread drag.
   - Standardize spec schema definitions across timeframes, asset universes, and risk parameters.

3. **Mass-BT Job Spec & Metric Expansion**:
   - Expand `specsPayload` in `backend/cli/commands/research/research_mass_bt.js` and `MassBtJobSpec` in C++ `frame_backtester.hpp` to forward per-strategy risk and cost parameters.
   - Surface profit-factor and trade duration metrics in C++ mass-bt JSON output and CLI matrix.

4. **Continuous Verification & Safety Boundaries**:
   - Keep 100% test integrity across `npm run test:core` (34 CTests), `npm run test:safety` (43 tests), `npm run test:structure` (12 suites), and `npm run hygiene`.
   - Preserve zero-key development invariants, hardware execution PIN gates, and fail-closed safety guards.

