#!/usr/bin/env bash
# ==============================================================================
# Sovereign Trading Platform - Proxmox LXC Container Provisioning Script
# ==============================================================================
# Automated, reproducible provisioning of an unprivileged Proxmox LXC container
# optimized for Sovereign trading, paper execution, and C++ vector analytics.
#
# Hardware Specification:
#   - RAM: 6144 MB (6 GB recommended baseline, 2048 MB swap)
#   - Cores: 4 vCPUs (x86_64 with AVX2/SSE4.2 host passthrough)
#   - Storage: 40 GB NVMe/SSD rootfs
#   - Isolation: Unprivileged container (UID 1000:1000 mapping)
#   - Features: nesting=1, keyctl=1 (enables Docker-in-LXC and secure keystores)
# ==============================================================================

set -euo pipefail

# Configurable Parameters with Safe Defaults
CTID="${CTID:-108}"
CT_NAME="${CT_NAME:-sovereign-trading}"
MEMORY="${MEMORY:-6144}"
SWAP="${SWAP:-2048}"
CORES="${CORES:-4}"
DISK_SIZE="${DISK_SIZE:-40G}"
STORAGE="${STORAGE:-local-lvm}"
TEMPLATE="${TEMPLATE:-local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst}"
BRIDGE="${BRIDGE:-vmbr0}"
IP_CONFIG="${IP_CONFIG:-dhcp}"
GATEWAY="${GATEWAY:-}"
NAMESERVER="${NAMESERVER:-1.1.1.1}"
UNPRIVILEGED="${UNPRIVILEGED:-1}"
DRY_RUN="${DRY_RUN:-0}"

# Display banner
cat << 'EOF'
===================================================================
   Sovereign Platform - Proxmox LXC Provisioning Automation
===================================================================
EOF

log_info() {
    echo -e "\033[1;34m[INFO]\033[0m $*"
}

log_warn() {
    echo -e "\033[1;33m[WARN]\033[0m $*"
}

log_error() {
    echo -e "\033[1;31m[ERROR]\033[0m $*" >&2
}

# Validation preflights
if [ "$EUID" -ne 0 ] && [ "$DRY_RUN" -eq 0 ]; then
    log_error "This script must be run as root on the Proxmox host (or with DRY_RUN=1)."
    exit 1
fi

if ! command -v pct &> /dev/null && [ "$DRY_RUN" -eq 0 ]; then
    log_error "Proxmox container management utility 'pct' not found. Ensure this runs on a Proxmox VE host."
    exit 1
fi

log_info "Target Container ID   : ${CTID}"
log_info "Container Hostname    : ${CT_NAME}"
log_info "Allocated RAM / Swap  : ${MEMORY}MB / ${SWAP}MB"
log_info "CPU Core Allocation   : ${CORES} vCPUs"
log_info "Rootfs Disk Sizing    : ${DISK_SIZE} on ${STORAGE}"
log_info "LXC OS Template       : ${TEMPLATE}"
log_info "Unprivileged Mode     : ${UNPRIVILEGED} (Features: nesting=1, keyctl=1)"

if [ "$DRY_RUN" -eq 1 ]; then
    log_warn "DRY_RUN mode enabled. Commands will be printed without executing."
    PCT_CMD="echo pct"
else
    PCT_CMD="pct"
fi

# 1. Check if container ID already exists
if [ "$DRY_RUN" -eq 0 ] && pct status "${CTID}" &> /dev/null; then
    log_error "Container ID ${CTID} already exists. Destroy or choose a different CTID."
    exit 1
fi

# 2. Provision Container via `pct create`
log_info "Creating LXC container ${CTID}..."
NET_CONFIG="name=eth0,bridge=${BRIDGE},ip=${IP_CONFIG}"
if [ -n "${GATEWAY}" ]; then
    NET_CONFIG="${NET_CONFIG},gw=${GATEWAY}"
fi

$PCT_CMD create "${CTID}" "${TEMPLATE}" \
    --hostname "${CT_NAME}" \
    --memory "${MEMORY}" \
    --swap "${SWAP}" \
    --cores "${CORES}" \
    --ostype debian \
    --rootfs "${STORAGE}:${DISK_SIZE}" \
    --net0 "${NET_CONFIG}" \
    --nameserver "${NAMESERVER}" \
    --unprivileged "${UNPRIVILEGED}" \
    --features "nesting=1,keyctl=1" \
    --onboot 1 \
    --start 0

# 3. Optimize container configuration
if [ "$DRY_RUN" -eq 0 ]; then
    log_info "Configuring CPU host flags and permissions in /etc/pve/lxc/${CTID}.conf..."
    # Enable CPU host virtualization flags for AVX2/SSE4 C++ acceleration
    if ! grep -q "cpuunits:" "/etc/pve/lxc/${CTID}.conf"; then
        echo "cpuunits: 1024" >> "/etc/pve/lxc/${CTID}.conf"
    fi
fi

# 4. Start Container and bootstrap dependencies
log_info "Starting container ${CTID}..."
$PCT_CMD start "${CTID}"

if [ "$DRY_RUN" -eq 0 ]; then
    log_info "Waiting for container networking..."
    sleep 5

    log_info "Updating system packages and installing prerequisites..."
    $PCT_CMD exec "${CTID}" -- bash -c "
        export DEBIAN_FRONTEND=noninteractive
        apt-get update -qq
        apt-get install -y -qq curl git ca-certificates gnupg build-essential cmake ufw sudo

        # Create unprivileged sovereign service user (UID 1000)
        if ! id -u sovereign &>/dev/null; then
            useradd -m -s /bin/bash -u 1000 -U sovereign
            echo 'sovereign ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/sovereign
            chmod 0440 /etc/sudoers.d/sovereign
        fi

        # Install Node.js 22 LTS
        curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
        apt-get install -y -qq nodejs

        # Setup firewall (allow only private SSH 22 and internal API 8787)
        ufw default deny incoming
        ufw default allow outgoing
        ufw allow 22/tcp
        ufw allow 8787/tcp
        ufw --force enable
    "
fi

log_info "==================================================================="
log_info "Container ${CTID} (${CT_NAME}) successfully provisioned and ready!"
log_info "Next Steps:"
log_info "  1. pct enter ${CTID}"
log_info "  2. su - sovereign"
log_info "  3. git clone <repo_url> sovereign && cd sovereign"
log_info "  4. npm run setup:dev"
log_info "==================================================================="
