# Sovereign Architecture (SV Console)

Sovereign is a modular, local-first quantitative trading, research, and backtesting platform. This document serves as the canonical architectural entrypoint across all subsystems.

---

## 1. System Overview & Modular Architecture

The **SV Console** is engineered to support major tradable asset classes locally without external cloud dependencies:
- **Traditional Equities & Indices**: `5m` base intraday resolution up to `1w` (synthesized locally via rollup to minimize rate limits).
- **Crypto Markets**: High-granularity `1m` continuous data back to 2017–2018 (Binance, Coinbase).
- **Prediction Markets (Polymarket)**: Sub-minute / tick / `1s` orderbook and price resolution with Gamma and CLOB history archiving.

```text
+---------------------------------------------------------------------------------------------------+
|                                      SV CONSOLE ARCHITECTURE                                      |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  [ 1. DATA INGESTION PIPELINE ]                                                                   |
|  - Passive Background Ingestion (`backfill-daemon`) across multi-core CPU workers                 |
|  - Two Operating Modes: Rebuild Mode (deep historical archive) & Live Mode (incremental polling)|
|  - Market Resolutions:                                                                            |
|    • Traditional Markets: 5m (base free provider), 15m, 30m, 1h, 4h, 1d, 1w                   |
|    • Crypto Markets: 1m continuous historical data (2017-present)                                 |
|    • Prediction Markets (Polymarket): 1s / tick orderbook archives                                |
|                                       │                                                           |
|                                       ▼                                                           |
|  [ 2. DATA FILTRATION & NORMALIZATION PIPELINE ]                                                  |
|  - Provenance Check: "Where does it come from? Who gave it?" (Provider attribution)               |
|  - Numerical Validity: low <= high, positive volume, no NaN/INF, timestamp monotonicity          |
|  - Depth & Rate Limits: Max depth per timeframe, TTL throttling (`INGESTION_TTL_MAP`)             |
|  - Normalization: Asset metadata sidecar `category { family { symbols } }`                        |
|  - Binary TS Storage (SOVT): 8-byte header + 48-byte packed records [ts_ms, O, H, L, C, V]        |
|                                       │                                                           |
|                                       ▼                                                           |
|  [ 3. DATA REPAIR & SANITIZATION PIPELINE ]                                                       |
|  - Repair triggers: Stale cache, server downtime gaps, corrupted tails, out-of-order writes       |
|  - Native Streaming Merger (`BinaryTsMerger`): O(1) memory two-pointer deduplicating merge        |
|  - Rollup from Base: 5m base bars synthesized to 15m/1h/1d (saves 26 API calls/min)              |
|                                       │                                                           |
|                                       ▼                                                           |
|  [ 4. ENGINE INTERACTION & EXECUTION LAYER ]                                                      |
|  ┌───────────────────────────────┬───────────────────────────────┬─────────────────────────────┐  |
|  │ C++20 Sovereign Core          │ AI Strategy Explorer & MCP    │ Live Trading & Ledger       │  |
|  │ - Zero-allocation Backtester  │ - Novelty metric (>=50% dist) │ - Fast-path signal (<2ms)   │  |
|  │ - Monte Carlo / Walk-Forward  │ - 6D Hamming + SHA-256 dedup  │ - 200-bar lookback prune    │  |
|  │ - PreTradeRisk & DrawdownGuard│ - MCP `explore_strategy` tool │ - Sub-positions JSON ledger │  |
|  │ - Binary TS Streaming Merger  │ - Canonical Strategy YAMLs    │ - [MANUAL] auto-attribution │  |
|  └───────────────────────────────┴───────────────────────────────┴─────────────────────────────┘  |
|                                       │                                                           |
|                                       ▼                                                           |
|  [ 5. BROKER GATEWAYS & DEPLOYMENT TOPOLOGY ]                                                     |
|  - Alpaca (Paper/Live with fractional step sizing) & Polymarket CLOB                              |
|  - Docker Compose Services: `sv-web`, `sv-bot-alpaca-paper`, `sv-backfill`, `sv-strategy-explorer`|
|  - HPDesk Proxmox VM soak monitoring & private central-host single-writer protocol                |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Active Domains & Ownership

| Domain | Canonical Source Owner | Responsibility |
|---|---|---|
| **Data Ingestion & Storage** | `shared/lib/market/` | Binary TS index (`SOVT`), append-only segments, rollup synthesis, quote routing |
| **Native C++ Core** | `backend/core/` | C++20 analytics, streaming binary merger, zero-allocation backtester, risk engine |
| **Strategy Discovery & MCP** | `scripts/strategies/`, `backend/mcp_server/` | Autonomous AI agent strategy explorer, novelty deduplication, MCP tools |
| **Execution & Sub-Positions**| `shared/lib/runtime/`, `backend/gateway/` | Virtual sub-position ledger, deterministic signatures, broker reconciliation |
| **CLI & Terminal Dashboard** | `backend/cli/` | Ink dashboard, CLI commands, operator presentation |
| **Private API & Web Bridge** | `backend/api/` | Authenticated Express routes, capability authorization, WebSocket server |
| **Frontend** | `Frontend/dashboard/src/` | React 19 + Vite dashboard (source in `src/`, `dist/` is generated) |
| **Configuration** | `config/` | System environment manifest, strategy registries, risk policies |
| **Runtime Data** | `storage/data/` | Binary time series (`ts/`), JSON caches (`cache/`), paper state (`runtime/`) |
| **Infrastructure & Deployment**| `infra/` | Docker Compose topology, HPDesk Proxmox VM runbooks, automated updater |

---

## 3. Canonical Documentation Reading Order

1. [Data Pipeline & Storage Architecture](engineering/DATA_PIPELINE_AND_STORAGE.md) — Ingestion, filtration, binary `SOVT` format, repair pipeline, and rollup engine.
2. [Native C++20 Core & Backtester](engineering/NATIVE_CORE_AND_BACKTESTER.md) — Streaming merger, zero-allocation backtesting, Monte Carlo, and risk gates.
3. [AI Strategy Explorer & MCP Workbench](RESEARCH_STRATEGY_EXPLORER.md) — Autonomous exploration loop, novelty Hamming metric, and MCP tools.
4. [Sub-Position Virtual Ledger & Reconciliation](engineering/SUB_POSITIONS_LEDGER.md) — Deterministic signatures, broker reconciliation, and manual share isolation.
5. [Operational Soak Runbook & HPDesk Deployment](OPERATIONAL_SOAK_RUNBOOK.md) — Docker Compose services, Proxmox VM soak monitoring, and single-writer safety.
6. [Architecture Overview](engineering/architecture_overview.md) — Runtime policy, paper ledger, and execution boundaries.
7. [Documentation Hub](README.md) & [Documentation Manifest](documentation_manifest.json) — Complete corpus registry.

---

## 4. Fundamental Architectural Invariants

- **Single Canonical Writer**: Only the designated `central-host` node executes write daemons or updates binary storage.
- **Fail-Closed Execution**: Research and backtest outputs cannot authorize live trading. Live trading requires explicit PIN authentication, environment variable authorization, and pre-trade C++ risk engine clearance.
- **Strict Data Provenance**: Ingestion validates timestamp monotonicity, finite floating-point numbers, and provider ranking priority before persisting binary files.
- **Virtual Sub-Position Isolation**: Automated trading bot strategies cannot mutate, close, or liquidate shares belonging to other strategies or manual operator positions.
