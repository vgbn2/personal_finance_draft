# Polymarket Historical Backfill Implementation Plan

## Goal

Build a repeatable Polymarket research path that can answer: "Would this strategy have worked on resolved markets, using only information available at the time?"

The first implementation target is local price-history replay. Full historical order books are optional and should be sampled around candidate trades only after the price-history signal survives basic tests.

## Existing Anchors

- `workspace/POLYMARKET_BOT_PLAN.md`: states the need for resolved markets, rolling price series, and outcomes.
- `shared/lib/market/polymarket_history.js`: already fetches Gamma closed markets and CLOB `/prices-history`.
- `backend/cli/commands/trade/polymarket_backtest.js`: already runs simple resolved-market strategies, but it fetches live and can fall back to a single Gamma outcome price.
- `backend/cli/commands/trade/trade.js`: exposes `polymarket history` and `polymarket backtest` command surfaces.

## Storage Contract

Generated local state:

```text
storage/data/polymarket_history/
  manifest.json
  markets_index.json
  prices/<token_id>.json
  features/<token_id>.json
  orderbooks-lite/<token_id>.jsonl
```

Recommended content:

- `manifest.json`: schema version, generated_at, days_back, interval, market_count, price_count, missing_history_count.
- `markets_index.json`: normalized market records with `market_id`, `condition_id`, `question`, `category`, `end_date`, `closed`, `volume`, `tokens`, `winner`, and `resolution_confidence`.
- `prices/<token_id>.json`: normalized price points `{ t, iso, p, source }`, sorted ascending and deduped by `t`.
- `features/<token_id>.json`: point-in-time rows derived from price curves.
- `orderbooks-lite/<token_id>.jsonl`: candidate-time snapshots or derived metrics only, not a dense global archive.

Do not commit bulk generated history. Commit only fixtures under `tests/fixtures/` or tiny documented samples when needed.

## Phase 1: Archive Library

Extend `shared/lib/market/polymarket_history.js` with:

- `archivePaths(root?)`
- `normalizeGammaMarket(market)`
- `normalizePriceHistory(raw)`
- `readPolymarketArchive(opts)`
- `writePolymarketArchiveChunk(record)`
- `loadArchivedMarketIndex(opts)`
- `loadArchivedPriceSeries(tokenId, opts)`
- `summarizeArchiveCoverage(root)`

Rules:

- Normalize token IDs as strings.
- Use YES and NO tokens when available, but keep YES as the initial strategy target.
- Store raw-enough metadata to recompute winner inference if the heuristic improves.
- Return structured `{ ok, data, errors, warnings, summary }`.
- Add retries through the repo's shared fetch retry helper if available.

Tests:

- normalized Gamma market shape
- price dedupe and sorting
- archive write/read round trip
- missing history reports as warning, not silent success

## Phase 2: CLI Ingest

Add a command surface under `polymarket research ingest` or `polymarket history ingest`.

Suggested command:

```text
node backend/cli/sovereign_cli.js polymarket research ingest --days 180 --interval 1h --max-markets 500 --category crypto --json
```

Behavior:

- Paginate Gamma closed markets until `max-markets` or date cutoff.
- Filter by category/tag only when the source fields support it reliably; otherwise fetch broad and filter client-side.
- Fetch CLOB price history for target tokens.
- Write incrementally so interrupted runs can resume.
- Print coverage summary and warning counts.

Output fields:

- `ok`
- `markets_scanned`
- `markets_archived`
- `tokens_archived`
- `price_points`
- `missing_history`
- `skipped`
- `archive_root`
- `manifest_path`

Network policy:

- Make live fetch explicit in command behavior.
- Use `--no-cache` only for repair runs.
- Keep tests no-network by injecting fetchers and temp archive roots.

## Phase 3: Local Replay Backtest

Update `backend/cli/commands/trade/polymarket_backtest.js`:

- Load local `markets_index.json` and `prices/<token_id>.json` first.
- Add `--from-archive` default behavior once archive exists.
- Keep live fetch as `--repair-missing` or fallback only.
- Label Gamma single-price fallback as `fallback_only`, not equivalent to true history.
- Report archive coverage in every backtest result.

Replay rules:

