# 07. Security Model, APIs, Testing Strategy & Deployment Topology

This document specifies the platform security model, Role-Based Access Control (RBAC), Model Context Protocol (MCP) capabilities, Express REST and WebSocket APIs, zero-key local verification matrix, Docker Compose topology, and HPDesk Proxmox VM deployment runbooks.

---

## 1. Security Architecture & RBAC Capability Model

Sovereign enforces a strict least-privilege security model across human operators, automated daemons, and autonomous AI agents:

```text
+--------------------------------------------------------------------------------------------------------------------+
|                                    SECURITY & RBAC CAPABILITY TOPOLOGY                                             |
+--------------------------------------------------------------------------------------------------------------------+
|                                                                                                                    |
|  [ CLIENT ACCESS SURFACES ]                                                                                        |
|  ├── AI Agents (Claude / LLMs via MCP)   ───► Require Scoped Capability Tokens            [Load: 2/10]             |
|  ├── React Web Dashboard                 ───► Require JWT Bearer Token Session            [Load: 3/10]             |
|  └── Local Sovereign CLI                 ───► Require Loopback IPC / File Permissions     [Load: 1/10]             |
|                                         │                                                                          |
|                                         ▼ [Load: 2/10 | SLA: <1ms]                                                 |
|  [ CAPABILITY AUTHORIZATION ROUTER (`backend/mcp_server/lib/access_control.ts`) ]                                  |
|  ├── `research:read`   : Inspect market data, query TS stats, read strategy YAMLs                                  |
|  ├── `research:run`    : Execute zero-allocation C++ backtests, run strategy discovery                             |
|  ├── `execution:paper` : Dispatch virtual paper orders, simulate prediction market trades                         |
|  └── `execution:admin` : Mutate live broker orders (REQUIRES PIN + OPERATOR CONFIRMATION)                          |
|                                         │                                                                          |
|                                         ▼ [Load: 1/10 | Three-Tier Gate]                                           |
|  [ SINGLE-WRITER & EXECUTION SAFETY GATES ]                                                                        |
|  ├── Gate 1: `SOVEREIGN_DEPLOYMENT_PROFILE == 'central-host'` (Single-writer invariant)                            |
|  ├── Gate 2: `SOVEREIGN_EXECUTION_AUTHORIZED == 'true'` (Environment authorization)                               |
|  └── Gate 3: `sovereign::PreTradeRisk` Microsecond Clearance (<15μs limit validation)                              |
+--------------------------------------------------------------------------------------------------------------------+
```

---

## 2. API Authentication & Token Lifecycle Sequence

```text
[Client / AI Agent]     [Express API / MCP]     [AccessControl Router]    [Security Policy]      [Internal Runtime]
        │                       │                        │                       │                      │
        │── 1. Request Auth ───►│                        │                       │                      │
        │   (API Key / PIN)     │── 2. Validate Token ──►│                       │                      │
        │                       │                        │── 3. Check Policy ───►│                      │
        │                       │                        │      Profile & RBAC   │                      │
        │                       │                        │◄─ 4. Access Granted ──│                      │
        │                       │◄─ 5. Return JWT Token ─│   (Scoped Claims)     │                      │
        │◄─ 6. Bearer Token ────│                                                │                      │
        │                       │                                                │                      │
        │── 7. Invoke Tool ────►│                                                │                      │
        │   (`explore_strat`)   │── 8. Verify Scope ────►│                                              │
        │   + Bearer Token      │      (`research:run`)  │── 9. Authorize ─────────────────────────────►│
        │                       │                        │                                              │── 10. Execute
        │                       │                        │                                              │   C++ Backtest
        │                       │◄─ 11. Results ────────────────────────────────────────────────────────│
        │◄─ 12. JSON Response ──│                                                                       │
```

---

## 3. 4-Tier Automated Test Execution DAG & Zero-Key Invariant

Sovereign enforces 100% keyless local development. Tests verify contracts without external cloud access:

```text
+--------------------------------------------------------------------------------------------------------------------+
|                                    4-TIER AUTOMATED TEST EXECUTION DAG                                             |
+--------------------------------------------------------------------------------------------------------------------+
|                                                                                                                    |
|  [ TIER 1: SAFETY & INVARIANT CONTRACTS ] ──► `npm run test:safety`                               [Load: 2/10]     |
|  - 43/43 Tests Passing: Environment manifest whitelisting, state invariants, lockfile timeouts,                    |
|    broker states, degraded fallback recovery, and zero-mutation boundaries.                                        |
|                                         │                                                                          |
|                                         ▼ Dependencies Satisfied                                                   |
|  [ TIER 2: STRUCTURAL & HYGIENE CONTRACTS ] ──► `npm run test:structure` & `npm run hygiene`      [Load: 3/10]     |
|  - 12/12 Suites Passing: Documentation manifest sync, skill integrity, upward require rules.                       |
|  - 0 Hygiene violations across git noise, symlinks, and code markers.                                              |
|                                         │                                                                          |
|                                         ▼ Structural Integrity Verified                                            |
|  [ TIER 3: NATIVE C++20 CTEST SUITE ] ──► `npm run test:core`                                     [Load: 8/10]     |
|  - 34/34 CTests Passing: `BinaryTsMerger` two-pointer streaming, `FrameBacktester`, `PreTradeRisk`,                |
|    Monte Carlo PRNG distribution uniformity, and SOVT packed byte layout precision.                                |
|                                         │                                                                          |
|                                         ▼ Native Binary Integrity Verified                                         |
|  [ TIER 4: MARKET DATA & INDICATOR CONTRACTS ] ──► `npm run test:data`                            [Load: 4/10]     |
|  - Indicator mathematical parity with reference vectors, binary TS serialization, and rollups.                     |
|                                         │                                                                          |
|                                         ▼ Full Suite Complete                                                      |
|  [ TOTAL TEST PYRAMID GATE: `npm test` PASSING (100% GREEN) ]                                                      |
+--------------------------------------------------------------------------------------------------------------------+
```

