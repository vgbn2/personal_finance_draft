# CLI Core

This directory holds the local Rust CLI core that mirrors the repo's command,
broker, portfolio, and backtest contracts.

Key modules:
- `src/commands` for command summaries and command-level helpers
- `src/broker_api` for Gate.io, MT5, and routed-order contracts
- `src/backtest_queue` for job queue and worker helpers
- `tests/` for bridge and integration coverage

Operational note:
- The Node CLI in `backend/cli/sovereign_cli.js` remains the active runtime
surface.
- This Rust crate exists for local CLI-core parity, contract tests, and future
bridge work.
