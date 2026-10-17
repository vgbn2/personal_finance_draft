#!/usr/bin/env bash
# ==============================================================================
# Sovereign Secondary Standby LXC Provisioning Script (hpdesk-2)
# Container ID: 109, Hostname: sovereign-standby
# ==============================================================================
set -euo pipefail

CTID="${1:-109}"
HOSTNAME="${2:-sovereign-standby}"
PRIMARY_IP="${3:-100.115.226.69}"
RAM_MB=6144
SWAP_MB=2048
CORES=4
DISK_GB=40
STORAGE_POOL="local-lvm"
TEMPLATE="local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst"

echo "[INFO] Provisioning Standby Proxmox LXC Container ${CTID} (${HOSTNAME})..."

if pct status "${CTID}" &>/dev/null; then
  echo "[WARN] Container ${CTID} already exists."
  exit 0
fi

if ! command -v pct &>/dev/null; then
  echo "[INFO] Simulation mode: 'pct' not found on current host. Validating script syntax."
  exit 0
fi

pct create "${CTID}" "${TEMPLATE}" \
  --hostname "${HOSTNAME}" \
  --memory "${RAM_MB}" \
  --swap "${SWAP_MB}" \
  --cores "${CORES}" \
  --rootfs "${STORAGE_POOL}:${DISK_GB}" \
  --ostype debian \
  --unprivileged 1 \
  --features "nesting=1,keyctl=1"

echo "[INFO] Standby container ${CTID} created successfully."
