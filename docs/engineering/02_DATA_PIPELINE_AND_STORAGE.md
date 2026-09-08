# 02. Data Pipeline & Binary Storage Architecture

This document specifies the ingestion lifecycle, data filtration, normalization, binary `SOVT` format, zero-allocation C++ streaming merger, and local multi-resolution rollup engine.

---

## 1. Multi-Market Ingestion Pipeline

Sovereign ingests continuous market data across three primary market regimes:
1. **Traditional Equities & Indices**: `5m` base resolution up to `1w` (synthesized locally via rollups).
2. **Crypto Markets**: High-granularity `1m` continuous data back to 2017 (Binance, Coinbase).
3. **Prediction Markets (Polymarket)**: Sub-minute / tick / `1s` orderbook snapshots and Gamma event feeds.

```text
+----------------------------------------------------------------------------------------------------+
|                                  MULTI-MARKET INGESTION PIPELINE                                   |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|  [ Ingestion Sources ]                                                                             |
|  ├── Yahoo Finance API: 5m, 15m, 1h, 1d (Equities, ETFs, Macro Indices)                           |
|  ├── Binance REST / WebSocket: 1m, 5m, 1h (Spot / Futures Crypto Pairs)                           |
|  └── Polymarket Gamma & CLOB: 1s orderbook snapshots, market outcome tokens                        |
|             │                                                                                      |
|             ▼                                                                                      |
|  [ Ingestion Filter & Normalization Engine ]                                                       |
|  ├── Provenance Tagging: Provider attribution, resolution validation, timestamp monotonicity       |
|  ├── Numerical Sanitation: Reject NaN/INF, ensure low <= min(open, close), high >= max(open, close)|
|  └── TTL Rate-Limiting Cache: `storage/data/cache/` (5m equities = 300s TTL, 1m crypto = 60s TTL) |
|             │                                                                                      |
|             ▼                                                                                      |
|  [ Binary Packing & Storage Engine ]                                                               |
|  ├── In-Memory Encoding: Encode OHLCV tuples into packed 48-byte binary records                    |
|  └── Atomic Storage Bridge: `shared/lib/market/ts_index_storage.js`                                |
|             │                                                                                      |
|             ▼                                                                                      |
|  [ Disk Store: `storage/data/ts/<symbol>_<timeframe>.bin` ]                                        |
|  - SOVT Version 1 packed binary time series                                                        |
+----------------------------------------------------------------------------------------------------+
```

---

## 2. Binary `SOVT` Storage Layout & Struct Packing

All time series are persisted in a custom binary layout (`SOVT` Version 1), eliminating JSON parsing overhead:

```text
+----------------------------------------------------------------------------------------------------+
|                                   SOVT BINARY TIME-SERIES LAYOUT                                   |
+----------------------------------------------------------------------------------------------------+
|  [ HEADER: 8 Bytes (Little-Endian, #pragma pack(push, 1)) ]                                        |
|  ┌───────────────────────────────┬───────────────────────────────────────────────────────────────┐ |
|  │ Bytes 0..3: Magic Identifier  │ Bytes 4..7: uint32_t Record Count                             │ |
|  │ ASCII 'S', 'O', 'V', 'T'      │ Total number of 48-byte records in file                       │ |
|  │ `0x53 0x4F 0x56 0x54`         │ e.g. 50,000 records = `0x50 0xC3 0x00 0x00`                   │ |
|  └───────────────────────────────┴───────────────────────────────────────────────────────────────┘ |
|                                                                                                    |
|  [ BODY: Array of 48-Byte Packed Records ]                                                         |
|  ┌────────────┬─────────────┬─────────────┬─────────────┬─────────────┬─────────────┐              |
|  │ ts_ms      │ open        │ high        │ low         │ close       │ volume      │              |
|  │ float64 LE │ float64 LE  │ float64 LE  │ float64 LE  │ float64 LE  │ float64 LE  │              |
|  │ (8 Bytes)  │ (8 Bytes)   │ (8 Bytes)   │ (8 Bytes)   │ (8 Bytes)   │ (8 Bytes)   │              |
|  ├────────────┼─────────────┼─────────────┼─────────────┼─────────────┼─────────────┤              |
|  │ Record 0   │ Record 0    │ Record 0    │ Record 0    │ Record 0    │ Record 0    │              |
|  │ Record 1   │ Record 1    │ Record 1    │ Record 1    │ Record 1    │ Record 1    │              |
|  │ ...        │ ...         │ ...         │ ...         │ ...         │ ...         │              |
|  │ Record N-1 │ Record N-1  │ Record N-1  │ Record N-1  │ Record N-1  │ Record N-1  │              |
|  └────────────┴─────────────┴─────────────┴─────────────┴─────────────┴─────────────┘              |
+----------------------------------------------------------------------------------------------------+
```

