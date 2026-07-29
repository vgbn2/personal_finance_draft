#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
compose_file="${repo_root}/infra/docker/docker-compose.yml"
evidence_helper="${repo_root}/backend/scripts/ops/deployment_evidence.js"
remote_name="${SOVEREIGN_DEPLOY_REMOTE:-origin}"
branch_name="${SOVEREIGN_DEPLOY_BRANCH:-main}"
central_env_file="${SOVEREIGN_CENTRAL_ENV_FILE:-${repo_root}/.env.central}"
deploy_lock="${SOVEREIGN_DEPLOY_LOCK:-/tmp/sovereign-central-deploy.lock}"
deployed_head_file="${SOVEREIGN_DEPLOYED_HEAD_FILE:-${repo_root}/.git/sovereign-central-deployed-head}"
deployment_evidence_file="${SOVEREIGN_DEPLOYMENT_EVIDENCE_FILE:-${repo_root}/.git/sovereign-central-deployment.json}"
compose_project="${SOVEREIGN_COMPOSE_PROJECT_NAME:-$(basename "${script_dir}")}"
image_repository="${SOVEREIGN_IMAGE_REPOSITORY:-personal_finance}"
paper_storage_dir="${SOVEREIGN_PAPER_STORAGE_DIR:-${repo_root}/storage/data/paper_trading}"
node_bin="${SOVEREIGN_NODE_BIN:-node}"

temporary_dir="$(mktemp -d)"
service_rows_file="${temporary_dir}/services.tsv"
pre_active_file="${temporary_dir}/pre-active.tsv"
pre_images_file="${temporary_dir}/pre-images.tsv"
pre_evidence_file="${temporary_dir}/pre-evidence.tsv"
post_services_file="${temporary_dir}/post-services.tsv"
previous_evidence_file="${temporary_dir}/previous-deployment-evidence.json"
had_previous_evidence=false
evidence_written=false
suppress_bot_rollback=false
trap 'rm -rf "${temporary_dir}"' EXIT

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
"${node_bin}" "${evidence_helper}" services > "${service_rows_file}"

declare -A service_profile=()
declare -A service_kind=()
while IFS=$'\t' read -r service profile kind; do
  [[ "${profile}" == "-" ]] && profile=""
  service_profile["${service}"]="${profile}"
  service_kind["${service}"]="${kind}"
done < "${service_rows_file}"

compose_for_service() {
  local service="$1"
  shift
  local command=(docker compose --env-file "${central_env_file}" -f "${compose_file}")
  if [[ -n "${service_profile[${service}]:-}" ]]; then
    command+=(--profile "${service_profile[${service}]}")
  fi
  "${command[@]}" "$@"
}

container_id_for_service() {
  local service="$1"
  docker ps -a \
    --filter "label=com.docker.compose.project=${compose_project}" \
    --filter "label=com.docker.compose.service=${service}" \
    --format '{{.ID}}'
}

capture_active_services() {
  local destination="$1"
  : > "${destination}"
  while IFS=$'\t' read -r service state container_id; do
    [[ -z "${service}" ]] && continue
    if [[ -z "${service_kind[${service}]:-}" ]]; then
      echo "refusing deployment with unknown Compose service: ${service}" >&2
      return 79
    fi
    if [[ "${state}" == "running" || "${state}" == "restarting" ]]; then
      image_id="$(docker inspect --format '{{.Image}}' "${container_id}")"
      printf '%s\t%s\t%s\t%s\n' "${service}" "${state}" "${container_id}" "${image_id}" >> "${destination}"
    fi
  done < <(
    docker ps -a \
      --filter "label=com.docker.compose.project=${compose_project}" \
      --format '{{.Label "com.docker.compose.service"}}{{"\t"}}{{.State}}{{"\t"}}{{.ID}}'
  )
}

service_is_active_in() {
  local service="$1"
  local source="$2"
  awk -F $'\t' -v expected="${service}" '$1 == expected { found = 1 } END { exit !found }' "${source}"
}

qualified_image_id() {
  docker image inspect --format '{{.Id}}' "${SOVEREIGN_IMAGE_REF}" 2>/dev/null
}

