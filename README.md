# Sovereign Trading Platform

Sovereign is a local-first trading research and controlled-execution platform. It combines a Node.js CLI/TUI and private API, a C++20 analytics and risk core, a native streaming binary time-series engine, quantitative research/backtesting workflows, simulated paper ledgers, broker gateways, and a React 19 dashboard.

The repository contains real execution adapters, but **execution availability is not permission or qualification**. Research, paper, and live paths remain strictly separated by runtime policy, authentication, explicit authorization, feature/risk gates, and isolated credentials.

---

## 1. System Architecture & Topology

```text
                               ┌─────────────────────────────────────────┐
                               │           External Market Data          │
                               │   (Binance, Yahoo, Polymarket, Alpaca)  │
                               └────────────────────┬────────────────────┘
                                                    │
                                                    ▼
                               ┌─────────────────────────────────────────┐
                               │       Ingestion & Validation Plane      │
                               │  - shared/lib/market/validation.js      │
                               │  - OHLCV bounds & timestamp ordering    │
                               └────────────────────┬────────────────────┘
                                                    │
                                                    ▼
                               ┌─────────────────────────────────────────┐
                               │     Native Streaming Binary TS Engine   │
                               │  - Packed 48-byte Float64 candle records│
                               │  - sovereign::BinaryTsMerger (C++20)    │
                               │  - O(1) memory footprint (<5MB RSS)     │
                               │  - storage/data/ts/{SYMBOL}_{TF}.bin    │
                               └───────────┬─────────────────┬───────────┘
                                           │                 │
                  ┌────────────────────────┴─┐             ┌─┴────────────────────────┐
                  │                          │             │                          │
                  ▼                          ▼             ▼                          ▼
       ┌────────────────────┐     ┌────────────────────┐ ┌────────────────────┐ ┌────────────────────┐
       │   CLI / Ink TUI    │     │   Private Express  │ │   C++20 Analytics  │ │  Strategy Engine   │
       │  backend/cli/      │     │   Bridge & REST API│ │  - Fast Backtesting │ │  - RSI / ATR / BB  │
       │  - Interactive TUI │     │  backend/api/      │ │  - Risk Validation │ │  - Regime Detect   │
       │  - Command Handlers│     │  - Capability-gated│ │  - Native CTests   │ │  - Feature Frames  │
       └──────────┬─────────┘     └──────────┬─────────┘ │  backend/core/     │ └─────────┬──────────┘
                  │                          │           └─────────┬──────────┘           │
                  │                          │                     │                      │
                  │                          ▼                     │                      │
                  │               ┌────────────────────┐           │                      │
                  │               │  React 19 Dashboard│           │                      │
                  │               │  Frontend/dashboard│           │                      │
                  │               │  Vite + Charts UI  │           │                      │
                  │               └────────────────────┘           │                      │
                  │                                                │                      │
                  └────────────────────────┬───────────────────────┴──────────────────────┘
                                           │
                                           ▼
                               ┌─────────────────────────────────────────┐
                               │   Runtime Policy & Safety Boundaries    │
                               │   - shared/lib/settings/runtime_policy  │
                               │   - Position sizing & Max drawdown gate │
                               └───────────────────┬─────────────────────┘
                                                   │
                         ┌─────────────────────────┴─────────────────────────┐
                         │                                                   │
                         ▼                                                   ▼
       ┌───────────────────────────────────┐               ┌───────────────────────────────────┐
       │     Simulated Virtual Ledger      │               │     Gated Production Gateway      │
       │   - Checksum-chained paper ledger │               │   - Alpaca, Gate.io, Polymarket   │
       │   - 100% Zero-Key, simulated cash │               │   - Strict Key & Host Isolation   │
       │   backend/gateway/src/paper_ledger│               │   - Isolated VM (hpdesk-1)        │
       └───────────────────────────────────┘               └───────────────────────────────────┘
```

---

## 2. Fast-Start for Developers & Contributors

### Stack & Zero-Key Boundary Truth
- **Runtime Stack**: Pure **Node.js (v20+)** and **C++20 (CMake 3.15+)**.
- **NO Python Virtual Environments (`venv`)**: Python is not part of the runtime or testing lifecycle.
- **Zero-Key Development**: All tests, backtests, and research workflows run **100% locally with zero external API keys** against recorded fixtures and virtual paper ledgers.

### 1-Command Automated Setup Flow

```text
                      git clone <repo>
                             │
                             ▼
                     npm run setup:dev
                             │
            ┌────────────────┼────────────────┐
            │                │                │
            ▼                ▼                ▼
     Generates safe    Installs all     Compiles C++20    Seeds Master Test
     local .env with   workspace deps   native engine     Fixture to cache
     dummy keys        (root, api, UI)  (CMake Release)   (last_fetch.json)
            │                │                │                   │
            └────────────────┼────────────────┴───────────────────┘
                             │
                             ▼
         [Pristine Local Development Environment Ready]
```

