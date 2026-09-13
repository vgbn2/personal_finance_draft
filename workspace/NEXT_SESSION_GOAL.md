# Next Session Goal

## Primary Objective: Remote Proxmox VM (`hpdesk-1`) Deployment & Soak Verification

1. **Remote Proxmox VM (`hpdesk-1`) Deployment & Soak Verification**:
   - Synchronize working branch `feat/diataxis-docs-overhaul-and-social-alpha` to `hpdesk-1`.
   - Test headless Wine64 MT5 container startup with Xvfb :99 under `docker compose --profile paper-mt5 up -d`.
   - Monitor live cgroup memory stability and verify daemon heap remains strictly bounded within the 2560MB quota.
   - Run 24h soak cycle and monitor `flaw_monitor.log` for zero error regressions.

2. **Social Alpha Future Experimental Optimizations**:
   - Monitor dataset volume and performance in offline replay.
   - Evaluate indexing/caching strategies if historical transcript volumes expand.
