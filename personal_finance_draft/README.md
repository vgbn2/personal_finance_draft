# Sovereign Trading Platform

Sovereign is an active trading-platform prototype that has moved beyond file layout into local ingestion, validation, research/backtest commands, C++ backend inspection, and a local web/API dashboard bridge.

The earlier personal-finance/wealth work is legacy context. Treat it as done unless a variable becomes useful to trading, macro modeling, or consumer sentiment. For example, wage growth can be a macro labor-market feature, but this repository should not grow into a budgeting or salary-planning product.

## Start Here

Read the documentation in this order:

1. [Documentation Hub](docs/README.md)
2. [Quickstart Guide](docs/operational/QUICKSTART.md)
3. [Architecture Overview](docs/engineering/architecture_overview.md)
4. [Codebase Organization Map](docs/engineering/codebase_org.md)
5. [Product Specification](docs/engineering/product_spec.md)
6. [Engineering Standards](docs/engineering/engineering_standards.md)
7. [Contributor Guide](docs/operational/CONTRIBUTING.md)

## Current Phase

Phase 8 production hardening and feature polish is complete. `workspace/STATE.md` is the current status anchor when older docs or fixtures drift.

Buildable today:

- local market data ingestion and strict cache validation
- stocks, indices, FX, crypto, macro, weather, news/sentiment, and quote source boundaries
- Node CLI operations through `backend/cli/sovereign_cli.js`
- C++ backend inspection for status, data summaries, correlations, universe, portfolio, and integrity checks
- sample features, model comparison, backtest, and optimization commands
- local web/API bridge serving the built React dashboard from `Frontend/dashboard/dist` through `backend/api/app.js`
- React/Vite source work under `Frontend/dashboard/src`

Still planned or gated:

- promoted live broker execution
- production portfolio monitoring
- broader Phase 6 hardening, benchmarking, and safety controls
- deployment stack hardening
- unified dashboard hydration across every panel

## Quick Build

```bash
npm install
npm link
cmake -S . -B build
cmake --build build
ctest --test-dir build/backend/core
```

Run the local CLI:

```bash
node backend/cli/sovereign_cli.js status --json
node backend/cli/sovereign_cli.js check --strict
sovereign setup
sovereign doctor --json
```

Run the local web/API bridge:

```bash
node backend/api/app.js
```

Then open `http://127.0.0.1:8787` or inspect `http://127.0.0.1:8787/api/system/status`.

## Documentation

The `docs/` folder is the main contributor documentation set. `workspace/STATE.md` remains the current status anchor when older docs drift.

## Workspace State

These workspace files track active development and session memory:

- [workspace/STATE.md](workspace/STATE.md)
- [workspace/HANDOFF.md](workspace/HANDOFF.md)
- [workspace/NEXT_SESSION_GOAL.md](workspace/NEXT_SESSION_GOAL.md)
- [docs/memory/BLAST_THROUGH_REPORT.md](docs/memory/BLAST_THROUGH_REPORT.md)

Keep them in sync with the code and `docs/` when the repo changes.
