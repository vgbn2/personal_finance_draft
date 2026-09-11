# Next Session Goal

## Primary Objective: MetaTrader 5 (MT5) Trade Execution Engine & Stub Integration

1. **MetaTrader 5 (MT5) Trade Integration & Execution Engine**:
   - Execute the architectural roadmap defined in `workspace/plans/MT5_INTEGRATION_AND_EXECUTION_STUB_PLAN.md`.
   - **Phase 1: Gateway Adapter & Contracts**: Implement `backend/gateway/src/adapters/mt5_adapter.ts` implementing `BrokerAdapter` interface, export in `adapters/index.ts`, and wire `broker === 'mt5'` in gateway dispatch.
   - **Phase 2: MQL5 Order Bridge EA**: Author `tools/mt5/SovereignTradeBridge.mq5` TCP server bridge (port 8282) supporting `ORDER_SUBMIT`, `POSITIONS_GET`, and atomic file mailbox fallback.
   - **Phase 3: CLI & Sub-Positions Wiring**: Expand `backend/cli/commands/trade/trade_mt5.js` with `buy`, `sell`, `positions`, and link fills to `shared/lib/risk/sub_positions_ledger.js` using MT5 magic numbers.
   - **Phase 4: Keyless Testing & Verification**: Create mock TCP server fixture and verify 100% test pass rate in `tests/scripts/operational/mt5_adapter.test.js`.

2. **Remote Proxmox VM (`hpdesk-1`) Operational Monitoring & Soak Telemetry**:
   - Inspect multi-hour soak metrics on running containers (`sv-web`, `sv-bot-alpaca-paper`, `sv-strategy-explorer`, etc.).
   - Verify cgroup memory stability (confirm heap usage remains strictly bounded within the 2560MB quota).
   - Review log health and error rates across all background daemons.

3. **Autonomous AI Strategy Explorer & ML Model Convergence**:
   - Evaluate newly generated strategy candidates in `config/strategies/automated/`.
   - Run walk-forward optimization passes and examine Sharpe/Sortino distribution across asset classes.
