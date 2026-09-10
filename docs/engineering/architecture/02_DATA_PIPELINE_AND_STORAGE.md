# 02. Data Pipeline & Binary Storage Architecture

This document specifies the market data ingestion lifecycle, data filtration, normalization, binary `SOVT` format, zero-allocation C++ streaming merger, circular ring buffers, and local multi-resolution rollup engine.

---

## 1. Multi-Market Ingestion Pipeline

Sovereign ingests continuous market data across three primary market regimes:
1. **Traditional Equities & Indices**: `5m` base resolution up to `1w` (synthesized locally via rollups).
2. **Crypto Markets**: High-granularity `1m` continuous data back to 2017 (Binance, Coinbase).
3. **Prediction Markets (Polymarket)**: Sub-minute / tick / `1s` orderbook snapshots and Gamma event feeds.

```mermaid
flowchart TD
    subgraph Sources["Ingestion Sources"]
        YAHOO["Yahoo Finance API: 5m, 15m, 1h, 1d<br/>(Equities, ETFs, Macro Indices)"]
        BINANCE["Binance REST / WebSocket: 1m, 5m, 1h<br/>(Spot / Futures Crypto Pairs)"]
        POLY["Polymarket Gamma & CLOB: 1s snapshots<br/>(Market Outcome Tokens)"]
    end

    subgraph Sanitizer["Ingestion Sanitizer & Normalization (shared/lib/market/quote_router.js)"]
        PROV["1. Provenance Tagging: Provider attribution, timeframe validation"]
        NUM["2. Numerical Sanitation: Reject NaN/INF, enforce L <= min(O,C), H >= max(O,C), V >= 0"]
        CACHE["3. TTL Cache: storage/data/cache/ (5m equities = 300s TTL, 1m crypto = 60s TTL)"]
    end

    subgraph StorageBridge["Binary Encoding & Storage Bridge (shared/lib/market/ts_index_storage.js)"]
        STRUCT["In-Memory Struct Encoding: Packed 48-byte records"]
        LOCK["File Lock Guard: Exclusive lock via withFileLockSync"]
    end

    STORAGE[("Persistent Storage: storage/data/ts/{symbol}_{tf}.bin<br/>SOVT v1 packed binary time series with 8-byte header")]

    Sources -->|Network SLA: 250-600ms| Sanitizer
    Sanitizer --> StorageBridge
    StorageBridge -->|Sequential Stream: 57.6 MB/s| STORAGE
```

---

## 2. Binary `SOVT` Storage Layout & Bit-Level Struct Packing

All time series are persisted in a custom binary layout (`SOVT` Version 1), eliminating JSON parsing overhead:

### Header Layout (8 Bytes, `#pragma pack(push, 1)`)

| Byte Offset Range | Field Name | C++ Data Type | Byte Width | Encoded Value / Description |
|---|---|---|---|---|
| `0x00..0x03` | Magic Identifier | `char[4]` | 4 Bytes | ASCII `SOVT` (`0x53, 0x4F, 0x56, 0x54`) |
| `0x04..0x07` | Total Record Count | `uint32_t` | 4 Bytes | Number of 48-byte records in body (little-endian) |

### Body Layout (Contiguous 48-Byte Packed IEEE-754 Records)

| Byte Offset Range | Field Name | C++ Data Type | Byte Width | Description |
|---|---|---|---|---|
| `0x00..0x07` | `ts_ms` | `double` (f64) | 8 Bytes | Unix Epoch Timestamp in Milliseconds (IEEE-754 LE) |
| `0x08..0x0F` | `open` | `double` (f64) | 8 Bytes | Bar Opening Price (IEEE-754 LE) |
| `0x10..0x17` | `high` | `double` (f64) | 8 Bytes | Bar Highest Price (IEEE-754 LE) |
| `0x18..0x1F` | `low` | `double` (f64) | 8 Bytes | Bar Lowest Price (IEEE-754 LE) |
| `0x20..0x27` | `close` | `double` (f64) | 8 Bytes | Bar Closing Price (IEEE-754 LE) |
| `0x28..0x2F` | `volume` | `double` (f64) | 8 Bytes | Bar Cumulative Volume (IEEE-754 LE) |

*Record Length: Exactly 48 Bytes (384 Bits) per Bar. Zero padding, zero struct alignment holes.*

### Mathematical Offset & Sizing Formalism
For a binary time-series file containing $N$ records:
$$\text{Total File Size}(N) = 8 + (N \times 48) \quad \text{bytes}$$
$$\text{Record Byte Offset}(i) = 8 + (i \times 48), \quad i \in [0, N-1]$$
$$\text{Storage Compression Ratio} = \frac{\text{Raw JSON Footprint}}{48 \times N} \approx 4.2\times$$

---

## 3. C++20 Zero-Allocation Streaming TS Merger (`sovereign::BinaryTsMerger`)

When new historical or incremental bars arrive, appending them in JavaScript causes huge V8 heap spikes ($>950\text{MB}$) and GC pauses. Sovereign replaces in-memory merging with a zero-allocation streaming two-pointer C++ merger (`sovereign_wealth ts-merge`):

