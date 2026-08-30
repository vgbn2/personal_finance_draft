# Polymarket History Archive

> **Status:** Implemented source exists; archive backfill and orderbook capture are provider/data-write operations and are not qualified by this reference.
> **Audience:** maintainers of local prediction-market research archives and backtests.
> **Canonical owner:** `shared/lib/market/polymarket_history.js`.
> **Review triggers:** archive schema, normalization, market/token mapping, cache policy, feature generation, orderbook capture, pagination, manifest compatibility.

## Purpose And Boundary

This module owns a local archive format for resolved Polymarket markets, token price histories, derived feature rows, and lightweight orderbook snapshots. It provides local readers and normalizers for research/backtest consumers, plus explicit backfill functions that contact external services and write archive files.

Reading an archive is not a provider check. Backfilling an archive is not a read-only command. This reference describes both paths so callers can choose the correct side-effect boundary.

## Archive Layout And Compatibility

The default root is `storage/data/polymarket_history`. `archivePaths(root)` normalizes an omitted or explicit-null root to that default and returns:

- `manifest.json` for archive provenance and run summaries;
- `markets_index.json` for normalized market records;
- `prices/<token>.json` for normalized token price history;
- `features/<token>.json` for derived feature rows;
- `orderbooks-lite/<token>.jsonl` for append-only orderbook snapshots.

Schema v1 is retained for compatibility. The active backfill writer produces schema v2 manifests with aggregate totals, up to 50 run entries, and legacy top-level mirror fields for older consumers.

Token file names are sanitized to alphanumeric, underscore, and dash characters. Missing or malformed local files degrade to empty arrays or null manifests in reader APIs rather than throwing to callers.

## Local Read And Normalization APIs

`loadArchivedMarketIndex`, `loadArchivedPriceSeries`, `loadArchivedFeatureRows`, and `loadArchivedOrderbookLite` read local files only. `readPolymarketArchive` returns the market index and manifest; `summarizeArchiveCoverage` counts local files, points, features, snapshots, and missing token artifacts.

`normalizeGammaMarket()` converts heterogeneous Gamma market shapes into a stable record with market/condition IDs, question/category, dates, volume/liquidity, tokens, inferred outcome, and constrained raw metadata.

`normalizePriceHistory()` accepts array or `{ history }` payloads, validates price values in `[0, 1]`, converts millisecond or second timestamps to whole seconds, deduplicates by timestamp, attaches ISO time and source, then sorts ascending. `buildPriceSeries()` exposes the normalized rows as timestamp/price pairs.

`yesTokenId`, `inferWinner`, and `gammaFinalPrice` interpret Gamma-compatible token/outcome representations. Resolution confidence is explicit: direct resolution fields are preferred, high-confidence near-extreme ask prices follow, and outcome-price fallback is labeled low confidence. These helpers do not establish the real-world resolution of a market.

## Write And Provider Boundaries

The following functions mutate local archive files and must not run as part of a read-only analysis:

- `ensureArchive`, `writePolymarketArchiveChunk`, and `appendJsonLines` create or modify archive paths.
- `backfillPolymarketArchive` pages resolved Gamma markets, fetches token histories, writes indexes/prices/features/manifests, and may delay between remote fetches.
- `fetchResolvedGammaMarkets*` and `fetchClobPriceHistory` contact Gamma/CLOB unless a valid local TTL cache is used.
- `capturePolymarketOrderbookLite` calls the PMXT archive endpoint and appends normalized snapshot rows; it warns when no PMXT key is configured.

The archive backfill is designed to resume safely: it merges market index records by stable ID, skips non-empty existing token price files unless `refresh` is set, regenerates missing features from local prices where possible, records warnings/errors, and preserves append-only run history. These source behaviors do not prove provider availability, data completeness, rate-limit handling in production, or storage durability.

## Feature And Orderbook Data

For selected market tokens, backfill can call `buildPolymarketFeatureRows()` over normalized prices and write the result separately. A missing feature file can be regenerated from an existing local price file without another price-history request.

Orderbook-lite rows normalize bid/ask depth, midpoint, spread, 1%/5% depth, last trade, timing, market/token context, and source metadata. They are append-only JSONL snapshots, not a complete orderbook replay guarantee.

## Tunable Adaptive Sampling & OHLCV Resampling

