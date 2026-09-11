# Next Session Goal

## Primary Objective: Remote Proxmox VM Soak Deployment & Live Paper Verification

1. **Remote Proxmox VM (`hpdesk-1`) Soak Deployment & Synchronization**:
   - Synchronize remediated codebase to remote soak VM: `rsync -avz --delete --exclude 'node_modules' --exclude '.git' --exclude 'build' ./ hpdesk:~/personal_finance_draft/`.
   - Rebuild native core C++ binaries on target host: `npm run native:build`.
   - Deploy full Docker Compose stack on Proxmox host (`infra/docker/docker-compose.yml`) with verified cgroup resource constraints.

2. **Live Paper Trading Loop Verification**:
   - Verify `sv-bot-alpaca-paper` loop stability over multi-hour operational cycle.
   - Assert fractional unit sizing dispatch (`0.001` equity, `0.0001` crypto) and deterministic order ID generation.
   - Verify zero-allocation streaming `BinaryTsMerger` performance under live ingestion.
   - Verify virtual sub-positions ledger (`storage/data/runtime/ledger/sub_positions.json`) attribution for overlapping symbol positions.

3. **Polymarket Paper Resolution & Settlement Engine Soak**:
   - Exercise Gamma orderbook ingestion and paper position matching.
   - Verify corrected NO token settlement payout logic on resolved market events.

4. **Web & Terminal UI Operational Monitoring**:
   - Monitor real-time telemetry on Ink v7 TUI dashboard (`npm run tui`) and React 19 web dashboard (`Frontend/dashboard`).
   - Confirm zero-flicker DEC Mode 2026 synchronized rendering during live updates.
