# Next Session Goal

## Primary Objective: Review Flaw Monitor Findings & Optimize High-Notional Sizing
1. **Flaw Monitor Log Inspection**:
   - Inspect `/home/vgbn-server/Documents/codeptit/personal_finance_draft/storage/logs/flaw_monitor.log` on `hpdesk` (`vgbn-server@100.122.7.7`).
   - Review any captured anomalies, rate limit spikes, unhandled rejections, dead-stub streaks, or broker API rejection codes.
2. **Fractional Sizing & Multi-Asset Alignment**:
   - Enable fractional unit contracts (`quantityStep: 0.001` or `0.01`) for equities/crypto where broker supports fractional shares, allowing sub-$100 allocations to execute on SPY/QQQ/BTC.
   - Filter out assets not supported on Alpaca Paper (e.g. non-tradable crypto pairs like NEAR/USD) from the Alpaca paper bot universe.
3. **Continuous Performance & Risk Soak**:
   - Monitor real-time sub-position accounting in `storage/data/runtime/ledger/sub_positions.json` and verify P&L tracking across running bot cycles.
