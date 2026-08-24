#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
compose_file="${repo_root}/infra/docker/docker-compose.yml"

usage() {
  cat <<'EOF'
Usage: infra/docker/logs.sh [OPTION] [SERVICE...]

Stream high-value container logs across services with filtering.

Options:
  --trades       Stream trade execution, order placement, and authorization logs
  --errors       Stream errors, warnings, and security events across all services
  --web          Stream web API requests (excluding routine health checks)
  --no-health    Exclude routine /health endpoint logs from stream
  --all          Stream all logs without filtering
  -h, --help     Display this help message

Examples:
  infra/docker/logs.sh --trades
  infra/docker/logs.sh --errors
  infra/docker/logs.sh --web
  infra/docker/logs.sh web bot
EOF
  exit 0
}

mode="default"
services=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --trades)
      mode="trades"
      shift
      ;;
    --errors)
      mode="errors"
      shift
      ;;
    --web)
      mode="web"
      shift
      ;;
    --no-health)
      mode="no-health"
      shift
      ;;
    --all)
      mode="all"
      shift
      ;;
    -h|--help)
      usage
      ;;
    *)
      services+=("$1")
      shift
      ;;
  esac
done

cd "${repo_root}"

# Check if docker compose is available
if ! command -v docker >/dev/null 2>&1; then
  echo "Error: docker command not found" >&2
  exit 1
fi

compose_cmd=(docker compose -f "${compose_file}" logs -f)
if [[ ${#services[@]} -gt 0 ]]; then
  compose_cmd+=("${services[@]}")
fi

case "${mode}" in
  trades)
    echo "[LOGS] Tailing trade execution and authorization events..."
    "${compose_cmd[@]}" | grep -E --line-buffered "\[AUTOMATION\]|\[TRADE\]|\[ORDER\]|LIVE_TRADING|SOVEREIGN_TRADE_PIN|Preflight|rejected|executed|error|WARN"
    ;;
  errors)
    echo "[LOGS] Tailing error, security, and warning events..."
    "${compose_cmd[@]}" | grep -E --line-buffered " 5[0-9]{2} | 4[0-3][0-9] |\[ERROR\]|\[SECURITY\]|CRITICAL|Uncaught Exception|Unhandled Rejection|OOM|FATAL|denied"
    ;;
  web)
    echo "[LOGS] Tailing web API requests (excluding routine health checks)..."
    "${compose_cmd[@]}" | grep -v "/health" | grep -E --line-buffered "\[web\]"
    ;;
  no-health)
    echo "[LOGS] Tailing logs excluding routine health check polling..."
    "${compose_cmd[@]}" | grep -v "/health"
    ;;
  all|default)
    if [[ "${mode}" == "default" && ${#services[@]} -eq 0 ]]; then
      echo "[LOGS] Tailing container logs (excluding routine /health noise)..."
      "${compose_cmd[@]}" | grep -v "/health"
    else
      echo "[LOGS] Tailing container logs..."
      "${compose_cmd[@]}"
    fi
    ;;
esac
