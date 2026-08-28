# Next Session Goal

## Primary Objective: Multi-Day Soak Monitoring & Intraday Position Reconciliation
1. **Flaw Monitor & Bot Performance Soak**:
   - Inspect `/home/vgbn-server/Documents/codeptit/personal_finance_draft/storage/logs/flaw_monitor.log` on `hpdesk` (`vgbn-server@100.122.7.7`).
   - Monitor live fill rates, position lifecycle (entries -> exits), and slippage for newly dispatched fractional orders (BTC/USD, SPY, QQQ).
2. **Sub-Position Virtual Ledger Attribution**:
   - Monitor real-time sub-position accounting in `storage/data/runtime/ledger/sub_positions.json` on `hpdesk`.
   - Verify strategy-level P&L tracking vs. broker physical holdings across multi-day cycles.
3. **UI / Dashboard Performance Sync**:
   - Ensure Frontend dashboard displays fractional quantities correctly in active positions and order history views.
