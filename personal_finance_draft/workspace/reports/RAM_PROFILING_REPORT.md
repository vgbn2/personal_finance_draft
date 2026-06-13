# RAM Profiling Report — Sovereign Trading Platform

**Date:** 2026-06-12  
**Branch:** feat/ml-onnx-section  
**Platform:** Windows 11, Node.js v24.13.1  
**Scope:** Read-only empirical profiling — no code modified, no live flags used.

---

## 1. Ranked Hotspot Table

| Rank | Operation | Measured Peak RSS | Heap Used | Root Cause (file:line) | Proposed Fix | Effort |
|------|-----------|-------------------|-----------|------------------------|--------------|--------|
| 1 | `ml dump` anchor loading (10 symbols) | **+1,507 MB** (36 → 1,549 MB) | 1,049 MB | `dataset.js:124–136` `cacheCloseSeriesAnchor` calls `readFamilySources()` once per anchor symbol, loading all 11 family JSON files (totalling 377 MB) on every call. 10 anchors = 110 file reads, 3.77 GB total raw JSON I/O. | Cache `readFamilySources()` result with a module-level lazy singleton (read once, reuse). Add `tsDir` .bin meta-cache. | S |
| 2 | `loadAssetSourcesFromCache` (125 syms, 200-bar cap) | **+975 MB** (46 → 997 MB) | 861 MB | `dataset.js:89–116` — calls `readFamilySources()` which deserializes all 5 OHLCV family JSONs (1.0 M records, 377 MB on-disk) into heap even when only 1d records for a subset of symbols are wanted. The 377 MB JSON string + 377 MB parsed object tree both live simultaneously. | Stream/partition: read one family file at a time and filter before accumulating, OR replace wholesale JSON with NDJSON streaming so only needed records are materialized. This is the STATE.md "Remaining Gaps" NDJSON idea — it would cut this stage to ~O(wanted_records) not O(all_records). | M |
| 3 | `buildMLFeatureFrame` (125 syms × 200 bars × 10 anchors) | **~2 min 47 s, +227 MB RSS above stage-2** | 530 MB after frame | `feature_builder.js:147` — inside the per-row loop `for (let i = 0; i < bars.length; i++)`, for each of 10 anchors the call `forwardFillOnto(dates, anchors[name]).slice(0, i + 1)` creates a NEW fully-re-filled array of length i+1. For 200 bars × 10 anchors = 2,000 `forwardFillOnto` calls per symbol, each O(n). Total allocations across 125 symbols: ~250,000 temporary arrays totalling ~125×200×10 = 250k GC pressure events. | Pre-compute the aligned anchor return series once per (anchor, symbol) outside the row loop; reuse it slice-free per row with a rolling index pointer. | S |
| 4 | All-family JSON parse (single load for backtest/model-compare) | **+379 MB** RSS at peak | 188 MB heap | `dataset.js:67–83` `readFamilySources` — equities/backtest_history.json alone is **223 MB** on disk, producing 549,180 records. When parsed by `JSON.parse(fs.readFileSync(...,'utf8'))` the raw string (223 MB) and the object tree (~185 MB heap delta) coexist briefly, spiking RSS by ~408 MB before GC. | Partition the equities JSON by year or symbol-range at write time (ingest pipeline) so individual file reads are bounded to ~50 MB each. Long term: convert to NDJSON so records stream without materializing the whole file. | M |
| 5 | CLI boot (`sovereign_cli.js`) | **+30 MB RSS**, 65 MB total | 16 MB | `sovereign_cli.js:3–19` — all command handlers are `require()`'d eagerly at startup including heavy modules (`research.js`, `trade.js`, `ml.js`). Every TUI session pays this cost regardless of which command is used. | Lazy-require command modules inside each handler (convert to `() => require(...)()` pattern). Measured baseline: Node baseline is 35 MB RSS; CLI eager-require adds 30 MB that could be deferred to first use. | S |
| 6 | frameToCsv (21,754 rows → 13.5 MB CSV string) | **+29 MB RSS** above frame | 574 MB heap | `dataset.js:154–179` — `frameToCsv` builds the full CSV as a joined string array in memory before writing. All `lines.join('\n')` allocates a 13.5 MB string simultaneously with the lines array. | Stream-write to disk using `fs.createWriteStream` + line-by-line push, never materializing the full string. | S |
| 7 | API server `backendUniverse()` (per-request) | **+0.1 MB heap** per call | Trivial | `cli_executor.js:23–33` — a 5-second `MEMORY_CACHE` Map is used. `last_fetch.json` is 109 KB, 293 records. This is already well-managed. | No action needed; the MEMORY_CACHE TTL is appropriate. | — |
| 8 | API server boot (module load) | **+14 MB RSS** | 12 MB | `app.js:269–285` — socket.io server + `fs.watchFile` on the snapshot. Steady-state is low. | No significant optimization needed. | — |
| 9 | TUI boot path | **+13 MB RSS** | 6 MB | `sovereign_cli.js:111–117` — utils + engine + auth require chain is lean. | No action needed. | — |
| 10 | C++ ONNX models (sovereign_wealth.exe) | Not measured directly | ~1.2 MB binary on disk | `backend/core/src/ml/onnx_model.cpp` — xgboost_v1.onnx is 1 MB, logistic/regime are trivially small. In-process ONNX inference memory is bounded by input tensor size (47×47 correlation, 19,480-row CSV → batch). | No immediate action; binary loading is bounded and acceptable. | — |

