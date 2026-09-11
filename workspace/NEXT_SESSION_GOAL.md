# Next Session Goal

## Primary Objective: Documentation Overhaul (Diátaxis & API References) & Social Alpha Signal Architecture

1. **Documentation Overhaul & Information Architecture Migration**:
   - Apply the Diátaxis 4-quadrant layout (`tutorials/`, `how_to/`, `reference/`, `explanation/`) inspired by Alpaca and Polymarket developer portals.
   - Refactor API and Wire Protocol documentation into card-based layouts with status-code tabs, language switchers (`content.tabs.link` across Node.js, C++20, CLI), parameter tables, and explicit rate limit / SLA guarantees.
   - Implement `llms.txt` and `.md` direct link indexes for LLM accessibility matching Alpaca and Polymarket best practices.
   - Ensure 100% compliance with `npm run audit:documentation` and `npm run docs:filter -- --strict`.

2. **Social Media & YouTube Trade Signal Stub (Research & Specification)**:
   - Deepen the newly documented `docs/research/social_signals_pipeline.md` specification.
   - Design test fixtures in `tests/fixtures/social/` with recorded transcripts and simulated creator signals for offline walk-forward validation.
   - Specify the Bayesian reputation scoring formula and anti-shill liquidity filters.
   - Prepare architectural review before considering any implementation code.

3. **Remote Proxmox VM (`hpdesk-1`) Deployment & Soak Verification**:
   - Synchronize new MT5 implementation (`sv-mt5` container, `Mt5Adapter`, `SovereignTradeBridge.mq5`, CLI commands) to `hpdesk-1`.
   - Launch `docker compose --profile paper-mt5 up -d` to verify headless MT5 container startup with Xvfb :99 and Wine64.
   - Inspect multi-hour soak metrics on running containers (`sv-web`, `sv-bot-alpaca-paper`, `sv-strategy-explorer`, `sv-bot-1`).
   - Verify cgroup memory stability (confirm heap usage remains strictly bounded within the 2560MB quota).
