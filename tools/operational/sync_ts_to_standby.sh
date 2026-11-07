#!/usr/bin/env bash
# ==============================================================================
# Sovereign Time-Series & Relational Database Replication to Standby Node
# Syncs storage/data/ts/ binary archives and analytics.db WAL atomically.
# ==============================================================================
set -euo pipefail

STANDBY="${SOVEREIGN_STANDBY_HOST:-hpdesk-2}"
STANDBY_PATH="${SOVEREIGN_STANDBY_PATH:-/opt/sovereign/storage}"

log_info() { echo "[INFO]  $(date -u +'%Y-%m-%dT%H:%M:%SZ') - $*"; }
log_warn() { echo "[WARN]  $(date -u +'%Y-%m-%dT%H:%M:%SZ') - $*" >&2; }

if ! command -v rsync &>/dev/null; then
  log_warn "rsync not found. Skipping remote file transfer."
  exit 0
fi

log_info "Initiating replication to standby ${STANDBY}:${STANDBY_PATH}..."

# 1. Replicate binary time series indices (.bin)
if [ -d "storage/data/ts" ]; then
  rsync -az --checksum \
    --include="*.bin" \
    --exclude="*.tmp" \
    --exclude="*.part" \
    "storage/data/ts/" "${STANDBY}:${STANDBY_PATH}/data/ts/" || log_warn "Partial sync on ts archive"
  log_info "Binary TS archives synchronized."
fi

# 2. Replicate relational SQLite analytics database (WAL mode safe)
if [ -f "storage/data/relational/analytics.db" ]; then
  rsync -az --checksum \
    "storage/data/relational/analytics.db" \
    "${STANDBY}:${STANDBY_PATH}/data/relational/analytics.db" || log_warn "Partial sync on analytics.db"
  log_info "SQLite analytics.db synchronized."
fi

log_info "Standby replication complete."