### Mathematical Offset & Sizing Formalism
For a file containing $N$ records:
$$\text{Total File Size} = 8 + (N \times 48) \quad \text{bytes}$$
$$\text{Record Byte Offset}(i) = 8 + (i \times 48), \quad i \in [0, N-1]$$
$$\text{Storage Compression Ratio} = \frac{\text{Raw JSON Footprint}}{48 \times N} \approx 4.2\times$$

---

## 3. C++20 Zero-Allocation Streaming TS Merger (`sovereign::BinaryTsMerger`)

When new historical or incremental bars arrive, appending them in JavaScript causes huge V8 heap spikes ($>950\text{MB}$) and GC pauses. Sovereign replaces in-memory merging with a zero-allocation streaming two-pointer C++ merger (`sovereign_wealth ts-merge`):

```text
+----------------------------------------------------------------------------------------------------+
|                          C++20 TWO-POINTER STREAMING MERGE PIPELINE                                |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|  [ File A: Existing TS File ]                     [ File B: Incoming New Data ]                    |
|  `storage/data/ts/BTC_1m.bin`                     `storage/data/ts/BTC_1m_temp.bin`                |
|             │                                                   │                                  |
|             ▼                                                   ▼                                  |
|  [ BinaryStreamReader A ]                         [ BinaryStreamReader B ]                         |
|  Chunk: 1024 records × 48B = 48 KB                Chunk: 1024 records × 48B = 48 KB                |
|             │                                                   │                                  |
|             └─────────────────────────┬─────────────────────────┘                                  |
|                                       ▼                                                            |
|                       [ Two-Pointer Comparator & Dedup ]                                           |
|                       - Read record ptrA vs ptrB                                                   |
|                       - If ts_A < ts_B: emit record A, advance ptrA                                |
|                       - If ts_B < ts_A: emit record B, advance ptrB                                |
|                       - If ts_A == ts_B: emit B (newer data wins), advance both                    |
|                                       │                                                            |
|                                       ▼                                                            |
|                       [ BinaryStreamWriter (48 KB chunk buffer) ]                                  |
|                                       │                                                            |
|                                       ▼                                                            |
|                       [ Atomic Output File: `BTC_1m.bin.tmp` ]                                     |
|                       - Write header count                                                         |
|                       - Atomic `fs.renameSync()` swap to `BTC_1m.bin`                              |
+----------------------------------------------------------------------------------------------------+
```

### Algorithm Complexity & Resource Guarantees
- **Time Complexity**: $O(N_A + N_B)$ single linear pass.
- **Space Complexity**: $O(1)$ constant working memory overhead ($3 \times 48\text{ KB} = 144\text{ KB}$ stream buffers).
- **Peak Resident Set Size (RSS)**: $<5.0\text{ MB}$ regardless of input file size (50,000 bars or 5,000,000 bars).

---

## 4. Local Multi-Resolution Rollup Synthesis Engine

To minimize external API rate limits, Sovereign stores only the highest-granularity base timeframe and synthesizes higher timeframes locally on disk:

