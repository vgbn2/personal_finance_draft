# Sovereign Trading Platform

Sovereign is a local-first trading research and controlled-execution platform. It combines a Node.js CLI/TUI and private API, a C++ analytics and risk core, binary market-data storage, research/backtesting workflows, broker gateways, and a React dashboard.

The repository contains real execution adapters, but **execution availability is not permission or qualification**. Research, paper, and live paths remain separated by runtime policy, authentication, explicit authorization, feature/risk gates, and operator-controlled credentials.

## Capability Status

| Label | Meaning |
|---|---|
| **Implemented** | Production-reachable source exists and the named source/test contract is current. |
| **Research-only** | Output is non-promotional and cannot authorize execution. |
| **Gated** | Source exists but requires explicit runtime, authorization, credential, feature, and risk conditions. |
| **Not qualified** | Provider, host, deployment, restart, recovery, soak, paper, or live evidence has not been established for the claim. |

| Area | Status | Current boundary |
|---|---|---|
| Market-data ingestion and binary ts-index | Implemented | Provider availability, freshness, provenance, and one-writer operation remain explicit gates. |
| Indicators, backtests, correlation, and native analytics | Implemented | Results are research evidence, not automatic strategy promotion. |
| Global parameter sweep | Research-only | Validation/holdout isolation exists, but cross-dataset ranking comparability has an open review blocker. |
| CLI, Ink TUI, private API, and React dashboard | Implemented | API access is capability-gated; built frontend output must match source. |
| Internal Polymarket paper ledger | Implemented | Virtual ledger authority is separate from broker-hosted paper accounts and live execution. |
| Alpaca, Polymarket, Gate.io, and MT5 adapters | Gated | Live use requires the complete runtime-policy and risk boundary; this README does not claim live qualification. |
| Private-host deployment and recovery | Not qualified | Source/runbooks exist; exact host, restart, rollback, recovery, one-writer, and soak evidence are separate. |

## Quick Start

Prerequisites: Node.js and npm. The repository has multiple package roots. These installation commands modify local dependency directories but do not contact trading providers or start platform services.

```bash
npm install
npm install --prefix backend/api
npm install --prefix backend/gateway
npm install --prefix backend/mcp_server
npm install --prefix Frontend/dashboard
```

After installation, inspect local status without placing orders or starting a persistent writer:

```bash
node backend/cli/sovereign_cli.js status --json
node backend/cli/sovereign_cli.js backend status --json
node backend/cli/sovereign_cli.js market monitor --limit 20 --json
```

Launch the terminal dashboard:

```bash
node backend/cli/sovereign_cli.js
```

Build the optional C++ core:

```bash
npm run native:build
ctest --test-dir backend/core/build --output-on-failure
```

For environment setup, platform-specific prerequisites, and expected output, use the [Quickstart guide](docs/operational/guides/QUICKSTART.md). Do not begin with deployment, provider polling, data backfills, persistent bots, or trade commands unless you have read the owning runbook and safety boundary.

## Architecture At A Glance

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

| Path | Ownership |
|---|---|
| `backend/cli/` | CLI dispatch, Ink dashboard, and legacy TUI |
| `backend/api/` | Private HTTP API, access control, and served dashboard bridge |
| `backend/gateway/` | Broker adapters, execution boundary, and paper ledger |
| `backend/core/` | C++ analytics, data inspection, backtesting, and risk contracts |
| `shared/lib/` | Shared market, strategy, runtime, auth, data, and UI owners |
| `Frontend/dashboard/` | React/Vite dashboard source; `dist/` is generated |
| `config/` | Market, strategy, risk, environment, and deployment policy |
| `storage/data/` | Local runtime data plane; most contents are generated or ignored |
| `infra/` | Compose, host preparation, update, backup, and deployment tooling |

Start with the short [architecture entrypoint](docs/ARCHITECTURE.md), then use the [documentation hub](docs/README.md) for module and operator material.

## Choose Your Path

- **Operator:** [Quickstart](docs/operational/guides/QUICKSTART.md) → [CLI guide](docs/operational/guides/cli_quick_guide.md) → [Operations](docs/operational/guides/operations.md)
- **Contributor:** [Contributing](CONTRIBUTING.md) → [Governance](GOVERNANCE.md) → [Architecture](docs/engineering/architecture_overview.md) → [Documentation standard](docs/engineering/documentation_standard.md)
- **Maintainer:** [Maintainer roster](MAINTAINERS.md) → [Governance](GOVERNANCE.md) → [Security policy](SECURITY.md) → [Module catalog](docs/modules/README.md)
- **Quantitative researcher:** [Research overview](docs/research/quant_research.md) → [codebase tour](docs/codebase_tour/00_START_HERE.md)
- **API or frontend developer:** [Web/API reference](docs/engineering/web_api.md) *(currently marked for refresh in the documentation manifest)*
- **Deployment maintainer:** [Role-based hosting](docs/operational/guides/role_based_hosting.md) → [Deployment](docs/operational/guides/DEPLOYMENT.md)
- **Module maintainer:** [Module catalog](docs/modules/README.md) → [Code Atlas](docs/atlas/README.md) → [documentation standard](docs/engineering/documentation_standard.md).

## Testing And Evidence

```bash
npm test
npm run test:api
npm run test:structure
npm run hygiene
```

See [Testing surfaces](docs/operational/guides/testing_surface.md) for focused gates and evidence modes. Tests use Node's test runner through `tests/run_node_tests.js`; do not substitute Jest.

Evidence scopes are deliberately distinct:

- source inspection and focused tests;
- aggregate tests;
- working-tree snapshot or committed-archive proof;
- authenticated CI;
- provider acceptance;
- owned-host deployment, restart, rollback, recovery, and soak;
- paper and live execution.

A passing source test does not prove the later scopes.

## Documentation And Historical Evidence

The [documentation manifest](docs/documentation_manifest.json) classifies canonical, supporting, stale, and historical material. Historical logs, handoffs, reviews, plans, and graph reports are retained and scraped for durable knowledge, but facts are promoted into canonical docs only after current-source verification.

- Current documentation: [docs/README.md](docs/README.md)
- Documentation standard: [docs/engineering/documentation_standard.md](docs/engineering/documentation_standard.md)
- Historical knowledge promotion ledger: [workspace/reports/DOCUMENTATION_KNOWLEDGE_INVENTORY.md](workspace/reports/DOCUMENTATION_KNOWLEDGE_INVENTORY.md)
- Session and review history: [`workspace/`](workspace/) — secondary evidence, not normal architecture navigation

## Safety Boundary

Do not infer trading permission from the presence of an adapter, credential variable, menu item, test, paper account, or prior session record. Live-capital actions require explicit authorization and current operator review of runtime policy, kill switch, risk limits, credentials, account scope, and provider behavior. Nothing in this README authorizes an order, provider mutation, canonical-data write, host change, or deployment.
