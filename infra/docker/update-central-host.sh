#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
compose_file="${repo_root}/infra/docker/docker-compose.yml"
remote_name="${SOVEREIGN_DEPLOY_REMOTE:-origin}"
branch_name="${SOVEREIGN_DEPLOY_BRANCH:-main}"
central_env_file="${SOVEREIGN_CENTRAL_ENV_FILE:-${repo_root}/.env.central}"
deploy_lock="${SOVEREIGN_DEPLOY_LOCK:-/tmp/sovereign-central-deploy.lock}"

cd "${repo_root}"
exec 9>"${deploy_lock}"
if ! flock -n 9; then
  echo "central deployment already running: ${deploy_lock}" >&2
  exit 73
fi

if [[ -n "$(git status --porcelain --untracked-files=all)" ]]; then
  echo "refusing central deployment from a dirty working tree" >&2
  exit 74
fi
current_branch="$(git branch --show-current)"
if [[ "${current_branch}" != "${branch_name}" ]]; then
  echo "refusing central deployment from branch ${current_branch:-<detached>}; expected ${branch_name}" >&2
  exit 75
fi
if [[ ! -f "${central_env_file}" ]]; then
  echo "missing central environment file: ${central_env_file}" >&2
  exit 78
fi

export SOVEREIGN_ENV_FILE="${central_env_file}"
export SOVEREIGN_CENTRAL_ENV_FILE="${central_env_file}"
export SOVEREIGN_RUNTIME_MODE="cloud-compute"
export LIVE_TRADING="false"
export SOVEREIGN_EXECUTION_AUTHORIZED="false"

git fetch "${remote_name}" "${branch_name}"
git merge --ff-only "${remote_name}/${branch_name}"
if [[ "$(git rev-parse HEAD)" != "$(git rev-parse "${remote_name}/${branch_name}")" ]]; then
  echo "refusing central deployment because HEAD does not exactly match ${remote_name}/${branch_name}" >&2
  exit 75
fi

node backend/scripts/ops/central_host_preflight.js
docker compose --env-file "${central_env_file}" -f "${compose_file}" config --quiet
docker compose --env-file "${central_env_file}" -f "${compose_file}" build web
docker compose --env-file "${central_env_file}" -f "${compose_file}" up -d --force-recreate web backfill

health_url="http://127.0.0.1:8787/health"
for attempt in $(seq 1 30); do
  backfill_running="$(docker compose --env-file "${central_env_file}" -f "${compose_file}" ps --status running --services backfill)"
  if curl --silent --show-error --fail "${health_url}" >/dev/null && [[ "${backfill_running}" == "backfill" ]]; then
    docker compose --env-file "${central_env_file}" -f "${compose_file}" ps web backfill
    echo "central host update complete: ${remote_name}/${branch_name}"
    exit 0
  fi
  sleep 2
done

echo "central host failed health verification: ${health_url}" >&2
docker compose --env-file "${central_env_file}" -f "${compose_file}" ps web backfill >&2 || true
exit 1