---

## 4. Multi-Container Docker Compose & Proxmox VM Mesh Topology

The containerized stack is defined in `infra/docker/docker-compose.yml` with strict resource quotas:

```text
+--------------------------------------------------------------------------------------------------------------------+
|                                  DOCKER COMPOSE & PROXMOX VM MESH TOPOLOGY                                         |
+--------------------------------------------------------------------------------------------------------------------+
|                                                                                                                    |
|  [ HPDesk Proxmox VM (`hpdesk-1` / Ubuntu 24.04 LTS / 192.168.4.101 via Tailscale Mesh) ]                         |
|  ┌─────────────────────────┬─────────────────────────┬─────────────────────────┐                                   |
|  │ sv-web (Default)        │ sv-backfill (Writer)    │ sv-bot-alpaca-paper     │                                   |
|  │ - Port 127.0.0.1:8787   │ - Canonical Data Writer │ - Alpaca Paper Bot      │                                   |
|  │ - Read-Only API / UI    │ - Ingestion & Rollup    │ - Sub-Position Sizing   │                                   |
|  │ - Quota: 1.0 CPU, 512MB │ - Quota: 2.0 CPU, 3072MB│ - Quota: 1.0 CPU, 512MB │                                   |
|  │ - [Load: 2/10]          │ - [Load: 5/10]          │ - [Load: 3/10]          │                                   |
|  └─────────────────────────┴─────────────────────────┴─────────────────────────┘                                   |
|  ┌─────────────────────────┬─────────────────────────┬─────────────────────────┐                                   |
|  │ sv-strategy-explorer    │ sv-portfolio-monitor    │ sv-host-health & backup │                                   |
|  │ - 30-min AI Discovery   │ - Ledger Reconciliation │ - Disk / Flaw Sentinel  │                                   |
|  │ - C++ Backtest Bridge   │ - Drawdown Monitoring   │ - 24h State Snapshots   │                                   |
|  │ - Quota: 2.0 CPU, 2048MB│ - Quota: 0.5 CPU, 256MB │ - Quota: 0.5 CPU, 256MB │                                   |
|  │ - [Load: 5/10]          │ - [Load: 2/10]          │ - [Load: 1/10]          │                                   |
|  └─────────────────────────┴─────────────────────────┴─────────────────────────┘                                   |
|                                         │                                                                          |
|                                         ▼ POSIX Volume Mount                                                       |
|  [ Shared Persistent Volume: `/app/storage` -> `storage/data/` ]                                                   |
|  - `ts/*.bin` (Binary market bars)                                                                                 |
|  - `runtime/sub_positions.json` (Virtual sub-positions ledger)                                                     |
|  - `logs/*.log` (Flaw monitor and audit trails)                                                                    |
+--------------------------------------------------------------------------------------------------------------------+
```

---

## 5. Subsystem Load Indices & Resource Quotas

| Service Container | Profile | CPU Quota (Limit) | RAM Limit / Baseline RSS | Expected Latency / Cadence | Disk I/O Profile | Load Score (1–10) |
|---|---|---|---|---|---|:---:|
| **`sv-web`** | default | 1.0 vCPU | 512 MB / **~45 MB RSS** | Healthcheck: 30s (<5ms) | Read-only cache hits | **2/10** |
| **`sv-backfill`** | writer | 2.0 vCPU | 3072 MB / **~220 MB RSS** | Polling cycle: 60s | $15–30\text{ MB/min}$ writes | **5/10** |
| **`sv-bot-alpaca-paper`** | paper-alpaca | 1.0 vCPU | 512 MB / **~65 MB RSS** | Bot tick: 60s (<2ms signal)| Atomic ledger writes | **3/10** |
| **`sv-strategy-explorer`**| research | 2.0 vCPU | 2048 MB / **~140 MB RSS**| Interval: 30 mins | 1 YAML + State write / 30m | **5/10** |
| **`sv-portfolio-monitor`**| monitoring | 0.5 vCPU | 256 MB / **~35 MB RSS** | Reconcile: 60s | Read-only ledger audit | **2/10** |
| **`sv-host-health`** | monitoring | 0.5 vCPU | 256 MB / **~28 MB RSS** | Probe: 120s | Append-only flaw logs | **1/10** |
| **`sv-host-backup`** | monitoring | 0.5 vCPU | 256 MB / **~32 MB RSS** | Backup: 24h cron | Compressed archive snapshot | **1/10** |