```bash
# Automated setup (does everything in one go)
npm run setup:dev
```

### Manual Step-by-Step Alternative

```bash
# 1. Clone the repository
git clone <repository-url>
cd personal_finance_draft

# 2. Copy the default environment template (contains safe local defaults & dummy keys)
cp .env.example .env

# 3. Install packages across workspaces
npm install
npm install --prefix backend/api
npm install --prefix backend/gateway
npm install --prefix backend/mcp_server
npm install --prefix Frontend/dashboard

# 4. Build the native C++ core engine & seed master test fixture
npm run native:build
npm run test:prepare

# 5. Run test verification (all pass with zero external credentials)
npm run test:data
npm run test:structure
npm run test:core
```

---

## 3. Environment & Secret Tiers

```text
┌───────────────────┬───────────────────────────────────┬────────────────────────────────────┐
│ Environment Tier  │ Access & Protection               │ Allowed Credentials / Mode         │
├───────────────────┼───────────────────────────────────┼────────────────────────────────────┤
│ `development`     │ - Local machine & Pull Requests   │ - ZERO SECRETS (100% Keyless)      │
│ (Default)         │ - All branches & contributors     │ - Recorded fixtures & mock feeds   │
├───────────────────┼───────────────────────────────────┼────────────────────────────────────┤
│ `hpdesk-paper`    │ - Staging / Paper soak            │ - Free Alpaca Paper sandbox key    │
│ (Paper Trading)   │ - Restricted to main branch       │ - Virtual Polymarket paper ledger  │
├───────────────────┼───────────────────────────────────┼────────────────────────────────────┤
│ `production`      │ - Isolated Host (`hpdesk-1`)      │ - Real-money trading keys          │
│ (Restricted)      │ - Manual review approval required │ - NEVER committed or sent to CI    │
└───────────────────┴───────────────────────────────────┴────────────────────────────────────┘
```

---

## 4. What You Can Do Immediately (Zero Keys Required)

### A. Run Quantitative Strategy Backtests
Execute local historical backtests with regime detection and feature extraction:
```bash
# Run strategy backtesting CLI
node backend/cli/sovereign_cli.js backtest --symbol BTC/USDT --timeframe 1h

# Run feature generator and data flow verification
npm run test:data
```

### B. Launch the Web Dashboard & Private API
Start the Express backend bridge and the React 19 + Vite dashboard:
```bash
# Terminal 1: Start backend API bridge
npm run api:dev

# Terminal 2: Start frontend dashboard
npm run dashboard:dev
```
Open **`http://localhost:5173`** in your browser.

### C. Launch the Interactive Terminal Cockpit (Ink TUI)
```bash
# Launch interactive TUI
node backend/cli/sovereign_cli.js

# Or inspect status directly
node backend/cli/sovereign_cli.js status --json
node backend/cli/sovereign_cli.js market monitor --limit 20 --json
```

### D. Trade on the Simulated Paper Ledger
Simulate prediction market orders and paper strategies without Polygon wallet credentials or real capital:
```bash
node backend/cli/sovereign_cli.js paper --strategy polymarket_sample
```

### E. Develop & Benchmark the Native C++20 Core
Modify C++ indicators, binary time-series stream mergers, or risk models:
```bash
# Rebuild native engine
npm run native:build

# Run all 34 CTest suites
npm run test:core
```

### F. Docker Quickstart (Zero Local Tooling)
To run the complete platform (API, Web Dashboard, and C++ Core) in isolated containers without installing local compilers:
```bash
docker compose -f infra/docker/docker-compose.yml up -d --build
```

---

## 5. Market Data & Strategy Pipeline

```text
Raw Market Feed (Binance / Yahoo / Polymarket)
                     │
                     ▼
        [Data Ingestion & Validation]
  (Checks timestamps, monotonic ordering, OHLCV bounds)
                     │
                     ▼
        [Native Binary TS Stream Merger]
  (Two-pointer sorted merge, 48-byte records, 64KB chunk buffer)
                     │
                     ▼
     storage/data/ts/{SYMBOL}_{TF}.bin
                     │
                     ▼
        [Feature & Indicator Pipeline]
  (RSI, ATR, Bollinger Bands, Macro Features, Regimes)
                     │
                     ▼
        [C++20 Analytics & Backtester]
  (Risk simulation, cost models, Bayesian posterior analysis)
                     │
                     ▼
        [Visual Cockpit / Web Dashboard]
  (PnL curves, Sharpe ratio, max drawdown, live metrics)
```

---

