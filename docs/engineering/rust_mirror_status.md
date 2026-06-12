# Rust Mirror Status

Generated: 2026-06-01

## Purpose

The active CLI is the Node.js surface in `backend/cli/sovereign_cli.js`. The Rust tree in `backend/cli/src/` is a scaffold and should mirror the JavaScript command contracts only after the JS behavior is stable and contract-tested.

## Command Map

| JS command | JS owner | Rust counterpart | Status | Primary data structures to mirror |
| --- | --- | --- | --- | --- |
| `status` | `commands/status.js` | Missing | Needs Rust module | system status payload, phase label, quote provider state, cache/data-quality summary |
| `cockpit` | `commands/status.js` | Missing | Needs Rust module | cockpit model, provider header state, runtime surface rows |
| `watch` | `commands/data.js` | `data.rs` | Partial placeholder | market config families, quote provider snapshots, polling interval |
| `ingest` | `commands/data.js` | `data.rs` | Partial placeholder | ingest market data request, provider checks, snapshot writes |
| `backfill` | `commands/data.js` | `data.rs` | Partial placeholder | historical candles, backfill windows, provider errors, family/timeframe routing |
| `cache-clean` / `clean` | `commands/data.js` | Missing | Needs Rust module | cache paths, stale-file policy |
| `validate` / `check` | `commands/data.js` | `data.rs` | Partial placeholder | `validateSnapshot` report, usable sources, rejected records, provider errors |
| `backend` | `commands/backend.js` | Missing | Needs Rust module | backend integrity report, availability matrix, stale window summary |
| `quotes` | `commands/quotes.js` | Missing | Needs Rust module | quote provider status, MT5/Webull paths, dedupe policy |
| `strategy` | `commands/strategy.js` | `strategies.rs` | Partial placeholder | strategy YAML registry, `family/lane/role`, grade index, selector grouping |
| `backtest` / `bt` | `commands/research.js` | `backtest.rs` | Partial placeholder | feature frame, backtest metrics, stress test, trust assessment, strategy grade record |
| `indicators` / `features` | `commands/research.js` | `analytics.rs` or missing | Needs explicit Rust owner | rolling feature frame, indicator periods, feature counts |
| `models` | `commands/research.js` | `retrain.rs` or missing | Needs explicit Rust owner | model comparison report, candidate families, promotion gates |
| `optimize` | `commands/research.js` | `optimize.rs` | Partial placeholder | optimization grid, train/test metrics, overfit warning, indicator flags |
| `trade` | `commands/trade.js` | `execute.rs`, `paper_trade.rs`, `broker_api` modules | Partial placeholder | trade intent, dry-run gateway, broker adapters, risk gate result |
| `prune` / `db-prune` | `commands/data.js` | Missing | Needs Rust module | retention policy, removed records, snapshot compaction |
| `demo` | `commands/research.js` | Missing | Needs Rust wrapper | indicators + models + backtest + optimize chained outputs |
| `loc` | `commands/data.js` | Missing | Needs Rust module | file counts, line counts, repo path summary |
| `universe` | `commands/data.js` | Missing | Needs Rust module | market universe entries, family/category tags, max entry limit |

## Translation Pattern

1. Treat the JavaScript JSON payload as the compatibility contract before porting a command.
2. Mirror shared data shapes first: `Snapshot`, `ValidationReport`, `FeatureFrame`, `BacktestReport`, `StrategyMeta`, `StrategyGradeRecord`, `QuoteProviderStatus`, and `TradeIntent`.
3. Keep command aliases identical to `sovereign_cli.js` so shell scripts and MCP tools do not fork behavior.
4. Port one command family at a time: data quality, strategy registry, backtest/research, quotes, trade execution, then dashboard/status helpers.
5. Every Rust command should have a fixture-backed parity test against the JS command before it replaces the active JS route.

## Current Recommendation

The Rust CLI now mirrors the current JS command surface and help topics at the contract level. The next step is to keep the Rust surface aligned whenever the JS CLI changes, and to port execution logic command-by-command only when the Rust toolchain and parity tests are available in this environment.
