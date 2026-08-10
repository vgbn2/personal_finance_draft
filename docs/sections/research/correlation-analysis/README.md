# Correlation Analysis

> **Status:** Implemented for local source/test scope; no provider, host, deployment, paper, or live qualification is implied.
> **Audience:** quantitative researchers and maintainers of the backend correlation command.
> **Canonical owners:** `backend/cli/commands/tools/backend_correlation.js` and the native `correlation` backend command.
> **Review triggers:** symbol resolution, storage readers, formula synthesis, alignment policy, native argument contract, correlation method, temporary snapshot lifecycle.

## Purpose And Boundary

This section owns the local correlation-analysis bridge from selected symbols to a focused native C++ correlation matrix. It selects available sources, constructs a small aligned snapshot, selects a method, invokes the local backend, and returns provenance such as dropped symbols and last aligned prices.

It does not ingest or refresh providers, repair data, place orders, or decide strategy promotion. The short operator entry remains in [CLI Features](../../../operational/guides/CLI_FEATURES.md); this page owns the exact input, alignment, and failure contract.

## Entrypoint And Data Flow

`runBackendCorrelation(args, preSelectedSymbol)` is called by the backend CLI surface.

1. It reads `--symbols` or uses an interactive asset picker in a rich terminal; otherwise it falls back to configured equity symbols.
2. It resolves requested symbols against the local universe and removes unavailable symbols unless an explicit `--input` snapshot was supplied.
3. Without `--input`, it builds a focused temporary snapshot from binary time-series files first, then family JSON history for missing indexed series.
4. It computes daily macro and requested formula series when applicable, filters thin series, and finds the common date intersection.
5. It selects a correlation method, invokes the C++ backend with only the focused snapshot, then removes the temporary snapshot.
6. It attaches local-only metadata such as last aligned prices, dropped symbols, and the FX-return interpretation note.

The wrapper creates its temporary snapshot under the operating system temporary directory. It removes it after the native child returns; this is a best-effort cleanup path, not durable storage.

## Source Selection And Synthesis

`loadFocusedSources()` prefers `storage/data/ts/<symbol>_<timeframe>.bin` through `readTsIndex()`. For symbols missing from the binary index, it reads compatible family `backtest_history.json` files under the configured history root. An explicit `--input` bypasses this availability prefilter because the caller supplies a self-contained source.

For daily analysis only, `synthesizeDailyMacroBars()` turns sparse scalar macro/PMI/sentiment records into capped forward-filled OHLC-shaped rows. The final unbounded record fills at most 45 days, preventing stale scalar observations from becoming arbitrary long history.

`FORMULA_REGISTRY` defines synthetic cross rates, currency indexes, and ratios. Formula synthesis requires every component on the same calendar date and labels output `family: "synthetic"`, `source: "formula-synthesis"`. Formula output is analysis input, not provider truth.

## Alignment And Coverage Contract

Correlation uses shared calendar dates, not merely equal record counts.

- A symbol needs at least 30 dates to be eligible.
- The wrapper calculates per-symbol date coverage before invoking C++.
- If fewer than two eligible symbols remain, it returns `insufficient_correlation_coverage`.
- If eligible symbols have no common dates, it returns `no_common_correlation_dates` with coverage and candidate blockers.
- `--drop-non-overlap` permits removal only when the retained set still has at least two symbols and a non-empty common date intersection.
- If the post-filter snapshot is empty, it returns `empty_aligned_correlation_snapshot`.

These outcomes are CLI preflight errors with `engine: "sovereign_cli_preflight"`; they do not mean the native correlation engine failed. Human rendering includes the coverage table, blockers, and a next action rather than falling back to stale or unrelated cache data.

When duplicate same-symbol/date records survive source assembly, `buildAlignedSources()` selects a deterministic representative and prefers synthetic rows, then macro rows, over prior alternatives. This preserves a single source per symbol/date for the focused native input.

## Methods And Native Invocation

`defaultCorrelationMethod()` chooses `fx-returns` only when every effective symbol is an FX family member; otherwise it uses `pearson-returns`. A requested `fx-returns` method downgrades to `pearson-returns` for mixed/non-FX selections. The wrapper passes symbols, timeframe, focused `--input`, `--max-bars`, resolved method, and `--json` to the local backend.

`--divergence`, `--short-window`, and `--threshold` are forwarded only when explicitly requested. The progress estimate is cosmetic: it uses pair count `N(N-1)/2` and session-local prior timings. It does not alter matrix inputs or results.

For an all-FX automatic method, the result receives an explanatory note: pairs are directional and the matrix uses log returns. Consumers should preserve method and source provenance alongside numeric matrix cells.

## Failure, Limits, And Evidence

The command can fail before native execution for too few available symbols, insufficient coverage, no intersection, or an empty aligned snapshot. Native command errors remain native results. Provider refresh is intentionally not attempted by this wrapper.

The wrapper reads local storage and writes only a temporary focused snapshot. It neither mutates canonical cache data nor calls a remote provider. A stale local cache can therefore yield an honest no-overlap/coverage failure rather than an automatic recovery.

Representative focused tests:

- `tests/scripts/integration/engine/backend_correlation_preflight.test.js` covers coverage errors, no-overlap blockers, `--drop-non-overlap`, temporary focused snapshots, formula handling, and rendered next-step guidance.
- `tests/scripts/tui/cli_commands/sovereign_cli_human_surfaces.test.js` covers CLI output when the local native backend is available.
- `tests/benchmarks/math/correlation_matrix.bench.js` is performance evidence only, not a correctness or operational qualification gate.

These checks do not prove the freshness or correctness of local data, provider behavior, a clean install, authenticated CI, deployment, recovery, paper trading, or live trading.

## Change Checklist

1. Preserve explicit `--input` as a self-contained source contract.
2. Keep binary-first/local-history fallback ordering and formula provenance visible.
3. Test thin, missing, non-overlapping, dropped, and aligned symbol sets.
4. Keep `--drop-non-overlap` conservative: at least two retained symbols with a real shared date set.
5. Keep method selection and native argv synchronized with the C++ command contract.
6. Treat temporary snapshot cleanup failures as an operational concern; never replace them with canonical storage writes.
7. Update the operator guide when user-facing flags or preflight diagnostics change.
