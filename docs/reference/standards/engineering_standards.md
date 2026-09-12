# Engineering Guide

This document explains the current architecture and the engineering rules contributors should follow.

## Architecture Summary

The repository is now an active local trading-platform prototype. It still has staged and gated modules, but the useful base is no longer just file layout: local ingestion, validation, CLI research/backtest commands, C++ inspection, and the web/API bridge are live.

```text
data sources
        |
        v
ingestion adapters -> validated market frames -> features/CNN tensors
        |                                      |
        v                                      v
backtests and research                    signals
        |                                      |
        v                                      v
portfolio monitor <- trade log <- execution and broker adapters
```

The personal-finance code is legacy/reference context. New engineering work should prioritize trading data, research, execution, and monitoring modules.

## Active Source Map

- `backend/cli/sovereign_cli.js`: active CLI command surface.
- `backend/scripts/data_ops/ingest_market_data.js`: active ingestion orchestration.
- `shared/lib/`: active JS helpers for validation, indicators, backfill, models, providers, and quote routing.
- `backend/api/app.js`: active local web/API bridge.
- `backend/api/server/services/cli_executor.js`: active bridge from HTTP routes to the CLI.
- `backend/core/src/parser`: active CSV/OHLCV parsing helpers.
- `backend/core/src/indicators`: active technical indicator engine.
- `backend/core/src/features`: active technical and macro feature boundaries.
- `backend/core/src/ml`: active tensor builders and model boundary code.
- `backend/core/src/backtest`: active native backtest components.
- `backend/core/src/ingestion`: active native ingestion adapters and snapshot summaries.
- `backend/core/src/portfolio`: active PnL and reusable optimizer helpers.
- `backend/core/src/execution`: partially active execution interfaces and kill-switch/paper-broker compatibility wrappers.
- `backend/core/src/wealth`: compatibility wealth logic retained for reference.
- `config/markets/data_sources.yaml`: active provider and family manifest.
- `workspace/STATE.md`: current status anchor when docs drift.

## Build Targets

The root `CMakeLists.txt` delegates into `backend/core`.

The native CMake project currently defines `sovereign_wealth` plus focused test executables for data contracts, stats, risk, replay, indicators, backtests, portfolio, ingestion contracts, Kronos/CNN tensors, technical features, parser/sizing, normalization/optimizer, and macro features.

Local Windows verification may use `C:\msys64\ucrt64\bin\g++.exe` directly when `cmake` and `ctest` are unavailable on PATH. CI remains the authoritative CMake/CTest gate.

## Public API Rules

Public structs and functions used across modules should live in the owning `backend/core/src` module today unless a stable public include boundary already exists.

Implementation details belong under the module that owns them:

- asset identity should go under `backend/core/src/assets`
- data ingestion should go under `backend/core/src/ingestion`
- validated market records should go under `backend/core/src/data`
- feature engineering should go under `backend/core/src/features`
- market logic should go under market-owned modules
- future macro-specific engines should go under `backend/core/src/macro` if they outgrow `features`
- future data-quality engines should go under `backend/core/src/data_quality` if they outgrow `data`
- future quant research workflow logic should go under `backend/core/src/research`
- execution logic should go under `backend/core/src/execution`
- portfolio monitoring should go under `backend/core/src/portfolio`
- legacy wealth logic stays under `backend/core/src/wealth`

Avoid multiple headers with the same name and different definitions. One public API should have one authoritative declaration.

## Legacy Wealth Data Model

This model is retained as legacy/reference context. New trading work should not add to it unless a field is explicitly reused as a macro, sentiment, or purchasing-power input.

`SimulationParams`:

- `initInv`
- `years`
- `wage` legacy; possible macro labor-market input only in future trading work
- `wageGrow` legacy; possible wage-growth or consumer-sentiment input only in future trading work
- `ret`
- `retSd`

`MonthResult`:

- `month`
- `netWorth`
- `portfolio`

## Legacy Numerical Behavior

The legacy wealth simulator converts annual return to monthly return with:

```text
monthlyReturn = (1 + annualReturn)^(1 / 12) - 1
```

This behavior should not drive the trading-platform module design.

## Dependency Policy

Core C++ should prefer the standard library and small isolated dependencies. ONNX Runtime is already gated behind CMake integration for model boundary work.

Before adding a dependency:

- confirm the active phase needs it
- update requirements documentation
- isolate it behind a small module boundary
- add tests around behavior that depends on it

## Testing Policy

Every behavior change should have a test.

Tests must not be easy to pass.

For integration and pipeline tests, the evidence must show the actual data flow, not just a final `passed` signal. Prefer test output that makes the path visible:

- input source or fixture
- key transform or filter steps
- record counts or row counts at each stage
- rejected or skipped records, when relevant
- output artifact path and a small sample of the produced result
- the invariant that explains why the test passed

Codex and Gemini must follow the same verification standard when they write or review tests.

Legacy wealth behavior remains a compatibility concern, not the main active path. Keep its baseline stable unless the product spec changes.

Required baseline:

```text
1000M at 12% annual return for 20 years -> 9646.293093274M
```

## Deferred Engineering Notes

Later phases may introduce:

- JSON library
- SQLite
- HTTP/WebSocket client
- ONNX Runtime
- Node.js web dashboard
- Rust or expanded C++ CLI
- Docker deployment

These should not affect active build or runtime until their owning phase or module is opened.

Future module reservations:

- `backend/core/src/macro`: FX, inflation, rates, yield curves, volatility indexes, liquidity and credit stress, macro regime classification, and economy health scoring.
- `backend/core/src/data_quality`: missing data, stale data, timestamp mismatch, source freshness, and lookahead-risk checks for market and macro inputs.
- `backend/core/src/research`: research hypotheses, backtest integrity rules, cost models, validation windows, portfolio constraints, and promotion gates.

Macro and research modules are partially present as provider boundaries and helper code, but full macro-regime scoring and strategy promotion remain gated. Legacy `vndDep` currency-drag assumptions must stay separate from live FX or macro ingestion unless intentionally promoted with tests.

## Legacy Porting Rule

Sovereign Wealth math should be ported from the legacy dashboard first. Do not silently change formulas while porting. If a dashboard behavior is wrong or needs improvement, first reproduce it in a test, then document the intentional change.

