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

If you prefer using `pct` commands directly:

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

Enter the container as the non-root `sovereign` user:

```bash
# Enter container shell
pct enter 108

# Switch to unprivileged service user
su - sovereign

# Clone and setup workspace
git clone <your-repository-url> sovereign
cd sovereign

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

---

## 5. Security & Isolation Invariants

- **Unprivileged Isolation**: The container runs in unprivileged user namespace (`--unprivileged 1`) where root in the container maps to an unprivileged UID on the host (UID 100000+).
- **Service Account**: Application processes run strictly as `sovereign:sovereign` (UID 1000:1000).
- **Network Boundaries**: Ingress is restricted via UFW to private management SSH (port 22) and local REST/WebSocket bridge (port 8787). The API is never exposed to public internet interfaces without reverse proxy authentication.
- **Persistent Data**: Binary TS indices (`storage/data/ts/`) and SQLite state persist safely on the container's 40GB rootfs.