## 6. Repository Layout & Ownership

| Path | Purpose & Ownership |
|---|---|
| `backend/core/` | C++20 analytics engine, risk checks, binary TS merger, CTest suite. |
| `backend/cli/` | Sovereign CLI entrypoints, Ink TUI, and command handlers. |
| `backend/api/` | Private Express API, route access control, and web dashboard bridge. |
| `backend/gateway/` | Broker gateways (Alpaca, Polymarket, Gate.io) & checksummed paper ledger. |
| `shared/lib/` | Shared domain logic: market storage, indicators, strategy runtime, risk models. |
| `Frontend/dashboard/` | React 19 + Vite dashboard (source in `src/`, `dist/` is generated). |
| `config/` | System environment manifest, asset mappings, risk policies. |
| `storage/data/` | Runtime disk storage: binary TS indices (`ts/`), JSON caches (`cache/`), paper trading state. |
| `tests/` | Node.js integration, architecture contract, and safety test suites. |
| `docs/` | Canonical documentation hub, Code Atlas, and operational runbooks. |
| `workspace/` | Project state (`STATE.md`), handoffs, logs, and developer documentation. |

---

## 7. Canonical Skill Protocols for Development & Review

All development, testing, and pull request reviews follow the repository's canonical skill protocols in `skills/manifest.json`:

| Lifecycle Phase | Protocol / Command | Enforced Gate |
|---|---|---|
| **Authoring & Refactoring** | `skills/mass-implement` | Bounded scope, zero-key development preservation. |
| **Test Integrity Audit** | `skills/verify-test-integrity` | Anti-cheating scan, no Release-elided `assert()` calls. |
| **Native Core Verification** | `skills/native-core-verify` | 34/34 CTests pass with sanitizer validation (`npm run test:core`). |
| **Hygiene & Documentation** | `skills/repo-hygiene`<br>`skills/audit-documentation` | `npm run hygiene` (0 noise) + `npm run audit:documentation` (100% manifest match). |
| **PR Review & Audit** | `skills/blast-through` | Single-mode audit (`review`, `security`) with 6-tuple fault attribution. |
| **Failure Triage** | `skills/bayesian-troubleshooter` | Hypothesis ranking and binary probe debugging. |
| **Architecture & Atlas Sync**| `skills/codebase-untangler` | Syncs Code Atlas records in `docs/atlas/`. |

---

## 8. Capability Status

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

---

## 9. Choose Your Path

- **Operator:** [Quickstart](docs/operational/guides/QUICKSTART.md) → [CLI guide](docs/operational/guides/cli_quick_guide.md) → [Operations](docs/operational/guides/operations.md)
- **Contributor:** [Contributing](docs/operational/guides/CONTRIBUTING.md) → [GitHub rulesets](docs/operational/guides/github_environment_and_rulesets.md) → [Architecture](docs/engineering/architecture_overview.md) → [Documentation standard](docs/engineering/documentation_standard.md)
- **Maintainer:** [Maintainer roster](workspace/MAINTAINERS.md) → [Governance](workspace/GOVERNANCE.md) → [Security policy](workspace/SECURITY.md) → [Module catalog](docs/modules/README.md)
- **Quantitative researcher:** [Research overview](docs/research/quant_research.md) → [codebase tour](docs/codebase_tour/00_START_HERE.md)
- **API or frontend developer:** [Web/API reference](docs/engineering/web_api.md) *(currently marked for refresh in the documentation manifest)*
- **Deployment maintainer:** [Role-based hosting](docs/operational/guides/role_based_hosting.md) → [Deployment](docs/operational/guides/DEPLOYMENT.md)
- **Module maintainer:** [Module catalog](docs/modules/README.md) → [Code Atlas](docs/atlas/README.md) → [documentation standard](docs/engineering/documentation_standard.md).

---

## 10. Testing & Verification

```bash
# Run core verification gates
npm run test:data        # Ingestion, indicators, backfill regression
npm run test:structure   # Repo structural contracts, hygiene, skill integrity
npm run test:core        # Native C++ analytics & CTest suite (34/34 tests)
npm run test:api         # Backend REST/WebSocket API contracts

# Full test suite
npm test

# Hygiene & documentation contracts
npm run hygiene
npm run audit:documentation
```

*Note: Tests use Node's native test runner (`tests/run_node_tests.js`). Do not use or install Jest/Mocha.*

---

## 11. Safety Boundary

Do not infer trading permission from the presence of an adapter, credential variable, menu item, test, paper account, or prior session record. Live-capital actions require explicit authorization and current operator review of runtime policy, kill switch, risk limits, credentials, account scope, and provider behavior. Nothing in this README authorizes an order, provider mutation, canonical-data write, host change, or deployment.
