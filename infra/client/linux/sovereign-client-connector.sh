#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: sovereign-client-connector.sh --config PATH [--launch-cli]

Maintains a read-only SSH local port forward. --launch-cli performs one
on-demand health check and opens the configured CLI launcher.
EOF
}

config_file=""
launch_cli_only="false"
while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --config)
      [[ "$#" -ge 2 ]] || { usage >&2; exit 64; }
      config_file="$2"
      shift 2
      ;;
    --launch-cli)
      launch_cli_only="true"
      shift
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
done

[[ -n "${config_file}" && -f "${config_file}" ]] || {
  echo "connector config file is required" >&2
  exit 78
}

CENTRAL_HOST=""
CENTRAL_USER=""
IDENTITY_FILE=""
LOCAL_BIND="127.0.0.1"
LOCAL_PORT="8788"
REMOTE_BIND="127.0.0.1"
REMOTE_PORT="8787"
TOKEN_FILE=""
AUTO_OPEN="false"
CLI_LAUNCHER=""
RETRY_INITIAL_SECONDS="1"
RETRY_MAX_SECONDS="60"
HEALTH_TIMEOUT_SECONDS="3"
HEALTH_RETRY_SECONDS="2"

while IFS='=' read -r key value || [[ -n "${key:-}" ]]; do
  key="${key%$'\r'}"
  value="${value%$'\r'}"
  [[ -z "${key}" || "${key}" == \#* ]] && continue
  case "${key}" in
    CENTRAL_HOST|CENTRAL_USER|IDENTITY_FILE|LOCAL_BIND|LOCAL_PORT|REMOTE_BIND|REMOTE_PORT|TOKEN_FILE|AUTO_OPEN|CLI_LAUNCHER|RETRY_INITIAL_SECONDS|RETRY_MAX_SECONDS|HEALTH_TIMEOUT_SECONDS|HEALTH_RETRY_SECONDS)
      printf -v "${key}" '%s' "${value}"
      ;;
    *)
      echo "unknown connector setting: ${key}" >&2
      exit 78
      ;;
  esac
done < "${config_file}"

