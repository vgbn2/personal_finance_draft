#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  install.sh install --host HOST --user USER --identity-file PATH --token-file PATH [options]
  install.sh status|logs|restart|open|uninstall

Install options:
  --local-port PORT        Local loopback port (default: 8788)
  --remote-port PORT       Central-host loopback port (default: 8787)
  --remote-bind ADDRESS    Central-host bind target (default: 127.0.0.1)
  --refresh-seconds N      Remote CLI refresh interval (default: 10)
  --cli-launcher PATH      Executable launcher used by the open action
  --auto-open              Open the launcher once after login and healthy tunnel
  --no-start               Install without enabling or starting the user service

The token is copied from --token-file. Token text is never accepted as an argument.
EOF
}

action="${1:-}"
[[ -n "${action}" ]] || { usage >&2; exit 64; }
shift

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../../.." && pwd)"
data_root="${XDG_DATA_HOME:-${HOME}/.local/share}/sovereign-client"
config_root="${XDG_CONFIG_HOME:-${HOME}/.config}/sovereign"
state_root="${XDG_STATE_HOME:-${HOME}/.local/state}/sovereign-client"
systemd_user_dir="${XDG_CONFIG_HOME:-${HOME}/.config}/systemd/user"
install_root="${data_root}/bin"
config_file="${config_root}/connector.conf"
client_json_file="${config_root}/client.json"
installed_token_file="${config_root}/client.token"
service_file="${systemd_user_dir}/sovereign-client-connector.service"
installed_connector="${install_root}/sovereign-client-connector.sh"
installed_launcher="${install_root}/launch-remote-cli.sh"
systemctl_bin="${SOVEREIGN_CLIENT_SYSTEMCTL_BIN:-$(command -v systemctl || true)}"

run_systemctl() {
  [[ -n "${systemctl_bin}" && -x "${systemctl_bin}" ]] || {
    echo "systemctl is required for user-service lifecycle actions" >&2
    exit 69
  }
  "${systemctl_bin}" --user "$@"
}

case "${action}" in
  status)
    if [[ -f "${state_root}/status" ]]; then
      cat "${state_root}/status"
    else
      echo "state=not-installed-or-not-started"
    fi
    run_systemctl --no-pager status sovereign-client-connector.service
    exit $?
    ;;
  logs)
    journalctl --user-unit sovereign-client-connector.service --no-pager -n 200
    exit $?
    ;;
  restart)
    run_systemctl restart sovereign-client-connector.service
    run_systemctl --no-pager status sovereign-client-connector.service
    exit $?
    ;;
  open)
    [[ -x "${installed_connector}" && -f "${config_file}" ]] || {
      echo "client connector is not installed" >&2
      exit 69
    }
    exec "${installed_connector}" --config "${config_file}" --launch-cli
    ;;
  uninstall)
    if [[ -n "${systemctl_bin}" && -x "${systemctl_bin}" ]]; then
      "${systemctl_bin}" --user disable --now sovereign-client-connector.service >/dev/null 2>&1 || true
    fi
    rm -f "${service_file}"
    [[ -z "${systemctl_bin}" || ! -x "${systemctl_bin}" ]] || "${systemctl_bin}" --user daemon-reload
    rm -f "${config_file}" "${client_json_file}" "${installed_token_file}"
    rmdir "${config_root}" 2>/dev/null || true
    rm -rf "${data_root}" "${state_root}"
    echo "Sovereign client connector uninstalled"
    exit 0
    ;;
  install)
    ;;
  -h|--help)
    usage
    exit 0
    ;;
  *)
    usage >&2
    exit 64
    ;;
esac

central_host=""
central_user=""
identity_file=""
token_source=""
local_port="8788"
remote_bind="127.0.0.1"
remote_port="8787"
refresh_seconds="10"
cli_launcher=""
auto_open="false"
start_service="true"

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --host) central_host="${2:-}"; shift 2 ;;
    --user) central_user="${2:-}"; shift 2 ;;
    --identity-file) identity_file="${2:-}"; shift 2 ;;
    --token-file) token_source="${2:-}"; shift 2 ;;
    --local-port) local_port="${2:-}"; shift 2 ;;
    --remote-bind) remote_bind="${2:-}"; shift 2 ;;
    --remote-port) remote_port="${2:-}"; shift 2 ;;
    --refresh-seconds) refresh_seconds="${2:-}"; shift 2 ;;
    --cli-launcher) cli_launcher="${2:-}"; shift 2 ;;
    --auto-open) auto_open="true"; shift ;;
    --no-start) start_service="false"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; exit 64 ;;
  esac
done

