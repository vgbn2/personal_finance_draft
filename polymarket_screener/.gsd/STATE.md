## Current Position
- **Phase**: 8 — Advanced Alpha & Arbitrage Skeletons
- **Task**: 8.2 — Dynamic Capital Sizing (Kelly Criterion)
- **Status**: Paused at 2026-03-22 18:22
- **Milestone Audit**: Completed for Phases 5-7 ([Core-Integration-SUMMARY.md](file:///c:/Users/Lenovo/Desktop/VGBN/.vscode/CODEPTIT/polymarket_screener/.gsd/milestones/Core-Integration-SUMMARY.md))

## Last Session Summary
Implemented Phase 8.1 (Correlation & Imbalance) and Phase 8.2 (Capital Sizing). Phase 8.1 is verified. Phase 8.2 is implemented in `alpha.py` and `signal_engine.py` but verification is blocked by a $500 cap issue.

## In-Progress Work
- Modified `app/core/signal_engine.py` with dynamic sizing logic.
- Created `app/core/alpha.py` with `MarketScorer`.
- Added `depth_usd` to `app/core/domain_models.py`.
- Tests: `test_alpha_signals.py` PASS, `test_dynamic_sizing.py` FAIL (IndexError/Capped).

## Context Dump
### Decisions Made
- **Kelly Fraction**: Set to 0.25 (Quarter-Kelly) by default in config for safety.
- **Score Multiplier**: Scaling range [0.5x, 1.5x] based on Liquidity/Spread ratio.

### Approaches Tried
- **Approach 1**: Full Kelly in `signal_engine.py`. Result: Capped at 5% ($500) regardless of edge.
- **Approach 2**: Reduced edge in test (0.01). Result: Still capped at 5% ($500).
- **Approach 3**: Atomic math test (`diag_sizing.py`). Result: PASSED (calculated 1.04% properly).

### Current Hypothesis
Singleton collision in `event_bus` or `config_manager`. Multiple `MarketScreener` instances may be listening to the same channel, or the `fair_prob` calculation for ultra-short DTE (15m) in the full engine is behaving differently than the diagnostic script.

### Files of Interest
- `app/core/signal_engine.py`: Integration of sizing logic.
- `app/core/alpha.py`: Implementation of `MarketScorer`.
- `tests/test_dynamic_sizing.py`: Failing verification test.

## Next Steps
1. Resume with a clean session to reset singletons.
2. Run `tests/test_dynamic_sizing.py` in isolation.
3. Verify `final_alloc` doesn't hit `max_pos` and respects `score_mult`.