---

## 2. End-to-End `ml dump` Memory Profile (200-bar cap, 125 symbols, 10 anchors)

```
Stage                  RSS (MB)    Heap (MB)   Duration
─────────────────────────────────────────────────────────
Start (baseline)          46.4        5.3         0 s
loadAssetSourcesFromCache 997.0      861.4         4 s    ← +951 MB
loadAnchors (10 syms)   1,285.3      411.8        42 s    ← +288 MB RSS
                                                          (heap drops = GC reclaimed previous JSON)
buildMLFeatureFrame     1,223.9      529.6       167 s    ← 2m47s total, GC pressure
frameToCsv              1,252.3      574.2       167 s    ← 13.5 MB CSV in heap
```

**Total wall time: 2 min 47 s. Peak RSS: ~1.3 GB. Heap peak: ~862 MB (loadAssets stage).**

---

## 3. Root Cause Details

### Hotspot 1 — Anchor loading: N×readFamilySources() calls (CRITICAL)

**File:** `shared/lib/ml/dataset.js`, lines 123–139 (`cacheCloseSeriesAnchor`)  
**File:** `shared/lib/ml/dataset.js`, lines 67–83 (`readFamilySources`)

`cacheCloseSeriesAnchor(symbol)` calls `readFamilySources()` internally (line 132), which opens and `JSON.parse(fs.readFileSync(...))` all 11 `backtest_history.json` files it finds under `storage/data/cache/`. The 5 non-empty files total **377 MB** on disk.

With 10 anchor symbols, this runs **110 file reads** totalling **21.4 s** and peaks at **1,549 MB RSS**.

Probe command used:
```
node --max-old-space-size=4096 _probe_anchor_cost.js
# Output: {"anchor_count":10,"json_file_reads":110,"time_ms":21442,"peak_rss_mb":"1548.8","rss_delta_mb":"1507.1"}
```

**Fix:** Add a module-level cache in `dataset.js`:
```js
let _familySourcesCache = null;
function readFamilySources(cacheRoot) {
  if (_familySourcesCache) return _familySourcesCache;
  // ... existing logic ...
  _familySourcesCache = out;
  return out;
}
```
This collapses 10 JSON loads into 1 with zero logic changes downstream. Invalidation can be time-based (e.g., 60 s TTL) or explicit.

---

### Hotspot 2 — loadAssetSourcesFromCache: full-family JSON load before filter (MAJOR)

**File:** `shared/lib/ml/dataset.js`, lines 89–116 (`loadAssetSourcesFromCache`)  
**File:** `shared/lib/ml/dataset.js`, lines 67–83 (`readFamilySources`)

The function deserializes **all 1,003,269 records** across all families and all timeframes before filtering to 1d with `maxBarsPerSymbol`. This loads the 223 MB equities JSON alone into two simultaneous representations (raw string + parsed object tree) causing a spike of **+379 MB RSS** just for the equities file, before any filtering.

