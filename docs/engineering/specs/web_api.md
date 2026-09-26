# Web REST & WebSocket API Bridge SRS

> **Document Standard**: IEEE 830-1998 / ISO/IEC/IEEE 29148:2018 | **Diátaxis Type**: Reference & Specification | **Status**: Canonical | **Engine**: Native `node:http` (Zero Express) | **Review**: Continuous

---

## 1. Introduction

### 1.1 Purpose
This Software Requirements Specification (SRS) defines the communication contracts, security policies, role-based access control (RBAC) tiers, routing engine, and payload schemas for the **Sovereign Web REST & WebSocket API Bridge**.

### 1.2 Document Conventions
- Requirements are uniquely identified using `FR-API-xxx` (Functional) and `NFR-API-xxx` (Non-Functional).
- RFC 2119 keywords (`MUST`, `MUST NOT`, `SHOULD`, `MAY`) establish mandatory contracts.

### 1.3 Intended Audience
Frontend dashboard developers, API clients, integration engineers, and compliance auditors.

### 1.4 System Scope
Encompasses the standalone native HTTP daemon (`backend/api/app.js` on port 8787), 42 route keys across 41 handler modules, RBAC access control gates, Model Context Protocol (MCP) agent boundaries, and static asset serving for the React 19 dashboard.

### 1.5 References
- [Product Software Requirements Specification](../../reference/specifications/product_specification.md)
- [Technical Architecture Specification](../specs/technical_spec.md)
- [Pre-Trade Risk & Sub-Positions Specification](../../reference/specifications/sub_positions_risk_spec.md)

---

## 2. Overall Description

### 2.1 Runtime Architecture & Topology
The API server acts as an in-process bridge connecting web frontends, CLI consumers, MCP agents, and the native C++20 engine:

```mermaid
flowchart TD
    CLIENT["Browser / TUI / MCP Agent"] -->|HTTP / WebSocket| APP["Native HTTP Server<br/>backend/api/app.js (Port 8787)"]
    APP -->|Path Traversal Check| STATIC["Static Assets<br/>Frontend/dashboard/dist/"]
    APP -->|Security Filter| ACCESS["Access Control & RBAC<br/>backend/api/server/services/access_control.js"]
    ACCESS --> ROUTER["Router Engine (42 Routes)<br/>backend/api/server/routes/index.js"]
    ROUTER -->|In-Process Execution| CLI["CLI Command Handlers<br/>backend/cli/commands/"]
    ROUTER -->|C++ Subprocess Bridge| CORE["Native C++ Core<br/>sovereign_wealth"]
    ROUTER -->|Read/Write State| CACHE["Disk State & Caches<br/>storage/data/"]
```

### 2.2 Server Characteristics
- **Entrypoint**: `backend/api/app.js` instantiated via standard `node:http.createServer()`.
- **Default Port**: `8787` (configurable via `SOVEREIGN_PORT` or `PORT`).
- **Zero Express Dependency**: Uses native URL parsing, manual body consumption buffers with prototype pollution guards, and streaming response writers.
- **Static Asset Fallback**: Unmatched non-API requests route to `serveStatic()`, serving the compiled React 19 bundle from `Frontend/dashboard/dist/` guarded by strict path containment (`filePath.startsWith(WEB_PUBLIC_ROOT)`).

---

## 3. Specific Functional Requirements

### 3.1 Authentication & RBAC Capability Tiers
- **FR-API-001 (RBAC Route Gate)**:
  - *Description*: Every incoming request MUST be evaluated against its registered capability tier before executing route logic:

