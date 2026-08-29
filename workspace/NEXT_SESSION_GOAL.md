# Next Session Goal

## Primary Objective: Multi-Day Soak Monitoring, Ingestion Backfill & Refactoring Priorities

1. **HPDesk Live Paper Soak Monitoring**:
   - Continue monitoring `sv-bot-alpaca-paper` container and `storage/logs/flaw_monitor.log` on `hpdesk` (`root@100.122.7.7`).
   - Monitor 7 active positions ($97,755 equity, ~$5,119 position market value): `PLTR` (+40.27%), `AAPL` (+3.74%), `SPY`, `QQQ`, `BTCUSD`, `TSLA`, `INTC`.
   - Verify take-profit / stop-loss exits when equity markets reopen on Monday.

2. **Scaffold & Modular Refactoring Execution**:
   - `personal_finance` repository scaffold initialized, committed (`22cf574`), and pushed to `origin/master`.
   - Next refactoring targets identified:
     - **Backend Gateway & Alpaca SDK Bridge**: Resolve constructor instantiation in `backend/gateway/src/index.ts` to support CLI `portfolio status`.
     - **Binary Time-Series Seeding**: Backfill missing lookback history for `VCB`, `FPT`, `HPG` (Vietnamese equities) and `TAOUSDT`, `SOLUSDT` to satisfy the 21-bar indicator lookback.
     - **Polymarket DCA Test**: Re-align market token IDs to clear `DEAD_STUB` warning.

3. **Sub-Position Virtual Ledger Attribution**:
   - Verify strategy-level P&L tracking in `storage/data/runtime/ledger/sub_positions.json` vs. broker physical holdings across multi-day cycles.