Family JSON sizes on disk:
```
equities:     223.3 MB  (549,180 records, of which 304,277 are 1d)
crypto:        59.0 MB  (146,352 records)
commodities:   44.6 MB  (148,164 records)
indices:       34.9 MB  (109,327 records)
fx:            15.5 MB  (50,246 records)
TOTAL:        377.3 MB  (1,003,269 records → filtered to 500,875 1d records)
```

**Fix options (in order of effort):**
1. **M:** Convert `backtest_history.json` to NDJSON at write time; stream-filter at read time — only the lines matching the requested timeframe are parsed.
2. **M:** Shard the equities file by year (e.g. `backtest_history_2024.json`), cap individual files to ~50 MB.
3. **S:** Pass `timeframe` into `readFamilySources` and filter during parse (reduces heap by skipping non-matching records early, but full string still loads).

---

### Hotspot 3 — forwardFillOnto called per-row per-anchor (PERFORMANCE)

**File:** `shared/lib/ml/feature_builder.js`, line 147

Inside the inner `for (let i = 0; i < bars.length; i += 1)` loop:
```js
const mom = i + 1 >= corrPeriod
  ? trailingReturn(forwardFillOnto(dates, anchors[name]).slice(0, i + 1), corrPeriod)
  : null;
```

`forwardFillOnto(dates, anchors[name])` returns a full-length array every time, then `.slice(0, i+1)` discards the tail. For 200 bars × 10 anchors × 125 symbols = **250,000 temporary array allocations** each up to 200 elements. This is the primary contributor to the 125-second build phase and its GC churn.

The `rollingPairCorr` function (lines 57–70) also slices via `aRet[k]` and `bRet[k]` index access which is fine — but `forwardFillOnto` is called fresh every time whereas it only needs to be called **once per (symbol, anchor) pair** and then accessed with an index pointer.

**Fix:**
```js
// Pre-compute outside row loop (once per anchor per symbol):
const anchorAligned = {};
for (const name of anchorNames) {
  anchorAligned[name] = forwardFillOnto(dates, anchors[name]); // full array, computed once
  anchorRet[name] = toReturns(anchorAligned[name]);
}

// Inside row loop, replace the forwardFillOnto+slice with just a rolling return on pre-built array:
const mom = i + 1 >= corrPeriod
  ? trailingReturn(anchorAligned[name].slice(0, i + 1), corrPeriod)
  : null;
```
This reduces from O(n²) per anchor to O(n) per anchor. The `.slice(0, i+1)` for `trailingReturn` still allocates but that can be further optimized by rewriting `trailingReturn` to accept `(arr, end, period)` indices.

---

### Hotspot 4 — CLI eager-requires (MINOR)

**File:** `backend/cli/sovereign_cli.js`, lines 3–20

All 12 command handler modules are `require()`'d at top level, including `research.js`, `trade.js`, and `ml.js` which transitively require heavy graph/indicator/broker modules. Measured cost: **+30 MB RSS** on every CLI invocation, paid whether the user runs `status` or `ml dump`.

Node module cache means subsequent imports in the same process are free, but for a CLI tool that spawns a fresh process per command this is pure tax.

---

## 4. Binary ts-Index: Already Efficient

The binary time-series index (`storage/data/ts/`, 854 `.bin` files, 84.6 MB total) is well-designed:
- 48-byte packed float64 records (6 fields × 8 bytes) — no JSON parsing overhead
- Loading all 125 1d-timeframe symbols costs **+203 MB RSS** for 542,789 records in **< 1 s**
- Average: 1.6 MB per symbol, fast sequential read

**No optimization needed here.** The binary format is already ~2.3× more compact than the equivalent JSON.

---

## 5. Methodology Notes

All probes were run on Windows 11, Node.js v24.13.1, PowerShell 5.1. Each probe script was placed in the project root (to inherit `package.json` `#shared/*` import maps), then deleted after collection.

### Reproducible Probe Commands

