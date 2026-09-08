# 02. Data Pipeline & Binary Storage Architecture

This document specifies the market data ingestion lifecycle, data filtration, normalization, binary `SOVT` format, zero-allocation C++ streaming merger, circular ring buffers, and local multi-resolution rollup engine.

---

## 1. Multi-Market Ingestion Pipeline

Sovereign ingests continuous market data across three primary market regimes:
1. **Traditional Equities & Indices**: `5m` base resolution up to `1w` (synthesized locally via rollups).
2. **Crypto Markets**: High-granularity `1m` continuous data back to 2017 (Binance, Coinbase).
3. **Prediction Markets (Polymarket)**: Sub-minute / tick / `1s` orderbook snapshots and Gamma event feeds.

```text
+--------------------------------------------------------------------------------------------------------------------+
|                                      MULTI-MARKET INGESTION & PURIFICATION PIPELINE                                 |
+--------------------------------------------------------------------------------------------------------------------+
|                                                                                                                    |
|  [ INGESTION SOURCES ]                                                                                             |
|  ├── Yahoo Finance API: 5m, 15m, 1h, 1d (Equities, ETFs, Macro Indices)                                            |
|  ├── Binance REST / WebSocket: 1m, 5m, 1h (Spot / Futures Crypto Pairs)                                            |
|  └── Polymarket Gamma & CLOB: 1s orderbook snapshots, market outcome tokens                                        |
|             │                                                                                                      |
|             ▼ [Load: 4/10 | Network SLA: 250-600ms]                                                                |
|  [ INGESTION SANITIZER & NORMALIZATION ENGINE (`shared/lib/market/quote_router.js`) ]                              |
|  ├── 1. Provenance Tagging: Provider attribution, timeframe validation, timestamp monotonicity                     |
|  ├── 2. Numerical Sanitation: Reject NaN/INF, enforce $L \le \min(O, C)$, $H \ge \max(O, C)$, $V \ge 0$           |
|  └── 3. TTL Rate-Limiting Cache: `storage/data/cache/` (5m equities = 300s TTL, 1m crypto = 60s TTL)              |
|             │                                                                                                      |
|             ▼ [Load: 2/10 | Zero-Alloc In-Memory Conversion]                                                       |
|  [ BINARY ENCODING & STORAGE BRIDGE (`shared/lib/market/ts_index_storage.js`) ]                                     |
|  ├── In-Memory Struct Encoding: Encode OHLCV tuples into packed 48-byte binary records                              |
|  └── File Lock Guard: Acquire exclusive write lock (`storage/data/ts/*.bin.lock`) via `withFileLockSync`           |
|             │                                                                                                      |
|             ▼ [Load: 3/10 | Disk I/O: 57.6 MB/s Sequential Stream]                                                 |
|  [ PERSISTENT STORAGE: `storage/data/ts/<symbol>_<timeframe>.bin` ]                                                |
|  - SOVT Version 1 packed binary time series with little-endian 8-byte header and 48-byte records                   |
+--------------------------------------------------------------------------------------------------------------------+
```

---

## 2. Binary `SOVT` Storage Layout & Bit-Level Struct Packing

All time series are persisted in a custom binary layout (`SOVT` Version 1), eliminating JSON parsing overhead:

```text
+--------------------------------------------------------------------------------------------------------------------+
|                                       SOVT BINARY FORMAT MEMORY LAYOUT (VERSION 1)                                 |
+--------------------------------------------------------------------------------------------------------------------+
|                                                                                                                    |
|  [ HEADER: 8 Bytes (Little-Endian, #pragma pack(push, 1)) ]                                                        |
|  0                   1                   2                   3                   4                               7 |
|  +-------------------+-------------------+-------------------+-------------------+-------------------------------+ |
|  |     'S' (0x53)    |     'O' (0x4F)    |     'V' (0x56)    |     'T' (0x54)    | uint32_t record_count (LE)    | |
|  +-------------------+-------------------+-------------------+-------------------+-------------------------------+ |
|  | <------------- 4-Byte Magic Identifier -------------> | <------------ 4-Byte Total Record Count ------------> | |
|                                                                                                                    |
|  [ BODY: Contiguous Array of 48-Byte Packed Little-Endian IEEE-754 Records ]                                       |
|  Byte Offset Range    Field Name   C++ DataType   Byte Width   Description                                         |
|  ----------------------------------------------------------------------------------------------------------------  |
|  0x00 .. 0x07         ts_ms        double (f64)   8 Bytes      Unix Epoch Timestamp in Milliseconds (float64 LE)   |
|  0x08 .. 0x0F         open         double (f64)   8 Bytes      Bar Opening Price (IEEE-754 float64 LE)             |
|  0x10 .. 0x17         high         double (f64)   8 Bytes      Bar Highest Price (IEEE-754 float64 LE)             |
|  0x18 .. 0x1F         low          double (f64)   8 Bytes      Bar Lowest Price (IEEE-754 float64 LE)              |
|  0x20 .. 0x27         close        double (f64)   8 Bytes      Bar Closing Price (IEEE-754 float64 LE)             |
|  0x28 .. 0x2F         volume       double (f64)   8 Bytes      Bar Cumulative Volume (IEEE-754 float64 LE)         |
|  ----------------------------------------------------------------------------------------------------------------  |
|  Record Length: Exactly 48 Bytes (384 Bits) per Bar. Zero Padding, Zero Struct Alignment Holes.                   |
+--------------------------------------------------------------------------------------------------------------------+
```

### Mathematical Offset & Sizing Formalism
For a binary time-series file containing $N$ records:
$$\text{Total File Size}(N) = 8 + (N \times 48) \quad \text{bytes}$$
$$\text{Record Byte Offset}(i) = 8 + (i \times 48), \quad i \in [0, N-1]$$
$$\text{Storage Compression Ratio} = \frac{\text{Raw JSON Footprint}}{48 \times N} \approx 4.2\times$$

---

## 3. C++20 Zero-Allocation Streaming TS Merger (`sovereign::BinaryTsMerger`)

When new historical or incremental bars arrive, appending them in JavaScript causes huge V8 heap spikes ($>950\text{MB}$) and GC pauses. Sovereign replaces in-memory merging with a zero-allocation streaming two-pointer C++ merger (`sovereign_wealth ts-merge`):

```text
+--------------------------------------------------------------------------------------------------------------------+
|                                    C++20 TWO-POINTER STREAMING MERGE PIPELINE                                      |
+--------------------------------------------------------------------------------------------------------------------+
|                                                                                                                    |
|  [ File A: Existing TS File ]                     [ File B: Incoming Incremental Data ]                            |
|  `storage/data/ts/BTC_1m.bin`                     `storage/data/ts/BTC_1m_temp.bin`                                |
|             │                                                   │                                                  |
|             ▼                                                   ▼                                                  |
|  [ BinaryStreamReader A ]                         [ BinaryStreamReader B ]                                         |
|  Chunk: 1024 records × 48B = 48 KB                Chunk: 1024 records × 48B = 48 KB                                |
|             │                                                   │                                                  |
|             └─────────────────────────┬─────────────────────────┘                                                  |
|                                       ▼                                                                            |
|                       [ Two-Pointer Comparator & Deduplicator ]                                                    |
|                       ┌────────────────────────────────────────────────────────┐                                   |
|                       │ ptrA -> recordA (ts_A)   vs   ptrB -> recordB (ts_B)   │                                   |
|                       ├────────────────────────────────────────────────────────┤                                   |
|                       │ If ts_A < ts_B  ==> Write Record A, Advance ptrA       │                                   |
|                       │ If ts_B < ts_A  ==> Write Record B, Advance ptrB       │                                   |
|                       │ If ts_A == ts_B ==> Write Record B (Newer Wins),       │                                   |
|                       │                     Advance Both ptrA and ptrB         │                                   |
|                       └────────────────────────┬───────────────────────────────┘                                   |
|                                                │                                                                   |
|                                                ▼                                                                   |
|                       [ BinaryStreamWriter (48 KB chunk buffer) ]                                                  |
|                                                │                                                                   |
|                                                ▼                                                                   |
|                       [ Atomic Output File: `BTC_1m.bin.tmp` ]                                                     |
|                       - Rewrite final header `uint32_t record_count`                                               |
|                       - Atomic `fs.renameSync()` swap to `BTC_1m.bin`                                              |
+--------------------------------------------------------------------------------------------------------------------+
```

### Gap Detection & Deduplication State Machine

```text
       ┌──────────────┐
       │ SEEK_HEADER  │  Read magic 'SOVT' (4B) and total record count (4B)
       └──────┬───────┘
              │ Magic Valid
              ▼
       ┌──────────────┐
       │ COMPARE_HEADS│◄──────────────────────────────────────────────┐
       └──────┬───────┘                                               │
              │                                                       │
      ┌───────┴───────────────────────────────┐                       │
      ▼                                       ▼                       │
ts_A < ts_B                             ts_B <= ts_A                  │
┌──────────────┐                        ┌──────────────┐              │
│ EMIT_REC_A   │                        │ EMIT_REC_B   │              │
└──────┬───────┘                        └──────┬───────┘              │
       │                                       │                      │
       └──────────────────┬────────────────────┘                      │
                          ▼                                           │
                   ┌──────────────┐                                   │
                   │ CHECK_GAP    │                                   │
                   └──────┬───────┘                                   │
                          │ Δt > Step × (1 + ε) ==> Flag Gap Warning  │
                          ▼                                           │
                   ┌──────────────┐                                   │
                   │ ADVANCE_PTRS │───────────────────────────────────┘
                   └──────┬───────┘
                          │ EOF Reached on Both Streams
                          ▼
                   ┌──────────────┐
                   │ FINALIZE_HDR │ Rewrite uint32_t count, flush & atomic swap
                   └──────────────┘
```

---

## 4. Live Streaming Circular Ring Buffer Mechanics

For real-time indicator computation and fast-path signal derivation, live bars are queued in fixed-capacity in-memory ring buffers:

```text
+--------------------------------------------------------------------------------------------------------------------+
|                                    CIRCULAR RING BUFFER MEMORY & INDEX ARITHMETIC                                  |
+--------------------------------------------------------------------------------------------------------------------+
|                                                                                                                    |
|     Capacity: C = 200 Bars | Head: Pointer to Oldest Bar | Tail: Pointer to Latest Bar | Size: Current Bar Count   |
|                                                                                                                    |
|                          [ Index 0 ]  [ Index 1 ]  [ Index 2 ] ... [ Index 198 ] [ Index 199 ]                     |
|                        ┌────────────┬────────────┬────────────┬───┬────────────┬────────────┐                      |
|  Buffer Memory Array:  │ Bar (t-199)│ Bar (t-198)│ Bar (t-197)│...│ Bar (t-1)  │ Bar (t)    │                      |
|                        └────────────┴────────────┴────────────┴───┴────────────┴────────────┘                      |
|                              ▲                                                       ▲                             |
|                              │ (Head = 0)                                            │ (Tail = 199)                |
|                                                                                                                    |
|  [ Index Wrap-Around Formula ]:                                                                                    |
|  $$\text{Next Tail Index} = (\text{Tail} + 1) \pmod C$$                                                             |
|  $$\text{Next Head Index} = \begin{cases} (\text{Head} + 1) \pmod C & \text{if } \text{Size} = C \\ \text{Head} & \text{if } \text{Size} < C \end{cases}$$ |
|                                                                                                                    |
|  [ Rolling Indicator Window Slicing ]: Zero-allocation sub-array span access for $O(1)$ indicator updates.         |
+--------------------------------------------------------------------------------------------------------------------+
```

---

## 5. Local Multi-Resolution Rollup Synthesis Engine

To minimize external API rate limits, Sovereign stores only the highest-granularity base timeframe and synthesizes higher timeframes locally on disk:

```text
+--------------------------------------------------------------------------------------------------------------------+
|                                      LOCAL MULTI-RESOLUTION ROLLUP SYNTHESIS                                       |
+--------------------------------------------------------------------------------------------------------------------+
|                                                                                                                    |
|  [ 5m Base Binary Time Series ] (`storage/data/ts/SPY_5m.bin`)                                                     |
|  ├── Record 0 (09:30): O: 500.0, H: 501.0, L: 499.5, C: 500.5, V: 10,000                                           |
|  ├── Record 1 (09:35): O: 500.5, H: 502.0, L: 500.2, C: 501.8, V: 12,000                                           |
|  └── Record 2 (09:40): O: 501.8, H: 502.5, L: 501.0, C: 502.1, V: 15,000                                           |
|             │                                                                                                      |
|             ▼                                                                                                      |
|  [ Local Rollup Aggregator (`shared/lib/market/quote_router.js`) ]                                                 |
|  ├── Time Alignment: Floor timestamp to target interval boundary $T_{\text{target}}$                               |
|  ├── Open Price: $O_{\text{target}} = O_{\text{first\_bar}}$                                                       |
|  ├── High Price: $H_{\text{target}} = \max(H_0, H_1, \dots, H_{k-1})$                                              |
|  ├── Low Price: $L_{\text{target}} = \min(L_0, L_1, \dots, L_{k-1})$                                                |
|  ├── Close Price: $C_{\text{target}} = C_{\text{last\_bar}}$                                                       |
|  └── Volume Sum: $V_{\text{target}} = \sum_{j=0}^{k-1} V_j$                                                         |
|             │                                                                                                      |
|             ├───────────────────────┬───────────────────────┬───────────────────────┐                              |
|             ▼                       ▼                       ▼                       ▼                              |
|       [ 15m Rollup ]          [ 30m Rollup ]           [ 1h Rollup ]          [ 1d Rollup ]                        |
|       `SPY_15m.bin`           `SPY_30m.bin`           `SPY_1h.bin`           `SPY_1d.bin`                          |
+--------------------------------------------------------------------------------------------------------------------+
```

---

## 6. Subsystem Load Indices & Performance Benchmarks

| Operation / Component | CPU Utilization | Memory / RSS | Latency / SLA | Disk I/O Profile | Complexity | Load Score (1–10) |
|---|---|---|---|---|---|:---:|
| **Binary TS Read (5,000 bars)** | < 0.05 CPU | `< 2.0 MB` RSS | `< 0.5 ms` | Zero-copy mmap/stream | $O(N)$ sequential | **2/10** |
| **C++ Streaming TS Merge (50k bars)**| 0.2 CPU | **`< 5.0 MB` RSS** | `< 15.0 ms` | $57.6\text{ MB/s}$ sequential | $O(A + B)$ time, $O(1)$ space | **3/10** |
| **Local 15m Rollup Synthesis** | 0.1 CPU | `< 4.0 MB` heap | `< 3.5 ms` / 10k bars | In-memory aggregation | $O(N)$ linear pass | **2/10** |
| **Ring Buffer 200-Bar Update** | < 0.01 CPU | Negligible | **`< 10 μs`** | In-memory array swap | $O(1)$ constant | **1/10** |
| **Atomic File Lock Acquisition** | < 0.01 CPU | Negligible | `< 0.2 ms` | Single lockfile write | $O(1)$ constant | **1/10** |
| **HTTP Provider Fetch (Cached)** | < 0.05 CPU | `< 10.0 MB` heap | `< 2.0 ms` | Local cache hit | $O(1)$ file read | **1/10** |
| **HTTP Provider Fetch (Remote)** | 0.2–0.5 CPU | $25–45\text{ MB}$ heap | $250–600\text{ ms}$ | Network I/O (180 KB) | $O(N)$ network | **4/10** |
