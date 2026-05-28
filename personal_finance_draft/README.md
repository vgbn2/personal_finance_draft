# Sovereign Trading Platform

Sovereign is an active trading-platform prototype that has moved beyond file layout into local ingestion, validation, research/backtest commands, C++ backend inspection, and a local web/API dashboard bridge.

The earlier personal-finance/wealth work is legacy context. Treat it as done unless a variable becomes useful to trading, macro modeling, or consumer sentiment. For example, wage growth can be a macro labor-market feature, but this repository should not grow into a budgeting or salary-planning product.

## Start Here

Read the documentation in this order:

1. [Documentation Hub](docs/README.md)
2. [Quickstart Guide](docs/operational/QUICKSTART.md)
3. [Architecture Overview](docs/engineering/architecture_overview.md)
4. [Product Specification](docs/engineering/product_spec.md)
5. [Engineering Standards](docs/engineering/engineering_standards.md)
6. [Contributor Guide](docs/operational/CONTRIBUTING.md)

## Current Phase

Phase 5 automated execution and risk hardening is complete. The current state anchor points to Phase 6 preparation, with the React dashboard, Supabase-native persistence, and C++ kill-switch work already landed.

Buildable today:

- local market data ingestion and strict cache validation
- stocks, indices, FX, crypto, macro, weather, news/sentiment, and quote source boundaries
- Node CLI operations through `scripts/cli/sovereign_cli.js`
- C++ backend inspection for status, data summaries, correlations, universe, portfolio, and integrity checks
- sample features, model comparison, backtest, and optimization commands
- local web/API bridge serving the built React dashboard from `web_page/dist` through `web/app.js`
- React/Vite source work under `web_page/src` with the built artifact mirrored into the served bridge

Still planned or gated:

- promoted live broker execution
- production portfolio monitoring
- broader Phase 6 hardening, benchmarking, and safety controls
- deployment stack hardening
- unified dashboard hydration across every panel

## Quick Build

```bash
cmake -S . -B build
cmake --build build
ctest --test-dir build/cpp_core
```

Run the local CLI:

```bash
node scripts/cli/sovereign_cli.js status --json
node scripts/cli/sovereign_cli.js check --strict
```

Run the local web/API bridge:

```bash
node web/app.js
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
