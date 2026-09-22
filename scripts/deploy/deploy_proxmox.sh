#!/usr/bin/env bash
# ==============================================================================
# Sovereign All-in-One Deployment & Atomic Rollback Script for Proxmox VM
# Image: ghcr.io/vgbn2/personal_finance:latest
# ==============================================================================
set -euo pipefail

# Configuration defaults
SOVEREIGN_ROOT="${SOVEREIGN_ROOT:-/opt/sovereign}"
COMPOSE_FILE="${SOVEREIGN_ROOT}/docker-compose.allinone.yml"
SECRETS_FILE="${SECRETS_FILE:-/etc/sovereign/sovereign.env}"
STORAGE_DIR="${SOVEREIGN_ROOT}/storage"
BACKUP_DIR="${SOVEREIGN_ROOT}/backups"
LOCK_FILE="/var/lock/sovereign-deploy.lock"
IMAGE_REPO="${IMAGE_REPO:-ghcr.io/vgbn2/personal_finance}"
TARGET_TAG="${1:-latest}"
TARGET_IMAGE="${IMAGE_REPO}:${TARGET_TAG}"
HEALTH_URL="http://127.0.0.1:8787/health"
MAX_HEALTH_ATTEMPTS=15
HEALTH_SLEEP_SECS=2

# Logging utilities
log_info()  { echo "[INFO]  $(date -u +'%Y-%m-%dT%H:%M:%SZ') - $*"; }
log_warn()  { echo "[WARN]  $(date -u +'%Y-%m-%dT%H:%M:%SZ') - $*" >&2; }
log_error() { echo "[ERROR] $(date -u +'%Y-%m-%dT%H:%M:%SZ') - $*" >&2; }

# Step 1: Concurrency Control via Mutex Lock
mkdir -p "$(dirname "${LOCK_FILE}")"
exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  log_error "Deployment is already running. Lock held at ${LOCK_FILE}."
  exit 73
fi

log_info "Starting deployment sequence for ${TARGET_IMAGE}..."

# Step 2: Secret Isolation & Permission Enforcement
if [[ -f "${SECRETS_FILE}" ]]; then
  FILE_PERM=$(stat -c "%a" "${SECRETS_FILE}" 2>/dev/null || stat -f "%Lp" "${SECRETS_FILE}" 2>/dev/null)
  if [[ "${FILE_PERM}" != "600" && "${FILE_PERM}" != "400" ]]; then
    log_error "Security violation: ${SECRETS_FILE} has permissions ${FILE_PERM}. Must be 0600 or 0400."
    exit 1
  fi
  log_info "Verified credentials file permissions: ${SECRETS_FILE} (${FILE_PERM})"
else
  log_warn "No credentials file found at ${SECRETS_FILE}. Booting in zero-key simulation mode."
fi

# Step 3: Record Pre-Deployment State
mkdir -p "${BACKUP_DIR}" "${STORAGE_DIR}"
PREV_CONTAINER_ID=$(docker ps -q -f name=sv-allinone || true)
PREV_IMAGE_ID=$(docker inspect --format='{{.Image}}' sv-allinone 2>/dev/null || true)

# Step 4: Storage Snapshot & Backup
TIMESTAMP=$(date -u +'%Y%m%d_%H%M%S')
BACKUP_ARCHIVE="${BACKUP_DIR}/storage_backup_${TIMESTAMP}.tar.gz"

log_info "Creating atomic pre-deploy snapshot of ${STORAGE_DIR}..."
if [ -d "${STORAGE_DIR}" ] && [ "$(ls -A "${STORAGE_DIR}" 2>/dev/null)" ]; then
  tar --exclude='storage/logs/*' -czf "${BACKUP_ARCHIVE}" -C "${SOVEREIGN_ROOT}" storage 2>/dev/null || true
  sha256sum "${BACKUP_ARCHIVE}" > "${BACKUP_ARCHIVE}.sha256" 2>/dev/null || true
  log_info "Snapshot created: ${BACKUP_ARCHIVE}"
