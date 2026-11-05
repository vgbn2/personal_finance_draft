# Proxmox LXC Container Deployment & Automation Guide

This guide provides step-by-step instructions for provisioning and operating the Sovereign Trading Platform inside an unprivileged **Proxmox VE LXC container**.

---

## 1. Hardware & Sizing Specifications

| Resource | Recommended Baseline | Minimal Headless | High-Throughput / Backfill |
| :--- | :--- | :--- | :--- |
| **RAM** | **6 GB (6144 MB)** | 4 GB (4096 MB) | 8–16 GB |
| **Swap** | **2 GB (2048 MB)** | 2 GB | 4 GB |
| **Storage** | **40 GB SSD / NVMe** | 25 GB | 80 GB+ |
| **CPU** | **4 vCPUs (x86_64)** | 2 vCPUs | 8 vCPUs (AVX2/SSE4.2 enabled) |
| **OS Template**| **Debian 12 / Ubuntu 24** | Debian 12 Minimal | Debian 12 Standard |
| **Network** | **vmbr0 (Bridge / DHCP)**| Static IP / Private LAN | Dedicated 1GbE/10GbE Bridge |

---

## 2. Automated Provisioning via Script

From the Proxmox VE root shell:

```bash
# 1. Download or copy provision_lxc.sh to the Proxmox host
curl -fsSL https://raw.githubusercontent.com/.../infra/lxc/provision_lxc.sh -o provision_lxc.sh
chmod +x provision_lxc.sh

# 2. (Optional) Customize environment variables
export CTID=108
export CT_NAME="sovereign-trading"
export MEMORY=6144
export CORES=4
export DISK_SIZE=40G
export STORAGE="local-lvm"

# 3. Dry-run verification
DRY_RUN=1 ./provision_lxc.sh

# 4. Execute provisioning
./provision_lxc.sh
```

---

## 3. Manual Provisioning Command Reference

If you prefer using `pct` commands directly, first check `pct list`, `qm list`, `pvesm status`, and `pveam list local`. Choose an unused guest ID and an installed Debian 12 template; `108` and the template filename below are examples, not reserved values. Four vCPUs share host capacity. For thin storage, check physical pool usage and aggregate virtual commitments before allocating the disk.

```bash
pct create 108 local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst \
  --hostname sovereign-trading \
  --memory 6144 \
  --swap 2048 \
  --cores 4 \
  --ostype debian \
  --rootfs local-lvm:40 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --nameserver 1.1.1.1 \
  --unprivileged 1 \
  --features nesting=1,keyctl=1 \
  --onboot 1

# Start container
pct start 108
```

---

## 4. Container Initial Setup & Runtime Verification

A manually created Debian template has neither the service user nor the development prerequisites. Run this bootstrap as **root inside the new container**; replace `108` with the ID you created. The automated provisioning script already performs the equivalent user/toolchain bootstrap.

```bash
# On the Proxmox host
pct enter 108

# Inside the container as root; stop on the first failed command
set -eu
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y curl git ca-certificates gnupg build-essential cmake

# Node.js 22, matching infra/lxc/provision_lxc.sh.
# Save the installer first so a failed download cannot be hidden by a pipe.
curl -fsSL https://deb.nodesource.com/setup_22.x -o /dev/shm/sovereign-node-setup.sh
bash /dev/shm/sovereign-node-setup.sh
rm /dev/shm/sovereign-node-setup.sh
apt-get install -y nodejs

useradd --create-home --shell /bin/bash --uid 1000 --user-group sovereign
id sovereign
node --version
npm --version
cmake --version
g++ --version
```

Do not rerun `useradd` if an earlier run created the account; verify its UID, group and home instead. The development user does not need passwordless sudo. Nesting/keyctl enable Docker-in-LXC prerequisites, but do **not** install or verify Docker; this native development path does not require it.

Continue as the non-root service user:

```bash
su - sovereign

# Clone clean source; record the actual revision and keep credentials out of URLs.
git clone https://github.com/vgbn2/personal_finance_draft.git sovereign
cd sovereign
git rev-parse HEAD
git status --short

# Run automated dev & test setup
npm run setup:dev

# Verify native C++ core analytics & test suite
npm run test:core

# Run test pyramid validation
npm run test:tier1
npm run test:tier2
npm run test:tier3
npm run test:cluster
```

### Managed Go and generated test prerequisites

`npm run setup:dev` reuses a compatible Go on `PATH` or installs a stable official Go archive satisfying `backend/go/go.mod` (currently Go 1.24+) beneath `~/.local/share/sovereign/go/`. Managed installation supports Linux/macOS amd64/arm64, requires `tar`, fetches release metadata from `https://go.dev/dl/?mode=json`, and checks the archive SHA-256 before extraction into a fresh directory. It never overwrites an existing Go tree, changes shell profiles, runs sudo, or installs OS packages. Other platforms must provide compatible Go on `PATH`. Offline setup requires an existing compatible PATH or managed toolchain; first installation requires HTTPS access to Go downloads. Concurrent first installs are not supported; rerun setup after the other installer completes.

Setup now builds gateway, MCP and dashboard outputs before its existing verification gates. The Node test runner resolves the cached Go toolchain for the parity test without downloading during tests; direct `go` commands still require its `bin` directory on your shell's `PATH`. A successful setup gate is not a full aggregate pass. Verify separately:

```bash
node --test tests/scripts/architecture/cli/core/setup_prerequisites.test.js
node tests/run_node_tests.js tests/scripts/integration/go_parity_sovt.test.js
npm test
```

Root cause: setup previously omitted MCP/dashboard builds, and the native-only bootstrap did not supply the Go executable needed by the aggregate parity test. This produced two dashboard HTTP404 assertions, two MCP module-load failures, and one Go process-start failure on CT100. Those historical failures remain recorded. On 2026-11-05 the explicitly patched existing CT100 passed non-root setup (including native 35/35), focused checks 42/42 and the Node aggregate (1,646 pass, zero fail, eight skip). This is guest patched-checkout proof, not unchanged public-source or empty-state installation qualification; exact revision, hashes and limitations are in `workspace/handoff/2026/11/2026-11-05-onboarding-prerequisites.md`.

### Debian 12 native-build compatibility

GCC 12.2 can reject assignment to the grid-optimizer fixture's short string under Release `-O3 -Werror=maybe-uninitialized`. The fixture now directly constructs its string members using C++20 designated initialization, retaining the same data and assertions. Do not disable warnings, skip the target, or substitute Debug as an installation workaround. Check with `bash tests/repro/repro_20261104_233928_gcc12_grid_optimizer_release.sh`, then run the native and acceptance commands above. A patched-checkout pass does not establish that an older public revision installs unchanged.

---

## 5. Security & Isolation Invariants

- **Unprivileged Isolation**: The container runs in unprivileged user namespace (`--unprivileged 1`) where root in the container maps to an unprivileged UID on the host (UID 100000+).
- **Service Account**: Application processes run strictly as `sovereign:sovereign` (UID 1000:1000).
- **Network Boundaries**: The manual native setup does not configure UFW or publish application ports. Keep the API bound to `127.0.0.1` (default port `8787`) and use a private SSH tunnel for access; changing a port alone does not provide access control. Host/CT ingress policy and SSH access require separate verification. Do not expose the API publicly without authenticated ingress.
- **Persistent Data**: Binary TS indices (`storage/data/ts/`) and SQLite state persist safely on the container's 40GB rootfs.
