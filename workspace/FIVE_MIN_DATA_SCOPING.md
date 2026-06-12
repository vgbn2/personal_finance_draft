# Five-Minute Historical Data — Scoping Document (Roadmap Item 8)

**Written**: 2026-06-12  
**Status**: Research-only scoping. No implementation started.  
**Relationship to SCALPING_BOT_SCOPING.md**: 5m data was flagged as a prerequisite for the scalping bot direction. This document scopes the data plane change in isolation — the execution-layer work remains separate per that document.

---

## 1. Current State (verified by reading, not assumed)

### 1a. What timeframes are cached today

The binary ts-index (`storage/data/ts/`) already stores **5m files** for most symbols. Verified by file count: 218 `*_5m.bin` files exist versus 250 `*_1d.bin` files. However, these are shallow — not deep history.

Confirmed via BTCUSDT as the canonical canary:

| File | Provider (from .meta.json) | `count` (bars) | Approx depth |
|---|---|---|---|
| `BTCUSDT_5m.bin` | **twelve** (TwelveData) | 5,000 | ~17 days |
| `BTCUSDT_1d.bin` | **binance** | 3,221 | ~8.8 years |
| `BTCUSDT_1h.bin` | **binance** | 3,221 | ~134 days |
| `BTCUSDT_15m.bin` | **binance** | 3,221 | ~33 days |

The mismatch is diagnostic: Binance pagination (`fetchBinanceBaseCandles`) is capped at 20 calls × 1000 bars/call = 20,000 bars max (`binance.js:9`). For 1h that is 833 days; for 1d that is 3,221 bars (full ~8.8y history from 2017-07-14). For 5m at 288 bars/day, 20,000 bars = **~69 days**. The current `BTCUSDT_5m.bin` shows only 5,000 bars because the active 5m provider is TwelveData (whose free tier is the binding constraint, not Binance).

### 1b. Key code locations

| Concern | File:Line |
|---|---|
| Binary ts format (48-byte record, `SOVT` magic, 6×Float64LE) | `shared/lib/market/validation.js:582–703` |
| `readTsIndex` / `writeTsIndex` functions | `shared/lib/market/validation.js:668` / `599` |
| File-per-symbol-per-timeframe naming (`<symbol>_<tf>.bin`) | `validation.js:586–592` |
| `fetchBinanceBaseCandles` pagination (MAX_CALLS=20 cap) | `shared/lib/providers/binance.js:9` |
| `fetchAlpacaBaseCandles` (no pagination loop, single request) | `shared/lib/providers/alpaca.js:7–52` |
| `fetchYahooBaseCandles` (single request, no pagination) | `shared/lib/providers/yahoo.js:3–56` |
| `YAHOO_MAX_DAYS['5m'] = 60` — hardcoded cap constant | `backend/scripts/data_ops/ingest_market_data/constants.js:20` |
| `fetchPaginated` / `fetchParallelBackfill` — pagination orchestrator | `shared/lib/data/backfill.js:52–169` |
| `BARS_PER_DAY.crypto['5m'] = 288` / `equities['5m'] = 78` — already correct | `shared/lib/data/backfill.js:7–8` |
| `fetchCryptoSnapshot` — dispatches to Binance by default, TwelveData/Finnhub path via FAMILIES_MANIFEST | `index.js:1779–1838` |
| `auto_backfill` flag default = `false`, `backfill_interval_min` default = `1440` | `shared/lib/settings/user_settings.js:31, 40` |
| `FRESHNESS_RULES_MS.crypto['5m'] = 3h` / `equities['5m'] = 96h` | `shared/lib/market/validation.js:8–26` |
| ML `loadAssetSourcesFromCache` O(n^2) warning + `maxBarsPerSymbol` cap | `shared/lib/ml/dataset.js:100–102` |
| `buildMLFeatureFrame` — expanding-window feature build | `shared/lib/ml/feature_builder.js:95–96` |

### 1c. What `5m` in config actually means today

