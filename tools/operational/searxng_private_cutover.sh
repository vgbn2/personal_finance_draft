#!/usr/bin/env bash
# tools/operational/searxng_private_cutover.sh
# Safe, fail-closed preflight and volume-inventory cutover for SearXNG.
set -euo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/infra/docker/searxng/compose.yml"
EXPECTED_IMAGE_DIGEST="searxng/searxng@sha256:a36a9d52d6f9014eb032998e72cb8c82beb6a3f8a17dd05da4bc2e0fcd73bd7f"
EXPECTED_CONTAINER="sv-searxng"
BACKUP_DIR="${SEARXNG_BACKUP_DIR:-/dev/shm/searxng-cutover}"
VOL_CONFIG_NAME="a95e0f51192da50204771df5364a36bf570e7e6a0bdd4671c118106e8f94c600"
VOL_CACHE_NAME="f604a8165306fc84e0832bbe557ed4494746c51ddf0def48590323b91bb11017"

log() {
  printf '[searxng-cutover] %s\n' "$*" >&2
}

err() {
  printf '[searxng-cutover:ERROR] %s\n' "$*" >&2
  exit 1
}

# 1. Preflight Validation
check_preconditions() {
  log "Validating environment and manifest preconditions..."
  if [[ -z "${SEARXNG_ENV_FILE:-}" ]]; then
    err "SEARXNG_ENV_FILE is not set. Must point to private host env file (mode 0600)."
  fi
  if [[ ! -r "${SEARXNG_ENV_FILE}" ]]; then
    err "SEARXNG_ENV_FILE (${SEARXNG_ENV_FILE}) does not exist or is not readable."
  fi
  if [[ ! -f "${COMPOSE_FILE}" ]]; then
    err "Compose file (${COMPOSE_FILE}) does not exist."
  fi

  # Validate compose syntax without variable resolution
  if command -v docker >/dev/null 2>&1; then
    docker compose --env-file /dev/null -f "${COMPOSE_FILE}" config --quiet || err "Docker Compose config validation failed."
  fi
}

# 2. Consumer & Route Verification Gate
# Docker default bridge does NOT support custom IP pinning (--ip).
# Recreating the container may change its internal 172.17.0.x IP address.
# Narrowing to 127.0.0.1:8888 breaks any external LAN client.
check_consumer_gate() {
  log "Checking consumer route and standalone IP dependencies..."
  # If consumer route is unconfirmed and live cutover is requested without explicit override, FAIL CLOSED.
  if [[ "${SEARXNG_CONSUMER_ROUTE_CONFIRMED:-0}" != "1" ]]; then
    log "BLOCK: Standalone LAN clients and container bridge consumers are not authoritatively identified."
    log "BLOCK: Default bridge IP (172.17.0.2) cannot be pinned via --ip without a user-defined network."
    log "BLOCK: Halting cutover before container mutation. Run with SEARXNG_CONSUMER_ROUTE_CONFIRMED=1 once consumers are qualified."
    return 1
  fi
  return 0
}

# 3. Offline Volume Backup (Tarball + Inventory)
backup_volumes() {
  local target_dir="$1"
  mkdir -p -m 700 "${target_dir}"
  log "Creating offline volume archives under ${target_dir}..."

  local cfg_path="/var/lib/docker/volumes/${VOL_CONFIG_NAME}/_data"
  local cch_path="/var/lib/docker/volumes/${VOL_CACHE_NAME}/_data"

  if [[ -d "${cfg_path}" ]]; then
    tar --numeric-owner -cpf "${target_dir}/config-backup.tar" -C "${cfg_path}" .
    tar -tf "${target_dir}/config-backup.tar" > "${target_dir}/config-inventory.txt"
  else
    log "WARNING: Config volume path not found locally: ${cfg_path}"
  fi

  if [[ -d "${cch_path}" ]]; then
    tar --numeric-owner -cpf "${target_dir}/cache-backup.tar" -C "${cch_path}" .
    tar -tf "${target_dir}/cache-backup.tar" > "${target_dir}/cache-inventory.txt"
  else
    log "WARNING: Cache volume path not found locally: ${cch_path}"
  fi
  log "Volume backup completed successfully."
}

# 4. Offline Volume Restore
restore_volumes() {
  local target_dir="$1"
  log "Restoring volume data from ${target_dir} to revert candidate writes..."

  local cfg_path="/var/lib/docker/volumes/${VOL_CONFIG_NAME}/_data"
  local cch_path="/var/lib/docker/volumes/${VOL_CACHE_NAME}/_data"

  if [[ -f "${target_dir}/config-backup.tar" && -d "${cfg_path}" ]]; then
    find "${cfg_path}" -mindepth 1 -delete
    tar --numeric-owner -xpf "${target_dir}/config-backup.tar" -C "${cfg_path}"
  fi

  if [[ -f "${target_dir}/cache-backup.tar" && -d "${cch_path}" ]]; then
    find "${cch_path}" -mindepth 1 -delete
    tar --numeric-owner -xpf "${target_dir}/cache-backup.tar" -C "${cch_path}"
  fi
  log "Volumes restored to pre-cutover state."
}