[[ "${central_host}" =~ ^[A-Za-z0-9._:-]+$ ]] || { echo "valid --host is required" >&2; exit 64; }
[[ "${central_user}" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "valid --user is required" >&2; exit 64; }
[[ "${identity_file}" == /* && -f "${identity_file}" ]] || {
  echo "existing absolute --identity-file is required" >&2
  exit 64
}
[[ "${token_source}" == /* && -f "${token_source}" ]] || {
  echo "existing absolute --token-file is required" >&2
  exit 64
}
[[ "${local_port}" =~ ^[0-9]+$ ]] && (( 10#${local_port} >= 1 && 10#${local_port} <= 65535 )) || {
  echo "invalid --local-port" >&2
  exit 64
}
[[ "${remote_port}" =~ ^[0-9]+$ ]] && (( 10#${remote_port} >= 1 && 10#${remote_port} <= 65535 )) || {
  echo "invalid --remote-port" >&2
  exit 64
}
[[ "${refresh_seconds}" =~ ^[0-9]+$ ]] && (( 10#${refresh_seconds} >= 2 )) || {
  echo "invalid --refresh-seconds" >&2
  exit 64
}
[[ "${remote_bind}" =~ ^[A-Za-z0-9.:-]+$ ]] || { echo "invalid --remote-bind" >&2; exit 64; }
if [[ -n "${cli_launcher}" && ( "${cli_launcher}" != /* || ! -x "${cli_launcher}" ) ]]; then
  echo "--cli-launcher must be an executable absolute path" >&2
  exit 64
fi
for path_value in "${install_root}" "${config_file}" "${service_file}"; do
  [[ "${path_value}" != *$'\n'* && "${path_value}" != *$'\r'* && "${path_value}" != *' '* ]] || {
    echo "client installation paths must not contain whitespace" >&2
    exit 65
  }
done
for required_command in ssh curl flock install sed node realpath; do
  command -v "${required_command}" >/dev/null 2>&1 || {
    echo "missing required client command: ${required_command}" >&2
    exit 69
  }
done
[[ "${start_service}" == "false" || ( -n "${systemctl_bin}" && -x "${systemctl_bin}" ) ]] || {
  echo "systemctl is required unless --no-start is used" >&2
  exit 69
}

umask 077
install -d -m 700 "${install_root}" "${config_root}" "${state_root}" "${systemd_user_dir}"
install -m 700 "${script_dir}/sovereign-client-connector.sh" "${installed_connector}"
install -m 600 "${token_source}" "${installed_token_file}"

config_tmp="$(mktemp "${config_root}/client.conf.XXXXXX")"
client_json_tmp="$(mktemp "${config_root}/client.json.XXXXXX")"
service_tmp="$(mktemp "${systemd_user_dir}/sovereign-client-connector.service.XXXXXX")"
launcher_tmp="$(mktemp "${install_root}/launch-remote-cli.XXXXXX")"
trap 'rm -f "${config_tmp}" "${client_json_tmp}" "${service_tmp}" "${launcher_tmp}"' EXIT

if [[ -z "${cli_launcher}" ]]; then
  node_bin="$(realpath "$(command -v node)")"
  cli_entry="${repo_root}/backend/cli/sovereign_cli.js"
  [[ -f "${cli_entry}" ]] || {
    echo "cannot find backend/cli/sovereign_cli.js; pass --cli-launcher" >&2
    exit 66
  }
  {
    printf '#!/usr/bin/env bash\n'
    printf 'set -euo pipefail\n'
    printf 'cd %q\n' "${repo_root}"
    printf 'exec %q %q remote status --watch\n' "${node_bin}" "${cli_entry}"
  } > "${launcher_tmp}"
  chmod 700 "${launcher_tmp}"
  mv "${launcher_tmp}" "${installed_launcher}"
  cli_launcher="${installed_launcher}"
fi

{
  printf 'CENTRAL_HOST=%s\n' "${central_host}"
  printf 'CENTRAL_USER=%s\n' "${central_user}"
  printf 'IDENTITY_FILE=%s\n' "${identity_file}"
  printf 'LOCAL_BIND=127.0.0.1\n'
  printf 'LOCAL_PORT=%s\n' "${local_port}"
  printf 'REMOTE_BIND=%s\n' "${remote_bind}"
  printf 'REMOTE_PORT=%s\n' "${remote_port}"
  printf 'TOKEN_FILE=%s\n' "${installed_token_file}"
  printf 'AUTO_OPEN=%s\n' "${auto_open}"
  printf 'CLI_LAUNCHER=%s\n' "${cli_launcher}"
  printf 'RETRY_INITIAL_SECONDS=1\n'
  printf 'RETRY_MAX_SECONDS=60\n'
  printf 'HEALTH_TIMEOUT_SECONDS=3\n'
  printf 'HEALTH_RETRY_SECONDS=2\n'
} > "${config_tmp}"
chmod 600 "${config_tmp}"
mv "${config_tmp}" "${config_file}"

printf '{\n  "base_url": "http://127.0.0.1:%s",\n  "refresh_seconds": %s\n}\n' \
  "${local_port}" "${refresh_seconds}" > "${client_json_tmp}"
chmod 600 "${client_json_tmp}"
mv "${client_json_tmp}" "${client_json_file}"

sed \
  -e "s|@INSTALL_ROOT@|${install_root}|g" \
  -e "s|@CONFIG_FILE@|${config_file}|g" \
  "${script_dir}/sovereign-client-connector.service.in" > "${service_tmp}"
chmod 600 "${service_tmp}"
mv "${service_tmp}" "${service_file}"

if [[ "${start_service}" == "true" ]]; then
  run_systemctl daemon-reload
  run_systemctl enable --now sovereign-client-connector.service
else
  echo "service installed but not started (--no-start)"
fi
echo "Sovereign client connector installed"
echo "Auto-open CLI: ${auto_open}"