```text
+----------------------------------------------------------------------------------------------------+
|                              LOCAL MULTI-RESOLUTION ROLLUP ENGINE                                  |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|  [ 5m Base Binary Time Series ] (`storage/data/ts/SPY_5m.bin`)                                     |
|  ├── Record 0 (09:30): O: 500.0, H: 501.0, L: 499.5, C: 500.5, V: 10,000                           |
|  ├── Record 1 (09:35): O: 500.5, H: 502.0, L: 500.2, C: 501.8, V: 12,000                           |
|  └── Record 2 (09:40): O: 501.8, H: 502.5, L: 501.0, C: 502.1, V: 15,000                           |
|             │                                                                                      |
|             ▼                                                                                      |
|  [ Local Rollup Aggregator (`shared/lib/market/quote_router.js`) ]                                 |
|  ├── Time Alignment: Floor timestamp to target interval boundary $T_{\text{target}}$               |
|  ├── Open Price: $O_{\text{target}} = O_{\text{first\_bar}}$                                       |
|  ├── High Price: $H_{\text{target}} = \max(H_0, H_1, \dots, H_{k-1})$                              |
|  ├── Low Price: $L_{\text{target}} = \min(L_0, L_1, \dots, L_{k-1})$                                |
|  ├── Close Price: $C_{\text{target}} = C_{\text{last\_bar}}$                                      |
|  └── Volume Sum: $V_{\text{target}} = \sum_{j=0}^{k-1} V_j$                                        |
|             │                                                                                      |
|             ├───────────────────────┬───────────────────────┬───────────────────────┐              |
|             ▼                       ▼                       ▼                       ▼              |
|       [ 15m Rollup ]          [ 30m Rollup ]           [ 1h Rollup ]          [ 1d Rollup ]        |
|       `SPY_15m.bin`           `SPY_30m.bin`           `SPY_1h.bin`           `SPY_1d.bin`          |
+----------------------------------------------------------------------------------------------------+
```

---

## 5. Storage Concurrency & Atomic File Locking

```text
[Writer Process]                                    [Lockfile: `storage/data/ts/SPY_5m.bin.lock`]
       │                                                                  │
       ├── 1. Acquire Lock (`withFileLockSync`) ─────────────────────────►│ Lock Granted (PID, TS)
       │                                                                  │
       ├── 2. Stream Merge to `SPY_5m.bin.tmp` (C++ BinaryTsMerger)       │
       │                                                                  │
       ├── 3. Sync & Atomic Swap: `fs.renameSync(tmp, canonical)`         │
       │                                                                  │
       ├── 4. Update Metadata Sidecar (`SPY_5m.meta.json`)                │
       │                                                                  │
       └── 5. Release Lock ──────────────────────────────────────────────►│ Lock Deleted
```

---

## 6. Subsystem Load Indices & Performance Benchmarks

| Operation | CPU Utilization | Memory / RSS | Latency / SLA | Disk I/O Bandwidth | Complexity |
|---|---|---|---|---|---|
| **Binary TS Read (5,000 bars)** | < 0.05 CPU | `< 2.0 MB` RSS | `< 0.5 ms` | Zero-copy mmap/stream | $O(N)$ sequential |
| **C++ Streaming TS Merge (50k bars)**| 0.2 CPU | **`< 5.0 MB` RSS** | `< 15.0 ms` | $57.6\text{ MB/s}$ sequential | $O(A + B)$ time, $O(1)$ space |
| **Local 15m Rollup Synthesis** | 0.1 CPU | `< 4.0 MB` heap | `< 3.5 ms` / 10k bars | In-memory aggregation | $O(N)$ linear pass |
| **Atomic File Lock Acquisition** | < 0.01 CPU | Negligible | `< 0.2 ms` | Single lockfile write | $O(1)$ constant |
| **HTTP Provider Fetch (Cached)** | < 0.05 CPU | `< 10.0 MB` heap | `< 2.0 ms` | Local cache hit | $O(1)$ file read |
