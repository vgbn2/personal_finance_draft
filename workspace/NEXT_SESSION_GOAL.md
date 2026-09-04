# Next Session Goal

## Primary Objective: Rsync Discovered Strategy YAMLs from HPDesk, Walk-Forward Validation & Paper Soak

1. **Rsync HPDesk Discovered Strategies & State**:
   - Pull generated strategy registry YAML files from `root@100.79.196.24:/home/vgbn-server/Documents/codeptit/personal_finance_draft/config/strategies/` to local `config/strategies/`.
   - Pull discovery state `storage/data/strategy_explorer_state.json` and logs `storage/logs/auto_strategy_explorer.log` from HPDesk.
   - Inspect newly discovered candidates across the 15-minute intervals.

2. **Automated Strategy Candidate Evaluation & Walk-Forward Testing**:
   - Run walk-forward backtesting using `sovereign bt` over the newly synced YAML candidates using the native C++ Sovereign Core engine.
   - Evaluate top performers for promotion to paper trading.

3. **HPDesk Live Paper Soak Monitoring**:
   - Continue monitoring `sv-bot-alpaca-paper` container and `storage/logs/flaw_monitor.log` on `hpdesk` (`root@100.79.196.24`).
   - Monitor active paper trading positions and verify fractional trade execution integrity.

4. **Sub-Position Virtual Ledger Attribution**:
   - Verify strategy-level P&L tracking in `storage/data/runtime/ledger/sub_positions.json` vs. broker physical holdings across multi-day cycles.


