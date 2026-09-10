# 07. Security Model, APIs, Testing Strategy & Deployment Topology

This document specifies the platform security model, Role-Based Access Control (RBAC), Model Context Protocol (MCP) capabilities, Express REST and WebSocket APIs, zero-key local verification matrix, Docker Compose topology, and HPDesk Proxmox VM deployment runbooks.

---

## 1. Security Architecture & RBAC Capability Model

Sovereign enforces a strict least-privilege security model across human operators, automated daemons, and autonomous AI agents:

```mermaid
flowchart TD
    subgraph Clients["Client Access Surfaces"]
        AI["AI Agents (Claude / LLMs via MCP)<br/>Require Scoped Capability Tokens [Load: 2/10]"]
        WEB["React Web Dashboard<br/>Require JWT Bearer Token Session [Load: 3/10]"]
        CLI["Local Sovereign CLI<br/>Require Loopback IPC / File Permissions [Load: 1/10]"]
    end

    subgraph RBAC["Capability Authorization Router (backend/mcp_server/lib/access_control.ts) [Load: 2/10 | SLA: <1ms]"]
        C1["research:read: Inspect market data, query TS stats, read strategy YAMLs"]
        C2["research:run: Execute zero-allocation C++ backtests, run strategy discovery"]
        C3["execution:paper: Dispatch virtual paper orders, simulate prediction market trades"]
        C4["execution:admin: Mutate live broker orders (REQUIRES PIN + CONFIRMATION)"]
    end

    subgraph Gates["Single-Writer & Execution Safety Gates [Load: 1/10 | Three-Tier Gate]"]
        G1["Gate 1: SOVEREIGN_DEPLOYMENT_PROFILE == 'central-host' (Single-writer invariant)"]
        G2["Gate 2: SOVEREIGN_EXECUTION_AUTHORIZED == 'true' (Environment authorization)"]
        G3["Gate 3: sovereign::PreTradeRisk Microsecond Clearance (<15μs limit validation)"]
    end

    Clients --> RBAC
    RBAC --> Gates
```

---

## 2. API Authentication & Token Lifecycle Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Client as Client / AI Agent
    participant API as Express API / MCP
    participant RBAC as AccessControl Router
    participant POL as Security Policy
    participant RUN as Internal Runtime

    Client->>API: Request Auth (API Key / PIN)
    API->>RBAC: Validate Token
    RBAC->>POL: Check Policy, Profile & RBAC
    POL-->>RBAC: Access Granted (Scoped Claims)
    RBAC-->>API: Return JWT Token
    API-->>Client: Bearer Token
    Client->>API: Invoke Tool (explore_strat + Bearer Token)
    API->>RBAC: Verify Scope (research:run)
    RBAC->>RUN: Authorize & Dispatch
    RUN->>RUN: Execute C++ Backtest
    RUN-->>API: Results
    API-->>Client: JSON Response
```

---

## 3. 4-Tier Automated Test Execution DAG & Zero-Key Invariant

Sovereign enforces 100% keyless local development. Tests verify contracts without external cloud access:

```mermaid
flowchart TD
    T1["TIER 1: SAFETY & INVARIANT CONTRACTS (npm run test:safety) [Load: 2/10]<br/>• 43/43 Tests Passing: Environment manifest whitelisting, state invariants,<br/>lockfile timeouts, broker states, degraded recovery, zero-mutation boundaries"]
    
    T2["TIER 2: STRUCTURAL & HYGIENE CONTRACTS (npm run test:structure & hygiene) [Load: 3/10]<br/>• 12/12 Suites Passing: Documentation manifest sync, skill integrity, require rules<br/>• 0 Hygiene violations across git noise, symlinks, code markers"]
    
    T3["TIER 3: NATIVE C++20 CTEST SUITE (npm run test:core) [Load: 8/10]<br/>• 34/34 CTests Passing: BinaryTsMerger two-pointer streaming, FrameBacktester,<br/>PreTradeRisk, Monte Carlo PRNG distribution, SOVT packed byte layout"]
    
    T4["TIER 4: MARKET DATA & INDICATOR CONTRACTS (npm run test:data) [Load: 4/10]<br/>• Indicator mathematical parity with reference vectors, binary TS serialization, rollups"]

    GATE[("TOTAL TEST PYRAMID GATE: npm test PASSING (100% GREEN)")]

    T1 -->|Dependencies Satisfied| T2
    T2 -->|Structural Integrity Verified| T3
    T3 -->|Native Binary Integrity Verified| T4
    T4 -->|Full Suite Complete| GATE
```

---

## 4. Multi-Container Docker Compose & Proxmox VM Mesh Topology

The containerized stack is defined in `infra/docker/docker-compose.yml` with strict resource quotas:

```mermaid
flowchart TD
    subgraph Host["HPDesk Proxmox VM (hpdesk-1 / Ubuntu 24.04 LTS / 192.168.4.101 via Tailscale)"]
        WEB["sv-web (Default)<br/>Port 127.0.0.1:8787<br/>Read-Only API / UI<br/>Quota: 1.0 CPU, 512MB<br/>[Load: 2/10]"]
        BACKFILL["sv-backfill (Writer)<br/>Canonical Data Writer<br/>Ingestion & Rollup<br/>Quota: 2.0 CPU, 3072MB<br/>[Load: 5/10]"]
        BOT["sv-bot-alpaca-paper<br/>Alpaca Paper Bot<br/>Sub-Position Sizing<br/>Quota: 1.0 CPU, 512MB<br/>[Load: 3/10]"]
        EXPLORER["sv-strategy-explorer<br/>30-min AI Discovery<br/>C++ Backtest Bridge<br/>Quota: 2.0 CPU, 2048MB<br/>[Load: 5/10]"]
        PORTFOLIO["sv-portfolio-monitor<br/>Ledger Reconciliation<br/>Drawdown Monitoring<br/>Quota: 0.5 CPU, 256MB<br/>[Load: 2/10]"]
        HEALTH["sv-host-health & backup<br/>Disk / Flaw Sentinel<br/>24h State Snapshots<br/>Quota: 0.5 CPU, 256MB<br/>[Load: 1/10]"]
    end

    VOL[("Shared Persistent Volume: /app/storage -> storage/data/<br/>• ts/*.bin (Binary market bars)<br/>• runtime/sub_positions.json (Virtual ledger)<br/>• logs/*.log (Flaw monitor and audit trails)")]

    WEB -->|POSIX Mount| VOL
    BACKFILL -->|POSIX Mount (Writer)| VOL
    BOT -->|POSIX Mount| VOL
    EXPLORER -->|POSIX Mount| VOL
    PORTFOLIO -->|POSIX Mount| VOL
    HEALTH -->|POSIX Mount| VOL
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
