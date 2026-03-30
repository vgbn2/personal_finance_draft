---
phase: 8
plan: 8.2
type: autonomous
wave: 1
depends_on: [8.1]
---

# Plan 8.2: Dynamic Capital Sizing (Kelly Criterion)

## Objective
Implement a multi-market scoring system and dynamic bankroll management to optimize capital allocation across diverse opportunities.

## Context Files
- `app/core/alpha.py`
- `app/core/portfolio.py`
- `app/core/signal_engine.py`
- `app/math/kelly.py`

## Tasks

### Wave 1: Market Scoring
- [ ] **Task 1: Add `MarketScorer` to `app/core/alpha.py`**
  - Implement `calculate_score(snapshot)` based on edge, spread, and volume.
  - `type: auto`

### Wave 2: Dynamic Bankroll & Sizing
- [ ] **Task 2: Update `MarketScreener` for Dynamic Sizing**
  - Use `portfolio.equity` as the basis for Kelly calculations.
  - Apply `MarketScorer` to adjust the `kelly_fraction` dynamically.
  - `type: auto`

### Wave 3: Verification
- [ ] **Task 3: Run `tests/test_dynamic_sizing.py`**
  - Verify that high-quality (high score) signals get larger relative allocations.
  - `type: auto`

## Success Criteria
- [ ] `MarketScreener` uses live portfolio equity for sizing.
- [ ] High-liquidity/low-spread markets receive higher scoring priority.
- [ ] Dynamic sizing correctly handles multiple concurrent signals.
