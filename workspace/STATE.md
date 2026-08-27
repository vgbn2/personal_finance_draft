# Current Workspace State

## Current Phase
Fast-Path Live Signal Derivation & Inference Pipeline - ACTIVE

- **Fast-Path Live Signal Derivation**: Integrated `deriveLiveStrategySignal` into `backend/cli/commands/strategy/strategy.js` to evaluate rolling feature frames directly from pre-warmed binary disk lookback buffers (`storage/data/ts/<SYM>_<TF>.bin`), eliminating `commandBacktest` inversion during live bot polling loops.
- **Continuous 1-100 Conviction Scoring**: Standardized model conviction metrics in `shared/lib/ml/models.js` via continuous Bull/Bear score mapping $50.0 + 50.0 \times (P_{\text{up}} - P_{\text{down}})$.
- **Sub-Positions Ledger**: Implemented `shared/lib/runtime/sub_positions_ledger.js` for deterministic signatures, atomic sub-position JSON ledger, and auto-attribution of residual broker shares as `[MANUAL]`.
- **Pre-Trade Risk & Protocol Bounds**: Aligned C++ risk check protocol validation and CLI exit codes (0 = approved, 2 = rejected by risk limit, 1 = validation error) in `backend/cli/commands/tools/risk.js`.
- **TUI 9-Category Manifest Parity**: Reconciled category and command navigation indices across all TUI dashboard contract test suites.
- **Suite Status**: 100% test pass rate across all 197 test files (`npm test`), structural tests (`npm run test:structure`), safety tests (`npm run test:safety`), and hygiene audits (`node scripts/dev/check_hygiene.js`).