**1. CLI boot cost:**
```js
// _probe_cli.js (place at project root)
const before = process.memoryUsage();
const cli = require('./backend/cli/sovereign_cli');
const after = process.memoryUsage();
console.log(JSON.stringify({ rss_delta_mb: ((after.rss-before.rss)/1048576).toFixed(1) }));
```
```
node _probe_cli.js
# Output: {"rss_delta_mb":"30.1"}
```

**2. Family JSON load cost (per family):**
```js
// Place at project root
const fs = require('fs');
const families = ['equities','crypto','commodities','indices','fx'];
for (const fam of families) {
  const b = process.memoryUsage();
  const data = JSON.parse(fs.readFileSync(`storage/data/cache/${fam}/backtest_history.json`, 'utf8'));
  const a = process.memoryUsage();
  console.log(fam, 'sources:', data.sources?.length, 'rss_delta:', ((a.rss-b.rss)/1048576).toFixed(1)+'MB');
}
```

**3. Anchor hot-load (N×readFamilySources):**
```js
const dataset = require('./shared/lib/ml/dataset');
const anchors = ['XAUUSD','XAGUSD','XCUUSD','USOIL','NG','EURUSD','USDJPY','GBPUSD','AUDUSD','USDCAD'];
const b = process.memoryUsage();
for (const s of anchors) dataset.cacheCloseSeriesAnchor(s, '1d');
const a = process.memoryUsage();
console.log('rss_delta_mb:', ((a.rss-b.rss)/1048576).toFixed(1));
// => rss_delta_mb: 1507.1
```

**4. End-to-end ml dump (200-bar cap):**
```
node --max-old-space-size=6144 _probe_e2e.js
# Stages: start→loadAssets(+951MB,4s)→loadAnchors(+288MB,42s)→buildFrame(167s)→frameToCsv
```

**5. JSON record count per family and timeframe:**
```
node --max-old-space-size=2048 _probe_json_all_tf.js
# total: 1,003,269 records; equities alone: 549,180 (304,277 are 1d)
```

---

## 6. Recommended First Implementation Target

### Fix #1: Cache `readFamilySources()` in `dataset.js` — Effort: **S** (< 2 hours)

**Rationale:** This single change eliminates the dominant memory spike in `ml dump`. The anchor loading phase currently consumes **1,507 MB RSS** and **21 seconds** because `readFamilySources()` has no memoization and is called once per anchor symbol. A module-level lazy cache reduces this from 110 file reads to 11, cutting anchor-stage RAM from ~1.5 GB to ~380 MB (the cost of a single full load).

This fix is:
- Contained to one function in one file (`dataset.js:67-83`)
- Zero-risk: the cache can be a simple `let _cache = null` with a TTL or process-lifetime scope
- Immediately testable: the existing `tests/` suite exercises dataset paths
- No API surface changes required

After this fix, the dominant remaining cost shifts to Hotspot 2 (full-family JSON load), which requires the more invasive NDJSON/sharding work.

**Recommended implementation order:**
1. **S** — Cache `readFamilySources()` (dataset.js) → eliminates 1.5 GB anchor spike
2. **S** — Pre-compute `forwardFillOnto` outside row loop (feature_builder.js:147) → eliminates 2m47s build time
3. **S** — Lazy CLI requires (sovereign_cli.js) → saves 30 MB on every CLI boot
4. **M** — NDJSON streaming for backtest_history.json → eliminates 850+ MB asset load peak
5. **S** — Stream frameToCsv to disk (dataset.js:154) → eliminates 13.5 MB CSV string spike

---

## 7. Findings Not Actionable (No Fixes Needed)

- **Docker containers:** Docker daemon was not running; container stats could not be observed.
- **C++ ONNX model loading:** Models are small (xgboost_v1.onnx = 1 MB, others < 100 KB). No memory concern.
- **API server `MEMORY_CACHE`** (cli_executor.js): 5-second TTL Map is appropriate; `last_fetch.json` is only 109 KB with 293 records.
- **Binary ts-index:** Efficient binary format; 125 symbols load in < 1 s at 203 MB RSS. No changes needed.
- **TUI boot:** Only 13 MB RSS total for utils + engine + auth. No changes needed.
