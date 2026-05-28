# Macro And Market Model Roadmap

This document describes the macro and market modeling direction for Sovereign Markets. Some local seams now exist in the prototype, but the full macro regime and economy health stack is still not a production feature.

## Scope Boundary

Macro inputs are market and risk inputs for research, feature engineering, and local analysis. They must not create live ingestion or live execution behavior without explicit gating.

The legacy dashboard field `vndDep` remains part of Sovereign Wealth as a currency-drag assumption. It should be ported with the legacy wealth math before it is connected to any live FX or macro data source.

## Data Domains

Macro and market domains include:

- FX: USD/VND, DXY, and major currency pairs if needed
- inflation: CPI, local inflation, and expected inflation
- rates: policy rates, treasury rates, and yield curves
- risk: VIX-like volatility indexes, credit stress, and liquidity proxies
- markets: OHLCV, volume, spreads, implied volatility, and realized volatility

These domains require timestamped observations, source metadata, and data quality checks before they can feed simulations or strategy research.

## Interfaces

The prototype C++ model may use:

- `MacroObservation`: one timestamped macro datapoint with source metadata
- `MacroSnapshot`: an aligned set of macro inputs for one date
- `MacroRegime`: a classified state such as expansion, slowdown, inflation shock, credit stress, or risk-off
- `EconomyHealthScore`: a normalized macro health score from 0 to 100
- `DataQualityReport`: missing data, stale data, timestamp mismatch, and lookahead-risk checks
- `CostModel`: commission, spread, slippage, funding, borrow, and FX conversion costs
- `ResearchHypothesis`: hypothesis metadata, data requirements, test window, and promotion status

Some of these are still roadmap concepts, but the repo already contains local macro and sentiment-related feature/ingestion seams that should be treated as the current prototype baseline.

## FX And Currency Depreciation

FX data should eventually support:

- currency conversion for market data and portfolio results
- currency depreciation assumptions for wealth planning
- FX conversion costs in strategy returns
- stress scenarios for local purchasing power

`vndDep` is currently documented as a legacy wealth assumption. Phase 2 may port it as part of inflation and currency drag. Phase 4 may replace or augment static assumptions with validated macro or FX inputs.

## Inflation

Inflation inputs may affect:

- real-return reporting
- purchasing-power projections
- spending and cost-of-living assumptions
- macro regime classification
- stress scenarios

The current prototype does not use live inflation feeds. If legacy inflation drag is preserved, keep it separate from trading-platform macro ingestion.

## Rates And Yield Curves

Rates data may include:

- central bank policy rates
- short-term treasury rates
- long-term treasury rates
- yield curve slope
- real rates when inflation expectations are available

Rates may influence cash return assumptions, discounting, leverage spread analysis, macro regimes, and risk simulations.

## Volatility, Liquidity, And Credit Stress

Risk inputs may include:

- VIX-like volatility indexes
- realized and implied volatility
- credit spreads or credit stress proxies
- liquidity stress proxies
- market breadth and volume deterioration

These inputs should feed risk controls and regime classification only after data quality checks pass.

## Macro Regime Classification

`MacroRegime` should classify aligned macro snapshots into states such as:

- expansion
- slowdown
- inflation shock
- credit stress
- risk-off

The classifier should be deterministic for fixed inputs and versioned configuration. It should expose uncertainty or insufficient-data states rather than forcing a false classification.

## Economy Health Score

Economy health means macroeconomic regime health. It does not refer to Sovereign Vessel body or metabolic health.

`EconomyHealthScore` should normalize macro conditions from 0 to 100:

- 0 means severe macro stress
- 50 means mixed or neutral conditions
- 100 means broad macro strength

The score should be an input to market risk, scenario analysis, and portfolio context. It must not be treated as a direct trading signal without quant research validation.

## Simulation Effects

Macro inputs may affect:

- portfolio context through inflation and currency depreciation assumptions
- market simulations through volatility and regime-conditioned return assumptions
- portfolio risk through stress scenarios and correlation changes
- research through regime filters and cost assumptions

## Test Expectations

Macro work should include tests proving:

- missing data produces a data quality warning
- stale macro observations are rejected or flagged
- FX depreciation affects wealth assumptions only where configured
- economy health score is deterministic for fixed inputs
- regime classifier returns stable output for known macro snapshots

The current prototype should keep macro outputs deterministic and explicit about any missing or stale inputs.

## Canonical Macro Store

Macro observations are now normalized into a canonical database shape before persistence. The store keeps:

- the raw source value
- the source timestamp
- a unit label such as `index_points`, `percent`, `count`, or `level`
- a unitless `signed_log1p` feature for model input

This keeps CPI, PPI, rates, payroll counts, and confidence surveys together without pretending they share the same measurement scale.

For model input and dashboard presentation, use the normalized feature by default. Keep the raw source value in the store for provenance, audit, and human inspection.