| Capability Tier | Authentication Requirement | Allowed Route Patterns |
|---|---|---|
| **Public (`*`)** | None (Unauthenticated) | `/health`, `/api/auth/status`, `/api/supabase/config`, `/api/public/*` |
| **`status:read`** | `x-sovereign-token` or valid Supabase session | `/api/status`, `/api/client/status`, `/api/bot/status`, `/api/run/status`, `/api/backend/stats`, `/api/system/status`, `/api/cluster/status` (GET) |
| **`research:read`** | `x-sovereign-token` or valid Supabase session | `/api/data/*`, `/api/universe`, `/api/indicators`, `/api/market/*`, `/api/quotes/*`, `/api/cache/*`, `/api/analytics`, `/api/strategies`, `/api/sigma-band`, `/api/bias`, `/api/scorecard`, `/api/combined-analysis` |
| **`research:run`** | `x-sovereign-token` with write capability | `/api/backtest`, `/api/signal/promote`, `/api/combined-analysis/*` |
| **`execution:paper`** | `x-sovereign-token` with paper trade capability | `/api/bot/cycle`, `/api/combined-analysis/paper-cycle` |
| **`execution:admin`** | Signed admin bearer token + salted PIN | `/api/bot/sell`, `/api/kill-switch`, `/api/system/*`, `/api/auth/session/reauth`, `/api/cluster/status` (POST) |

- **FR-API-002 (MCP Agent Safeguard)**:
  - *Description*: Autonomous MCP agents MUST be blocked from invoking destructive operations (`/api/kill-switch`, `/api/bot/sell`) unless verified by human operator PIN.

### 3.2 System Status & Health Endpoints
- **FR-API-003 (Health & Status Probes)**:
  - `GET /health` (`Public`): Uptime, heap/RSS memory metrics.
  - `GET /api/status` (`status:read`): Aggregated system health and quote feed staleness.
  - `GET /api/client/status` (`status:read`): Client handshake and build version.
  - `GET /api/run/status` (`research:read`): Status of background backtests and exploration jobs.
  - `GET /api/system/status` (`execution:admin`): Disk usage in `storage/data/ts/` and active POSIX locks.
  - `GET /api/system/service-health` (`execution:admin`): Soak test health checks.

### 3.3 Market Data & Storage Endpoints
- **FR-API-004 (Market Data Retrieval)**:
  - `GET /api/data/summary` (`research:read`): Returns validated OHLCV summaries and volatility metrics.
  - `GET /api/universe` (`research:read`): Returns canonical asset universe.
  - `GET /api/cache/universe` (`research:read`): Cached universe metadata.
  - `GET /api/indicators` (`research:read`): Rolling RSI, MACD, Bollinger, ATR computed over binary SOVT files.
  - `GET /api/quotes/status` (`research:read`): Real-time quote feed latency and provider fallback status.
  - `GET /api/cache/list` (`research:read`): Disk file inspection under `storage/data/cache/`.
  - `GET /api/market/monitor` (`research:read`): Real-time spreads, percent changes, and volume surges.
  - `GET /api/analytics` (`research:read`): Cross-asset return distributions and benchmark beta.
  - `GET /api/public/market-summary` (`Public`): Unauthenticated dashboard summary.
  - `GET /api/public/freshness` (`Public`): Ingestion freshness and SLA timestamps.

### 3.4 Alpha Research & Backtesting Endpoints
- **FR-API-005 (Backtesting & Alpha Analytics)**:
  - `GET /api/backtest` (`research:run`): Dispatches runs to C++20 `FrameBacktester` (or fallback), returning equity curve, Sharpe, Sortino, and drawdown.
  - `GET /api/correlation` (`research:read`): Computes Pearson correlation matrix with clamped eigenvalues.
  - `GET /api/backend/stats` (`research:read`): C++ quantitative analytics stats.
  - `GET /api/backend/portfolio` (`research:read`): Portfolio exposure and concentration.
  - `GET /api/signal` (`research:read`): Tactical signals across registered strategies (expires after 24h).
  - `POST /api/signal/promote` (`research:run`): Promotes candidate signals to paper eligibility.
  - `GET /api/strategies` (`research:read`): Lists registered strategy YAML configs.
  - `GET /api/sigma-band` (`research:read`): Rolling standard deviation envelopes.
  - `GET /api/bias` (`research:read`): Directional trend bias.
  - `GET /api/scorecard` (`research:read`): Quantitative strategy grading.
  - `GET /api/combined-analysis` (`research:read`): Multi-model ensemble analysis.
  - `POST /api/combined-analysis/promote` (`research:run`): Promotes candidate to strategy config.
  - `POST /api/combined-analysis/paper-cycle` (`execution:paper`): Triggers on-demand paper cycle.
  - `GET /api/public/research-summary` (`Public`): Public research hypothesis summary.

