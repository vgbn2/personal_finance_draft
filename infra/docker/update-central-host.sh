#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
compose_file="${repo_root}/infra/docker/docker-compose.yml"
remote_name="${SOVEREIGN_DEPLOY_REMOTE:-origin}"
branch_name="${SOVEREIGN_DEPLOY_BRANCH:-main}"
central_env_file="${SOVEREIGN_CENTRAL_ENV_FILE:-${repo_root}/.env.central}"
deploy_lock="${SOVEREIGN_DEPLOY_LOCK:-/tmp/sovereign-central-deploy.lock}"
deployed_head_file="${SOVEREIGN_DEPLOYED_HEAD_FILE:-${repo_root}/.git/sovereign-central-deployed-head}"
node_bin="${SOVEREIGN_NODE_BIN:-node}"

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

deployment_profile="$("${node_bin}" -e "const { loadCentralEnvironment } = require('./backend/scripts/ops/central_host_preflight.js'); process.stdout.write(loadCentralEnvironment().SOVEREIGN_DEPLOYMENT_PROFILE || 'central-host');")"
if [[ "${deployment_profile}" != "central-host" ]]; then
  echo "refusing central updater for deployment profile ${deployment_profile:-<missing>}; expected central-host" >&2
  exit 78
fi

git fetch "${remote_name}" "${branch_name}"
git merge --ff-only "${remote_name}/${branch_name}"
if [[ "$(git rev-parse HEAD)" != "$(git rev-parse "${remote_name}/${branch_name}")" ]]; then
  echo "refusing central deployment because HEAD does not exactly match ${remote_name}/${branch_name}" >&2
  exit 75
fi

"${node_bin}" backend/scripts/ops/central_host_preflight.js
docker compose --env-file "${central_env_file}" -f "${compose_file}" --profile writer config --quiet

stack_is_deployment_ready() {
  local service
  local web_container_id
  local web_health
  local web_running="false"
  local backfill_running="false"
  while IFS= read -r service; do
    [[ "${service}" == "web" ]] && web_running="true"
    [[ "${service}" == "backfill" ]] && backfill_running="true"
  done < <(docker compose --env-file "${central_env_file}" -f "${compose_file}" --profile writer ps --status running --services)

  web_container_id="$(docker compose --env-file "${central_env_file}" -f "${compose_file}" --profile writer ps -q web)"
  web_health=""
  if [[ -n "${web_container_id}" ]]; then
    web_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "${web_container_id}" 2>/dev/null || true)"
  fi

  [[ "${web_running}" == "true" ]] \
    && [[ "${backfill_running}" == "true" ]] \
    && [[ "${web_health}" == "healthy" ]]
}

deployed_head=""
[[ -f "${deployed_head_file}" ]] && deployed_head="$(<"${deployed_head_file}")"
if [[ "${deployed_head}" == "$(git rev-parse HEAD)" ]] \
  && [[ "${SOVEREIGN_DEPLOY_FORCE:-false}" != "true" ]] \
  && stack_is_deployment_ready; then
  echo "central host already current and deployment-ready: ${remote_name}/${branch_name}"
  exit 0
fi

docker compose --env-file "${central_env_file}" -f "${compose_file}" --profile writer build web
docker compose --env-file "${central_env_file}" -f "${compose_file}" --profile writer up -d --force-recreate web backfill

for attempt in $(seq 1 30); do
  backfill_running="$(docker compose --env-file "${central_env_file}" -f "${compose_file}" --profile writer ps --status running --services backfill)"
  web_container_id="$(docker compose --env-file "${central_env_file}" -f "${compose_file}" --profile writer ps -q web)"
  web_health=""
  if [[ -n "${web_container_id}" ]]; then
    web_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "${web_container_id}" 2>/dev/null || true)"
  fi
  if [[ "${web_health}" == "healthy" ]] && [[ "${backfill_running}" == "backfill" ]]; then
    deployed_head_tmp="${deployed_head_file}.tmp.$$"
    umask 077
    printf '%s\n' "$(git rev-parse HEAD)" > "${deployed_head_tmp}"
    mv "${deployed_head_tmp}" "${deployed_head_file}"
    docker compose --env-file "${central_env_file}" -f "${compose_file}" --profile writer ps web backfill
    echo "central host update complete: ${remote_name}/${branch_name}"
    exit 0
  fi
  sleep 2
done

echo "central host failed deployment readiness: web health=${web_health:-missing}, backfill=${backfill_running:-missing}" >&2
docker compose --env-file "${central_env_file}" -f "${compose_file}" --profile writer ps web backfill >&2 || true
exit 1
