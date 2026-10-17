# Module: Ingestion Staging & Quarantine Engine

> **Status:** Implemented  
> **Audience:** Maintainers, Data Engineers, Quantitative Researchers  
> **Canonical owners:** `shared/lib/data/quarantine.js`, `shared/lib/data/ingestion.js`  
> **Review triggers:** Ingestion schemas, data provider formats, quarantine reason taxonomy, retention policies  

## Purpose And Non-Goals

The Ingestion Staging & Quarantine Engine provides deterministic isolation for invalid, corrupted, or non-finite financial market observations received from external data providers (equities, crypto, FX, macro, prediction markets). 

**Goals:**
- Prevent poisoned or unparseable rows from reaching downstream binary time series indices (`storage/data/ts/*.bin`) or analytical cache snapshots (`storage/data/cache/`).
- Preserve full diagnostic provenance: capture the raw incoming payload, hash, timestamp, error message, and a standardized machine-readable reason code.
- Ensure non-blocking batch execution: a bad record in one asset family or symbol must not abort collection for valid sibling assets.

**Non-Goals:**
- It is not an automated data imputation or repair engine (it isolates bad records rather than fabricating replacement prices).
- It does not replace network retry logic in underlying provider fetchers (`shared/lib/providers/`).

---

## Entrypoints And Public Contracts

| Surface | Owner | Contract |
|---|---|---|
| `quarantineRecord(record, reasonCode, errorMessage, options)` | `shared/lib/data/quarantine.js` | Appends a structured quarantine event to `storage/data/quarantine/<family>_<date>.jsonl`. Returns written event metadata. |
| `readQuarantineRecords(options)` | `shared/lib/data/quarantine.js` | Reads and filters quarantined JSONL records by date range, family, or reason code. |
| `validateIngestRecord(record, family)` | `shared/lib/data/quarantine.js` | Returns `{ valid: true }` or `{ valid: false, reason, error }` against strict numeric and timestamp bounds. |
| `getQuarantineMetrics(options)` | `shared/lib/data/quarantine.js` | Computes summary metrics (`total_quarantined`, `file_count`, `by_reason`, `latest_anomaly`) across quarantined logs for health and status endpoints. |
| `pruneQuarantineRecords(daysToKeep, options)` | `shared/lib/data/quarantine.js` | Unlinks daily JSONL logs older than `daysToKeep` (default: 30 days) and returns `{ pruned_files, freed_bytes }`. |
| `runIngestBatch(config, options)` | `shared/lib/data/ingestion.js` | Executes multi-family ingestion, automatically routing invalid records to quarantine and returning `quarantine_count` in snapshot summary. |

### Quarantine Reason Taxonomy (`QUARANTINE_REASONS`)

1. `NON_FINITE_PRICE`: A numeric field is `NaN`/`Infinity`, or a market price field is non-positive. Canonical macro `value` observations may be finite, negative, or zero.
2. `NEGATIVE_SPREAD`: Best ask is strictly less than best bid ($P_{\text{ask}} < P_{\text{bid}}$) or negative spread.
3. `TIME_JUMP`: Timestamp is non-parseable or in the future (> 5 minutes clock skew).
4. `MISSING_PREDECESSOR`: Reserved taxonomy value for callers that detect a correction or revision referring to an unknown predecessor; `validateIngestRecord()` does not assign it.
5. `DUPLICATE_PAYLOAD_CONFLICT`: Reserved taxonomy value for callers that detect the same event identifier with conflicting payload hashes; `validateIngestRecord()` does not assign it.
6. `MALFORMED_ROW`: Unexpected schema shape, null row, or non-object payload.

---

## Dependencies And Data Flow

```text
External Providers (Yahoo, Binance, FRED, Polymarket)
       │
       ▼
shared/lib/providers/ -> shared/lib/data/ingestion.js
                               │
                validateIngestRecord()
                               ├─── [Valid] ──────► storage/data/cache/last_fetch.json
                               │                     storage/data/ts/*.bin
                               │
                               └─── [Invalid] ────► storage/data/quarantine/<family>_<date>.jsonl
                                                     (Captures raw payload + SHA256 + reason)
```

---

## Invariants And Safety Boundaries

