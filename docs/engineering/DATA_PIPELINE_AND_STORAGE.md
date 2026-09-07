# Data Pipeline, Normalization & Storage Architecture

## 1. System Overview & Core Design

The Sovereign Console (SV Console) data pipeline is engineered as a **local-first, multi-market, passive background engine**. It is designed to run continuously on low-power host nodes (such as an HPDesk mini-PC or local developer workstation) with minimal CPU and memory strain, distributing workloads cooperatively across CPU cores.

```text
+---------------------------------------------------------------------------------------------------+
|                                 END-TO-END DATA LIFECYCLE                                         |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  [ External Market Providers ]                                                                    |
|  Yahoo Finance (Equities) | Binance (Crypto) | Coinbase | Polymarket CLOB/Gamma (Predictions)     |
|              │                                                                                    |
|              ▼                                                                                    |
|  [ 1. Ingestion Pipeline (`backfill-daemon`) ]                                                    |
|  - Rate-limited Provider Fetchers with Exponential Backoff                                        |
|  - Two Modes: Rebuild Mode (deep historical archive) & Live Mode (incremental polling)           |
|  - Multi-lane CPU Load Distribution (Non-blocking async worker concurrency)                       |
|              │                                                                                    |
|              ▼                                                                                    |
|  [ 2. Data Filtration & Normalization Pipeline ]                                                  |
|  - Provenance Check: Provider Attribution & Ranking Score                                         |
|  - Numerical Sanity: Low <= Open/Close <= High, Volume >= 0, No NaN/INF, Strict Timestamp Sort    |
|  - Sidecar Metadata Attachment: `category { family { symbols } }`                                 |
|              │                                                                                    |
|              ▼                                                                                    |
|  [ 3. High-Performance Binary Storage (`SOVT`) ]                                                  |
|  - Canonical Single-Binary: 8-byte header + 48-byte packed records (`storage/data/ts/`)          |
|  - Append-Only Segments: SHA-256 chunk manifests (`.segments/<SYM>_<TF>/`)                       |
|  - Atomic Write Safety: Write to `.tmp` followed by `fs.renameSync()`                             |
|              │                                                                                    |
|              ├──────────────────────────────────────────────┬───────────────────────────────┐     |
|              ▼                                              ▼                               ▼     |
|  [ 4. Data Repair & Rollup Engine ]              [ 5. Native C++ Merger ]        [ 6. Engines ]   |
|  - Local Rollup from Base (5m -> 15m/1h/1d)     - Streaming O(1) Memory         - Backtest Core   |
|  - Eliminates 26+ API calls/symbol/min          - Deduplicating 2-Pointer Merge - Live Bot Signal |
|                                                                                                   |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Multi-Market Resolution & Timeframe Hierarchy

The data ingestion pipeline handles heterogeneous asset classes with specialized resolution guarantees:

| Market Classification | Primary Providers | Resolution / Granularity | Historical Depth & Retention |
|---|---|---|---|
| **Traditional Equities & Indices** | Yahoo Finance, Alpaca | `5m` (base intraday free tier), `15m`, `30m`, `1h`, `4h`, `1d`, `1w` | 60 days intraday (`5m`), 10+ years daily (`1d`) |
| **Crypto Assets** | Binance, Coinbase, CoinGecko | `1m` (base tick-aggregated), `5m`, `15m`, `1h`, `4h`, `1d` | Continuous archive back to 2017–2018 |
| **Prediction Markets** | Polymarket CLOB, Gamma API | `1s` / sub-minute tick orderbook snapshots & trade history | Full resolved market lifecycle archives |

### Ingestion Scheduling & Duration Ordering
To prevent out-of-order dependency hazards, multi-timeframe ingestion sorts candidate updates strictly ascending by duration:
$$\text{Duration Ordering: } 1\text{m} < 5\text{m} < 15\text{m} < 30\text{m} < 1\text{h} < 4\text{h} < 1\text{d} < 1\text{w}$$
This guarantees that base high-frequency bars (`5m`) are committed to disk before dependent rollup aggregations execute.

---

## 3. Data Filtration & Normalization Protocol

Raw JSON data received from remote provider endpoints cannot be trusted directly. Every incoming payload passes through a strict validation gate before being converted to binary format:

```text
[ Raw Provider Response ]
           │
           ▼
[ Step 1: Provenance & Attribution ]
  - Verify provider identity and check ranking score:
    Score = Rank * 1,000,000,000 + BarCount * 1,000 + Quality * 10
           │
           ▼
