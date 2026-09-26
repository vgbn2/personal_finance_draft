# Sovereign All-in-One Docker Deployment, Security Isolation & TUI Runbook

This guide covers the deployment, secret isolation architecture, interactive Ink Terminal UI (TUI) container access, and secondary test instance setup for the **Sovereign Trading Platform** All-in-One container (`ghcr.io/vgbn2/personal_finance_draft:latest`).

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

## 2. Hardware Sizing & System Resource Allocation

Sovereign is engineered for high performance with minimal overhead on commodity x86_64 hardware, Proxmox LXC containers, Proxmox VMs, and bare-metal cloud instances.

### OS-Agnostic Host & Proxmox LXC Support

Since Sovereign runs fully containerized via Docker and OCI images, **Ubuntu is NOT a requirement**. Any Linux distribution supporting Docker 24+ and Compose can host Sovereign seamlessly:

- **Proxmox LXC Containers (Recommended)**: Extremely lightweight with near-zero hypervisor overhead. Can use any standard Linux template (Debian 12, Alpine, Ubuntu, Rocky Linux). Requires only enabling **Nesting** (`features: nesting=1,keyctl=1`) in Proxmox container options to run Docker Engine within the LXC.
- **Proxmox QEMU / KVM VMs**: Full hardware-isolated virtual machines.
- **Bare-Metal Linux Hosts**: Debian, Arch Linux, Fedora, Rocky Linux, Ubuntu, etc.
- **Local Workstations**: Linux or macOS running Docker Desktop, OrbStack, or Colima.

### Recommended Sizing Matrix

| Resource | Baseline (Standard Operations) | Minimal (Headless Web/Paper) | Performance / Multi-Strategy |
| :--- | :--- | :--- | :--- |
| **RAM** | **6 GB** | 4 GB | 8–16 GB |
| **Storage (SSD)** | **40 GB SSD (NVMe / SATA)** | 25 GB SSD | 100+ GB SSD (Tick history) |
| **CPU Cores** | **2–4 vCPU / Cores** | 2 Cores | 4–8 Cores |
| **Operating System** | **Any Linux with Docker** (Ubuntu not required) | Any Linux with Docker | Any Linux with Docker |
| **Architecture** | **x86_64 / amd64** (AVX2/SSE4.2) | x86_64 | x86_64 |

### Detailed Resource Breakdown

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        SOVEREIGN RESOURCE BUDGET ALLOCATION                            │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  RAM BUDGET: 6 GB Total                                                                │
│  ├── Host OS / LXC + Kernel & Buffer Cache:     ~1.0 GB - 1.5 GB                       │
│  ├── Node.js Web API + React Dashboard:         ~768 MB - 1024 MB (cgroups limit)      │
│  ├── Native C++20 Core & ONNX Runtime:          ~512 MB - 768 MB                       │
│  ├── Headless Wine 9 + MetaTrader 5 Bridge:     ~1024 MB - 1536 MB                     │
│  └── Ingestion & Backfill Scratchpad Buffer:    ~512 MB                                │
│                                                                                        │
│  STORAGE BUDGET: 40 GB SSD                                                             │
│  ├── Base Linux OS / LXC Rootfs:                ~4 GB - 8 GB                           │
│  ├── Docker Engine & Image Cache:               ~6 GB (Base layers + All-in-One image)  │
│  ├── Binary Time-Series Indices (storage/ts/):  ~12 GB (Multi-year 1m/5m/1d OHLCV bars)│
│  ├── Wine 9 Prefix & MT5 Terminal Data:         ~4 GB (/opt/mt5/.wine & indicators)    │
│  ├── SQLite Cache & ONNX Models:                ~3 GB (Indicators + ML weights)        │
│  └── Workspace, Logs & Atomic Scratchpad:       ~7 GB (Free operating buffer)          │
│                                                                                        │
│  CPU ALLOCATION: 2–4 Cores                                                             │
│  ├── Core 0: Linux Kernel, Network I/O, Node.js Event Loop & Express API               │
│  ├── Core 1: Native C++20 Analytics, Feature Engine & Binary TS Ingestion              │
│  ├── Core 2: Wine 9 / MT5 Terminal Process & Expert Advisor socket bridge              │
│  └── Core 3: Parallel CTest evaluation, ML inference & Monte Carlo simulation          │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Resource Tuning & Memory Optimization

- **Low-Memory Environments (4 GB RAM)**:
  When operating on 4 GB hosts without MetaTrader 5, run the standard `web` container instead of `allinone` (`docker compose up sv-web`). This reduces memory consumption to `< 1.2 GB` total.
- **Node.js Heap Clamping**:
  The Compose stack configures `NODE_OPTIONS=--max-old-space-size=1024` for web services and `--max-old-space-size=2560` for all-in-one containers, preventing V8 garbage collection spikes from exhausting host memory.
- **Fast NVMe / SSD Storage**:
  Sovereign's streaming binary TS merger (`sovereign::BinaryTsMerger`) performs sequential and indexed reads on 48-byte packed binary candle files (`storage/data/ts/*.bin`). An SSD ensures sub-millisecond seek times for multi-year backtests.

---

## 3. Strict Environment Variable & Secret Isolation

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

## 4. Proxmox LXC Container & VM Deployment Runbook

### Proxmox LXC Container Provisioning (Recommended)

When deploying on Proxmox VE, an **unprivileged LXC container** with Nesting is lighter, faster, and more memory-efficient than a full QEMU VM:

```bash
# Proxmox VE Node Shell: Create LXC container with 6GB RAM, 40GB Disk, 4 Cores, and Docker Nesting
pct create 120 local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst \
  --hostname sovereign-node \
  --cores 4 \
  --memory 6144 \
  --swap 2048 \
  --rootfs local-lvm:40 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp,firewall=1 \
  --features nesting=1,keyctl=1 \
  --unprivileged 1 \
  --onboot 1 \
  --start 1
```

*Note: The `--features nesting=1,keyctl=1` flag is essential for running Docker daemon inside LXC.*

### Host / Container Directory Layout
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

Run the deployment script inside the LXC container or host VM:
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
