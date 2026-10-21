# Data Ingestion Contract

The platform needs one coherent stream for assets before contributors add strategies, ML models, or execution. This document defines the operational ingestion contract. For the binary format and storage specification, see [02. Data Pipeline & Storage](../../engineering/architecture/02_DATA_PIPELINE_AND_STORAGE.md).

## Asset Coverage

Supported asset domains:

- stocks and ETFs (Alpaca / Yahoo Finance: 5m base bars)
- equity indices (SPY, QQQ)
- crypto spot (Binance: 1m historical from 2017)
- prediction markets (Polymarket: Gamma API & CLOB 1s L2 orderbooks)
- macro series & economic indicators (FRED / SEC Company Facts)

Each asset resolves to a canonical symbol format (e.g. `SPY`, `BTC/USD`, `ETH/USD`) before entering features, backtests, or execution.

## Storage Formats

1. **Binary TS Index (`storage/data/ts/*.bin`)**:
   - 8-byte magic header: `SOVT\x01\x00\x00\x00`
   - 48-byte packed records: timestamp (uint64_le), open, high, low, close, volume (float64_le)
   - Zero-allocation two-pointer streaming merger (`backend/core/src/data/binary_ts_merger.cpp`)
2. **JSON Cache (`storage/data/cache/*.json`)**:
   - Rapid-inspection caches for indicators, backtest fixtures, and recent market snapshots.
   - Machine-written snapshots use compact JSON while preserving parsed content and atomic replacement.
   - `mass-backfill --binary-only` skips legacy JSON history/cache persistence while retaining binary TS and quality-report writes for maintenance runs.

Incremental write safety:

- Duplicate tail records are compared against the existing binary record and do not trigger a full native merge rewrite.
- Strictly newer records use the existing fsync-protected append path.
- Conflicting overlaps retain provider-priority native merge semantics.
- Native merger buffers are heap-backed at 65,536 records (about 3 MiB per stream) to avoid stack pressure.
- Descriptor-level `fsync` after native stream flush remains deferred: the current cross-platform `fstream` abstraction has no verified portable descriptor boundary, so `flush()` is not documented as durable beyond the existing contract.

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