[ Step 2: Numerical Validity & Integrity Checks ]
  - Timestamp monotonicity: T[i] < T[i+1]
  - Price sanity: Low <= Open <= High AND Low <= Close <= High
  - Finite numbers: Reject NaN, +INF, -INF
  - Volume check: Volume >= 0
           │
           ▼
[ Step 3: Rate-Limit & Depth Governance ]
  - Ingestion TTL check (`INGESTION_TTL_MAP`)
  - Target depth clamp (e.g. max 5,000 bars for deep exploration)
           │
           ▼
[ Step 4: Metadata Normalization ]
  - Sidecar `.meta.json` generated: `family`, `provider`, `symbol`, `timeframe`, `coordinate_id`
           │
           ▼
[ Stored in Binary SOVT Format ]
```

---

## 4. Binary Time-Series Format (`SOVT`)

Market data is serialized into a packed, binary format (`.bin` files) to maximize machine read throughput and minimize disk footprint ($O(1)$ memory mapping capability).

### Byte-Level Memory Layout

```text
+-----------------------------------------------------------------------------------+
| 8-Byte Fixed Header                                                               |
+---------------------------------------------------+-------------------------------+
| Magic Bytes (4 bytes ASCII): "SOVT"               | Record Count (uint32_t LE)    |
| [0x53, 0x4F, 0x56, 0x54]                          | e.g. 0x00010000 (65,536 bars) |
+---------------------------------------------------+-------------------------------+

+-----------------------------------------------------------------------------------+
| Continuous Record Array (N x 48 Bytes Packed, #pragma pack(push, 1))              |
+-----------------------------------------------------------------------------------+
| Offset +0x00: double ts_ms  (Epoch timestamp in milliseconds, Float64LE)          |
| Offset +0x08: double open   (Opening price, Float64LE)                            |
| Offset +0x10: double high   (Highest traded price, Float64LE)                     |
| Offset +0x18: double low    (Lowest traded price, Float64LE)                      |
| Offset +0x20: double close  (Closing / settlement price, Float64LE)               |
| Offset +0x28: double volume (Aggregated volume, Float64LE)                        |
+-----------------------------------------------------------------------------------+
```

### Sidecar Metadata (`<SYMBOL>_<TIMEFRAME>.meta.json`)
Accompanying each `.bin` file is an atomic JSON sidecar defining asset taxonomy:
```json
{
  "coordinate_id": "crypto:binance:BTCUSDT:5m",
  "family": "crypto",
  "provider": "binance",
  "symbol": "BTCUSDT",
  "timeframe": "5m",
  "count": 50000,
  "first_ts_ms": 1502942400000,
  "last_ts_ms": 1756148200000,
  "derived_from": null
}
```

---

## 5. Data Repair, Compaction & Streaming Merge Pipeline

Data degradation can occur over long periods due to upstream API downtime, network dropouts, clock drift, or out-of-order multi-source polling. The SV Console integrates multi-layered self-healing mechanisms:

### 1. Native C++ Streaming Binary Merger (`BinaryTsMerger`)
When historical backfills or live updates overlap with existing binary data, `BinaryTsMerger` executes a stream-buffered two-pointer merge:
- **Zero-Allocation Streaming**: Uses two 48 KB buffers (`BinaryStreamReader`) and an output buffer (`BinaryStreamWriter`), maintaining constant memory overhead ($<5\text{MB}$ RSS vs $954\text{MB}$ V8 heap spikes).
- **Deduplication & Tie-Breaking**: When timestamps collide ($T_{\text{existing}} == T_{\text{incoming}}$), priority policy determines the surviving bar (default: `incoming_wins`).

### 2. Atomic Write & Lock-Stepping Protection
- **Per-Symbol Write Locks**: `withFileLockSync()` enforces `.bin.write.lock` to prevent race conditions across parallel daemons.
- **Atomic Rename**: Writes are staged to `.tmp` files and committed via `fs.renameSync()` to guarantee zero partial-file corruption on power loss.

### 3. Local Intraday Rollup Engine
To eliminate redundant API calls to external providers, higher timeframes (`15m`, `1h`, `1d`) are synthesized directly from verified `5m` base intraday bars via `rollupFromBase()`:
- Computes true open (first bar open), high ($\max(\text{high})$), low ($\min(\text{low})$), close (last bar close), and sum of volumes across the timeframe window.
- Eliminates 26+ redundant API requests per symbol per minute.