image_is_qualified() {
  local image_id
  image_id="$(qualified_image_id)" || return 1
  [[ "$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "${image_id}")" == "${SOVEREIGN_SOURCE_REVISION}" ]] \
    && [[ "$(docker image inspect --format '{{index .Config.Labels "io.sovereign.source-tree"}}' "${image_id}")" == "${SOVEREIGN_SOURCE_TREE}" ]] \
    && [[ "$(docker image inspect --format '{{index .Config.Labels "io.sovereign.build-contract"}}' "${image_id}")" == "1" ]]
}

capture_verified_services() {
  local destination="$1"
  local expected_image_id="$2"
  local excluded_service="${3:-}"
  : > "${destination}"
  local expected_services=(web backfill)
  while IFS=$'\t' read -r service _state _container_id _image_id; do
    if [[ "${service_kind[${service}]}" == "optional" && "${service}" != "${excluded_service}" ]]; then
      expected_services+=("${service}")
    fi
  done < "${pre_active_file}"

  for service in "${expected_services[@]}"; do
    if [[ "${service}" == "bot" && "${suppress_bot_rollback}" == "true" ]]; then
      compose_for_service bot stop bot >/dev/null 2>&1 || rollback_status=1
      continue
    fi
    container_id="$(container_id_for_service "${service}")"
    [[ -n "${container_id}" ]] || return 1
    state="$(docker inspect --format '{{.State.Status}}' "${container_id}")"
    [[ "${state}" == "running" ]] || return 1
    image_id="$(docker inspect --format '{{.Image}}' "${container_id}")"
    [[ "${image_id}" == "${expected_image_id}" ]] || return 1
    printf '%s\t%s\t%s\t%s\n' "${service}" "${container_id}" "${image_id}" "${state}" >> "${destination}"
  done

  web_container_id="$(container_id_for_service web)"
  [[ "$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "${web_container_id}")" == "healthy" ]] || return 1

  if [[ "${excluded_service}" != "bot" ]] && service_is_active_in bot "${pre_active_file}"; then
    bot_container_id="$(container_id_for_service bot)"
    bot_environment="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "${bot_container_id}")"
    grep -qx 'LIVE_TRADING=false' <<<"${bot_environment}" || return 1
    grep -qx 'SOVEREIGN_EXECUTION_AUTHORIZED=false' <<<"${bot_environment}" || return 1
    grep -qx 'SOVEREIGN_RUNTIME_MODE=cloud-compute' <<<"${bot_environment}" || return 1
  fi

  capture_active_services "${temporary_dir}/observed-active.tsv"
  cut -f1 "${destination}" | sort > "${temporary_dir}/expected-active"
  cut -f1 "${temporary_dir}/observed-active.tsv" | sort > "${temporary_dir}/observed-active"
  cmp -s "${temporary_dir}/expected-active" "${temporary_dir}/observed-active"
}

paper_state_fingerprint() {
  local ledger="${paper_storage_dir}/events.jsonl"
  local projection="${paper_storage_dir}/portfolio.v1.json"
  if [[ ! -r "${ledger}" || ! -r "${projection}" ]]; then
    echo "active paper bot requires readable ledger and projection evidence" >&2
    return 1
  fi
  printf 'ledger_lines=%s ledger_sha256=%s projection_sha256=%s' \
    "$(wc -l < "${ledger}")" \
    "$(sha256sum "${ledger}" | awk '{print $1}')" \
    "$(sha256sum "${projection}" | awk '{print $1}')"
}

capture_active_services "${pre_active_file}"
: > "${pre_evidence_file}"
while IFS=$'\t' read -r service state container_id image_id; do
  printf '%s\t%s\t%s\t%s\n' "${service}" "${container_id}" "${image_id}" "${state}" >> "${pre_evidence_file}"
done < "${pre_active_file}"
if [[ -f "${deployment_evidence_file}" ]]; then
  cp -p "${deployment_evidence_file}" "${previous_evidence_file}"
  had_previous_evidence=true
fi

export SOVEREIGN_SOURCE_REVISION
SOVEREIGN_SOURCE_REVISION="$(git rev-parse HEAD)"
export SOVEREIGN_SOURCE_TREE
SOVEREIGN_SOURCE_TREE="$(git rev-parse 'HEAD^{tree}')"
export SOVEREIGN_IMAGE_REF="${image_repository}:${SOVEREIGN_SOURCE_REVISION}"

