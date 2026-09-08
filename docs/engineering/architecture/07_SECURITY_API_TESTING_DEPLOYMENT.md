# 07. Security Model, APIs, Testing Strategy & Deployment Topology

This document specifies the platform security model, Role-Based Access Control (RBAC), Model Context Protocol (MCP) capabilities, Express REST and WebSocket APIs, zero-key local verification matrix, Docker Compose topology, and HPDesk Proxmox VM deployment runbooks.

---

## 1. Security Architecture & RBAC Capability Model

Sovereign enforces a strict least-privilege security model across human operators, automated daemons, and autonomous AI agents:

```text
+----------------------------------------------------------------------------------------------------+
|                                    SECURITY & RBAC ARCHITECTURE                                    |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|  [ Client Access Surfaces ]                                                                        |
|  ├── AI Agents (Claude / LLMs via MCP)   ───► Require Scoped Capability Tokens                     |
|  ├── React Web Dashboard                 ───► Require JWT Bearer Token Session                     |
|  └── Local Sovereign CLI                 ───► Require Loopback IPC / File Permissions              |
|                                         │                                                          |
|                                         ▼                                                          |
|  [ Capability Authorization Router (`backend/mcp_server/lib/access_control.ts`) ]                  |
|  ├── `research:read`   : Inspect market data, query TS stats, read strategy YAMLs                  |
|  ├── `research:run`    : Execute zero-allocation C++ backtests, run strategy discovery             |
|  ├── `execution:paper` : Dispatch virtual paper orders, simulate prediction market trades         |
|  └── `execution:admin` : Mutate live broker orders (REQUIRES PIN + OPERATOR CONFIRMATION)          |
|                                         │                                                          |
|                                         ▼                                                          |
|  [ Single-Writer & Execution Safety Gates ]                                                        |
|  ├── Gate 1: `SOVEREIGN_DEPLOYMENT_PROFILE == 'central-host'` (Single-writer invariant)            |
|  ├── Gate 2: `SOVEREIGN_EXECUTION_AUTHORIZED == 'true'` (Environment authorization)               |
|  └── Gate 3: `sovereign::PreTradeRisk` Microsecond Clearance (<15μs limit validation)              |
+----------------------------------------------------------------------------------------------------+
```

---

## 2. API Specifications: REST, WebSocket & MCP

### A. Model Context Protocol (MCP) Tools (`backend/mcp_server/`)
- `explore_strategy`: Runs automated quantitative discovery or evaluates a custom hypothesis with C++ backtest verification and YAML registration.
- `run_backtest`: Direct execution of native C++ backtester over specified timeframes and strategy files.
- `get_system_status`: Inspects deployment profile, runtime policies, active daemons, and system health.
- `inspect_sub_positions`: Queries active virtual sub-positions, strategy attributions, and broker reconciliation balances.

### B. Express REST API (`backend/api/app.js`)
- `GET /api/v1/system/status`: Returns system invariants, active daemons, memory RSS, and writer status.
- `GET /api/v1/market/bars`: Streams binary TS slices or JSON candles with local rollup aggregation.
- `GET /api/v1/positions/sub`: Returns current virtual sub-positions ledger state.
- `POST /api/v1/strategy/backtest`: Dispatches native C++ backtesting run and returns JSON metrics.

### C. Real-Time WebSocket Mesh (`ws://127.0.0.1:8787/ws`)
- `subscribe:ticker`: Real-time market tick broadcasts.
- `subscribe:bot_cycle`: Telemetry from running paper trading bots (cycle counter, latency, signal state).
- `subscribe:ledger`: Real-time fill attribution and sub-position updates.

---

## 3. Comprehensive Zero-Key Verification & Test Matrix

Sovereign enforces 100% keyless local development. Tests verify contracts without external cloud access:

```text
+----------------------------------------------------------------------------------------------------+
|                                    VERIFICATION & TEST ARCHITECTURE                                |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|  [ 1. Safety & Invariant Suite ] : `npm run test:safety`                                            |
|  - 43/43 Tests Passing: Environment manifest whitelisting, state invariants, lockfile timeouts,   |
|    Alpaca broker states, degraded fallback recovery, and zero-mutation boundaries.                 |
|                                         │                                                          |
|  [ 2. Structure & Documentation Suite ] : `npm run test:structure`                                |
|  - 12/12 Suites Passing: Documentation manifest sync, skill structure, schema conformance.         |
|                                         │                                                          |
|  [ 3. Native C++20 CTest Suite ] : `npm run test:core`                                             |
|  - 34/34 CTests Passing: BinaryTsMerger two-pointer streaming, FrameBacktester, PreTradeRisk,      |
|    Monte Carlo PRNG, and SOVT packed byte layout precision.                                        |
|                                         │                                                          |
|  [ 4. Market Data & Indicator Suite ] : `npm run test:data`                                        |
|  - Indicator mathematical correctness, binary TS serialization, and local rollup calculations.     |
|                                         │                                                          |
|  [ 5. Hygiene & Documentation Audit ] : `npm run hygiene` & `npm run audit:documentation`          |
|  - 0 Hygiene violations, 0 broken documentation links across the master corpus.                    |
+----------------------------------------------------------------------------------------------------+
```

