# Architecture

> Verified against the executable repository on 2026-07-24.

## Overview

Sovereign is a local-first trading research platform. Its strongest production-reachable paths are validated
market-data storage, indicators/features, backtests, research contracts, a Node CLI, a private API/dashboard,
native C++ analytics/risk commands, and read-only MCP adapters. Live-capital promotion is blocked. The intended
deployment profile is a private, single-writer paper-research host.

## Executable ownership model

```text
providers -> ingestion -> validation -> ts-index/cache
                                      |
                                      +-> features/backtests/research -> CLI/API/MCP/UI

runtime environment + CLI intent + authorization + risk/feature gates
                                      |
                                      v
                    shared/lib/settings/runtime_policy.js
                                      |
                  +-------------------+-------------------+
                  |                                       |
          private-paper/research                    eligible private runner
          can_execute=false                         explicit live gates still required
                  |
                  v
 backend/gateway/src/paper_ledger.js -> portfolio.v1.json
        append-only authority              rebuildable projection
```

The effective execution policy is owned by `shared/lib/settings/runtime_policy.js`. CLI broker gates and the
gateway consume this contract; CLI status, API system status, and MCP `get_system_status` expose the same policy
shape and deterministic fingerprint. `private-paper`, `cloud-compute`, and test profiles are permanently
non-executing. Unknown profiles fail closed.

The canonical internal Polymarket simulator is owned by `backend/gateway/src/paper_ledger.js`. Its chained JSONL
event log is authoritative; `portfolio.v1.json` is an atomic, rebuildable projection carrying the ledger sequence
and checksum. The owner enforces an ownership-token writer lock, deterministic idempotency keys, replay,
checksum validation, and fail-closed truncated-tail handling. Legacy `fills.jsonl` and `portfolio.json` are
migrated only when every imported fill is provably virtual and reconciles exactly; originals are copied to a
read-only archive. Ambiguous or live-looking records are preserved and refused.

The older non-live `bot cycle` still persists a separate `bot_state.json` projection. It no longer initializes a
credentialed CLOB client in paper mode, but convergence of that state into the canonical event ledger remains an
explicit release blocker.

## Components

| Component | Active owner | Current role |
|---|---|---|
| Native analytics and risk | `backend/core` | Compiled C++ indicators, data inspection, backtests, kill switch, and risk contracts |
| CLI and TUI | `backend/cli` | Primary orchestration and operator surface |
| Execution gateway | `backend/gateway` | Dry-run/live boundary, broker adapters, Polymarket research and paper paths |
| Runtime policy | `shared/lib/settings/runtime_policy.js` | One fail-closed execution decision and status contract |
| Paper ledger | `backend/gateway/src/paper_ledger.js` | Internal Polymarket paper event authority and portfolio replay |
| Private API/dashboard | `backend/api`, `Frontend/dashboard` | Thin authenticated views and command adapters |
| MCP | `backend/mcp_server` | CLI-backed tools; operational only after a real host stdio handshake |
| Configuration | `config` | Data, strategy, feature, risk, and deployment settings |

## Account and execution boundaries

- Internal Polymarket paper simulation uses the repository event ledger and virtual cash. It is not a broker
  account and never proves live readiness.
- Alpaca paper is a broker-hosted account and is separate from the internal Polymarket ledger.
- Live Alpaca, Polymarket, Gate.io, or MT5 execution requires an eligible private runtime plus explicit command,
  authorization, feature, credential, kill-switch, and risk gates.
- `private-paper` remains non-executing even if `LIVE_TRADING=true`, `--live`, authorization, a valid PIN, and
  credentials are all present.
- Research-only and paper UI must not imply real-money approval.

## Deployment and recovery topology

The target is one qualified Ubuntu x86_64 private host with one persistent writer. The current Lenovo workstation
is testing-only. API access must remain loopback/private-network scoped. Backups must capture the ledger,
projections, configuration, and market data consistently; restore must prove ledger checksum and replay parity.
No host is production-qualified until hardware, freshness, MCP stdio, backup/restore, restart, rollback, and soak
gates pass.

## Current release blockers

- Converge non-live bot state and status onto the canonical paper-ledger projection.
- Prove a qualified separate host, one-writer operation, data freshness/DCS, recovery, and soak.
- Complete a real host-side MCP initialize/list/read-only-status exchange.
- Keep the combined exact-asset engine read-only and promotion-blocked until its own evidence gates pass.
- Obtain authenticated CI and committed-release evidence before tagging `private-paper-v1`.
