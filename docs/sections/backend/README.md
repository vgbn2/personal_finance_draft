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

2. **CLI & TUI (`frontend/cli-tui/`):**
   - Entrypoint: `frontend/cli-tui/sovereign_cli.js`
   - Command Registry: `frontend/cli-tui/commands/` (domain-grouped: `account/`, `operational/`, `research/`, `runner/`, `settings/`, `strategy/`, `tools/`, `trade/`)
   - TUI Engine: `frontend/cli-tui/sovereign_dashboard.mjs`, `frontend/cli-tui/tui/dashboard_exec.js`, `frontend/cli-tui/tui/manifest.js`

3. **C++ Core Engine (`backend/cpp_core/`):**
   - Build Manifest: `backend/cpp_core/CMakeLists.txt`
   - CLI Entrypoint: `backend/cpp_core/src/main.cpp`
   - Native Modules: `backend/cpp_core/src/backtest/`, `backend/cpp_core/src/data/`, `backend/cpp_core/src/statistical_analysis/`, `backend/cpp_core/src/technical_indicators/`, `backend/cpp_core/src/machine_learning/`

4. **Execution Gateway (`backend/execution/`):**
   - Cycle Engine: `backend/execution/src/cycle.ts`
   - Paper Ledger: `backend/execution/src/paper_ledger.js`
   - State Persistence: `backend/execution/src/bot_state.ts`
   - Broker Adapters: `backend/execution/src/adapters/` (`alpaca_adapter.ts`, `gate_io_adapter.ts`, `polymarket_adapter.ts`, `mt5_adapter.ts`, `simulation_adapter.ts`)
   - Native MT5 Bridge: `tools/mt5/SovereignTradeBridge.mq5` (MQL5 EA TCP client), `shared/lib/runtime/mt5_magic_codec.js` (64-bit ORDER_MAGIC attribution)

5. **MCP Tool Server (`backend/mcp_server/`):**
   - Source: `backend/mcp_server/index.ts`
   - Stdio Launcher: `tools/mcp/mcp_stdio_probe.js`

## Code Atlas Cross-References

- Topology: Retrieval & Command Flow — [`atlas.topology.documentation.retrieval-flow`](../../atlas/topology/documentation/retrieval-flow.md)
- Terminal Dashboard Interface — [`docs/sections/interface/terminal-dashboard/README.md`](../interface/terminal-dashboard/README.md)
- Bot Execution Cycle — [`docs/sections/execution/polymarket-bot-cycle/README.md`](../execution/polymarket-bot-cycle/README.md)