### 3.5 Bot Execution & Circuit Breakers
- **FR-API-006 (Trading Bot Control)**:
  - `GET /api/bot/status` (`execution:paper`): Sub-position ledger holdings, open orders, and cash balances.
  - `POST /api/bot/cycle` (`execution:paper`): Forces immediate paper cycle with pre-trade risk validation.
  - `POST /api/bot/sell` (`execution:admin`): Emergency sub-position trim/close requiring PIN verification.
  - `POST /api/kill-switch` (`execution:admin`): Emergency platform circuit breaker cancelling open orders across all gateways and setting execution state to suspended.

### 3.6 Account & Infrastructure Endpoints
- **FR-API-007 (Infrastructure & Database Operations)**:
  - `GET /api/auth/status` (`Public`): Current auth status and role permissions.
  - `POST /api/auth/session/reauth` (`Public`): Refreshes session bearer token.
  - `GET /api/database/status` (`execution:admin`): Paper ledger integrity and checksum verification.
  - `GET /api/supabase/config` (`Public`): Safe public Supabase telemetry client configuration.
  - `GET /api/config` (`research:read`): Sanitized system runtime configuration.
  - `GET /api/system/infra` (`execution:admin`): Streams Docker operational logs without shell interpolation.
  - `GET /api/cluster/status` (`status:read`): Returns local node role, active leader lease, healthy/unresponsive cluster nodes, and remote peer mesh health.
  - `POST /api/cluster/status` (`execution:admin`): Cluster control actions — `action=heartbeat` registers local node; `action=elect` forces election evaluation; `action=step_down` surrenders leadership; `action=acquire_lock` / `action=release_lock` manages distributed order idempotency locks.

---

## 4. External Interface Requirements

### 4.1 Transport Protocols
- **HTTP/1.1**: Persistent keep-alive connections on TCP port 8787.
- **WebSocket**: Bidirectional JSON framed channels (`ws://127.0.0.1:8787/ws`) for order updates and live bars.
- **Server-Sent Events (SSE)**: Unidirectional streaming (`/api/stream/*`) for telemetry and log tails.

### 4.2 Error Responses & Format
Standard JSON error payload for all non-2xx responses:
```json
{
  "ok": false,
  "error": "UNAUTHORIZED_CAPABILITY",
  "message": "Route requires 'execution:admin' capability",
  "status": 403
}
```

---

## 5. Non-Functional Requirements

### 5.1 Performance & Latency
- **NFR-API-001 (P95 Response Latency)**: P95 response time for non-backtesting REST routes MUST be $<10\text{ms}$.
- **NFR-API-002 (Throughput Capacity)**: The server MUST sustain $>2,500\text{ req/sec}$ on 4 CPU cores for cached quote and indicator routes.

### 5.2 Security Invariants
- **NFR-API-003 (Path Traversal Protection)**: The static file server MUST verify that resolved paths reside strictly within `Frontend/dashboard/dist/`.
- **NFR-API-004 (Prototype Pollution Guard)**: JSON body parser MUST reject payloads containing `__proto__`, `constructor`, or `prototype` keys.

---

## 6. Other Requirements & Verification Matrix

### 6.1 Verification Matrix
| Requirement ID | Description | Verification Method | Target Command / Test |
|---|---|---|---|
| `FR-API-001` | RBAC Capability Enforcement | Route Contract Test | `tests/api/routes_access.test.js` |
| `FR-API-002` | MCP Safety Gating | Unit Test | `tests/api/mcp_gating.test.js` |
| `FR-API-003` | Status & Health Routes | Integration Test | `npm run test:api` |
| `FR-API-004` | Market Data Routes | Integration Test | `npm run test:api` |
| `FR-API-005` | Backtesting Dispatch | Integration Test | `npm run test:api` |
| `FR-API-006` | Kill Switch & Emergency Halt | Safety Test | `npm run test:safety` |
| `FR-API-007` | Database & Infra Routes | Integration Test | `npm run test:api` |
| `NFR-API-001` | Latency SLA (<10ms) | API Benchmark | `npm run test:api` |
| `NFR-API-003` | Path Traversal Protection | Security Test | `tests/api/path_traversal.test.js` |
| `NFR-API-004` | Prototype Pollution Guard | Security Test | `tests/api/body_parser.test.js` |
