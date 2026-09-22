# Sovereign All-in-One Docker Deployment, Security Isolation & TUI Runbook

This guide covers the deployment, secret isolation architecture, interactive Ink Terminal UI (TUI) container access, and secondary test instance setup for the **Sovereign Trading Platform** All-in-One container (`ghcr.io/vgbn2/personal_finance:latest`).

---

## 1. Interactive Ink TUI Access Inside Docker

The Sovereign Terminal UI (`backend/cli/sovereign_dashboard.mjs`) is an interactive **React 19 + Ink** terminal application. When running inside Docker, it is fully accessible with interactive keyboard navigation, real-time live streaming output, and ANSI color rendering via Docker's pseudo-TTY.

### Direct TUI Session Launch

```bash
# Attach directly to the interactive Ink TUI dashboard inside the container:
docker exec -it sv-allinone node backend/cli/sovereign_dashboard.mjs
```

### How It Works Under the Hood
- **`-i` (`--interactive`)**: Keeps standard input (`stdin`) open to your local keyboard.
- **`-t` (`--tty`)**: Allocates a pseudo-TTY (`pty`), passing terminal window dimensions, ANSI escape sequences (`\x1b[2J\x1b[H`), arrow keys, Tab, Enter, and mouse events directly into Ink's virtual DOM.
- **In-Pane Process Execution**: When running commands inside the TUI (such as `sovereign watch`, backtests, or market data ingestion), child processes stream live stdout chunks directly to your terminal without locking up keyboard navigation.

### Direct CLI Commands via Docker

You can also run any CLI command directly inside the running container:

```bash
# View multi-broker status, balances, and system doctor diagnostics:
docker exec -it sv-allinone node backend/cli/sovereign_cli.js status

# Start live multi-family streaming quotes:
docker exec -it sv-allinone node backend/cli/sovereign_cli.js watch

# Run strategy backtest:
docker exec -it sv-allinone node backend/cli/sovereign_cli.js bt --strategy low_prob_dip --symbol EURUSD --timeframe 1d
```

---

## 2. Strict Environment Variable & Secret Isolation

To guarantee that **no credentials or API keys ever leak into Docker images or build layers**:

### Air-Gapped Image Build
- `.dockerignore` strictly excludes all `.env`, `.env.*`, `*.pem`, `*.key`, and test credential files from the Docker build context.
- The image published on `ghcr.io` contains **zero secrets** and runs keyless by default.

### Host-Level Secret Injection
All secrets reside exclusively on the host filesystem at `/etc/sovereign/sovereign.env`:
- **Owner**: `root:root`
- **POSIX Permissions**: `0600` (`-rw-------`). No group read, no world read.
- **Enforcement**: The deployment script (`scripts/deploy/deploy_proxmox.sh`) verifies the octal file permissions before starting the container. If permissions allow world/group access, deployment aborts immediately.

### Production Environment Variables Template

Create `/etc/sovereign/sovereign.env` on your Proxmox VM:

```bash
# Platform Token Authorization
SOVEREIGN_API_TOKEN=3f9a8b1c0e2d4f6a8b0c2e4d6f8a0b2c
SOVEREIGN_SESSION_SECRET=e7b4a2f1c8d9e0b3a5c7f9d1e3b5a7c9

# Alpaca Paper / Live Configuration
ALPACA_PAPER_API_KEY=PKXXXXXXXXXXXXXXXXXX
ALPACA_PAPER_SECRET_KEY=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
ALPACA_PAPER_BASE_URL=https://paper-api.alpaca.markets

# Gate.io Credentials
GATEIO_API_KEY=
GATEIO_API_SECRET=

# Polymarket Credentials
POLYMARKET_API_KEY=
POLYMARKET_API_SECRET=
POLYMARKET_API_PASSPHRASE=
POLYMARKET_PRIVATE_KEY=

# MetaTrader 5 Credentials (Optional)
MT5_LOGIN=
MT5_PASSWORD=
MT5_SERVER=

# Live Execution Protection Guard (Must remain false until operator authorization)
LIVE_TRADING=false
SOVEREIGN_EXECUTION_AUTHORIZED=false
SOVEREIGN_TRADE_PIN=
```

