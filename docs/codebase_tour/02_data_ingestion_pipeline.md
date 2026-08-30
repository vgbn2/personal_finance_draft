# Module 02 — Data Ingestion & Storage

Supersedes `docs/engineering/capability_manifest.md`'s data-file claims (`data/market_data.db`, SQLite
trade logs) — that's an old layout. The real canonical data plane is `storage/data/ts/`, a binary format.

## The base-grain concept

`backend/cli/commands/data/data_rollup.js:24-30` defines `FAMILY_BASE_TF`:

```js
{ crypto: '1m', equities: '1m', indices: '5m', commodities: '5m', fx: '5m' }
```

Crypto (Binance) and equities (Alpaca) get a 1-minute base grain; everything else (Yahoo-sourced) gets
5-minute, because Yahoo only serves ~7 days of 1m history vs ~60 days of 5m
(`data_rollup.js:22-23`). Every coarser timeframe you ever see (15m/1h/1d/...) is rolled up from the base
grain, never fetched separately — this is the "ingest finest grain only" rule.

For `prediction_market` contracts (Polymarket / Kalshi), lifespans vary from 5 minutes to multiple years. Rather than a single fixed base grain, `resolveTunableRegressionFidelity()` in `shared/lib/market/polymarket_history.js` dynamically computes adaptive resolution $\Delta t(L; N, \gamma, \beta)$ to yield consistent indicator density (~300 bars) without aliasing short contracts or bloating long ones.

## One ingest call, traced

```
ingestMarketData()                                    backend/scripts/data_ops/ingest_market_data/index.js:83
  -> fetchBinanceBaseCandles / fetchAlpacaBaseCandles / fetchYahooBaseCandles   shared/lib/providers/*
  -> validateSnapshot()                                shared/lib/market/validation.js:429
  -> mergeWriteBin(tsDir, meta, incoming)               shared/lib/market/validation.js:753
       -> writes {symbol}_{timeframe}.bin + .meta.json
```

## The ts-index binary format

`validation.js:699-710`: 4-byte magic `'SOVT'` + a `uint32LE` record count, then N records of 6
`float64LE` values each (`ts_ms, open, high, low, close, volume` — 48 bytes/record). A `.meta.json`
sidecar stores family/provider/derivation lineage.

`readTsIndex()` (`validation.js:883-919`) materializes the whole bin into JS objects — fine for small
bins, **dangerous for BTCUSDT-scale 1m bins (~3M rows)**, which is why `readTsIndexSince()`
(`validation.js:938-984`) exists: it binary-searches the buffer for a tail window without materializing
the whole thing. `mergeWriteBin()` itself reads the existing bin as a raw `Buffer`, not JS objects, for
the same reason — a real OOM was hit and fixed here (`validation.js:739-751`'s comment names it
directly).

## The backfill daemon's staleness logic

`backend/cli/commands/data/backfill_daemon.js`. `isFresh()` (`shared/lib/market/coverage.js:146-173`)
checks the last bar's age against a per-family threshold (`validation.js:7-77`; crypto 5m is the
strictest at 3 hours). `readCoverage()` (`coverage.js:77-133`) reads just the bin's tail timestamp — an
8-byte read, not a full materialization — specifically so the freshness check itself doesn't trigger the
same OOM class it's trying to avoid downstream.

`decideAction()` (`backfill_daemon.js:136-140`) picks `deep` (missing/empty), `incremental` (stale —
top off just the recent window), or `skip` (fresh). Delisted symbols get a dead-symbol marker
(`data_rollup.js:82-98`) and are skipped for 7 days (`DEAD_SYMBOL_TTL_MS`, `coverage.js:20`) instead of
being re-probed every cycle.

## Labs

**Lab 1 — read a real bin's header without loading the whole thing.**
```bash
node -e "
const fs = require('fs');
const fd = fs.openSync('storage/data/ts/BTCUSDT_1m.bin', 'r');
const buf = Buffer.alloc(8);
fs.readSync(fd, buf, 0, 8, 0);
console.log('magic:', buf.toString('ascii', 0, 4), 'count:', buf.readUInt32LE(4));
"
```
(Swap the path for whatever symbol/timeframe bin actually exists under `storage/data/ts/` on your
machine — list the directory first if BTCUSDT isn't there.)

**Lab 2 — check real freshness, not assumed freshness.**
```bash
node backend/cli/sovereign_cli.js backend integrity --json
```
Find a symbol marked stale or missing. Open `coverage.js`'s `isFresh()` and work out, from the real
threshold table, exactly how old that symbol's data would need to be to trigger that status.

**Lab 3 — trace one rollup.** Pick a symbol with a 1m base grain. Open `data_rollup.js` and find the
function that derives a coarser timeframe (e.g. 1h) from it. Confirm: does it re-read the whole 1m bin,
or use the same tail-window trick from Lab 1's reading?

**Lab 4 — run the daemon once, dry.**
```bash
node backend/cli/sovereign_cli.js backfill-daemon --once --families crypto
```
Read the output. For each symbol it touched, can you say whether it chose `deep`, `incremental`, or
`skip`, and why, using only `decideAction()`'s logic (not a guess)?
