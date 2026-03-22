# Research: Phase 8 — Advanced Alpha & Arbitrage Skeletons

## Objective
Enhance the signal engine with cross-exchange correlation filters, implement orderbook manipulation detection, and automate position sizing using multi-strategy Kelly logic.

## Key Findings

### 1. Cross-Exchange Correlation (StatArb)
- **Concept**: Monitor the price spread between Polymarket (Prediction) and Binance/Deribit (Spot/Options).
- **Metric**: Z-Score of the spread.
- **Implementation**:
    - `SpreadMonitor` service calculating `spread = poly_price - spot_price`.
    - Signal if `abs(Z-Score) > 2.0`.
- **Reference**: Cointegration tests are needed to ensure the relationship is mean-reverting.

### 2. Phantom Order (Spoofing) Detection
- **Concept**: Detect "large" orders that are placed and quickly cancelled to manipulate the mid-price.
- **Metric**: Order Book Imbalance (OBI). 
- **Formula**: `(BidSize - AskSize) / (BidSize + AskSize)`.
- **Action**: Reject signals if OBI is heavily skewed toward the signal side by recent cancellations.

### 3. Multi-Strategy Kelly Optimal
- **Objective**: Maximize logarithmic growth while preventing ruin across N strategies.
- **Approach**: 
    - Use "Fractional Kelly" (e.g., 0.25) to account for estimation error.
    - Sizing formula: `Size = Capital * f * (ExpectedReturn / Variance)`.
    - Multi-strategy: Solve the quadratic program for allocation if strategies are correlated.

## Proposed Implementation Plan

### Plan 8.1: Alpha Signals — Correlation & Imbalance
- Implement `CorrelationMonitor` in `app/core/signal_engine.py`.
- Add `OBITracker` (Order Book Imbalance) to `app/core/feed_aggregator.py`.
- Update `Signal` schema to include `alpha_score`.

### Plan 8.2: Position Sizing — Automated Kelly
- Implement `KellySizer` in `app/execution/risk_manager.py`.
- Wire into `ExecutionRouter` for dynamic order sizing.
- Add safety caps (e.g., max 5% per trade regardless of Kelly).

### Plan 8.3: Multi-Market Scalability
- Refactor `Screener` to handle N markets in parallel without blocking.
- Add "Market Scoring" to prioritize capital allocation.
