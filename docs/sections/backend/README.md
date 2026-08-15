# Backend Domain Structure Map

Canonical structural map for the `backend/` subsystem of the Sovereign Trading Platform.

## Overview And Subsystems

The `backend/` directory houses the server-side API bridge, execution gateway, Sovereign CLI/TUI engine, C++ core engine, and model serving services.

```text
backend/
├── api/            # Express HTTP server & Socket.IO telemetry bridge
├── cli/            # Sovereign CLI dispatcher & TUI terminal dashboard engine
├── core/           # C++20 CMake native compute & matrix optimization engine
├── gateway/        # Order execution gateway & broker paper/live adapters
├── mcp_server/     # Model Context Protocol stdio tool server
└── scripts/        # Active backend operational & ingestion scripts
```

## Active Subsystem Entrypoints

1. **API Server (`backend/api/`):**
   - Entrypoint: `backend/api/app.js`
   - Routes: `backend/api/server/routes/index.js` (domain-grouped: `account/`, `bot/`, `data/`, `market/`, `status/`, `system/`)
   - Services: `backend/api/server/services/` (`access_control.js`, `data_readiness.js`, `input_validator.js`, `supabase_client.js`)

2. **CLI & TUI (`backend/cli/`):**
   - Entrypoint: `backend/cli/sovereign_cli.js`
   - Command Registry: `backend/cli/commands/` (domain-grouped: `account/`, `operational/`, `research/`, `runner/`, `settings/`, `strategy/`, `tools/`, `trade/`)
   - TUI Engine: `backend/cli/sovereign_dashboard.mjs`, `backend/cli/tui/dashboard_exec.js`, `backend/cli/tui/manifest.js`

3. **C++ Core Engine (`backend/core/`):**
   - Build Manifest: `backend/core/CMakeLists.txt`
   - CLI Entrypoint: `backend/core/src/main.cpp`
   - Native Modules: `backend/core/src/backtest/`, `backend/core/src/data/`, `backend/core/src/math/`, `backend/core/src/ml/`

4. **Execution Gateway (`backend/gateway/`):**
   - Cycle Engine: `backend/gateway/src/cycle.ts`
   - Paper Ledger: `backend/gateway/src/paper_ledger.js`
   - State Persistence: `backend/gateway/src/bot_state.ts`

5. **MCP Tool Server (`backend/mcp_server/`):**
   - Source: `backend/mcp_server/src/index.ts`
   - Stdio Launcher: `scripts/mcp_stdio_probe.js`

## Code Atlas Cross-References

- Topology: Retrieval & Command Flow — [`atlas.topology.documentation.retrieval-flow`](../../atlas/topology/documentation/retrieval-flow.md)
- Terminal Dashboard Interface — [`docs/sections/interface/terminal-dashboard/README.md`](../interface/terminal-dashboard/README.md)
- Bot Execution Cycle — [`docs/sections/execution/polymarket-bot-cycle/README.md`](../execution/polymarket-bot-cycle/README.md)