existing_image_id=""
if image_is_qualified; then
  existing_image_id="$(qualified_image_id)"
  if capture_verified_services "${post_services_file}" "${existing_image_id}" \
    && [[ -f "${deployed_head_file}" ]] \
    && [[ "$(<"${deployed_head_file}")" == "${SOVEREIGN_SOURCE_REVISION}" ]] \
    && "${node_bin}" "${evidence_helper}" matches \
      --path "${deployment_evidence_file}" \
      --revision "${SOVEREIGN_SOURCE_REVISION}" \
      --tree "${SOVEREIGN_SOURCE_TREE}" \
      --image-ref "${SOVEREIGN_IMAGE_REF}" \
      --image-id "${existing_image_id}" \
      --services-file "${post_services_file}" \
    && [[ "${SOVEREIGN_DEPLOY_FORCE:-false}" != "true" ]]; then
    echo "central host already current and deployment-ready: ${remote_name}/${branch_name}"
    exit 0
  fi
fi

if service_is_active_in polymarket-research "${pre_active_file}"; then
  echo "refusing automatic recreation of active polymarket-research; use an authorized maintenance window" >&2
  exit 79
fi

paper_state_before=""
if service_is_active_in bot "${pre_active_file}"; then
  if ! paper_state_before="$(paper_state_fingerprint)"; then
    exit 79
  fi
fi

docker compose --env-file "${central_env_file}" -f "${compose_file}" build web
if ! image_is_qualified; then
  echo "refusing cutover because the built image lacks exact source provenance" >&2
  exit 76
fi
new_image_id="$(qualified_image_id)"

: > "${pre_images_file}"
while IFS=$'\t' read -r service state container_id image_id; do
  rollback_ref="${image_repository}:rollback-${service}"
  docker image tag "${image_id}" "${rollback_ref}"
  printf '%s\t%s\t%s\t%s\t%s\n' "${service}" "${state}" "${container_id}" "${image_id}" "${rollback_ref}" >> "${pre_images_file}"
done < "${pre_active_file}"

rollback_cutover() {
  local rollback_status=0
  echo "deployment verification failed; restoring the captured active service set" >&2
  local expected_services=(web backfill)
  while IFS=$'\t' read -r service _state _container_id _image_id _rollback_ref; do
    [[ "${service_kind[${service}]}" == "optional" ]] && expected_services+=("${service}")
  done < "${pre_images_file}"

  for service in "${expected_services[@]}"; do
    rollback_row="$(awk -F $'\t' -v expected="${service}" '$1 == expected { print; exit }' "${pre_images_file}")"
    if [[ -z "${rollback_row}" ]]; then
      compose_for_service "${service}" stop "${service}" >/dev/null 2>&1 || rollback_status=1
      continue
    fi
    IFS=$'\t' read -r _service _state _container_id old_image_id rollback_ref <<<"${rollback_row}"
    if [[ "$(docker image inspect --format '{{.Id}}' "${rollback_ref}" 2>/dev/null || true)" != "${old_image_id}" ]]; then
      rollback_status=1
      continue
    fi
    SOVEREIGN_IMAGE_REF="${rollback_ref}" compose_for_service "${service}" up -d --no-build --force-recreate "${service}" \
      || rollback_status=1
  done
  if [[ "${evidence_written}" == "true" ]]; then
    if [[ "${had_previous_evidence}" == "true" ]]; then
      cp -p "${previous_evidence_file}" "${deployment_evidence_file}" || rollback_status=1
    else
      rm -f "${deployment_evidence_file}" || rollback_status=1
    fi
  fi
  export SOVEREIGN_IMAGE_REF="${image_repository}:${SOVEREIGN_SOURCE_REVISION}"
  return "${rollback_status}"
}

if service_is_active_in bot "${pre_active_file}"; then
  if ! compose_for_service bot stop bot; then
    rollback_cutover || true
    exit 1
  fi
fi
if service_is_active_in portfolio-monitor "${pre_active_file}"; then
  if ! compose_for_service portfolio-monitor stop portfolio-monitor; then
    rollback_cutover || true
    exit 1
  fi
fi

