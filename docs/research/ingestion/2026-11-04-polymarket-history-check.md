# Polymarket historical backfill check

Date: 2026-11-04. Scope: source review and offline tests; no network backfill, credential reads, canonical archive writes, or live execution.

## Implemented capability

Polymarket already implements resolved Gamma market metadata and CLOB token price-curve archiving. Default storage is `storage/data/polymarket_history/`, with market index, manifest, prices, features, and optional orderbook-lite files. This does not establish complete historical coverage.

- Command: `polymarket backfill`; also `polymarket research ingest` and `polymarket history ingest|backfill`. The archive branch returns before the later orderbook branch, so `history backfill` selects the archive; use `history orderbook-lite` for the separate book path (`backend/cli/commands/trade/trade_polymarket.js:846-890`).
- Options include `--days` (default 180), `--interval` (default `1h`), `--max-markets` (default 500), `--start-offset`, `--archive-root`, `--delay-ms`, `--refresh`, `--include-no`, and symbol/slug filters (`:71-148`). No command was executed against a provider.
- Gamma pagination requests up to 100 markets per page; the helper bounds offsets below 2000. Date, category, volume, and targeting filters are applied locally (`shared/lib/market/polymarket_history.js:524-625`). This is not an exhaustive historical-market guarantee.
- CLOB requests `/prices-history` with `interval=max`. The source maps interval labels to numeric `fidelity` values: `1m=60`, `5m=300`, `1h=3600`, `1d=86400`, `1w=604800` (`:863-887`). Upstream fidelity units and effective sampling were not verified; labels are not proof of actual granularity.
- Normalization validates prices in [0,1], timestamps, sorting, and deduplication (`:133-153`). These are point curves, not native OHLC candles; optional OHLCV is locally derived.
- Resume skips nonempty token price files unless refreshing, regenerates missing features, and merges the market index. It is token-file resume, not transactional partial-page checkpointing (`:627-799`).
- Local backtests prefer the archive. Empty price histories can fall back to a single Gamma outcome-price point, which is not historical price evidence (`backend/cli/commands/trade/polymarket_backtest.js:377-478`).
- Full historical L2/L3 books are not established. Optional PMXT orderbook-lite is separate and requires provider qualification; no credentials were inspected.

## Offline evidence

The assessment agent and subsequent fresh coordinator verification each ran `node --test tests/scripts/integration/polymarket/polymarket_history_archive.test.js`: 15 passed, zero failed per run. Fresh coordinator checks also passed eight focused ingest/research tests, both modified production JavaScript syntax checks, `git diff --check`, and anti-cheat with zero strikes. Tests exercise temporary archives, fixture ingestion, pagination, skip-existing, empty-file refetch, refresh, index merging, manifest totals, delay semantics, and delta sync. They do not qualify external API behavior or recoverable coverage.

## Requested Kalshi removal

Removed `fetchKalshiHistoricalMarkets` and `fetchKalshiHistoricalCandlesticks` declarations/imports/exports. Current Kalshi support remains. Historical Kalshi dispatch still rejects explicitly rather than substituting current snapshots. The new export-removal contract failed before deletion and eight focused ingest/research tests passed afterward. The four retained Yahoo/OpenSky/Blockchair/SEC fetchers remain incomplete.

Graph refresh was attempted and exited 1 because graphify refused to replace the existing graph with a smaller corpus. No forced overwrite or parser install was performed; graph freshness is not certified. The seven findings in the original ingestion/configuration/test audit remain unrepaired.
