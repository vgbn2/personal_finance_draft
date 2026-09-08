# 01. Sovereign System Architecture & Codebase Organization

This document establishes the canonical top-level architecture, subsystem boundaries, directory taxonomy, and fundamental runtime invariants for the Sovereign Trading Platform (SV Console).

---

## 1. Master System Topology

Sovereign is engineered as a high-performance, local-first quantitative research, backtesting, and automated execution engine. It decouples high-throughput C++20 data processing and pre-trade risk evaluation from Node.js runtime orchestration and Model Context Protocol (MCP) AI agent workbenches.

```text
+--------------------------------------------------------------------------------------------------------------------+
|                                    SOVEREIGN CONSOLE MASTER ARCHITECTURE TOPOLOGY                                  |
+--------------------------------------------------------------------------------------------------------------------+
|                                                                                                                    |
|  [ 1. PRESENTATION & INTEGRATION LAYER ]                                                                           |
|  ┌───────────────────────────────┬───────────────────────────────┬─────────────────────────────┐                  |
|  │ Sovereign CLI & Ink TUI       │ React 19 + Vite Dashboard     │ Model Context Protocol (MCP)│                  |
|  │ `backend/cli/sovereign_cli.js`│ `Frontend/dashboard/src/`     │ `backend/mcp_server/`       │                  |
|  │ Zero-allocation CLI commands  │ Real-time WebSocket bridge    │ AI Autonomous Workbench     │                  |
|  └───────────────────────────────┴───────────────────────────────┴─────────────────────────────┘                  |
|                                                  │                                                                 |
|                                                  ▼                                                                 |
|  [ 2. APPLICATION & ROUTING LAYER ]                                                                                |
|  ┌───────────────────────────────────────────────────────────────┬─────────────────────────────┐                  |
|  │ Authenticated Express API (`backend/api/`)                    │ Execution Policy Router     │                  |
|  │ Token validation, rate limiters, WebSocket broadcaster        │ `shared/lib/settings/`      │                  |
|  └───────────────────────────────────────────────────────────────┴─────────────────────────────┘                  |
|                                                  │                                                                 |
|                                                  ▼                                                                 |
|  [ 3. QUANTITATIVE DISCOVERY & RUNTIME EXECUTION ]                                                                 |
|  ┌───────────────────────────────┬───────────────────────────────┬─────────────────────────────┐                  |
|  │ Autonomous Strategy Discovery │ Virtual Sub-Positions Ledger  │ Indicator & Feature Engine  │                  |
|  │ `scripts/strategies/`         │ `shared/lib/runtime/`         │ `shared/lib/market/`        │                  |
|  │ 6D Novelty Hamming Filter     │ Deterministic Order Signatures│ Rolling RSI, MACD, ATR, SVM │                  |
|  └───────────────────────────────┴───────────────────────────────┴─────────────────────────────┘                  |
|                                                  │                                                                 |
|                                                  ▼                                                                 |
|  [ 4. NATIVE C++20 SOVEREIGN CORE (`backend/core/`) ]                                                              |
|  ┌───────────────────────────────┬───────────────────────────────┬─────────────────────────────┐                  |
|  │ Streaming Binary TS Merger    │ FrameBacktester Engine        │ PreTradeRisk & Drawdown     │                  |
|  │ Two-pointer zero-allocation   │ Mode A Native / Mode B Frame  │ Microsecond circuit breaker │                  |
|  │ $O(1)$ memory (<5MB RSS)      │ Monte Carlo bootstrap PRNG    │ Drawdown limit & fat-finger │                  |
|  └───────────────────────────────┴───────────────────────────────┴─────────────────────────────┘                  |
|                                                  │                                                                 |
|                                                  ▼                                                                 |
|  [ 5. LOCAL STORAGE ENGINE (`storage/data/`) ]                                                                     |
|  ┌───────────────────────────────┬───────────────────────────────┬─────────────────────────────┐                  |
|  │ Binary TS Storage (`ts/*.bin`)│ Append-Only Paper Ledger JSONL│ Persistent Parameter Caches │                  |
|  │ SOVT 48-byte packed format    │ Virtual Polymarket simulation │ `strategy_explorer_state`   │                  |
|  └───────────────────────────────┴───────────────────────────────┴─────────────────────────────┘                  |
|                                                  │                                                                 |
|                                                  ▼                                                                 |
|  [ 6. BROKER GATEWAYS & OPERATIONAL INFRASTRUCTURE ]                                                               |
|  ┌───────────────────────────────┬───────────────────────────────┬─────────────────────────────┐                  |
|  │ Alpaca Paper / Live Broker    │ Polymarket CLOB Gateway       │ Docker Compose Stack        │                  |
|  │ Fractional step sizing clamp  │ 1s / tick orderbook streams   │ HPDesk Proxmox VM Soak Mesh │                  |
|  └───────────────────────────────┴───────────────────────────────┴─────────────────────────────┘                  |
+--------------------------------------------------------------------------------------------------------------------+
```

---

## 2. Directory Taxonomy & Domain Ownership

The repository enforces strict module separation and unidirectional dependency flow:

```text
personal_finance_draft/
├── backend/
│   ├── api/                 # Private authenticated Express REST API & WebSocket bridge
│   ├── cli/                 # Sovereign CLI entrypoints, Ink TUI, and command handlers
│   │   ├── commands/        # Domain subcommands (strategy, data, backtest, broker)
│   │   └── tui/             # Terminal User Interface manifests & views
│   ├── core/                # C++20 Sovereign Core native analytics & risk library
│   │   ├── src/             # Source: binary TS merger, backtester, Monte Carlo, risk
│   │   └── tests/           # 34 CTest verification suites
│   ├── gateway/             # Broker adapters (Alpaca, Polymarket, Gate.io) & paper ledger
│   └── mcp_server/          # Model Context Protocol (MCP) server for AI agent integration
├── config/                  # System environment manifests, risk policies, strategies
│   ├── strategies/          # Canonical YAML strategy registries (`auto_*.yaml`)
│   └── system/              # `environment_manifest.json` (strict variable whitelisting)
├── docs/                    # Master documentation corpus (Schema: `sovereign.documentation_manifest/v1`)
│   └── engineering/         # Modular 7-section canonical engineering specifications
├── Frontend/
│   └── dashboard/           # React 19 + Vite dashboard (source in `src/`, `dist/` generated)
├── infra/
│   └── docker/              # Multi-service `docker-compose.yml` for HPDesk Proxmox VM
├── scripts/
│   ├── dev/                 # Hygiene checks, documentation auditors, test runners
│   └── strategies/          # `auto_strategy_explorer.js` (autonomous 30-min discovery daemon)
├── shared/
│   └── lib/                 # Shared TypeScript/JavaScript domain logic
│       ├── brokers/         # Broker environment wrappers & tradability checks
│       ├── market/          # Binary TS storage, quote router, rolling indicators
│       ├── runtime/         # Virtual sub-positions ledger & deterministic signatures
│       └── settings/        # Deployment profiles & fail-closed runtime policy
├── storage/                 # Local data directory (excluded from git tracking)
│   └── data/
│       ├── cache/           # Provider HTTP response caches & temporary buffers
│       ├── runtime/         # Active sub-positions virtual ledger (`sub_positions.json`)
│       └── ts/              # High-density binary time-series files (`*.bin`)
├── tests/                   # Native Node.js test suites (`run_node_tests.js`)
└── workspace/               # Project state tracking (`STATE.md`, `HANDOFF.md`, logs)
```

### Module Boundary Invariants
1. **Frontend $\to$ Backend Isolation**: The React dashboard communicates strictly over HTTP/WebSocket via `backend/api/`. It possesses zero direct filesystem or native C++ access.
2. **C++ Native Independence**: `backend/core/` compiles as an independent static library `sovereign_core_lib` and CLI binary `sovereign_wealth`. It has zero Node.js dependencies.
3. **Storage Gatekeeping**: All binary TS writes must flow through `shared/lib/market/ts_index_storage.js` with mandatory lock acquisition (`withFileLockSync`).

---

## 3. Subsystem Interaction & Dependency Direction

```text
[External Providers] (Binance, Yahoo, Polymarket)
         │
         ▼
[Ingestion & Normalization] (shared/lib/market/)
         │
         ▼
[Binary TS Storage (*.bin)] ◄──────► [C++20 Binary TS Merger] (Zero-alloc $O(1)$)
         │
         ├─────────────────────────────────────────┐
         ▼                                         ▼
[AI Strategy Explorer] (scripts/)       [Live Trading Bot] (sv-bot-alpaca-paper)
         │                                         │
         ▼                                         ▼
[C++20 FrameBacktester]                 [C++20 PreTradeRisk Gate] (<15μs)
         │                                         │
         ▼                                         ▼
[Canonical YAML Registry]               [Virtual Sub-Positions Ledger]
(`config/strategies/*.yaml`)            (`storage/data/runtime/sub_positions.json`)
                                                   │
                                                   ▼
                                        [Broker Execution Gateway]
                                        (Alpaca / Polymarket with fractional step clamp)
```

---

## 4. Fundamental Architectural Invariants

### 1. Single-Writer Authority
Only the node designated with `SOVEREIGN_DEPLOYMENT_PROFILE=central-host` has authority to write to disk (`canonical_writer: true`). Read-only replica nodes and UI clients fail closed upon write attempts.

### 2. Zero-Key Local Development
The repository operates locally without external API keys or cloud services:
- Unit, safety, and integration tests execute against recorded fixtures (`tests/fixtures/`).
- Market data ingestion uses public endpoints (Binance, Yahoo) or mock generators.
- Prediction market execution uses the internal virtual paper ledger (`backend/gateway/src/paper_ledger.js`).
- Real-money API credentials exist solely on the isolated production host (`hpdesk-1`).

### 3. Fail-Closed Execution Policy
Live trading execution is blocked by default. Promotion to real execution requires three explicit gates:
1. `SOVEREIGN_EXECUTION_AUTHORIZED=true` in environment.
2. Operator PIN authentication.
3. Real-time C++ `PreTradeRisk` clearance (drawdown $< \text{max\_drawdown}$, concentration $< 25\%$, quantity step alignment).

### 4. Virtual Sub-Position Isolation
Automated trading strategies cannot mutate, close, or liquidate shares belonging to other strategies or manual operator positions (`[MANUAL]`). Position attribution is enforced by immutable client order signatures.

---

## 5. Master Subsystem Load Indices & Performance Matrix

| Subsystem Component | CPU Utilization | Memory / RSS | Latency / SLA | Disk / Network I/O | Complexity |
|---|---|---|---|---|---|
| **`BinaryTsMerger` (C++20)** | Single Core (0.1–0.3 CPU) | **`< 5.0 MB` RSS** ($O(1)$ 48KB buffer) | $1.2\text{M records/sec}$ throughput | $57.6\text{ MB/s}$ sequential I/O | $O(A + B)$ time, $O(1)$ space |
| **`BinaryTsReader` (C++20)** | Single Core (<0.1 CPU) | `< 2.0 MB` RSS | `< 0.5 ms` for 5,000 bars | Direct zero-copy file stream | $O(N)$ sequential |
| **`FrameBacktester::runNative`** | Single Core (0.8–1.0 CPU) | `< 12.0 MB` RSS | `< 1.8 ms` for 10,000 bars | $0\text{ B}$ disk I/O (in-memory span) | $O(N)$ linear pass |
| **`FrameBacktester::runFromAnnotated`**| Single Core (0.4–0.7 CPU) | `< 18.0 MB` RSS | $12–25\text{ ms}$ per fold | Read-only JSON frame parse | $O(N)$ linear pass |
| **Monte Carlo (1,000 resamples)** | Multi-thread / AVX2 | `< 8.0 MB` RSS | `< 4.5 ms` total execution | In-memory `xorshift64` PRNG | $O(\text{runs} \times N)$ |
| **`PreTradeRisk` Gate Verification** | < 0.01 CPU | `< 1.0 MB` RSS | **`< 15 μs`** per order | Zero disk / network I/O | $O(1)$ constant |
| **6D Novelty Distance & Hash** | < 0.05 CPU | `< 2.0 MB` heap | `< 0.2 ms` calculation | Read-only state file parse | $O(D \times K)$ |
| **Market Bar Sourcing (5k bars)** | 0.2–0.5 CPU | $25–45\text{ MB}$ heap | $250–600\text{ ms}$ (remote API) | $180\text{ KB}$ network JSON | $O(N)$ network I/O |
| **Rolling Feature Frame Builder** | 0.8–1.0 CPU | $65–110\text{ MB}$ heap | $45–80\text{ ms}$ (5k bars × 8 inds)| Zero I/O (pure JS compute) | $O(N \times K)$ |
| **MCP `explore_strategy` Tool** | Async worker | `< 150 MB` Node RSS | `< 1.2 s` end-to-end SLA | Atomic YAML + State JSON write | Multi-stage pipeline |
| **Sub-Position Atomic Mutation** | < 0.02 CPU | `< 4.0 MB` heap | `< 1.5 ms` per transaction | Lock file creation + atomic rename | $O(1)$ atomic swap |
| **Broker Position Reconciliation** | 0.1 CPU | `< 8.0 MB` heap | $120–250\text{ ms}$ (broker REST) | 1 broker API request / cycle | $O(P + S)$ items |
| **Fast-Path Signal Evaluation** | 0.05 CPU | `< 15.0 MB` heap | **`< 2.0 ms`** internal latency| Zero disk I/O | $O(\text{bars})$ lookback |