deploy_command=(docker compose --env-file "${central_env_file}" -f "${compose_file}" --profile writer)
declare -A enabled_profiles=([writer]=1)
active_optional=()
while IFS=$'\t' read -r service _state _container_id _image_id; do
  [[ "${service_kind[${service}]}" == "optional" ]] || continue
  [[ "${service}" != "bot" ]] && active_optional+=("${service}")
  profile="${service_profile[${service}]}"
  if [[ -n "${profile}" && -z "${enabled_profiles[${profile}]:-}" ]]; then
    deploy_command+=(--profile "${profile}")
    enabled_profiles["${profile}"]=1
  fi
done < "${pre_active_file}"

if ! "${deploy_command[@]}" up -d --no-build --force-recreate web backfill "${active_optional[@]}"; then
  rollback_cutover || true
  exit 1
fi

verified=false
for attempt in $(seq 1 30); do
  excluded_service=""
  service_is_active_in bot "${pre_active_file}" && excluded_service="bot"
  if capture_verified_services "${post_services_file}" "${new_image_id}" "${excluded_service}"; then
    verified=true
    break
  fi
  sleep 2
done
if [[ "${verified}" != "true" ]]; then
  rollback_cutover || true
  exit 1
fi

if service_is_active_in bot "${pre_active_file}"; then
  if [[ "$(paper_state_fingerprint)" != "${paper_state_before}" ]]; then
    rollback_cutover || true
    exit 1
  fi
  if ! SOVEREIGN_IMAGE_REF="${image_repository}:${SOVEREIGN_SOURCE_REVISION}" \
    compose_for_service bot up -d --no-build --force-recreate bot; then
    rollback_cutover || true
    exit 1
  fi
  bot_verified=false
  for attempt in $(seq 1 30); do
    if capture_verified_services "${post_services_file}" "${new_image_id}"; then
      bot_verified=true
      break
    fi
    sleep 2
  done
  paper_state_after=""
  paper_state_after="$(paper_state_fingerprint)" || true
  if [[ "${bot_verified}" != "true" || "${paper_state_after}" != "${paper_state_before}" ]]; then
    suppress_bot_rollback=true
    compose_for_service bot stop bot >/dev/null 2>&1 || true
    echo "paper state changed during cutover; bot remains stopped for manual recovery" >&2
    rollback_cutover || true
    exit 1
  fi
fi

if service_is_active_in portfolio-monitor "${pre_active_file}"; then
  monitor_stable=false
  if monitor_container_id="$(container_id_for_service portfolio-monitor)" \
    && monitor_restarts_before="$(docker inspect --format '{{.RestartCount}}' "${monitor_container_id}")"; then
    sleep 2
    if monitor_restarts_after="$(docker inspect --format '{{.RestartCount}}' "${monitor_container_id}")" \
      && [[ "${monitor_restarts_before}" == "${monitor_restarts_after}" ]]; then
      monitor_stable=true
    fi
  fi
  if [[ "${monitor_stable}" != "true" ]]; then
    rollback_cutover || true
    exit 1
  fi
fi

if ! "${node_bin}" "${evidence_helper}" write \
    --path "${deployment_evidence_file}" \
    --revision "${SOVEREIGN_SOURCE_REVISION}" \
    --tree "${SOVEREIGN_SOURCE_TREE}" \
    --image-ref "${SOVEREIGN_IMAGE_REF}" \
    --image-id "${new_image_id}" \
    --pre-services-file "${pre_evidence_file}" \
    --services-file "${post_services_file}"; then
  rollback_cutover || true
  exit 1
fi
evidence_written=true

deployed_head_tmp="${deployed_head_file}.tmp.$$"
if ! (
  umask 077
  printf '%s\n' "${SOVEREIGN_SOURCE_REVISION}" > "${deployed_head_tmp}" \
    && mv "${deployed_head_tmp}" "${deployed_head_file}"
); then
  rm -f "${deployed_head_tmp}"
  rollback_cutover || true
  exit 1
fi

reported_optional=("${active_optional[@]}")
service_is_active_in bot "${pre_active_file}" && reported_optional+=(bot)
"${deploy_command[@]}" ps web backfill "${reported_optional[@]}"
echo "central host update complete: ${remote_name}/${branch_name}"
