# Next Session Goal

## Primary Objective: HPDesk Boot & Live Soak Verification
1. **HPDesk Reconnect & Verification**:
   - Reconnect to `hpdesk` (`vgbn-server@100.122.7.7`) upon machine power-on.
   - Verify `sv-bot-alpaca-paper` continuous execution container status and check Docker log streams.
2. **Strategy Fast-Path & Ledger Sync**:
   - Verify that fast-path signal derivation and the updated `DEFAULT_LEDGER_PATH` in `shared/lib/runtime/sub_positions_ledger.js` are synchronized to `hpdesk`.
3. **Execution Soak Monitoring**:
   - Monitor real paper order submissions, position attribution ledger updates, and 120-bar dead-stub silence tracking.
