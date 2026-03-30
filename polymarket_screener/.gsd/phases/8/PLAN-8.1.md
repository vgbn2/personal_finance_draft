---
phase: 8
plan: 8.1
type: autonomous
wave: 1
depends_on: []
---

# Plan 8.1: Alpha Signals — Correlation & Imbalance

## Objective
Enhance the `MarketScreener` with cross-exchange correlation filtering and orderbook imbalance metrics to reduce false positives and improve signal quality.

## Context Files
- `app/core/domain_models.py`
- `app/core/signal_engine.py`
- `app/core/feed_aggregator.py`
- `app/math/black_scholes.py`

## Tasks

### Wave 1: Data Structures
- [ ] **Task 1: Add `imbalance` to `UnifiedOrderbook`**
  - Implement a property that calculates (bid_size - ask_size) / (bid_size + ask_size) for the top N levels.
  - `type: auto`
- [ ] **Task 2: Add `CorrelationTracker` to `app/core/`**
  - Maintain a rolling correlation of Binance Spot BTC vs Polymarket prices.
  - `type: auto`

### Wave 2: Signal Engine Updates
- [ ] **Task 3: Implement Signal Filtering in `MarketScreener`**
  - Reject BUY_YES signals if orderbook imbalance is strongly negative (< -0.5).
  - Reject signals if Polymarket price is moving inversely to Binance (correlation < 0).
  - `type: auto`

### Wave 3: Verification
- [ ] **Task 4: Run `tests/test_alpha_signals.py`**
  - Verify that imbalance and correlation filters correctly suppress weak signals.
  - `type: auto`

## Success Criteria
- [ ] `MarketScreener` successfully suppresses signals when imbalance is unfavorable.
- [ ] Correlation tracker correctly identifies lead/lag relationships.
- [ ] No regression in baseline Black-Scholes pricing.