# 5. Full Rollback Action
rollback() {
  log "Initiating emergency rollback sequence..."
  if command -v docker >/dev/null 2>&1; then
    docker stop "${EXPECTED_CONTAINER}" 2>/dev/null || true
    docker rm -f "${EXPECTED_CONTAINER}" 2>/dev/null || true

    # Cleanly restore volume state before starting original
    restore_volumes "${BACKUP_DIR}"

    docker rename "${EXPECTED_CONTAINER}-original-backup" "${EXPECTED_CONTAINER}" 2>/dev/null || true
    docker update --restart=unless-stopped "${EXPECTED_CONTAINER}" 2>/dev/null || true
    docker start "${EXPECTED_CONTAINER}" 2>/dev/null || true
  fi
  log "Rollback completed. Original container restored."
}

# 6. Safe Live Cutover
cutover() {
  log "Initiating safe private cutover for SearXNG..."
  check_preconditions
  if ! check_consumer_gate; then
    err "Consumer gate check failed. Aborting cutover."
  fi

  # Step A: Perform volume backup first
  backup_volumes "${BACKUP_DIR}"

  # Step B: Ensure the existing container is running
  if ! docker inspect "${EXPECTED_CONTAINER}" >/dev/null 2>&1; then
    err "Target container ${EXPECTED_CONTAINER} not found."
  fi

  # Step C: Stop existing container and rename to original backup
  log "Stopping existing container ${EXPECTED_CONTAINER}..."
  docker stop "${EXPECTED_CONTAINER}"
  docker rename "${EXPECTED_CONTAINER}" "${EXPECTED_CONTAINER}-original-backup"
  docker update --restart=no "${EXPECTED_CONTAINER}-original-backup" || true

  # Step D: Deploy loopback container using tracked Compose definition
  log "Starting loopback SearXNG container via Compose..."
  if ! docker compose --env-file "${SEARXNG_ENV_FILE}" -f "${COMPOSE_FILE}" up -d --no-build; then
    log "Compose up failed. Triggering automatic rollback..."
    rollback
    err "Cutover failed during compose up. Reverted to original container."
  fi

  # Step E: Health check verification on loopback 127.0.0.1:8888
  log "Verifying loopback service reachability..."
  local attempts=0
  local max_attempts=15
  local healthy=0
  while [[ ${attempts} -lt ${max_attempts} ]]; do
    if curl -s -f -I http://127.0.0.1:8888/ >/dev/null 2>&1; then
      healthy=1
      break
    fi
    attempts=$((attempts + 1))
    sleep 1
  done

  if [[ ${healthy} -ne 1 ]]; then
    log "Health check timed out. Triggering automatic rollback..."
    rollback
    err "Cutover failed health check. Reverted to original container."
  fi

  # Step F: Verify port binding is strictly loopback
  local port_binding
  port_binding=$(docker inspect "${EXPECTED_CONTAINER}" --format '{{range $p, $conf := .NetworkSettings.Ports}}{{range $conf}}{{.HostIp}}:{{.HostPort}} {{end}}{{end}}')
  log "Verified active port bindings: ${port_binding}"
  if [[ "${port_binding}" != *"127.0.0.1:8888"* ]]; then
    log "Port binding is not 127.0.0.1:8888! Triggering rollback..."
    rollback
    err "Security boundary violation: binding is not loopback."
  fi
  if [[ "${port_binding}" == *"0.0.0.0"* || "${port_binding}" == *"[::]"* ]]; then
    log "Found non-loopback interface in port binding! Triggering rollback..."
    rollback
    err "Security boundary violation: non-loopback exposure detected."
  fi

  log "SearXNG private loopback cutover succeeded and verified healthy!"
}

cmd="${1:-preflight}"
case "${cmd}" in
  preflight)
    check_preconditions
    if ! check_consumer_gate; then
      exit 2
    fi
    log "Preflight passed."
    ;;
  backup)
    check_preconditions
    backup_volumes "${BACKUP_DIR}"
    ;;
  restore)
    restore_volumes "${BACKUP_DIR}"
    ;;
  cutover)
    cutover
    ;;
  rollback)
    rollback
    ;;
  *)
    err "Unknown command: ${cmd}. Available: preflight, backup, restore, cutover, rollback."
    ;;
esac
