# Backtest Execution

> **Status:** Implemented for source/test scope; provider, host, paper, and live qualification are not implied.
> **Audience:** quantitative researchers and maintainers of the research CLI or strategy engine.
> **Canonical owners:** `backend/cli/commands/research/research.js`, `shared/lib/strategy/backtest.js`, `shared/lib/runtime/backend_bridge.js`.
> **Review triggers:** backtest CLI arguments, feature-frame splits, engine dispatch, metric schema, degraded-mode semantics, prop-firm scoring, temporary native-frame protocol.

## Purpose And Boundary

This section owns the path from a validated feature frame to a backtest result. It covers input selection in the research CLI, chronological splitting, JavaScript or native execution, metrics, stress evidence, and engine provenance.

It does not own market-data ingestion, indicator formulas, strategy-file parsing, native sweep optimization, order execution, or promotion into automated trading. The sweep and dataset-catalog surfaces remain outside this section.

The guided walkthrough remains in [Codebase Tour: Strategy, Backtesting & ML](../../../codebase_tour/03_strategy_backtest_ml.md). That tutorial should link here for exact ownership instead of restating this contract.

## Entrypoint And Ownership Flow

`commandBacktest(args)` in `backend/cli/commands/research/research.js` is the operator-facing orchestrator:

1. It resolves a registered strategy and applies strategy defaults unless CLI flags override them.
2. It selects sample data, cached validated sources, or an explicitly requested provider-history window.
3. It rejects degraded data unless `--allow-degraded` is present.
4. It computes rolling features, filters the requested symbols/date range, and calls `splitFeatureFrame()`.
5. It runs in-sample, out-of-sample, and full-frame backtests. Non-sample runs also call `rollingWalkForward()`.
6. It adds trust, benchmark, data-quality, and strategy-taxonomy evidence, writes the report, and updates the strategy grade record when a strategy source exists.

`shared/lib/strategy/backtest.js` owns calculations and engine selection. `shared/lib/runtime/backend_bridge.js` owns native binary discovery and structured child-process execution.

## Input And Split Contracts

A feature frame contains rows keyed by `feature.key` with at least a timestamp, close, symbol, and timeframe plus model inputs. The engine does not fetch providers directly.

`filterFeatureFrame()` applies timeframe and inclusive date filters. `splitFeatureFrame()` groups rows by key, sorts each group chronologically, and places the first `floor(length * trainRatio)` rows in train, bounded so both sides retain a row when the group has at least two rows. Callers must validate ratios and sample sufficiency when stronger guarantees are required.

`rollingWalkForward()` sorts all keyed rows into one global chronological sequence, builds expanding-train/next-chunk-test folds, and returns compact metrics only. It reports failure rather than fabricating folds when a chunk has fewer than two rows.

This general backtest split is separate from the excluded native global-sweep selection protocol. Do not infer sweep train/validation/holdout behavior from this page.

## Engine Dispatch

`runBacktest(featureFrame, options)` reports both requested and actual engines:

- `engine: "js"` calls `runBacktestJs()` directly and is not degraded.
- `engine: "auto"` prefers native mode when `backendAvailable()` finds the C++ binary. Native mode passes the selected symbols, timeframe, thresholds, costs, date range, and Monte Carlo count to the binary.
- `engine: "js_model"` annotates feature rows with JavaScript model predictions, writes a process-specific temporary frame, invokes native frame mode, and removes the temporary file in `finally`.
- Missing, invalid, or failed native execution falls back to JavaScript with `degraded: true` and a machine-readable `fallback_reason`.

`withEngineProvenance()` is the compatibility boundary. Consumers should inspect `engine_requested`, `engine_actual`, `degraded`, and `fallback_reason`; the `engine` field alone is insufficient to prove that the requested path ran.

## JavaScript Execution And Metrics

`runBacktestJs()` groups rows by key and evaluates non-overlapping horizon steps. A trade opens only when the resolved model predicts `long` at or above the threshold. It applies entry and exit fee/slippage drag before compounding equity.

For intraday equities, a candidate whose entry and exit fall on different UTC calendar dates is rejected to avoid treating overnight/weekend gaps as continuously tradable P&L.

The result includes:

- trade logs and an equity curve;
- net/gross return, drawdown, hit rate, expectancy, payoff, and profit-factor fields;
- annualized Sharpe and Sortino values based on the labeled timeframe;
- time-weighted variance using holding period or elapsed hours as exposure weight;
- historical value-at-risk/expected-shortfall evidence;
- deterministic bootstrap Monte Carlo summaries with bounded retained paths;
- an equal-weight buy-and-hold benchmark;
- optional prop-firm suitability against the selected profile.

Null and unavailable values are meaningful. Callers must not reinterpret a missing annualized metric, empty trade sample, or absent native field as authoritative zero.

## Side Effects And Safety

The pure calculation helpers do not submit orders. `commandBacktest()` can still have local and external side effects:

- `--days` on a non-sample run can request provider history;
- quality and backtest JSON artifacts are written under configured storage paths;
- a strategy-backed run can update the strategy grade index;
- native frame mode creates and removes a temporary JSON file;
- native execution starts the local C++ child process.

A backtest result is research evidence, not authorization to trade. Automation and live execution have separate trust, runtime-policy, authorization, kill-switch, credential, and risk gates.

## Failure And Degraded Semantics

The CLI fails visibly for invalid strategy files, provider-history failure, or disallowed degraded data. Calculation helpers may return valid empty samples when no model prediction crosses the threshold; this is not an execution error.

Native failures are fail-soft for research availability: the dispatcher uses the JavaScript engine and labels the reason. This behavior preserves a result but weakens engine provenance. Any consumer requiring native evidence must reject `degraded: true` or an unexpected `engine_actual`.

## Verification

Representative focused evidence:

- `tests/scripts/architecture/strategy_contracts/strategy_backtest_contract.test.js` covers CLI defaults, output shape, walk-forward behavior, native dispatch when available, Monte Carlo path bounds, and chart rendering.
- `tests/scripts/safety/degraded_fallback.test.js` pins engine provenance and explicit-JavaScript semantics.
- `tests/scripts/architecture/prop_firms_contract.test.js` covers selected-profile suitability and opt-out behavior.
- `tests/benchmarks/strategy/backtest_engine.bench.js` measures the JavaScript engine but is performance evidence, not a correctness or release gate.

These tests establish source-level contracts in the checked-out environment. They do not prove provider acceptance, clean-install reproducibility, authenticated CI, host operation, paper trading, live execution, recovery, or soak.

## Change Checklist

When an owning path changes:

1. keep CLI options and output fields aligned with the engine contract;
2. preserve chronological and keyed split semantics or document the migration explicitly;
3. preserve truthful requested/actual/degraded engine provenance;
4. test empty, insufficient, fallback, and native-success cases;
5. review metric units, annualization assumptions, transaction-cost application, and null semantics;
6. update the codebase-tour trace without copying this full reference contract.
