# Sovereign Trading Platform - Claude Compatibility & Instructions

The tracked `skills/` tree is canonical. `.agents/skills/` is the repo-local discovery mirror and must match recursively.

1. Boot and close through `skills/session-orchestrator/SKILL.md`.
2. Route audits and reviews through `skills/blast-through/SKILL.md` with exactly one audit mode.
3. Route approved broad fixes through `skills/mass-implement/SKILL.md`.
4. Route multi-session knowledge recovery, Code Atlas work, fragmented ownership, and staged modular convergence through `skills/codebase-untangler/SKILL.md`.
5. Use `workspace/STATE.md` as the current project-direction truth.

Do not rely on historical skill names that are absent from `skills/manifest.json`. Do not treat configured MCP metadata as proof of current connectivity or authorization.

---

## 1. Stack & Runtime Truth

- **Runtime**: Pure **Node.js (v20+)** and **C++20 (CMake 3.15+)**.
- **NO Python Virtual Environments (`venv`)**: Python is not part of the runtime or testing lifecycle. Do not search for, create, or activate Python virtual environments.
- **Zero-Key Development**: No external API keys or credentials are required for local development, unit/integration testing, or backtest execution.
  - Tests run keyless against recorded fixtures (`tests/fixtures/`, `storage/data/cache/last_fetch.json`).
  - Prediction market logic uses the internal virtual paper ledger (`backend/gateway/src/paper_ledger.js`).
  - Public market data feeds (Binance, Yahoo) require no keys.
  - Real-money trading keys reside solely on the isolated production host (`hpdesk-1`).

---

## 2. Fast-Start & Build Commands

```bash
# Automated setup (copies .env, installs workspaces, builds native core, seeds fixtures, runs tests)
npm run setup:dev

# Or manual step-by-step:
cp .env.example .env
npm install
npm install --prefix backend/api
npm install --prefix backend/gateway
npm install --prefix backend/mcp_server
npm install --prefix Frontend/dashboard
npm run native:build
npm run test:prepare
```

---

## 3. Test Suites & Verification

Always verify changes using the standard test runners before submitting:

```bash
# Core suite verification (all run keyless & locally)
npm run test:data        # Ingestion, indicators, backfill regression
npm run test:structure   # Repo structural contracts, hygiene, skill integrity
npm run test:core        # Native C++ analytics & CTest suite (34/34 tests)
npm run test:api         # Backend REST/WebSocket API contracts

# Full test run
npm test

# Hygiene & documentation contracts
npm run hygiene
npm run audit:documentation
```

*Note: Tests use Node's native test runner (`tests/run_node_tests.js`). Do not use or install Jest/Mocha.*

---

## 4. Repository Ownership & Architecture

```text
external providers
       |
       v
providers / ingestion -> validation -> binary ts-index (storage/data/ts/*.bin)
                                      |
                       +--------------+---------------+
                       |                              |
                 Node CLI / API                 C++ analytics / risk (backend/core)
                       |                              |
                       +---------- research ----------+
                                      |
                         runtime policy + authorization
                                      |
                       paper or gated broker execution
```

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
| `workspace/` | Project state (`STATE.md`), handoffs, logs, and developer documentation. |