require_private_file() {
  local file_path="$1"
  local label="$2"
  local mode
  [[ -f "${file_path}" ]] || {
    echo "${label} file is missing" >&2
    exit 78
  }
  mode="$(stat -c '%a' "${file_path}")"
  if (( (8#${mode}) & 8#077 )); then
    echo "${label} file must not be accessible by group or others" >&2
    exit 77
  fi
}

validate_port() {
  [[ "$1" =~ ^[0-9]+$ ]] && (( 10#$1 >= 1 && 10#$1 <= 65535 ))
}

[[ "${CENTRAL_HOST}" =~ ^[A-Za-z0-9._:-]+$ ]] || { echo "invalid central host" >&2; exit 78; }
[[ "${CENTRAL_USER}" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "invalid central user" >&2; exit 78; }
[[ "${LOCAL_BIND}" =~ ^[A-Za-z0-9.:-]+$ ]] || { echo "invalid local bind" >&2; exit 78; }
[[ "${REMOTE_BIND}" =~ ^[A-Za-z0-9.:-]+$ ]] || { echo "invalid remote bind" >&2; exit 78; }
validate_port "${LOCAL_PORT}" || { echo "invalid local port" >&2; exit 78; }
validate_port "${REMOTE_PORT}" || { echo "invalid remote port" >&2; exit 78; }
for seconds in RETRY_INITIAL_SECONDS RETRY_MAX_SECONDS HEALTH_TIMEOUT_SECONDS HEALTH_RETRY_SECONDS; do
  [[ "${!seconds}" =~ ^[0-9]+$ ]] && (( 10#${!seconds} >= 1 )) || {
    echo "invalid ${seconds}" >&2
    exit 78
  }
done
(( RETRY_INITIAL_SECONDS <= RETRY_MAX_SECONDS )) || {
  echo "retry initial delay exceeds retry maximum" >&2
  exit 78
}
[[ "${AUTO_OPEN}" == "true" || "${AUTO_OPEN}" == "false" ]] || {
  echo "AUTO_OPEN must be true or false" >&2
  exit 78
}
[[ "${IDENTITY_FILE}" == /* && -f "${IDENTITY_FILE}" ]] || {
  echo "an existing absolute SSH identity path is required" >&2
  exit 78
}
[[ "${TOKEN_FILE}" == /* ]] || { echo "an absolute token file path is required" >&2; exit 78; }
require_private_file "${config_file}" "config"
require_private_file "${TOKEN_FILE}" "token"
token_value="$(<"${TOKEN_FILE}")"
token_value="${token_value%$'\n'}"
[[ "${token_value}" =~ ^[A-Za-z0-9._~-]{24,256}$ ]] || {
  echo "client token must be 24-256 URL-safe characters" >&2
  exit 78
}
if [[ -n "${CLI_LAUNCHER}" && ( "${CLI_LAUNCHER}" != /* || ! -x "${CLI_LAUNCHER}" ) ]]; then
  echo "CLI_LAUNCHER must be an executable absolute path" >&2
  exit 78
fi
if [[ "${AUTO_OPEN}" == "true" && -z "${CLI_LAUNCHER}" ]]; then
  echo "AUTO_OPEN requires CLI_LAUNCHER" >&2
  exit 78
fi

ssh_bin="${SOVEREIGN_CLIENT_SSH_BIN:-$(command -v ssh || true)}"
curl_bin="${SOVEREIGN_CLIENT_CURL_BIN:-$(command -v curl || true)}"
sleep_bin="${SOVEREIGN_CLIENT_SLEEP_BIN:-$(command -v sleep || true)}"
for executable in "${ssh_bin}" "${curl_bin}" "${sleep_bin}"; do
  [[ -n "${executable}" && -x "${executable}" ]] || {
    echo "connector dependency is unavailable" >&2
    exit 69
  }
done

state_home="${SOVEREIGN_CLIENT_STATE_HOME:-${XDG_STATE_HOME:-${HOME}/.local/state}/sovereign-client}"
runtime_home="${SOVEREIGN_CLIENT_RUNTIME_HOME:-${XDG_RUNTIME_DIR:-${state_home}/runtime}/sovereign-client}"
mkdir -p -m 700 "${state_home}" "${runtime_home}"
status_file="${state_home}/status"
log_file="${state_home}/connector.log"
lock_file="${runtime_home}/connector.lock"
auto_open_marker="${runtime_home}/cli-auto-opened"
tunnel_healthy_marker="${runtime_home}/tunnel-healthy"

log_message() {
  local message="$1"
  printf '%s %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "${message}" >> "${log_file}"
}

write_status() {
  local state="$1"
  local attempt="$2"
  local detail="$3"
  local tmp="${status_file}.tmp.$$"
  {
    printf 'state=%s\n' "${state}"
    printf 'connector_pid=%s\n' "$$"
    printf 'attempt=%s\n' "${attempt}"
    printf 'detail=%s\n' "${detail}"
    printf 'updated_at=%s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
  } > "${tmp}"
  chmod 600 "${tmp}"
  mv "${tmp}" "${status_file}"
}

health_check() {
  local token
  local status_code
  token="${token_value}"
  status_code="$(
    {
      printf 'silent\n'
      printf 'show-error\n'
      printf 'header = "X-Sovereign-Token: %s"\n' "${token//\"/\\\"}"
    } | "${curl_bin}" --config - \
      --max-time "${HEALTH_TIMEOUT_SECONDS}" \
      --output /dev/null \
      --write-out '%{http_code}' \
      "http://${LOCAL_BIND}:${LOCAL_PORT}/api/client/status" 2>/dev/null
  )" || return 1
  [[ "${status_code}" =~ ^2[0-9][0-9]$ ]]
}

launch_cli() {
  local mode="$1"
  [[ -n "${CLI_LAUNCHER}" ]] || {
    echo "no CLI launcher is configured" >&2
    return 78
  }

  if [[ "${mode}" == "auto" ]]; then
    if [[ -z "${DISPLAY:-}" && -z "${WAYLAND_DISPLAY:-}" ]]; then
      log_message "CLI auto-open skipped: no desktop session"
      return 0
    fi
    [[ ! -e "${auto_open_marker}" ]] || return 0
    ( set -o noclobber; : > "${auto_open_marker}" ) 2>/dev/null || return 0
    chmod 600 "${auto_open_marker}"
    export SOVEREIGN_REMOTE_URL="http://${LOCAL_BIND}:${LOCAL_PORT}"
    export SOVEREIGN_CLIENT_TOKEN_FILE="${TOKEN_FILE}"
    local cli_pid=""
    if command -v x-terminal-emulator >/dev/null 2>&1; then
      x-terminal-emulator -e "${CLI_LAUNCHER}" >/dev/null 2>&1 &
      cli_pid=$!
    elif command -v gnome-terminal >/dev/null 2>&1; then
      gnome-terminal -- "${CLI_LAUNCHER}" >/dev/null 2>&1 &
      cli_pid=$!
    elif command -v konsole >/dev/null 2>&1; then
      konsole -e "${CLI_LAUNCHER}" >/dev/null 2>&1 &
      cli_pid=$!
    elif command -v xterm >/dev/null 2>&1; then
      xterm -e "${CLI_LAUNCHER}" >/dev/null 2>&1 &
      cli_pid=$!
    else
      rm -f "${auto_open_marker}"
      log_message "CLI auto-open skipped: no terminal emulator"
      return 0
    fi
    log_message "CLI auto-open requested"
    if [[ -n "${DISPLAY:-}" ]] && command -v xdotool >/dev/null 2>&1; then
      (
        "${sleep_bin}" 1
        xdotool search --onlyvisible --pid "${cli_pid}" windowminimize >/dev/null 2>&1 || true
      ) &
    fi
    return 0
  fi

  health_check || {
    echo "central host health check failed" >&2
    return 69
  }
  exec env \
    SOVEREIGN_REMOTE_URL="http://${LOCAL_BIND}:${LOCAL_PORT}" \
    SOVEREIGN_CLIENT_TOKEN_FILE="${TOKEN_FILE}" \
    "${CLI_LAUNCHER}"
}

if [[ "${launch_cli_only}" == "true" ]]; then
  launch_cli "manual"
fi

exec 9>"${lock_file}"
if ! flock -n 9; then
  echo "connector is already running" >&2
  exit 73
fi

ssh_pid=""
health_pid=""
cleanup() {
  [[ -z "${health_pid}" ]] || kill "${health_pid}" 2>/dev/null || true
  [[ -z "${ssh_pid}" ]] || kill "${ssh_pid}" 2>/dev/null || true
  write_status "stopped" "0" "connector stopped"
}
trap cleanup EXIT
trap 'exit 0' INT TERM

attempt=0
delay="${RETRY_INITIAL_SECONDS}"
max_attempts="${SOVEREIGN_CLIENT_MAX_ATTEMPTS:-0}"
[[ "${max_attempts}" =~ ^[0-9]+$ ]] || max_attempts=0

while :; do
  attempt=$((attempt + 1))
  rm -f "${tunnel_healthy_marker}"
  write_status "connecting" "${attempt}" "opening SSH local forward"
  log_message "connector attempt ${attempt} started"

  "${ssh_bin}" \
    -N -T \
    -o BatchMode=yes \
    -o ExitOnForwardFailure=yes \
    -o ConnectTimeout=10 \
    -o ServerAliveInterval=30 \
    -o ServerAliveCountMax=3 \
    -i "${IDENTITY_FILE}" \
    -L "${LOCAL_BIND}:${LOCAL_PORT}:${REMOTE_BIND}:${REMOTE_PORT}" \
    "${CENTRAL_USER}@${CENTRAL_HOST}" &
  ssh_pid=$!

  (
    health_state="connecting"
    while kill -0 "${ssh_pid}" 2>/dev/null; do
      if health_check; then
        : > "${tunnel_healthy_marker}"
        chmod 600 "${tunnel_healthy_marker}"
        if [[ "${health_state}" != "connected" ]]; then
          write_status "connected" "${attempt}" "authenticated API probe passed"
          health_state="connected"
        fi
        launch_cli "auto"
      elif [[ "${health_state}" != "host_unavailable" ]]; then
        write_status "host_unavailable" "${attempt}" "authenticated API probe failed"
        health_state="host_unavailable"
      fi
      "${sleep_bin}" "${HEALTH_RETRY_SECONDS}"
    done
  ) &
  health_pid=$!

  set +e
  wait "${ssh_pid}"
  ssh_exit=$?
  set -e
  ssh_pid=""
  kill "${health_pid}" 2>/dev/null || true
  wait "${health_pid}" 2>/dev/null || true
  health_pid=""

  if [[ -f "${tunnel_healthy_marker}" ]]; then
    delay="${RETRY_INITIAL_SECONDS}"
  fi
  write_status "reconnecting" "${attempt}" "SSH forward exited with status ${ssh_exit}"
  log_message "SSH forward exited; retry scheduled"
  if (( max_attempts > 0 && attempt >= max_attempts )); then
    exit "${ssh_exit:-1}"
  fi
  "${sleep_bin}" "${delay}"
  if (( delay < RETRY_MAX_SECONDS )); then
    delay=$((delay * 2))
    (( delay > RETRY_MAX_SECONDS )) && delay="${RETRY_MAX_SECONDS}"
  fi
done