Polymarket prediction contracts vary from 5-minute rolling binaries to multi-year geopolitical regimes. To prevent oversampling long-lifespan markets while retaining high-fidelity signal on short-lifespan markets, `resolveTunableRegressionFidelity()` dynamically resolves sampling step $\Delta t$:

$$\Delta t(L; N, \gamma, \beta) = \gamma \cdot \frac{L^\beta}{N \cdot 300^{\beta - 1}}$$

- **Parameters**:
  - $L = T_{\text{end}} - T_{\text{start}}$ (lifespan in seconds)
  - $N = 300$ (target bar count across lifecycle)
  - $\gamma = 1.0$ (scale multiplier)
  - $\beta = 0.9852$ (compression exponent)
- **Quantization**: Clamps $\Delta t \in [1\text{s}, 86400\text{s}]$ and snaps to canonical intervals (`1s`, `5s`, `15s`, `30s`, `1m`, `5m`, `15m`, `30m`, `1h`, `2h`, `4h`, `6h`, `12h`, `1d`).

`bucketTicksToOhlcv()` resamples raw trade ticks or price points into standard $[t, o, h, l, c, v]$ candles with forward-filling across inactive intervals.

## Curated Default Universes & Selection Modes

Default contract universes are defined in `config/markets/data_sources.yaml` and `config/polymarket_scope.json`:
- **Macro**: `fed_rate_cut_prob`, `us_cpi_target`, `us_recession_2026`
- **Crypto**: `btc_price_milestone`, `eth_etf_inflows`, `eth_price_target`, `sol_target`, `poly_btc_15m_rolling`
- **Geopolitics**: `us_presidency_regime`, `sec_crypto_regulation`

CLI commands support four flexible selection modes and binary persistence:
- **Mode 1 (Default Universe)**: `bin/sovereign polymarket backfill --all-defaults`
- **Mode 2 (Targeted Symbols / Slugs)**: `bin/sovereign polymarket backfill --symbol fed_rate_cut_prob --slug "fed-rate-cut-in-2026"`
- **Mode 3 (Top Liquidity Scanner)**: `bin/sovereign polymarket backfill --top 30 --category crypto --min-volume 50000`
- **Mode 4 (Scope File)**: `bin/sovereign polymarket backfill --scope-file config/polymarket_scope.json --scale 0.5 --target-bars 600`
- **Binary Time-Series Output**: Adding `--save-ts` writes `.bin` (SOVT format) and `.meta.json` sidecars directly to `storage/data/ts/`.

## Known Maintenance Boundary

`backfillPolymarketArchive()` currently combines catalog pagination, index merge, skip-existing logic, feature regeneration, rate pacing, provider calls, writes, counters, and manifest construction in one high-complexity function. The repository review ledger identifies this as maintainability debt. Any refactor must preserve v1 mirror fields, skip-existing counts, delay behavior, and append-only run history before splitting helpers.

## Verification And Limits

Representative source contracts:

- `tests/scripts/integration/polymarket/polymarket_tunable_backfill.test.js` covers adaptive fidelity calculation across 5m, 1h, 30d, 365d lifespans, scale overrides, OHLCV forward-filling, scope schemas, and filtered archive backfills.
- `tests/scripts/integration/polymarket/polymarket_history_archive.test.js` covers archive paths, schema compatibility, pagination, skip-existing/refresh behavior, feature regeneration, merge behavior, and local fixtures.
- `tests/scripts/strategy/polymarket_backtest.test.js` covers local archive replay and price-history normalization for research backtesting.
- `tests/scripts/integration/polymarket/polymarket_orderbook_lite.test.js` covers normalized orderbook snapshot shapes and fallback behavior.

These tests use controlled inputs or injected fetchers. They do not perform provider polling, create a canonical archive in this checkout, validate external data quality, prove provider credentials, or qualify paper/live trading.

## Change Checklist

1. Preserve explicit read-only readers and explicit provider/write functions; do not hide side effects behind a reader.
2. Keep root/null fallback, token sanitization, schema v1 mirrors, and malformed-local-file degradation compatible.
3. Test price timestamp/price validation, token/outcome mapping, index merge, skip-existing, refresh, and manifest run history.
4. Treat empty remote history as data evidence with a warning, not a successful complete archive.
5. Keep PMXT credentials out of archive artifacts and documentation.
6. Before extracting backfill helpers, pin current counters, delay semantics, retry behavior, and append-only manifest history.
