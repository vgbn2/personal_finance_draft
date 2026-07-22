#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "run as root: sudo $0 <absolute-repo-path> <service-user>" >&2
  exit 77
fi
if [[ "$#" -ne 2 ]]; then
  echo "usage: $0 <absolute-repo-path> <service-user>" >&2
  exit 64
fi

repo_root="$(realpath "$1")"
service_user="$2"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
service_template="${script_dir}/sovereign-central-update.service.in"
timer_source="${script_dir}/sovereign-central-update.timer"
service_target="/etc/systemd/system/sovereign-central-update.service"
timer_target="/etc/systemd/system/sovereign-central-update.timer"

if [[ "${repo_root}" =~ [[:space:]] ]]; then
  echo "repository path must not contain whitespace: ${repo_root}" >&2
  exit 65
fi
if [[ ! -d "${repo_root}/.git" ]] || [[ ! -x "${repo_root}/infra/docker/update-central-host.sh" ]]; then
  echo "not a deployable Sovereign checkout: ${repo_root}" >&2
  exit 66
fi
if ! id "${service_user}" >/dev/null 2>&1; then
  echo "unknown service user: ${service_user}" >&2
  exit 67
fi
for required_command in node docker git curl flock systemctl; do
  if ! command -v "${required_command}" >/dev/null 2>&1; then
    echo "missing required host command: ${required_command}" >&2
    exit 69
  fi
done
node_major="$(node -p 'Number(process.versions.node.split(".")[0])')"
if [[ ! "${node_major}" =~ ^[0-9]+$ ]] || (( node_major < 20 )); then
  echo "Node.js 20 or newer is required; Node.js 22 LTS is recommended" >&2
  exit 69
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is required for the central updater" >&2
  exit 69
fi

service_group="$(id -gn "${service_user}")"
rendered_service="$(mktemp)"
trap 'rm -f "${rendered_service}"' EXIT
sed \
  -e "s|@REPO_ROOT@|${repo_root}|g" \
  -e "s|@DEPLOY_USER@|${service_user}|g" \
  -e "s|@DEPLOY_GROUP@|${service_group}|g" \
  "${service_template}" > "${rendered_service}"

install -m 0644 "${rendered_service}" "${service_target}"
install -m 0644 "${timer_source}" "${timer_target}"
systemctl daemon-reload
systemctl enable --now sovereign-central-update.timer
systemctl --no-pager status sovereign-central-update.timer
