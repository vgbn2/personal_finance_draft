# Next Session Goal

## Primary Objective: Deep Review with Empirical Evidence & Remote Soak Deployment

1. **Deep Review & Evidence-First Verification (Zero False-Positive Gate)**:
   - Perform comprehensive deep review across all newly deployed Diátaxis documentation quadrants (`tutorials/`, `how_to/`, `reference/`, `explanation/`).
   - Run adversarial link validation and verify every code symbol and route referenced in `reference/api/web_rest_and_websocket_api.md` matches active handlers in `backend/api/app.js` and `backend/gateway/src/`.
   - Re-verify zero broken links, zero uncataloged docs, and zero drift via `npm run audit:documentation` and `node scripts/dev/filter_docs.js --strict`.

2. **Social Alpha Signal Test Fixtures & Offline Replay**:
   - Create deterministic test fixtures in `tests/fixtures/social/` with recorded YouTube subtitles, cashtags, and financial RSS posts.
   - Implement offline fixture replay validation for sentiment scoring and half-life decay math.
   - Verify isolated research boundaries remain decoupled from production broker execution.

3. **Remote Proxmox VM (`hpdesk-1`) Deployment & Soak Verification**:
   - Synchronize working branch to `hpdesk-1`.
   - Test headless Wine64 MT5 container startup with Xvfb :99 under `docker compose --profile paper-mt5 up -d`.
   - Monitor live cgroup memory stability and verify daemon heap remains strictly bounded within the 2560MB quota.