`data_sources.yaml` lists `"5m"` under `timeframes` for equities, indices, commodities, and crypto families. However: `fetchCryptoSnapshot` and `fetchEquityOrIndexSnapshot` both fetch a **1d base** and then call `aggregateCandles` to derive requested timeframes. At 5m, aggregating 1d bars produces exactly **1 bar per day** (a synthetic 5m bar with the full day's OHLCV), not real 5m bars. This is the fundamental gap: 5m is in the config schema but native 5m data is not being pulled, except via TwelveData which provides only ~17 days.

---

## 2. Provider Matrix Per Family

### 2a. Crypto (18 symbols in YAML)

**Best option: Binance Spot REST API — klines endpoint**

- **Depth**: BTCUSDT 5m data available from **2017-08-17** (~8.8 years). Confirmed via `data.binance.vision` which archives spot klines back to that date. Most alt-coins have shorter histories proportional to their listing date.
- **Rate limits**: Weight budget = **6,000 weight/minute** per IP. `/api/v3/klines` with limit=1000 costs **5 weight**. This allows up to **1,200 paginated requests/minute** before hitting the IP cap. (Source: Binance Open Platform rate-limit docs, 2026.)
- **Auth**: No API key required for public klines endpoint. Zero cost.
- **Pagination math for full 5y pull of one symbol**: 5 years × 365.25 days × 288 bars/day = **525,960 bars**. At 1,000 bars/call = **526 calls** per symbol. At 5 weight/call = **2,630 weight** for one symbol's full history. With 1,200 calls/min capacity, a single symbol full pull takes **~26 seconds**. For 18 crypto symbols: ~8 minutes total. Well within free-tier limits.
- **Current code gap**: `fetchBinanceBaseCandles` has `MAX_CALLS = 20` hard cap (`binance.js:9`), limiting output to 20,000 bars per call chain. For 5m at 288 bars/day this is only **~69 days**. The cap must be raised or a proper multi-segment backfill must be driven via `fetchPaginated` / `fetchParallelBackfill`, which already know `BARS_PER_DAY.crypto['5m'] = 288`.
- **Alternative bulk path**: `data.binance.vision` publishes monthly zip archives of all klines intervals (no API key, no rate limit). For a one-time deep historical load this is the fastest approach — download and parse CSVs rather than iterating the REST API.

**Coinbase Advanced Trade**: Supports 5m candles but history depth is shallower for most pairs (typically 1–3 years for majors). Adequate as a secondary/fallback. The `COINBASE_GRANULARITY['5m'] = 300` constant is already present (`constants.js:71`).

**CoinGecko free tier**: Daily OHLCV only. Not usable for 5m. Already confirmed in code (`fetchCoinGeckoBaseCandles` fetches at daily granularity only).

### 2b. US Equities (36 symbols in YAML — mix of US, VN, IN, UK, GER)

**Alpaca Data API (paper-account key already configured)**

- **Depth**: ~7 years of SIP historical bar data for US equities. 5m bars confirmed supported (`1Min`, `5Min`, `15Min`, `30Min`, `1Hour`, `1Day` timeframes).
- **Free tier real-time**: IEX feed only (~2.5% of US volume). For real-time quotes this is degraded. For **historical bars**, the SIP feed is accessible to free/paper accounts with a 15-minute delay floor on the `end` parameter. Full historical depth is available.
- **Rate limits**: Alpaca free tier does not publish a hard RPM cap on historical bar endpoints. Community reports suggest ~200 requests/minute in practice before throttling. Single request returns up to 10,000 bars; pagination via `next_page_token`. (Source: Alpaca docs/forum, 2026.)
- **Coverage gaps**: VN stocks (VCB, BID, etc.), UK stocks (HSBA, BP, etc.), German stocks (SAP, VOW3), Indian stocks (TCS, INFY) are NOT on US exchanges — Alpaca does not cover them. These are currently served by Yahoo/Stooq for daily data and would have **no 5m provider**.
- **Current code gap**: `fetchAlpacaBaseCandles` (`alpaca.js:7`) makes a single un-paginated request. No `next_page_token` handling, no `fetchPaginated` wiring. For 5y × 78 bars/day × 252 trading days = **98,280 bars** per US symbol, at 10,000 bars/request this needs **~10 paginated requests** per symbol.

**Yahoo Finance**

- **Depth**: Hard cap of **60 days** for 5m intraday. This is the documented and observed limit — confirmed by constants already in the codebase (`YAHOO_MAX_DAYS['5m'] = 60`). Not suitable for deep history.
- **Use case**: Suitable only as a recent-data complement or gap-fill for the last 60 days where Alpaca is unavailable (e.g., non-US equities).

**TwelveData (already listed as provider for equities)**

- **Free tier**: 8 API calls/minute, ~800/day. Only the most recent data windows are freely accessible; extended historical depth requires paid plans ($29+/mo for "Basic" with 1y history, higher tiers for more).
- **Conclusion**: Free tier is the current source of BTCUSDT 5m (5,000 bars = ~17 days). Not viable for deep multi-year backfills. Do not rely on for deep history.

**Finnhub (listed in YAML)**

- Free tier supports intraday resolution but historical depth at 5m is limited to **1 year** for free accounts. Rate limit: 60 calls/minute. Not suitable for 3–5y targets.

**Polygon.io free tier**

- Free tier: **2 years** of historical data, 5 API calls/minute. Insufficient rate for full universe backfill. Paid plans start at $79/mo for unlimited history. Not currently wired into codebase.

### 2c. FX (10 pairs)

**Current state**: FX in `data_sources.yaml` has `timeframes: ["1d","1w","1mo"]` only. Providers are Frankfurter, ECB, FxAPI, Finnhub, TwelveData.

- **Frankfurter / ECB**: Daily only. No intraday. Dead end for 5m.
- **FxAPI**: Real-time focus; limited intraday history on free tier. Not suitable for deep 5m.
- **Finnhub**: 5m FX candles available; free tier capped at 1y, 60 calls/min. Viable for recent history (up to 1y).
- **TwelveData paid**: Full historical FX at 5m with paid plan. Free tier: ~17 days.
- **OANDA free (not in stack)**: Provides 5m historical FX back ~5 years via REST API (no key for historical public data, but registration required for API key). Not currently in the codebase.

**Practical assessment**: FX 5m deep history is the hardest family. No zero-cost provider exists for multi-year depth. The current YAML correctly omits 5m from FX timeframes. Adding FX 5m would require either a TwelveData paid plan or integrating a new provider (OANDA, Alpha Vantage premium).

### 2d. Metals and Energy / Commodities (9 symbols)

**Current state**: Providers are TwelveData, Stooq, Yahoo. Timeframes include 5m in the YAML.

- **Stooq**: Daily only (CSV download). No intraday. Currently the depth workhorse for daily commodity history.
- **Yahoo Finance (GC=F, CL=F, etc.)**: 5m available but limited to **60 days** per the `YAHOO_MAX_DAYS` constant.
- **TwelveData paid**: Full coverage for metals/energy at 5m.
- **CME/ICE data**: Vendor-priced, not free.

**Practical assessment**: Like FX, deep 5m commodity history requires a paid provider or accepting Yahoo's 60-day window as the operational depth. Commodity futures are also interrupted by contract rolls — 5m history across contracts needs adjustment logic (not present in the current stack).

### 2e. Indices (11 symbols)

- Yahoo Finance supports intraday for major US/global indices (SPX, NDX, DAX, etc.) with the 60-day limit at 5m.
- TwelveData paid provides deeper coverage.
- FRED (used for NDX, DJI, VIX mappings) is daily/weekly only.

---

## 3. Storage and Format Implications

### 3a. Record format — no changes needed

The binary ts format (`validation.js:582–592`) stores 6×Float64LE (48 bytes/record) with a per-symbol, per-timeframe file (`<symbol>_<tf>.bin`). A `*_5m.bin` file is identical in structure to a `*_1d.bin` file — only the count changes. **No format changes are required.**

The `.meta.json` sidecar stores `{symbol, timeframe, family, provider, coordinate_id, count}`. No additions needed for 5m support.

### 3b. Sizing math

**Assumptions**:
- Crypto (24/7): 288 bars/day × 365.25 days/year = **105,192 bars/year** per symbol
- US Equities RTH (6.5h/day, ~252 trading days): 78 bars/day × 252 = **19,656 bars/year** per symbol
- Record size: 48 bytes/bar (6 Float64) + 8 byte header = negligible per file

**Per-symbol storage (MB)**:

| Depth | Crypto (288/day) | US Equities (78/day) |
|---|---|---|
| 1 year | 105,192 bars × 48B = **4.8 MB** | 19,656 × 48B = **0.90 MB** |
| 3 years | **14.4 MB** | **2.7 MB** |
| 5 years | **24.1 MB** | **4.5 MB** |

**Universe totals (binary ts-index only)**:

| Depth | 18 crypto symbols | 36 equity symbols (US only ~20) | Combined estimate |
|---|---|---|---|
| 1 year | 18 × 4.8 = **86 MB** | 20 × 0.90 = **18 MB** | ~104 MB |
| 3 years | **259 MB** | **54 MB** | ~313 MB |
| 5 years | **434 MB** | **90 MB** | ~524 MB |

**JSON cache (`storage/data/cache/<family>/backtest_history.json`) adds overhead**: JSON encoding of OHLCV records is approximately 200–250 bytes/record versus 48 bytes binary — roughly 4–5× larger. If JSON caches are kept at full depth, multiply storage figures by ~5. **Recommendation**: JSON cache should hold only a rolling window (e.g., 90 days) while the binary ts-index holds the full archive. The current `writePartitionedSnapshot` + `writeTsIndex` split (`index.js:1712–1716`) already supports this pattern but the JSON window is unbounded today.

### 3c. ts-index design assumptions that hold or break at 5m

**What holds without change**:
- File-per-symbol-per-timeframe naming works at any granularity. A `BTCUSDT_5m.bin` file with 525,960 bars (5y crypto) is 48 × 525,960 + 8 = **25.2 MB** — easily handled by a single file read.
- `writeTsIndex` deduplicates by millisecond timestamp before writing, which is correct for 5m (adjacent bars are 300,000ms apart — no collision risk).
- `readTsIndex` reads the entire binary file into a JS Buffer on each call. At 25 MB per file this is a large synchronous allocation. For the current `ml dump` / backtest use cases (one or a few symbols at a time) this is fine. For a feature build over the full crypto universe (18 symbols × 5y = 18 × 25 MB = **450 MB** in memory simultaneously) this becomes a memory-pressure event.

**What breaks or requires attention**:
- `uint32LE` count field at header offset 4 has a max of 4,294,967,295 bars — not a practical concern (5y 5m = 525,960 bars per symbol).
- The current `BTCUSDT_5m.bin` has 5,000 bars from TwelveData. After a deep Binance backfill, `writeTsIndex` would overwrite this file with a merged + deduplicated 525,960-bar set. The merge logic in `mergeSnapshots` (`validation.js:481`) merges at the snapshot/sources level before calling `writeTsIndex` — this is correct.
- **Cache skip logic** (`index.js:1524–1536`): The ingest loop checks `universeMap` (keyed `family:symbol:timeframe`) for whether the cache already covers the requested `historyDays`. For a 5m deep backfill this lookup works correctly, but `cacheKey` uses the `backtest_history.json` JSON cache, not the binary ts-index. If a symbol has full 5y binary coverage but an empty JSON cache, the skip check will not detect it and will re-fetch needlessly. This is a minor inefficiency (not a correctness bug) but worth noting for large backfill runs.

---

## 4. Ingestion Changes Needed

### 4a. Binance provider — lift the `MAX_CALLS` cap

**File**: `shared/lib/providers/binance.js:9`  
**Current**: `const MAX_CALLS = 20;` — limits total bars to 20,000 per invocation  
**Change needed**: For deep 5m backfills (5y = 526 calls), this cap must be raised to at least **600** (one full 5y pull). Since `fetchPaginated` already implements chunked pagination with its own outer loop (`backfill.js:52`), the cleanest fix is to route 5m deep backfills through `fetchPaginated(symbol, '5m', days, 'crypto', fetchBinanceBaseCandles)` rather than calling `fetchBinanceBaseCandles` directly with a large `limit`. `fetchPaginated` already calculates `maxDaysPerChunk = floor(1000 / 288) = 3` days per chunk for 5m — this is correct.

**Throttle note**: With 5 weight/call and 6,000 weight/minute budget, successive 5m backfills for all 18 crypto symbols would use 18 × 526 calls = 9,468 calls total. At 1,200 calls/min the full universe deep pull completes in ~8 minutes. No sleep/delay is needed under normal conditions, but the retry/break logic in `fetchBinanceBaseCandles` should remain to handle transient 429 responses.

### 4b. Alpaca provider — add pagination loop

**File**: `shared/lib/providers/alpaca.js`  
**Current**: Single-request `fetchAlpacaBaseCandles`, no `next_page_token` handling, no `fetchPaginated` wiring  
**Change needed**: Either (a) add `next_page_token`-based pagination loop inside `fetchAlpacaBaseCandles`, or (b) wrap Alpaca in a `fetchPaginated`-compatible adapter. The existing `fetchParallelBackfill` already includes Alpaca (`backfill.js:120`) but it dispatches through `fetchPaginated` which calls `fetchFn(symbol, timeframe, null, currentStartTs, currentEndTs)` — this matches the Alpaca signature `(symbol, timeframe, limit, startTs, endTs)` when `limit` is null, which maps to Alpaca's default 1000-bar limit. The missing piece is handling the cursor response when the window has more than 1000 bars.

**Timeframe mapping note**: Alpaca uses `'5Min'` not `'5m'`. The existing code passes the internal timeframe string (`'5m'`) directly to the URL (`alpaca.js:17`). This will produce a 422 error. A timeframe translation map is needed: `{ '5m': '5Min', '15m': '15Min', '1h': '1Hour', '1d': '1Day' }`.

### 4c. `fetchCryptoSnapshot` — route 5m to native fetch, not aggregation

**File**: `backend/scripts/data_ops/ingest_market_data/index.js:1779–1838`  
**Current behavior**: `fetchCryptoSnapshot` fetches `1d` base candles, then calls `aggregateCandles` to produce all requested timeframes including 5m. This produces synthetic 5m bars (one per day) — not real intraday data.  
**Change needed**: When `timeframes` includes `'5m'` (or any sub-daily interval) AND `historyDays > 5`, the function must fetch the native 5m base directly from Binance rather than deriving it from daily bars. The `aggregateCandles` path for 5m should only be used when the native fetch fails.

Concretely: add a branch in `fetchCryptoSnapshot` that, when the finest requested timeframe is ≤ 4h, sets `interval = '5m'` (or the finest native interval) and calls `fetchBinanceBaseCandles` with that interval via `fetchPaginated`.

### 4d. `fetchEquityOrIndexSnapshot` — route 5m to Alpaca, not Yahoo aggregation

**File**: `index.js:713–754`  
**Current behavior**: For non-Stooq providers, calls `selectYahooBase` which caps `5m` lookback to 60 days. Aggregates from Yahoo's finest base.  
**Change needed**: When provider is `alpaca` and finest timeframe is `5m`, bypass `fetchYahooBaseCandles` and call `fetchAlpacaBaseCandles` with `timeframe='5Min'` directly. Add Alpaca to the equities FAMILIES_MANIFEST dispatcher (it is in `fetchParallelBackfill`'s capable list but not in `fetchEquityOrIndexSnapshot`'s switch logic).

### 4e. `auto_backfill` and `backfill_interval_min` for 5m data

**File**: `shared/lib/settings/user_settings.js:31`  
**Current default**: `backfill_interval_min = 1440` (once per 24 hours). For a 5m live feed, the acceptable data gap before a bar goes stale is 3 hours (`FRESHNESS_RULES_MS.crypto['5m'] = 3h`). Running backfill at 24h cadence means 5m bars will be flagged stale for most of the day.  
**Change needed**: When 5m is in the active timeframe set, `backfill_interval_min` should be reduced to **30–60 minutes** at minimum (or driven on a separate per-family schedule). This is a settings/runner concern, not a data pipeline concern, but the scoping document should flag it as a required follow-on.

### 4f. Backfill runtime estimates (crypto, 5y depth, Binance free tier)

| Scope | Bars | API calls | Weight used | Wall time (at 1200 calls/min) |
|---|---|---|---|---|
| 1 crypto symbol, 5y | 525,960 | 526 | 2,630 | ~26 seconds |
| 18 crypto symbols, 5y | 9,467,280 | 9,468 | 47,340 | ~8 minutes |
| 20 US equity symbols, 5y (Alpaca) | 1,965,600 | ~197 | N/A | ~2 min (rate TBD) |
| Full universe (crypto + US equities), 5y | ~11.4M bars | ~9,665 | — | ~10–12 minutes |

These are free-tier estimates with no throttling delays. They assume no retry overhead and sequential symbol processing.

---

## 5. Risks

### 5a. Rate-limit bans (HIGH)

Binance's 6,000 weight/minute limit with 429 blocking is enforced per IP. The current code has no weight tracking across concurrent calls. `fetchParallelBackfill` fires 4 workers simultaneously (`backfill.js:136`), each making calls at full speed. For a full crypto 5m backfill, 4 parallel workers × 526 calls = 2,104 calls in the first minute × 5 weight = **10,520 weight** — nearly double the 6,000 limit. A parallel deep backfill will trigger 429s immediately. Mitigation required: reduce `numWorkers` to 2 for 5m, or add inter-call delays, or switch to sequential `fetchPaginated` for the initial deep pull.

### 5b. Storage growth (MEDIUM)

A full 5y crypto + US equity 5m binary ts-index is ~524 MB (see §3b). The JSON backtest_history caches add 4–5× on top if unbounded — potentially 2–3 GB of JSON. Current setup has no JSON cache window cap for historical modes. Recommendation: enforce a rolling 90-day JSON window (`historyDays <= 90` for JSON; full depth in binary only).

### 5c. Memory pressure in ML feature builder (MEDIUM-HIGH)

`loadAssetSourcesFromCache` has a documented warning: the expanding-window feature build is **O(n^2)** (`dataset.js:100–101`). At `1d` with 3,221 bars this is manageable. At `5m` with 525,960 bars per symbol, n^2 is **2.76 × 10^11 operations** per symbol — not practical. The `maxBarsPerSymbol` cap must be set explicitly when building ML features from 5m data. A practical cap of 2,000–5,000 bars (6–17 days of 5m) is needed for interactive feature engineering. Full 5y 5m data should be used for backtesting only, not piped directly into `buildMLFeatureFrame`.

### 5d. Provider data-quality gaps for equities (MEDIUM)

- **Alpaca SIP feed**: Corporate actions (splits, dividends) are not applied retroactively in the 5m bar history. Backtests on unadjusted 5m bars will have price discontinuities at split dates. For the universe (NVDA has had multiple splits; TSLA, AAPL similarly), this is a real risk for any strategy that uses price levels or return calculations.
- **Non-US equities (VN, UK, IN, GER)**: No 5m provider exists in the current stack for these symbols. Binance does not cover equities; Alpaca covers US exchanges only; Yahoo's 60-day cap is the only option, and it only covers symbols listed on US-accessible feeds. Vietnamese stocks (VCB, FPT, etc.) will have no 5m data until a dedicated provider (e.g., SSI Data for VN market) is integrated.
- **Session gaps**: US equities have 6.5h RTH sessions. 5m bars will show large gaps overnight and on weekends. The `aggregateCandles` and `calculateRollingFeatureFrame` functions currently do not skip session gaps — RSI, ATR, and similar indicators calculated across overnight gaps will be incorrect. A session-aware bar filter is needed before passing equity 5m data to the indicator pipeline.

### 5e. Contract roll gaps for commodities (MEDIUM)

Commodity futures (USOIL, XAUUSD, etc.) change contracts monthly/quarterly. Yahoo 5m data does not handle roll-adjusted continuous contracts. Price gaps of 1–5% at rolls will appear as false signals. Roll-adjustment logic is not in the current codebase.

### 5f. Twelve Data as current 5m source (LOW — already a problem)

The current `BTCUSDT_5m.bin` was written by TwelveData (5,000 bars ~17 days). After a Binance deep backfill, `writeTsIndex` will merge and overwrite this file. The deduplication logic (`validation.js:629–637`) deduplicates by millisecond timestamp. If TwelveData and Binance bars for the same timestamp differ by rounding, the merge will keep both — introducing duplicate-adjacent records. Since `writeTsIndex` uses a `seen` Set on the ms timestamp, exact-ms duplicates are dropped, but provider-level disagreements at the same timestamp are not resolved (last writer wins). This is a low-severity data-quality concern for the shallow overlap window.

---

## 6. Phased Recommendation

### Phase 1 — Crypto 5m deep history via Binance (recommended first, lowest risk)

**Scope**: Binance only. 18 crypto symbols. Target 3-year depth (1y as first milestone).  
**Work items**:
1. Raise `MAX_CALLS` in `binance.js:9` to 600, or route all 5m backfills through `fetchPaginated` (preferred — no internal loop in the provider function).
2. Add a branch in `fetchCryptoSnapshot` (`index.js:1779`) to fetch native 5m from Binance when the finest requested timeframe is sub-daily and `historyDays > 5`.
3. Run initial backfill sequentially (not parallel) to stay within the 6,000 weight/minute budget. Set `numWorkers = 1` in `fetchParallelBackfill` for the initial deep pull.
4. Verify binary ts-index file for BTCUSDT 5m grows to expected size (~25 MB for 5y).
5. Add a JSON cache window cap (90 days) for 5m data to prevent JSON bloat.

**Risk**: Low. Binance is free, no auth, well-understood pagination. No strategy or ML changes needed for Phase 1.  
**Deliverable**: `BTCUSDT_5m.bin` et al. holding 1–5 years of native Binance 5m bars.

### Phase 2 — US Equity 5m via Alpaca (medium complexity)

**Scope**: 20 US equities. Target 2-year depth (limited by practical Alpaca SIP history availability).  
**Work items**:
1. Add `next_page_token` pagination to `fetchAlpacaBaseCandles`.
2. Add timeframe translation map (`'5m'` → `'5Min'`).
3. Wire Alpaca into `fetchEquityOrIndexSnapshot`'s provider dispatch for sub-daily timeframes.
4. Add split/adjustment flag to Alpaca bar requests (`adjustment=split` parameter).
5. Add session-gap guard to indicator pipeline before consuming equity 5m bars.

**Risk**: Medium. Alpaca rate limits are undocumented; Alpaca 422 bugs have been seen before (per bot integration memory notes). Paper-account data quality vs. SIP quality may differ.

### Phase 3 — FX and Commodities 5m (deferred until provider decision)

These families require either a paid TwelveData plan or a new provider integration. Defer until the user decides on budget allocation. Yahoo 60-day rolling window is available as a stop-gap for commodity 5m if session-gap handling is added.

### Phase 4 — ML feature builder 5m support

After Phase 1 data is available: add `maxBarsPerSymbol` configuration to `ml dump` commands, document recommended cap (~2,000 bars = 7 days at 5m granularity for interactive use), and test `buildMLFeatureFrame` performance against 5m inputs.

---

## 7. Open User Decisions

The following 5 questions must be answered before implementation starts:

**Q1 — Depth target**: What is the minimum acceptable historical depth for 5m data? Options:
- 1 year (crypto: 105k bars/symbol, 4.8 MB/symbol — fast to backfill)
- 3 years (315k bars, 14.4 MB/symbol — recommended balance)
- 5 years (526k bars, 25.2 MB/symbol — maximum free-tier Binance depth from 2017 for BTC; shorter for newer alts)

**Q2 — Family priority**: Phase 1 (crypto Binance) is clearly the lowest-friction first step. Should Phase 2 (US equities via Alpaca) follow immediately, or is crypto-only 5m sufficient for the near-term ML/backtesting use cases?

**Q3 — FX and non-US equities**: Are FX 5m and VN/UK/GER equity 5m in scope at all? They require either a paid provider ($29–$79/mo TwelveData or equivalent) or accepting Yahoo's 60-day rolling window. If not, should those families be explicitly removed from the `timeframes` list in `data_sources.yaml` for 5m to avoid generating misleading synthetic bars?

**Q4 — JSON cache window cap**: Is it acceptable to cap the JSON backtest_history.json files at 90 days for 5m data (full depth in binary ts-index only)? The current system uses JSON as the primary read path for some commands; switching those to binary ts-index reads may require additional changes to the status/backtest CLI commands.

**Q5 — `backfill_interval_min` for live ops**: For 5m to be useful in a live strategy context, the auto-backfill interval needs to drop from 1440 min (daily) to something like 30–60 min. Does this change the operational burden (CPU, storage I/O, API calls) at a level the user wants to consciously opt into, versus leaving 5m data as backtest-only with no live refresh?

---

*End of scoping document. No code was modified during this research pass.*