- Strategy decisions must be point-in-time.
- A strategy cannot inspect future prices or final resolution when selecting entries.
- Exits can be strategy exits or hold-to-resolution.
- Include fees and execution-cost assumptions in metrics.

Minimum result fields:

- `trades`
- `wins`
- `losses`
- `win_rate`
- `avg_pnl_per_trade`
- `ev_per_trade`
- `max_drawdown`
- `avg_hold_time_hours`
- `fallback_only_count`
- `archive_coverage`

## Phase 4: Feature Generation

Create feature rows from price curves:

- `p`
- `p_ma_7d`
- `p_ma_14d`
- `p_vol_7d`
- `p_momentum_7d`
- `p_zscore_7d`
- `drawdown_from_peak`
- `time_to_resolution_hours`
- `elapsed_fraction`

Use interval-aware rolling windows:

- `1h`: 7d = 168 bars
- `5m`: 7d = 2016 bars
- `1d`: 7d = 7 bars

Avoid global future leakage. Each row should use only current and previous points.

## Phase 5: Execution-Cost Model

Start with a lightweight configurable model:

```text
cost = fee + half_spread_estimate + impact_estimate
impact_estimate = Y * rolling_volatility * sqrt(order_notional / rolling_market_volume)
```

Defaults:

- `Y = 1.0`
- retail orders below a small notional threshold can assume near-zero impact on liquid markets
- enforce conservative spread and depth penalties for thin markets

Polymarket-specific caveat:

- Thin markets and volatile news windows can make spread and top-of-book depth more important than the square-root law.
- Treat this model as a backtest approximation until order-book-lite validates candidate trades.

## Phase 6: PMXT Order-Book-Lite

Use PMXT historical order-book data only after a strategy produces candidate trades.

Store derived fields around entry/exit candidate timestamps:

- `best_bid`
- `best_ask`
- `mid`
- `spread`
- `depth_1pct`
- `depth_5pct`
- `snapshot_ts`
- `source`

Do not store dense full-depth snapshots for every market by default. If a strategy requires full book replay, add a separate user-approved archive mode with explicit storage estimates.

## Subagent Execution Plan

Spawn workers only when the user asks for delegation.

### Worker A: Archive Library

Prompt:

```text
Use the repo-local Polymarket history plan to implement the archive library only.
Own files: shared/lib/market/polymarket_history.js and tests directly covering that module.
Add archive path helpers, normalization, read/write helpers, coverage summary, and no-network tests.
Do not modify CLI command files. Do not revert other edits. Report changed files and verification commands.
```

### Worker B: CLI Ingest And Backtest Wiring

Prompt:

```text
Implement the Polymarket history ingest and local replay command wiring.
Own files: backend/cli/commands/trade/trade.js, backend/cli/commands/trade/polymarket_backtest.js, and directly related CLI tests.
Use the archive helpers exposed by shared/lib/market/polymarket_history.js. Do not edit archive internals except for small integration fixes.
Do not place live orders. Do not revert other edits. Report changed files and verification commands.
```

### Worker C: Features And Execution Costs

Prompt:

```text
Implement point-in-time Polymarket feature generation and execution-cost modeling.
Own files: new or existing shared/lib/market helper files and focused feature/cost tests.
Compute rolling means, volatility, momentum, z-score, drawdown, time-to-resolution, and a configurable spread/impact cost model.
Do not modify CLI command files. Do not revert other edits. Report changed files and verification commands.
```

### Reviewer

Prompt:

```text
Review the Polymarket history backfill implementation for future leakage, storage blow-up, live-order risk, and no-network test coverage.
Do not make broad rewrites. If you patch anything, keep changes minimal and list files changed.
Run targeted tests if available and report residual risks.
```

## Acceptance Criteria

The feature is complete when:

- A no-network fixture test can ingest resolved markets and price curves into a temp archive.
- A backtest can run from local archive files with no live fetch.
- Backtest output clearly labels archive coverage and fallback-only markets.
- Feature rows are point-in-time and tested against a known curve.
- Execution-cost settings are visible in the output.
- Generated bulk history remains untracked by default.
- Workspace docs list the command, storage policy, and next PMXT order-book-lite phase.
