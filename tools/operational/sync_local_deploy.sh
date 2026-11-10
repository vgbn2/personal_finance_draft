#!/usr/bin/env bash
# Sync local repository to a target Proxmox container through pct exec.
# Usage:
#   bash tools/ops/sync_local_deploy.sh                      # sync source only
#   bash tools/ops/sync_local_deploy.sh --rebuild            # sync + rebuild Docker image + restart containers
#   bash tools/ops/sync_local_deploy.sh --clean              # deep clean build caches before sync
#   bash tools/ops/sync_local_deploy.sh --dry-run            # list files that would be archived
#   bash tools/ops/sync_local_deploy.sh --host <ip> --ct <id> --dest <path>
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Configurable defaults via environment variables
PROXMOX_HOST="${SOVEREIGN_PROXMOX_HOST:-${PROXMOX_HOST:-100.115.226.69}}"
PROXMOX_USER="${SOVEREIGN_PROXMOX_USER:-${PROXMOX_USER:-root}}"
CT_ID="${SOVEREIGN_CT_ID:-${CT_ID:-114}}"
CT_DEST="${SOVEREIGN_CT_DEST:-${CT_DEST:-/home/vgbn/sovereign-trades}}"

REBUILD=false
DRY_RUN=false
CLEAN=false
QUANT=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --rebuild)
      REBUILD=true
      shift
      ;;
    --quant)
      QUANT=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --clean)
      CLEAN=true
      shift
      ;;
    --host)
      PROXMOX_HOST="$2"
      shift 2
      ;;
    --user)
      PROXMOX_USER="$2"
      shift 2
      ;;
    --ct)
      CT_ID="$2"
      shift 2
      ;;
    --dest)
      CT_DEST="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  --host <ip|host>   Proxmox host (default: \$PROXMOX_HOST or 100.115.226.69)"
      echo "  --user <user>      SSH user (default: \$PROXMOX_USER or root)"
      echo "  --ct <id>          Target container ID (default: \$CT_ID or 114)"
      echo "  --dest <path>      Target destination directory (default: \$CT_DEST or /home/vgbn/sovereign-trades)"
      echo "  --rebuild          Rebuild Docker images and recreate containers on target"
      echo "  --clean            Purge transient build/dist caches on target before sync"
      echo "  --dry-run          Preview files to be archived without syncing"
      echo "  -h, --help         Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

TAR_EXCLUDES=(
  --exclude='.git'
  --exclude='*/.git'
  --exclude='node_modules'
  --exclude='*/node_modules'
  --exclude='storage/data/ts'
  --exclude='storage/data/cache'
  --exclude='storage/data/paper_trading'
  --exclude='storage/data/strategies'
  --exclude='workspace/RESEARCH_LEDGER.jsonl'
  --exclude='dist'
  --exclude='*/dist'
  --exclude='site'
  --exclude='graphify-out'
  --exclude='*.bin'
  --exclude='*.swp'
  --exclude='.env'
  --exclude='.env.*'
  --exclude='*.env'
  --exclude='*.key'
  --exclude='*.pem'
  --exclude='storage/secrets'
)

if [[ "$DRY_RUN" == "true" ]]; then
  echo "==> Dry run: listing archived paths from ${REPO_ROOT}/ (target CT ${CT_ID}:${CT_DEST} on ${PROXMOX_HOST})"
  tar -C "$REPO_ROOT" "${TAR_EXCLUDES[@]}" -cf /dev/null -v . 2>&1 | sed -n '1,100p'
  echo "==> Dry run completed (first 100 archived paths displayed)."
  exit 0
fi

