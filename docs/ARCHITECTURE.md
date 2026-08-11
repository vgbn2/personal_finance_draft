# Sovereign Architecture

Sovereign is a local-first trading research and controlled-execution platform. This page is the short architecture entrypoint; it does not duplicate module contracts or operator runbooks.

## System Shape

```text
external providers
       |
       v
providers / ingestion -> validation -> binary ts-index + metadata
                                      |
                       +--------------+---------------+
                       |                              |
                 Node CLI / API                 C++ analytics / risk
                       |                              |
                       +---------- research ----------+
                                      |
                         runtime policy + authorization
                                      |
                       paper or gated broker execution
```

## Active Domains

| Domain | Canonical source owner | Responsibility |
|---|---|---|
| CLI and terminal UI | `backend/cli/` | command dispatch, Ink dashboard, legacy TUI, operator presentation |
| Private API and web bridge | `backend/api/` | authenticated routes, capability checks, dashboard serving |
| Execution gateway | `backend/gateway/` | broker adapters, execution boundary, internal paper ledger |
| Native core | `backend/core/` | C++ analytics, data inspection, backtesting, and risk contracts |
| Shared platform | `shared/lib/` | market, strategy, runtime, auth, data, broker, settings, and UI owners |
| Frontend | `Frontend/dashboard/src/` | React dashboard source; `dist/` is generated output |
| Configuration | `config/` | markets, strategies, risk, environment, and deployment policy |
| Runtime data | `storage/data/` | local cache, time series, models, journals, and evidence artifacts |
| Infrastructure | `infra/` | Compose, host preparation, update, backup, and deployment tooling |
| Verification | `tests/`, `backend/api/tests/`, `backend/core/test/` | contract, regression, API, UI, and native tests |

## Canonical Reading Order

1. [Architecture overview](engineering/architecture_overview.md) — current runtime policy, paper ledger, execution, and deployment model.
2. [Documentation hub](README.md) — audience and task navigation.
3. [Documentation manifest](documentation_manifest.json) — which pages are canonical, supporting, stale, or historical.
4. [Module catalog](modules/README.md) and [Code Atlas](atlas/README.md) — capability ownership and deep source-linked mechanisms.
5. [Codebase organization](engineering/codebase_org.md) — retained map currently marked `needs_refresh`.

## Architecture Rules

- A domain rule has one canonical source owner; compatibility shims must remain visibly secondary.
- UI, API, CLI, MCP, and generated artifacts do not own trading, research, data-integrity, or authorization policy.
- Research-only output cannot promote or authorize execution.
- Deployment profiles control which services a machine may run; they do not grant user capabilities.
- Internal paper simulation, broker-hosted paper accounts, and live execution are distinct systems and evidence scopes.
- Data provenance, point-in-time rules, one-writer behavior, and recovery ownership are part of the architecture—not implementation trivia.
- Historical logs and graph output are evidence to mine; promoted architecture claims must be verified against current source.

## Evidence Boundary

Architecture documentation describes source ownership and intended contracts. It does not by itself prove provider acceptance, an owned-host deployment, restart, rollback, recovery, soak, paper behavior, or live execution. See [Testing surfaces](operational/guides/testing_surface.md) and the owning runbook for those evidence layers.
