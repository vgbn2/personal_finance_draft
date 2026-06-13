# Cloud Compute vs Local Execution

## Cloud Compute

Use shared cloud for:

- market scanning
- backtests
- paper trading
- signal generation
- proposed-order generation

Cloud compute must not hold live broker secrets by default.

## Local / Private Runner

Use `local-private` or `private-runner` for:

- live broker execution
- broker signing
- credential derivation
- local `.env` / secret-store access

## Guardrails

- `trade --live` blocks in `cloud-compute` mode.
- `bot --live` blocks in `cloud-compute` mode.
- `polymarket ... --live` blocks in `cloud-compute` mode.
- Paper-trading flows may run in cloud, but they never submit real orders.