---

## 4. Multi-Container Docker Compose Topology

The containerized stack is defined in `infra/docker/docker-compose.yml` with strict resource quotas:

```text
+----------------------------------------------------------------------------------------------------+
|                              DOCKER COMPOSE MULTI-SERVICE TOPOLOGY                                 |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|  ┌─────────────────────────┬─────────────────────────┬─────────────────────────┐                   |
|  │ sv-web (Default)        │ sv-backfill (Writer)    │ sv-bot-alpaca-paper     │                   |
|  │ - Port 127.0.0.1:8787   │ - Canonical Data Writer │ - Alpaca Paper Bot      │                   |
|  │ - Read-Only API / UI    │ - Ingestion & Rollup    │ - Sub-Position Sizing   │                   |
|  │ - Limit: 1.0 CPU, 512MB │ - Limit: 2.0 CPU, 3072MB│ - Limit: 1.0 CPU, 512MB │                   |
|  └─────────────────────────┴─────────────────────────┴─────────────────────────┘                   |
|  ┌─────────────────────────┬─────────────────────────┬─────────────────────────┐                   |
|  │ sv-strategy-explorer    │ sv-portfolio-monitor    │ sv-host-health & backup │                   |
|  │ - 30-min AI Discovery   │ - Ledger Reconciliation │ - Disk / Flaw Sentinel  │                   |
|  │ - C++ Backtest Bridge   │ - Drawdown Monitoring   │ - 24h State Snapshots   │                   |
|  │ - Limit: 2.0 CPU, 2048MB│ - Limit: 0.5 CPU, 256MB │ - Limit: 0.5 CPU, 256MB │                   |
|  └─────────────────────────┴─────────────────────────┴─────────────────────────┘                   |
|                                         │                                                          |
|                                         ▼                                                          |
|  [ Shared Persistent Volume: `/app/storage` -> `storage/data/` ]                                   |
|  - `ts/*.bin` (Binary market bars)                                                                 |
|  - `runtime/sub_positions.json` (Virtual sub-positions ledger)                                     |
|  - `logs/*.log` (Flaw monitor and audit trails)                                                    |
+----------------------------------------------------------------------------------------------------+
```

---

## 5. HPDesk Proxmox VM Soak Deployment Runbook

The primary soak environment runs on an isolated Ubuntu 24.04 Proxmox VM (`hpdesk-1`):

### Deployment & Operation Commands:
```bash
# 1. Connect to VM via Tailscale
ssh user@hpdesk-1

# 2. Synchronize Local Codebase to VM
rsync -avz --exclude 'node_modules' --exclude 'storage/data/cache' ./ user@hpdesk-1:/opt/sovereign/

# 3. Launch Docker Compose Stack with Writer Profile
docker compose -f infra/docker/docker-compose.yml --profile writer --profile paper-alpaca --profile research up -d

# 4. Monitor Live Soak Logs
tail -f storage/data/logs/flaw_monitor.log
docker compose logs -f sv-bot-alpaca-paper
```

---

## 6. Subsystem Load Indices & Resource Quotas

| Service Container | Profile | CPU Quota (Limit) | RAM Limit / Baseline RSS | Expected Latency / Cadence | Disk I/O Profile |
|---|---|---|---|---|---|
| **`sv-web`** | default | 1.0 vCPU | 512 MB / **~45 MB RSS** | Healthcheck: 30s (<5ms) | Read-only cache hits |
| **`sv-backfill`** | writer | 2.0 vCPU | 3072 MB / **~220 MB RSS** | Polling cycle: 60s | $15–30\text{ MB/min}$ sequential writes |
| **`sv-bot-alpaca-paper`** | paper-alpaca | 1.0 vCPU | 512 MB / **~65 MB RSS** | Bot tick: 60s (<2ms signal)| Atomic ledger writes |
| **`sv-strategy-explorer`**| research | 2.0 vCPU | 2048 MB / **~140 MB RSS**| Interval: 30 mins | 1 YAML + State write / 30m |
| **`sv-portfolio-monitor`**| monitoring | 0.5 vCPU | 256 MB / **~35 MB RSS** | Reconcile: 60s | Read-only ledger audit |
| **`sv-host-health`** | monitoring | 0.5 vCPU | 256 MB / **~28 MB RSS** | Probe: 120s | Append-only flaw logs |
| **`sv-host-backup`** | monitoring | 0.5 vCPU | 256 MB / **~32 MB RSS** | Backup: 24h cron | Compressed archive snapshot |
