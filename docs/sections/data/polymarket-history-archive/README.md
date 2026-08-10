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

## Known Maintenance Boundary

`backfillPolymarketArchive()` currently combines catalog pagination, index merge, skip-existing logic, feature regeneration, rate pacing, provider calls, writes, counters, and manifest construction in one high-complexity function. The repository review ledger identifies this as maintainability debt. Any refactor must preserve v1 mirror fields, skip-existing counts, delay behavior, and append-only run history before splitting helpers.

## Verification And Limits

Representative source contracts:

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