```mermaid
flowchart TD
    FILE_A["Existing TS File<br/>storage/data/ts/BTC_1m.bin"]
    FILE_B["Incoming Incremental Data<br/>storage/data/ts/BTC_1m_temp.bin"]

    RDR_A["BinaryStreamReader A<br/>Chunk: 1024 records x 48B = 48 KB"]
    RDR_B["BinaryStreamReader B<br/>Chunk: 1024 records x 48B = 48 KB"]

    FILE_A --> RDR_A
    FILE_B --> RDR_B

    subgraph Comparator["Two-Pointer Comparator & Deduplicator"]
        COMP["ptrA -> recordA (ts_A) vs ptrB -> recordB (ts_B)<br/>• If ts_A < ts_B: Write Record A, advance ptrA<br/>• If ts_B < ts_A: Write Record B, advance ptrB<br/>• If ts_A == ts_B: Write Record B (Newer Wins), advance both ptrA and ptrB"]
    end

    RDR_A --> Comparator
    RDR_B --> Comparator

    WRITER["BinaryStreamWriter (48 KB chunk buffer)"]
    OUT[("Atomic Output File: BTC_1m.bin.tmp<br/>- Rewrite final header record_count<br/>- Atomic fs.renameSync() swap to BTC_1m.bin")]

    Comparator --> WRITER
    WRITER --> OUT
```

### Gap Detection & Deduplication State Machine

```mermaid
stateDiagram-v2
    [*] --> SEEK_HEADER: Open Streams
    SEEK_HEADER --> COMPARE_HEADS: Magic Valid (SOVT)
    
    state COMPARE_HEADS <<choice>>
    COMPARE_HEADS --> EMIT_REC_A: ts_A < ts_B
    COMPARE_HEADS --> EMIT_REC_B: ts_B <= ts_A

    EMIT_REC_A --> CHECK_GAP
    EMIT_REC_B --> CHECK_GAP

    CHECK_GAP --> ADVANCE_PTRS: Record Emitted
    ADVANCE_PTRS --> COMPARE_HEADS: More Records
    ADVANCE_PTRS --> FINALIZE_HDR: EOF on Both Streams

    FINALIZE_HDR --> [*]: Rewrite Header, Flush & Atomic Swap
```

---

## 4. Live Streaming Circular Ring Buffer Mechanics

For real-time indicator computation and fast-path signal derivation, live bars are queued in fixed-capacity in-memory ring buffers:

| Index | Stored Bar | Pointer Reference | Description |
|:---:|:---:|:---:|---|
| `0` | $\text{Bar}(t-199)$ | **Head Pointer** | Oldest active bar in window |
| `1` | $\text{Bar}(t-198)$ | | Ring index $1$ |
| `2` | $\text{Bar}(t-197)$ | | Ring index $2$ |
| $\dots$ | $\dots$ | | |
| `198` | $\text{Bar}(t-1)$ | | Prior completed bar |
| `199` | $\text{Bar}(t)$ | **Tail Pointer** | Latest incoming live candle |

#### Index Arithmetic & Window Slicing
$$\text{Next Tail Index} = (\text{Tail} + 1) \pmod C$$
$$\text{Next Head Index} = \begin{cases} (\text{Head} + 1) \pmod C & \text{if } \text{Size} = C \\ \text{Head} & \text{if } \text{Size} < C \end{cases}$$
Zero-allocation sub-array span access enables $O(1)$ rolling indicator updates without memory reallocation.

---

## 5. Local Multi-Resolution Rollup Synthesis Engine

To minimize external API rate limits, Sovereign stores only the highest-granularity base timeframe and synthesizes higher timeframes locally on disk:

```mermaid
flowchart TD
    BASE["5m Base Binary Time Series (storage/data/ts/SPY_5m.bin)<br/>• Record 0 (09:30): O: 500.0, H: 501.0, L: 499.5, C: 500.5, V: 10k<br/>• Record 1 (09:35): O: 500.5, H: 502.0, L: 500.2, C: 501.8, V: 12k<br/>• Record 2 (09:40): O: 501.8, H: 502.5, L: 501.0, C: 502.1, V: 15k"]

    AGG["Local Rollup Aggregator (shared/lib/market/quote_router.js)<br/>• Floor timestamp to interval boundary T_target<br/>• Open: O_target = O_first<br/>• High: H_target = max(H_0..H_k-1)<br/>• Low: L_target = min(L_0..L_k-1)<br/>• Close: C_target = C_last<br/>• Volume: V_target = sum(V_0..V_k-1)"]

    BASE --> AGG

    R15[("15m Rollup<br/>SPY_15m.bin")]
    R30[("30m Rollup<br/>SPY_30m.bin")]
    R1H[("1h Rollup<br/>SPY_1h.bin")]
    R1D[("1d Rollup<br/>SPY_1d.bin")]

    AGG --> R15
    AGG --> R30
    AGG --> R1H
    AGG --> R1D
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
