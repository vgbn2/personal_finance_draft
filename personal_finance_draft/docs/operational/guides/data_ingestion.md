# Data Ingestion Contract

The platform needs one coherent stream for assets before contributors add strategies, CNN models, or execution. This document defines the prototype data shape. It is a contract document, not a live ingestion implementation.

## Asset Coverage

Supported asset domains:

- stocks and ETFs
- equity indices
- futures where a broker or data source supports them
- FX pairs
- crypto spot and derivatives
- volatility indexes
- macro series
- news and sentiment feeds

Each asset should resolve to a stable internal `asset_id` before it enters features, backtests, signals, or portfolio monitoring.

## Required Records

`Asset`:

- `asset_id`
- `symbol`
- `name`
- `instrument_type`
- `exchange`
- `currency`
- `timezone`
- `tick_size`
- `lot_size`
- `active_from`
- `active_to`

`OhlcvBar`:

- `asset_id`
- `timestamp`
- `timeframe`
- `open`
- `high`
- `low`
- `close`
- `volume`
- `source`
- `ingested_at`

`DataQualityReport`:

- missing timestamps
- duplicate timestamps
- stale observations
- bad OHLC ordering
- split or corporate-action mismatch
- timezone mismatch
- lookahead risk
- source freshness

## Stream Shape

Prototype flow:

```text
source adapter
  -> raw event
  -> normalized asset id
  -> validated market frame
  -> feature frame
  -> CNN tensor / backtest / signal engine
  -> portfolio monitor / execution gate
```

Validation must happen before calculations. A strategy should not receive bars, macro values, or sentiment values that have not passed quality checks.

## Calculation Inputs

Asset calculations should be possible from these validated fields:

- returns
- rolling volatility
- drawdown
- ATR
- RSI
- MACD
- Bollinger bands
- realized correlation
- liquidity and spread proxies
- benchmark-relative return
- portfolio exposure

Indices and stocks use the same bar contract. Index constituents, weights, and rebalances are separate records and should not be mixed into OHLCV bars.

## Macro And Sentiment Inputs

Wage data is not a personal-finance feature in this platform. If used, it belongs in macro and sentiment context:

- wage growth as labor-market strength
- employment and income data as consumer-demand proxies
- consumer sentiment surveys as regime inputs
- inflation and currency depreciation as purchasing-power and risk-regime inputs

These inputs should be timestamped as known-at-time observations to avoid lookahead bias.

Macro ingestion now also normalizes observations into a canonical store. The current implementation keeps the raw source value, adds a unit label, and derives a unitless feature for modeling so index-point series like CPI and PPI do not get treated like percentages.

## Storage Boundary

Suggested storage layers:

- raw source cache for replay
- normalized market-data store
- feature store for training and backtests
- signal store for generated model outputs
- trade and portfolio store for monitoring

Do not commit real bulk market data. Commit only tiny samples for tests.