PROXMOX_SSH="${SOVEREIGN_PROXMOX_SSH:-}"
if [[ -z "${PROXMOX_SSH}" ]]; then
  if ssh -o ConnectTimeout=5 -o BatchMode=yes "${PROXMOX_USER}@${PROXMOX_HOST}" "echo ok" &>/dev/null; then
    PROXMOX_SSH="ssh -o ConnectTimeout=10 ${PROXMOX_USER}@${PROXMOX_HOST}"
  elif ssh -o ConnectTimeout=5 -o BatchMode=yes dell-ts "ssh hpdesk echo ok" &>/dev/null; then
    echo "==> Direct SSH to ${PROXMOX_HOST} unavailable; routing via cluster peer dell-ts -> hpdesk"
    PROXMOX_SSH="ssh dell-ts ssh hpdesk"
  else
    PROXMOX_SSH="ssh -o ConnectTimeout=10 ${PROXMOX_USER}@${PROXMOX_HOST}"
  fi
fi

# Verify Proxmox reachable
if ! $PROXMOX_SSH "echo ok" &>/dev/null; then
  echo "ERROR: Cannot reach Proxmox host at ${PROXMOX_HOST} via SSH." >&2
  exit 1
fi

# Verify Container running
ct_status=$($PROXMOX_SSH "pct status ${CT_ID}" 2>/dev/null | awk '{print $2}')
if [[ "$ct_status" != "running" ]]; then
  echo "ERROR: Container ${CT_ID} is not running (status: ${ct_status})." >&2
  exit 1
fi

echo "==> Syncing ${REPO_ROOT}/ -> CT ${CT_ID}:${CT_DEST}/ on ${PROXMOX_HOST}"

$PROXMOX_SSH "pct exec ${CT_ID} -- mkdir -p '${CT_DEST}'"

echo "==> Purging legacy casing ghosts and obsolete directories on CT ${CT_ID}..."
$PROXMOX_SSH "pct exec ${CT_ID} -- bash -s" << EOF
  rm -rf "${CT_DEST}/Frontend"
  rm -rf "${CT_DEST}/notebooks"
  rm -rf "${CT_DEST}/web"
  rm -rf "${CT_DEST}/site"
  if [ -d "${CT_DEST}/tools/ops" ] && [ ! -L "${CT_DEST}/tools/ops" ]; then
    rm -rf "${CT_DEST}/tools/ops"
  fi
EOF

if [[ "$CLEAN" == "true" ]]; then
  echo "==> Deep clean requested: purging transient dist and build caches on CT ${CT_ID}..."
  $PROXMOX_SSH "pct exec ${CT_ID} -- bash -s" << EOF
    rm -rf "${CT_DEST}/dist"
    rm -rf "${CT_DEST}/backend/*/dist"
    rm -rf "${CT_DEST}/frontend/dashboard/dist"
EOF
fi

tar -C "$REPO_ROOT" "${TAR_EXCLUDES[@]}" -cf - . \
  | $PROXMOX_SSH "pct exec ${CT_ID} -- tar -C '${CT_DEST}' -xf -"

$PROXMOX_SSH "pct exec ${CT_ID} -- chown -R vgbn:vgbn '${CT_DEST}'"

echo "==> Sync complete."

if [[ "$REBUILD" == "true" && "$DRY_RUN" == "false" ]]; then
  echo "==> Rebuilding Docker image on CT ${CT_ID}..."
  $PROXMOX_SSH "pct exec ${CT_ID} -- bash -s" << EOF
    set -e
    cd "${CT_DEST}"
    docker compose -f infra/docker/docker-compose.yml --profile "*" build web feedd
    docker tag personal_finance:latest sovereign-trades:latest
    docker tag personal_finance:latest ghcr.io/vgbn2/sovereign-trades:latest
    SERVICES="web feedd backfill bot-alpaca-paper portfolio-monitor host-health host-backup"
    if [[ "$QUANT" == "true" ]]; then
      SERVICES="\$SERVICES quant"
    fi
    docker compose -p sv -f infra/docker/docker-compose.yml --profile "*" up -d --no-build --force-recreate \$SERVICES
    docker compose -p sv -f infra/docker/docker-compose.yml ps
EOF
  echo "==> Rebuild done."
fi
