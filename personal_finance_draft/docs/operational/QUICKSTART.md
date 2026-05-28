# Quickstart

This guide orients a new contributor to the current local Sovereign trading-platform prototype.

The repository now has active local ingestion, validation, research/backtest commands, C++ backend inspection, and a Node web/API bridge. The older wealth executable remains compatibility context, not the active product direction.

## Prerequisites

Required:

- C++20 compiler
- CMake 3.10 or newer
- a CMake-supported build backend such as Make, Ninja, MSBuild, or MinGW Makefiles
- Node.js 20 or newer for CLI, ingestion, and local web/API checks

Currently not required for the local prototype:

- Rust crates
- SQLite
- broker credentials
- Docker
- production deployment credentials

Optional or gated:

- ONNX Runtime for promoted Kronos/model integration work
- external API credentials for richer live provider coverage

## Build

From the repository root:

```bash
cmake -S . -B build
cmake --build build
ctest --test-dir build/cpp_core
```

On Windows PowerShell, the same commands apply:

```powershell
cmake -S . -B build
cmake --build build
ctest --test-dir build/cpp_core
```

If CMake is not installed, install it before treating the C++ backend as fully verified.

## CLI Health Checks

Run the active CLI entrypoint from the repository root:

```bash
node scripts/cli/sovereign_cli.js status --json
node scripts/cli/sovereign_cli.js check --strict
node scripts/cli/sovereign_cli.js backend integrity --json
node scripts/cli/sovereign_cli.js quotes status --json
```

Useful research commands:

```bash
node scripts/cli/sovereign_cli.js demo
node scripts/cli/sovereign_cli.js models --sample --json
node scripts/cli/sovereign_cli.js bt --sample
node scripts/cli/sovereign_cli.js optimize --sample
```

`models` compares a registry of deterministic model adapters across baseline, tree, boosting, linear, probabilistic, instance-based, and neural families. Treat these as reproducible candidate scorers for backtest selection; trained artifacts such as real XGBoost, random-forest, or neural models should plug into the same registry names once promoted.

## Local Web/API Bridge

Run:

```bash
node web/app.js
```

Open:

```text
http://127.0.0.1:8787
```

Useful inspection endpoints:

```text
http://127.0.0.1:8787/health
http://127.0.0.1:8787/api/system/status
http://127.0.0.1:8787/api/data/summary?symbol=AAPL&timeframe=1d&max_bars=5
http://127.0.0.1:8787/api/quotes/status
```

`/api/system/status` can be `ok: true` and `degraded: true` at the same time. That means the core CLI/backend path is usable while one component, commonly quote freshness/configuration, still needs attention.

## Native Backend Smoke Checks

After a CMake build, use the active backend through the CLI or through focused CTest targets. The older wealth executable may still exist in older build folders, but it is compatibility context rather than the main product path.

Preferred checks:

```bash
node scripts/cli/sovereign_cli.js backend data summary --symbol AAPL --timeframe 1d --json
node scripts/cli/sovereign_cli.js backend correlation --symbols AAPL,MSFT,SPX --timeframe 1d --json
node scripts/cli/sovereign_cli.js backend universe --json
```

Windows PowerShell uses the same Node commands:

```powershell
node scripts\cli\sovereign_cli.js backend data summary --symbol AAPL --timeframe 1d --json
node scripts\cli\sovereign_cli.js backend correlation --symbols AAPL,MSFT,SPX --timeframe 1d --json
node scripts\cli\sovereign_cli.js backend universe --json
```

## Where To Start Coding

For current implementation work:

- current state anchor: `workspace/STATE.md`
- active CLI: `scripts/cli/sovereign_cli.js`
- ingestion and provider routing: `scripts/data_ops/ingest_market_data.js`, `scripts/lib/providers/`
- validation: `scripts/lib/market_validation.js`
- web/API bridge: `web/app.js`, `web/server/services/cli_executor.js`
- Kronos pipeline: `docs/kronos_pipeline.md`, `cpp_core/src/ml/`
- core C++ folders: `cpp_core/src/assets`, `cpp_core/src/data`, `cpp_core/src/ingestion`, `cpp_core/src/features`, `cpp_core/src/ml`, `cpp_core/src/research`, `cpp_core/src/risk`, `cpp_core/src/execution`, `cpp_core/src/portfolio`

Do not add live broker execution or production portfolio-monitoring side effects until the corresponding phase is explicitly opened.
