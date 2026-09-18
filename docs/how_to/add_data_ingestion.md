# Contributor Guide: Adding New Market Data Feeds

This guide explains how to implement and integrate a new market data provider into Sovereign's streaming timeseries ingestion pipeline.

---

## 1. Provider Archetypes & Pipeline Architecture

Data ingestion in Sovereign falls into three distinct implementation archetypes:

```text
[Archetype A: Direct REST/WS API]     [Archetype B: Third-Party Archive]    [Archetype C: Local Terminal Stub]
  (Binance, Yahoo, Alpaca Data)             (PMXT for Polymarket)            (SovereignExport.mq5 for MT5)
               │                                      │                                      │
               │                                      │                                      │
               ▼                                      ▼                                      ▼
     HTTP/WS Bar Fetcher                     Snapshot Normalizer                     JSON File Watcher
  (fetch_binance / alpaca)              (polymarket_history.js)                      (mt5_quotes_read.js)
               │                                      │                                      │
               └──────────────────────────────┬───────┴──────────────────────────────────────┘
                                              │
                                              ▼
                                 [Validation & Normalization]
                               (shared/lib/market/validation.js)
                               - Canonical symbol mapping (e.g., BTC/USDT)
                               - Strict OHLCV invariant checks
                               - Monotonic timestamp ordering
                                              │
                                     ┌────────┴────────┐
                                     │                 │
                                     ▼                 ▼
                             [Binary TS Merger]    [JSON Cache Fallback]
                             Packed 48-byte        storage/data/cache/
                             records (SOVT)        last_fetch.json
                             storage/data/ts/
```

### Archetype A: Direct REST / WebSocket Ingest
- **Examples**: Binance spot/futures, Yahoo Finance, Alpaca Market Data, Finnhub.
- **Mechanism**: Scheduled poll or live WebSocket subscription directly into `validateCandles()`.

### Archetype B: Specialized Historical Archives
- **Examples**: **PMXT** (`https://api.pmxt.dev`) for Polymarket historical prediction market orderbook snapshots.
- **Mechanism**: Dedicated archival scripts (e.g. `backend/scripts/data_ops/polymarket_research_scheduler.js`) fetch sub-second Level 2 orderbook states, derive spread/midpoints, and archive snapshots to `storage/data/archive/polymarket/`.

### Archetype C: Local Platform Export Stubs
- **Examples**: **Headway / MT5 Quotes** (`tools/mt5/SovereignExport.mq5`).
- **Mechanism**: When a broker (like MT5 brokers or prop firms) does not offer a public REST market data API, a local MQL5 script runs inside the MT5 terminal and writes `headway_mt5_quotes.json` to the terminal's common file directory. Sovereign's `mt5_quotes_read.js` ingests the JSON file and passes quotes to the binary TS merger.

---

## 2. The OHLCV Candle Contract

All candles across every asset class (equities, crypto, forex, commodities, prediction markets) must conform to this schema:

| Field | Type | Description |
|---|---|---|
| `timestamp` | `number` | Unix epoch milliseconds (`uint64`). Must be strictly monotonic. |
| `open` | `number` | Float64 opening price. Must be $> 0$. |
| `high` | `number` | Float64 highest price during period. Must be $\ge \max(open, close)$. |
| `low` | `number` | Float64 lowest price during period. Must be $\le \min(open, close)$ and $> 0$. |
| `close` | `number` | Float64 closing price. Must be $> 0$. |
| `volume` | `number` | Float64 trading volume. Must be $\ge 0$. |

---

## 3. Packed Binary TS Format (`SOVT`)

Candles are written directly to binary files under `storage/data/ts/{ASSET}_{TIMEFRAME}.bin`.
- **Header**: 8-byte magic `SOVT\x01\x00\x00\x00` (Version 1).
- **Record Size**: 48 bytes per candle:
  - `0..7`: `uint64_t timestamp_ms` (Little-endian)
  - `8..15`: `double open` (IEEE-754 64-bit)
  - `16..23`: `double high` (IEEE-754 64-bit)
  - `24..31`: `double low` (IEEE-754 64-bit)
  - `32..39`: `double close` (IEEE-754 64-bit)
  - `40..47`: `double volume` (IEEE-754 64-bit)

---

## 4. Step-by-Step Implementation

### Step 1: Create the Ingest Client
Create a modular fetcher under `backend/scripts/ingest/` or `shared/lib/market/providers/`:

```javascript
'use strict';

const { validateCandles, normalizeSymbol } = require('../../../shared/lib/market/validation.js');

async function fetchMyProviderCandles(rawSymbol, timeframe, limit = 500) {
  const symbol = normalizeSymbol(rawSymbol);
  // 1. Fetch raw API payload
  const response = await fetch(`https://api.myprovider.com/v1/klines?sym=${encodeURIComponent(rawSymbol)}&limit=${limit}`);
  if (!response.ok) {
    throw new Error(`MyProvider fetch failed: HTTP ${response.status}`);
  }
  const payload = await response.json();

  // 2. Map to canonical OHLCV objects
  const candles = payload.data.map((row) => ({
    timestamp: Number(row.t),
    open: Number(row.o),
    high: Number(row.h),
    low: Number(row.l),
    close: Number(row.c),
    volume: Number(row.v),
  }));

  // 3. Validate against strict invariants
  const validation = validateCandles(candles);
  if (!validation.ok) {
    throw new Error(`Candle validation failed: ${validation.error}`);
  }

  return candles;
}

module.exports = { fetchMyProviderCandles };
```

### Step 2: Merge into Binary TS Storage
Use the binary merger utility to append deduplicated candles:

```javascript
const { appendCandlesToBinaryTs } = require('../../../shared/lib/market/binary_ts_writer.js');

await appendCandlesToBinaryTs(symbol, timeframe, candles, {
  storageDir: 'storage/data/ts',
});
```

### Step 3: Register Ingest CLI Command
Expose the provider in `backend/cli/commands/data/data_ingest.js`:
```javascript
// Add flag or family option:
// sovereign ingest --provider myprovider --symbol BTC/USDT --timeframe 1h
```

### Step 4: Write Offline Test Fixture
In accordance with Sovereign's zero-key test architecture, record a real sample payload into `tests/fixtures/` and add a unit test in `tests/scripts/data/`:
- Assert correct mapping of raw provider fields to canonical OHLCV.
- Assert validation catches broken timestamps or impossible prices.
- Assert binary serialization produces exactly 48-byte records.