1. **Non-Blocking Ingestion**: Quarantine writes must never throw fatal exceptions into `runIngestBatch`. Any file write error in the quarantine sink degrades safely to an error log while preserving pipeline execution.
2. **Immutable Forensic Capture**: Quarantined files are append-only JSONL files (`flag: 'a'`) with atomic line writes. Original raw strings are captured verbatim.
3. **Deterministic Classification**: The same input row processed multiple times must produce the exact same `reasonCode` and `payload_hash`.
4. **No Phantom Zeroes**: Missing market prices must never be converted to `0.0`; an explicit finite macro `value: 0` remains valid data. Missing data is categorized as `NON_FINITE_PRICE` or `MALFORMED_ROW`.

---

## Failure Modes And Degraded Behavior

| Failure | Visible evidence | Safe behavior | Repair owner |
|---|---|---|---|
| Malformed JSON row | `snapshot.quarantine_count > 0` | Row written to quarantine file; batch continues | Data engineer / Provider API |
| Quarantine directory read-only | `console.error` logged in sink | Ingestion completes; record logged in `snapshot.errors` | Host system administrator |
| Extreme provider clock drift | `TIME_JUMP` quarantine events | Future timestamps rejected from time series index | Ingestion module / NTP sync |

---

## Storage Staging Architecture: RAM & Tmpfs / Swap First Policy

To prevent excessive NVMe/SSD wear caused by continuous high-frequency backfilling (where direct intermediate disk writes generated nearly 2 TB of block I/O over 30 hours of continuous daemon polling), the ingestion and backfill engine employs an explicit **Memory & Tmpfs / Swap-First Staging Architecture**:

1. **In-Memory & Tmpfs Volatile Buffer (`/dev/shm` / swap-backed tmpfs)**:
   - Raw incoming candles, incremental fetches, and intermediate multi-grain rollups (1m -> 5m, 15m, 1h, 4h, 1d) are staged entirely in memory-mapped volatile storage (`/dev/shm` or tmpfs backed by OS swap space).
   - Validation checks (`validateIngestRecord`), quarantine classification, and timestamp deduplication execute in RAM without generating intermediate disk writes.

2. **Batched Coalescence & Pointer Swapping**:
   - Time-series records are accumulated and sorted in memory buffers (`dedupeSortCandles`).
   - Active readers access stable, immutable snapshots of existing binary TS files while ingestion workers mutate in-memory staging buffers.

3. **Atomic Single-Pass Disk Commit**:
   - Once all timeframes in a cycle are validated, rolled up, and verified for monotonic continuity, the buffer is serialized to a temporary swap file in tmpfs (`.bin.tmp`).
   - A single atomic filesystem rename (`fs.renameSync` / POSIX `rename()`) swaps the staged binary index into persistent disk storage (`storage/data/ts/<symbol>_<timeframe>.bin`), guaranteeing zero half-written files and minimizing block I/O wear by up to 90%.

---

## Observability

- **Snapshot Summary**: `snapshot.quarantine_count` in `storage/data/cache/last_fetch.json`.
- **Quarantine Files**: `storage/data/quarantine/<family>_<YYYY-MM-DD>.jsonl`.
- **Audit Tool**: `node -e 'require("./shared/lib/data/quarantine").readQuarantineRecords({ family: "crypto" })'`.

---

## Recovery And Rollback

1. Inspect daily quarantine records: `readQuarantineRecords({ date: '2026-10-08' })`.
2. If an upstream provider fixed an anomaly, re-fetch via `ingestMarketData({ family: '<family>', force: true })`.
3. Quarantined records are independent of active time-series storage. `runMaintenance()` in `shared/lib/data/db_pruning.js` invokes 30-day quarantine pruning; operators must still schedule that maintenance entrypoint.

---

## Tests And Evidence

- **Runnable verification**: `node tests/run_node_tests.js tests/scripts/integration/data/ingestion_quarantine.test.js`
  - Validates `NON_FINITE_PRICE` isolation for `NaN` and negative close prices.
  - Validates `TIME_JUMP` isolation for future timestamps.
  - Asserts append-only JSONL file formatting and payload SHA-256 integrity.
- **Hygiene Gate**: `npm run hygiene` and `npm run test:data`.
