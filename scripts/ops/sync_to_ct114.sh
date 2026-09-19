#!/usr/bin/env bash
# Sync this repo to CT 114 (hp-svconsole) through Proxmox pct exec.
# Usage:
#   bash scripts/ops/sync_to_ct114.sh             # sync source only
#   bash scripts/ops/sync_to_ct114.sh --rebuild   # sync + rebuild Docker image + restart containers
#   bash scripts/ops/sync_to_ct114.sh --dry-run   # list files that would be archived
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

PROXMOX_HOST="100.115.226.69"
PROXMOX_SSH="ssh -o ConnectTimeout=10 root@${PROXMOX_HOST}"
CT_ID="114"
CT_DEST="/home/vgbn/personal_finance_draft"

REBUILD=false
DRY_RUN=false
for arg in "$@"; do
  [[ "$arg" == "--rebuild" ]] && REBUILD=true
  [[ "$arg" == "--dry-run" ]] && DRY_RUN=true
done

# Verify Proxmox reachable
if ! $PROXMOX_SSH "echo ok" &>/dev/null; then
  echo "ERROR: Cannot reach hpdesk-proxmox at ${PROXMOX_HOST} via Tailscale SSH." >&2
  exit 1
fi

# Verify CT 114 running
ct_status=$($PROXMOX_SSH "pct status ${CT_ID} 2>/dev/null | awk '{print \$2}'")
if [[ "$ct_status" != "running" ]]; then
  echo "ERROR: CT ${CT_ID} is not running (status: ${ct_status})." >&2
  exit 1
fi

echo "==> Syncing ${REPO_ROOT}/ -> CT ${CT_ID}:${CT_DEST}/"

TAR_EXCLUDES=(
  --exclude='.git'
  --exclude='*/.git'
  --exclude='node_modules'
  --exclude='*/node_modules'
  --exclude='storage/data/ts'
  --exclude='storage/data/cache'
  --exclude='storage/data/paper_trading'
  --exclude='dist'
  --exclude='*/dist'
  --exclude='site'
  --exclude='graphify-out'
  --exclude='*.bin'
  --exclude='*.swp'
)

if [[ "$DRY_RUN" == "true" ]]; then
  tar -C "$REPO_ROOT" "${TAR_EXCLUDES[@]}" -cf /dev/null -v . 2>&1 | sed -n '1,200p'
  echo "==> Dry run listed first 200 archived paths."
  exit 0
fi

$PROXMOX_SSH "pct exec ${CT_ID} -- mkdir -p '${CT_DEST}'"
tar -C "$REPO_ROOT" "${TAR_EXCLUDES[@]}" -cf - . \
  | $PROXMOX_SSH "pct exec ${CT_ID} -- tar -C '${CT_DEST}' -xf -"

echo "==> Sync complete."

if [[ "$REBUILD" == "true" && "$DRY_RUN" == "false" ]]; then
  echo "==> Rebuilding Docker image on CT ${CT_ID}..."
  $PROXMOX_SSH "pct exec ${CT_ID} -- bash -c '
    cd ${CT_DEST}
    npm install --prefix backend/api --silent
    npm install --prefix backend/gateway --silent
    docker compose build web
    docker compose up -d --no-build --force-recreate web backfill
    docker compose ps
  '"
  echo "==> Rebuild done."
fi
