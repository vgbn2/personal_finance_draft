# Quant Research Roadmap

> **Research policy, not implementation reference:** this page defines methodology and promotion expectations. Source-owned algorithms, numerical assumptions, data structures, and protocols belong in the Code Atlas; active experiments and blockers belong in `workspace/research/` or `workspace/reports/`.

This document defines the research process for Sovereign Markets. The repo now has local backtesting, data-quality checks, feature construction, and model-comparison seams, but the promotion pipeline is still a local research workflow rather than a live production system.

## Scope Boundary

Quant research is the systematic search for repeatable, testable market edges. It is separate from discretionary market notes and should remain reproducible from versioned inputs and configuration.

Quant research must provide:

- a falsifiable hypothesis
- defined data requirements
- a reproducible test method
- realistic transaction costs
- risk and portfolio constraints
- promotion criteria before production use

Discretionary analysis may inform a hypothesis, but it is not an edge until it survives the research lifecycle below.

## Research Lifecycle

Each `ResearchHypothesis` should eventually track:

- hypothesis name and owner
- market and instrument universe
- data domains required
- feature definitions
- test window and validation window
- benchmark
- expected holding period
- expected capacity
- transaction cost assumptions
- failure criteria
- promotion status

Lifecycle states:

1. Draft: idea is written down, but not tested.
2. Data Ready: required data is available and quality-checked.
3. Backtested: historical test has run without known integrity violations.
4. Validated: walk-forward, out-of-sample, or paper-trading evidence exists.
5. Promoted: strategy can be exposed to production systems behind execution gates.
6. Retired: edge is invalid, decayed, or no longer operationally acceptable.

## Edge Validation

A strategy must not be considered valid because of one attractive equity curve. Research should evaluate:

- absolute and benchmark-relative returns
- drawdown depth and duration
- hit rate and payoff ratio
- turnover and capacity
- exposure concentration
- sensitivity to parameter changes
- behavior across market regimes
- robustness after transaction costs

Validation should prefer simple explanations. If a model only works through fragile parameter choices, it should remain unpromoted.

## Backtest Integrity

Backtests must reject or flag:

- lookahead data
- survivorship-biased universes
- timestamp mismatches
- revised macro data used as if it were known at the time
- overlapping walk-forward windows that leak validation data
- missing corporate actions where they affect price history
- unrealistic fills, fees, or borrowing assumptions

Every backtest result should be reproducible from versioned inputs and configuration.

## Transaction Costs

Cost modeling should be explicit through a `CostModel` covering:

- commissions
- bid/ask spread
- slippage
- market impact
- funding costs
- borrow costs
- FX conversion costs
- taxes or exchange fees where relevant

Research output should show gross and net performance. A strategy that depends on ignoring costs is not production-ready.

## Volatility Modeling

Volatility should be treated as both a forecast input and a risk constraint.

Volatility inputs include:

- realized volatility
- implied volatility where available
- rolling volatility windows
- volatility indexes such as VIX-like proxies
- regime-specific volatility assumptions

Strategies should document whether volatility controls affect entry, sizing, exits, or portfolio allocation.

## Data Quality Rules

Market and macro data must pass quality checks before research or simulation use.

`DataQualityReport` outputs should cover:

- missing data
- stale observations
- duplicate timestamps
- timestamp alignment errors
- outlier checks
- revision and lookahead risk
- source identity and refresh time

Failed quality checks should block promotion and may block research runs depending on severity.

## Portfolio Construction

Research should not stop at single-signal returns. Portfolio construction must define:

- position sizing
- gross and net exposure limits
- concentration limits
- correlation controls
- drawdown controls
- leverage limits
- cash and collateral assumptions
- rebalance frequency

Position sizing can include fixed sizing, volatility targeting, Kelly-inspired sizing, or constrained optimization, but each method must state its assumptions and failure modes.

## Strategy Taxonomy

Sovereign Markets may eventually classify strategies as:

- trend following
- mean reversion
- carry
- value
- quality
- momentum
- volatility risk premium
- event-driven
- statistical arbitrage
- macro regime allocation
- option structure analysis

Taxonomy is for organization. It does not validate an edge.

## Promotion Rules

A strategy cannot be promoted to production until it has:

- documented hypothesis metadata
- validated input data quality
- reproducible backtest results
- realistic cost model
- out-of-sample or walk-forward validation
- risk limits
- failure and retirement criteria
- review approval
- execution controls if it can affect live orders

The current local prototype can support research workflows, but any path to live production still needs execution gates, review, and promotion criteria.
