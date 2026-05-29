# Project State - Sovereign Trading Platform

## Current Phase
Phase 8: Production Hardening & Feature Polish

## Key Accomplishments
- **100% Core Integrity**: All 29/29 C++ core tests passing on Win32 MSVC 2026.
- **Strategy Automation**: Implemented `strategy run_automated` loop with live trade integration, dynamic position sizing, and **verified deduplication** via persistent `EXECUTION_MEMORY`.
- **Dynamic Position Sizing Active**: Replaced hardcoded quantities with a risk-based sizing engine. The automation loop now fetches real-time Alpaca balances and calculates order size using strategy `risk_weight` and instrument price.
- **Execution Guard Hardened**: Migrated `EXECUTION_MEMORY` from a volatile Set to a persistent JSON-backed utility (`shared/lib/execution_memory.js`). The platform now survives restarts without re-executing duplicate signals. (Waterproof)
- **Architectural Seam Fix**: Standardized binary and tool discovery via `shared/lib/paths.js`. Eliminated machine-local hardcoded paths for MSYS64 and MetaTrader 5, moving them to a centralized `config/tools.yaml`.
- **Unattended Security Gate**: Enhanced `trade` command with support for `--pin` flag and automated Fail-Closed logic when `SOVEREIGN_TRADE_PIN` is missing in non-interactive environments.
- **Sovereign MCP Server**: TypeScript-based MCP server providing structured agent access to the CLI.
- **Enhanced Dashboard**: Complete with Overview, Signal, Market Intel, Backtest, Telemetry, Quote Health, and Audit Log panels.
- **Verified Execution**: Confirmed end-to-end order flow (Risk Engine -> Gateway -> Alpaca -> Supabase) with live production keys loaded via `dotenv`.
- **Real-Time Data**: React UI successfully transitioned to real-time streaming market data and telemetry via `socket.io`.
- **CLI UX Enhancements**: Added TUI symbol categorization by asset family and `promptMultiSelect` for batch strategy toggling.
- **Retrained ML Models**: Adapted production heuristic models to use the centralized indicator mappings (e.g. `return_fast`, `return_slow`) and successfully rebuilt the model comparison matrix.

## Remaining Gaps
- [ ] Automated trading & cloud hosting (Linux/Cloud).
- [ ] Portfolio tracking: Finalize the sum of all live brokers (Alpaca, etc.).
- [ ] Prediction market trading: Track portfolio of market-making keys.

## Technical Details
- **Backend**: C++ Core (MSVC), Node.js API, Socket.io Telemetry/Streaming.
- **Frontend**: React (Vite), Tailwind CSS, Lucide Icons, Socket.io-client.
- **Persistence**: Supabase (PostgreSQL + Realtime).
- **Broker**: Alpaca (SDK Integrated, Production Ready).

# dev suggest:*do not delete
- [x] switchin strategies use config files for automating purpose
- [x] anti crash methods
- [x] better user experience, more TUI like, suggestion when choosing sth...
- [x] better UI, more visualy attractive, std deviation visualization
- [x] incorparate quantitative measure from previous project (Kalman filter)
- [x] options trading intergration (G/T/V)
- [ ] prediction market trading using keys, tracks the portfolio of it
- [ ] automated tradin, sever hosting via linux, cloud etc
- [x] for portfolio tracking:,use every live broker's portfolio and then sum it
- [x] backtesting optimization: overfit detection and OOS validation
- [x] collect major quotes data,economic data lookback to 20 years
