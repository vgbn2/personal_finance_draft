# Next Session Goal

## Primary Objective: Full Test Suite Regression Gate & Remote Soak Verification

1. **Full Test Suite & Quality Gate Execution**:
   - Run full test suite (`npm test`, `npm run hygiene`, `npm run audit:documentation`, `npm run test:structure`) once sandbox environment classifier is available.
   - Verify all 10 responsive viewport tests pass in `Frontend/dashboard/`.

2. **Social Alpha Signal Test Fixtures & Offline Replay**:
   - Create deterministic test fixtures in `tests/fixtures/social/` with recorded YouTube subtitles, cashtags, and financial RSS posts.
   - Implement offline fixture replay validation for sentiment scoring and half-life decay math.
   - Verify isolated research boundaries remain decoupled from production broker execution.

3. **Remote Proxmox VM (`hpdesk-1`) Deployment & Soak Verification**:
   - Synchronize working branch to `hpdesk-1`.
   - Test headless Wine64 MT5 container startup with Xvfb :99 under `docker compose --profile paper-mt5 up -d`.
   - Monitor live cgroup memory stability and verify daemon heap remains strictly bounded within the 2560MB quota.