Enforce permissions:
```bash
sudo chmod 0600 /etc/sovereign/sovereign.env
sudo chown root:root /etc/sovereign/sovereign.env
```

### Zero-Key Fallback Invariant
If `/etc/sovereign/sovereign.env` is missing or keys are empty:
1. The platform initializes cleanly in **zero-key simulation mode**.
2. Trades route strictly to the internal virtual double-entry paper ledger (`$100`).
3. Public data feeds (Binance, Yahoo Finance) ingest freely without requiring API keys.
4. The Web API boots on port 8787 and `/health` returns HTTP 200 `{ "ok": true }`.

---

## 3. Running a Secondary Test Instance (`sv-wealth-test`)

To test new images, security boundaries, and fail-closed protections without risking production state or ports, spin up a secondary isolated instance:

```bash
# Launch secondary test container on port 8788 with dedicated isolated storage:
docker run -d --name sv-wealth-test \
  -p 127.0.0.1:8788:8787 \
  -e NODE_ENV=production \
  -e SOVEREIGN_RUNTIME_MODE=test-isolated \
  -e LIVE_TRADING=false \
  -e SOVEREIGN_EXECUTION_AUTHORIZED=false \
  -v $(pwd)/storage-test:/app/storage \
  ghcr.io/vgbn2/personal_finance:latest
```

### Security & Penetration Verification Checks

1. **Verify Private Loopback Health**:
   ```bash
   curl -i http://127.0.0.1:8788/health
   # Expected: HTTP/1.1 200 OK {"ok":true,"service":"sovereign-web"}
   ```

2. **Verify Unauthorized Route Rejection (401 / 403)**:
   ```bash
   curl -i -X POST http://127.0.0.1:8788/api/bot/cycle/execute
   # Expected: 401 Unauthorized / 403 Forbidden
   ```

3. **Verify Interactive TUI Inside Test Instance**:
   ```bash
   docker exec -it sv-wealth-test node backend/cli/sovereign_dashboard.mjs
   ```

4. **Verify Storage Sandboxing**:
   - Confirm that all test operations write strictly to `storage-test/` and never touch production `storage/`.

5. **Clean Up Test Instance**:
   ```bash
   docker stop sv-wealth-test && docker rm sv-wealth-test
   ```

---

## 4. Proxmox VM Deployment Runbook

### Host Directory Layout
```text
/opt/sovereign/
├── docker-compose.allinone.yml  # Docker Compose definition
├── scripts/
│   └── deploy.sh               # Single-command update & rollback script
├── storage/                    # Persistent application state (ts binary files, sqlite)
└── backups/                    # Automated pre-deployment archives (14-run retention)

/etc/sovereign/
└── sovereign.env               # Host secrets file (0600 root:root)
```

### Single-Command Deployment

Run the deployment script on the host:
```bash
/opt/sovereign/scripts/deploy.sh latest
```

### What the Deployment Pipeline Does:
1. **Acquires Mutex Lock** (`/var/lock/sovereign-deploy.lock`) to prevent concurrent runs.
2. **Probes File Permissions** on `/etc/sovereign/sovereign.env` (`0600`/`0400`).
3. **Creates Pre-Deploy Storage Snapshot** (`/opt/sovereign/backups/storage_backup_<timestamp>.tar.gz`).
4. **Pulls Latest Image** from GitHub Container Registry (`ghcr.io/vgbn2/personal_finance:latest`).
5. **Performs Staged Cutover** (`docker compose up -d --no-build --force-recreate`).
6. **Active Healthcheck Polling** (polls `http://127.0.0.1:8787/health` up to 15 attempts).
7. **Automatic Fail-Closed Rollback**: If healthcheck fails, automatically rolls back to the previous container image and restores the storage snapshot if needed.
8. **Records Deployment Evidence** to `/opt/sovereign/deployment_evidence.json`.

---

## 5. Summary of Ports & Network Exposure

| Port | Service | Access Policy |
|---|---|---|
| `8787` | Express API & React Dashboard | Loopback only (`127.0.0.1:8787`). Access via Tailscale / SSH Tunnel. |
| `8282` | MetaTrader 5 Reverse TCP Bridge | Internal loopback only (`127.0.0.1:8282`). Never expose to public internet. |
| `8788` | Secondary Test Instance (`sv-wealth-test`) | Ephemeral testing port. |
