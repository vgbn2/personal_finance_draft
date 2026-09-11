# Next Session Goal

## Primary Objective: Live Paper Trading Verification & Soak Operation

1. **Remote Proxmox VM (`hpdesk-1`) Soak Deployment & Synchronization** (COMPLETED):
   - [x] Synchronized remediated codebase to remote soak VM (`hpdesk-1:/home/vgbn-server/Documents/codeptit/personal_finance_draft/`).
   - [x] Rebuilt Docker image `personal_finance:latest` on target host with native C++20 core binaries (`sovereign_wealth`, `sovereign_core`) and Vite frontend.
   - [x] Deployed full Docker Compose stack on Proxmox host (`infra/docker/docker-compose.yml`) across all 9 services (`sv-web` healthy).

2. **GitHub Pages Source Setting**:
   - [ ] Switch GitHub Pages Source to "GitHub Actions" at `https://github.com/vgbn2/personal_finance_draft/settings/pages` so Jekyll does not race and overwrite MkDocs builds.

3. **Live Paper Trading Loop Verification**:
   - Verify `sv-bot-alpaca-paper` loop stability over multi-hour operational cycle.
   - Assert fractional unit sizing dispatch (`0.001` equity, `0.0001` crypto) and deterministic order ID generation.
   - Verify zero-allocation streaming `BinaryTsMerger` performance under live ingestion.
   - Verify virtual sub-positions ledger (`storage/data/runtime/ledger/sub_positions.json`) attribution for overlapping symbol positions.

4. **Polymarket Paper Resolution & Settlement Engine Soak**:
   - Exercise Gamma orderbook ingestion and paper position matching.
   - Verify corrected NO token settlement payout logic on resolved market events.

5. **Web & Terminal UI Operational Monitoring**:
   - Monitor real-time telemetry on Ink v7 TUI dashboard (`npm run tui`) and React 19 web dashboard (`Frontend/dashboard`).
   - Confirm zero-flicker DEC Mode 2026 synchronized rendering during live updates.