fi

# Prune backups older than 14 runs
ls -1t "${BACKUP_DIR}"/storage_backup_*.tar.gz 2>/dev/null | tail -n +15 | xargs -r rm -f || true
ls -1t "${BACKUP_DIR}"/storage_backup_*.tar.gz.sha256 2>/dev/null | tail -n +15 | xargs -r rm -f || true

# Step 5: Pull Image from GHCR
log_info "Pulling image ${TARGET_IMAGE}..."
if ! docker pull "${TARGET_IMAGE}"; then
  log_error "Failed to pull image ${TARGET_IMAGE}. Aborting without altering running container."
  exit 2
fi

NEW_IMAGE_ID=$(docker inspect --format='{{.Id}}' "${TARGET_IMAGE}")

# Step 6: Fail-Closed Rollback Handler
rollback() {
  log_error "CRITICAL: Healthcheck failed! Commencing fail-closed rollback..."

  if [[ -n "${PREV_IMAGE_ID}" ]]; then
    log_info "Rolling back container to previous image: ${PREV_IMAGE_ID:0:12}"
    SOVEREIGN_IMAGE_REF="${PREV_IMAGE_ID}" docker compose -f "${COMPOSE_FILE}" up -d --force-recreate app

    log_info "Verifying rollback container health..."
    sleep 3
    if curl -sf "${HEALTH_URL}" | grep -q '"ok":true'; then
      log_warn "Rollback successful. System restored to previous healthy version."
    else
      log_error "FATAL: Rollback instance also failed healthcheck! Restoring storage snapshot..."
      if [ -f "${BACKUP_ARCHIVE}" ]; then
        tar -xzf "${BACKUP_ARCHIVE}" -C "${SOVEREIGN_ROOT}"
      fi
    fi
  else
    log_error "No previous container image available for rollback. Stopping failed container."
    docker compose -f "${COMPOSE_FILE}" stop app || true
  fi

  exit 1
}

# Step 7: Staged Recreate & Cutover
log_info "Executing container cutover..."
export SOVEREIGN_IMAGE_REF="${TARGET_IMAGE}"
docker compose -f "${COMPOSE_FILE}" up -d --no-build --force-recreate app

# Step 8: Healthcheck Polling Verification
log_info "Polling ${HEALTH_URL} for container readiness..."
HEALTHY=false

for attempt in $(seq 1 "${MAX_HEALTH_ATTEMPTS}"); do
  HTTP_STATUS=$(curl -s -o /tmp/health_resp.json -w "%{http_code}" "${HEALTH_URL}" 2>/dev/null || true)
  if [[ "${HTTP_STATUS}" == "200" ]] && grep -q '"ok":true' /tmp/health_resp.json 2>/dev/null; then
    HEALTHY=true
    log_info "Healthcheck PASSED on attempt ${attempt}/${MAX_HEALTH_ATTEMPTS} (HTTP 200 OK)."
    rm -f /tmp/health_resp.json
    break
  fi
  log_info "Waiting for service... attempt ${attempt}/${MAX_HEALTH_ATTEMPTS} (Status: ${HTTP_STATUS})"
  sleep "${HEALTH_SLEEP_SECS}"
done

if [[ "${HEALTHY}" != "true" ]]; then
  rollback
fi

# Step 9: Post-Deployment Audit Evidence
EVIDENCE_FILE="${SOVEREIGN_ROOT}/deployment_evidence.json"
cat <<EOF > "${EVIDENCE_FILE}"
{
  "deployed_at": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')",
  "target_image": "${TARGET_IMAGE}",
  "image_id": "${NEW_IMAGE_ID}",
  "previous_image_id": "${PREV_IMAGE_ID}",
  "backup_archive": "${BACKUP_ARCHIVE}",
  "healthcheck_status": "healthy",
  "status_code": 200
}
EOF

log_info "Deployment completed successfully. Audit evidence saved to ${EVIDENCE_FILE}."
exit 0
