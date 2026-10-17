#!/usr/bin/env bash
# ==============================================================================
# Sovereign Headless MetaTrader 5 Process Supervisor
# Runs terminal64.exe under Wine with Xvfb virtual framebuffer on display :99.
# Usage:
#   bash scripts/ops/run_headless_mt5.sh start   # start Xvfb & MT5 terminal
#   bash scripts/ops/run_headless_mt5.sh status  # check running processes
#   bash scripts/ops/run_headless_mt5.sh stop    # clean termination
# ==============================================================================
set -euo pipefail

DISPLAY_NUM="${MT5_DISPLAY:-99}"
WINE_PREFIX="${WINEPREFIX:-$HOME/.mt5}"
TERMINAL_PATH="${MT5_TERMINAL_PATH:-$WINE_PREFIX/drive_c/Program Files/MetaTrader 5/terminal64.exe}"
LOCK_FILE="/tmp/.sovereign_mt5_headless.pid"
LOG_DIR="${SOVEREIGN_LOG_DIR:-storage/logs/mt5}"

mkdir -p "$LOG_DIR"

log_info()  { echo "[INFO]  $(date -u +'%Y-%m-%dT%H:%M:%SZ') - $*"; }
log_warn()  { echo "[WARN]  $(date -u +'%Y-%m-%dT%H:%M:%SZ') - $*" >&2; }
log_error() { echo "[ERROR] $(date -u +'%Y-%m-%dT%H:%M:%SZ') - $*" >&2; }

check_status() {
  local running=0
  if pgrep -f "Xvfb :${DISPLAY_NUM}" >/dev/null; then
    log_info "Xvfb display :${DISPLAY_NUM} is active (PID: $(pgrep -f "Xvfb :${DISPLAY_NUM}" | tr '\n' ' '))"
    running=1
  else
    log_warn "Xvfb display :${DISPLAY_NUM} is not running."
  fi

  if pgrep -f "terminal64.exe" >/dev/null; then
    log_info "MT5 terminal64.exe is active (PID: $(pgrep -f "terminal64.exe" | tr '\n' ' '))"
    running=1
  else
    log_warn "MT5 terminal64.exe is not running."
  fi
  return $((1 - running))
}

stop_mt5() {
  log_info "Stopping headless MT5 and Wine server..."
  if pgrep -f "terminal64.exe" >/dev/null; then
    pkill -f "terminal64.exe" || log_warn "pkill terminal64 returned non-zero"
    sleep 1
  fi

  WINEPREFIX="$WINE_PREFIX" wineserver -k || log_warn "wineserver -k returned non-zero"

  if pgrep -f "Xvfb :${DISPLAY_NUM}" >/dev/null; then
    pkill -f "Xvfb :${DISPLAY_NUM}" || log_warn "pkill Xvfb returned non-zero"
  fi

  rm -f "/tmp/.X11-unix/X${DISPLAY_NUM}" "/tmp/.X${DISPLAY_NUM}-lock" "$LOCK_FILE"
  log_info "Headless MT5 processes terminated."
}

start_mt5() {
  if ! command -v Xvfb >/dev/null; then
    log_error "Xvfb is not installed. Install via: sudo apt-get install -y xvfb"
    exit 1
  fi

  if ! command -v wine >/dev/null; then
    log_error "wine is not installed."
    exit 1
  fi

  if [ ! -f "$TERMINAL_PATH" ]; then
    log_error "terminal64.exe not found at $TERMINAL_PATH"
    exit 1
  fi

  if pgrep -f "terminal64.exe" >/dev/null; then
    log_warn "MT5 terminal64.exe is already running."
    check_status
    exit 0
  fi

  # Clean up stale locks
  rm -f "/tmp/.X11-unix/X${DISPLAY_NUM}" "/tmp/.X${DISPLAY_NUM}-lock"

  log_info "Starting Xvfb virtual framebuffer on display :${DISPLAY_NUM}..."
  Xvfb ":${DISPLAY_NUM}" -screen 0 1024x768x16 -nolisten tcp -ac +extension GLX >"$LOG_DIR/xvfb.log" 2>&1 &
  local xvfb_pid=$!

  # Wait for display socket
  local ready=0
  for _ in $(seq 1 30); do
    if [ -S "/tmp/.X11-unix/X${DISPLAY_NUM}" ]; then
      ready=1
      break
    fi
    sleep 0.1
  done

  if [ "$ready" -ne 1 ]; then
    log_error "Xvfb failed to initialize socket at /tmp/.X11-unix/X${DISPLAY_NUM}"
    kill "$xvfb_pid" 2>/dev/null || log_warn "Could not kill xvfb pid $xvfb_pid"
    exit 1
  fi
  log_info "Xvfb display :${DISPLAY_NUM} initialized successfully."

  log_info "Launching MetaTrader 5 in headless portable mode..."
  DISPLAY=":${DISPLAY_NUM}" WINEPREFIX="$WINE_PREFIX" WINEDEBUG="-all" \
    wine "$TERMINAL_PATH" /portable >"$LOG_DIR/terminal.log" 2>&1 &
  local mt5_pid=$!

  echo "$mt5_pid" > "$LOCK_FILE"
  log_info "Headless MT5 launched (PID: $mt5_pid, Display: :${DISPLAY_NUM})."

  sleep 3
  check_status
}

ACTION="${1:-status}"
case "$ACTION" in
  start)
    start_mt5
    ;;
  stop)
    stop_mt5
    ;;
  status)
    check_status
    ;;
  restart)
    stop_mt5
    sleep 1
    start_mt5
    ;;
  *)
    echo "Usage: $0 {start|stop|status|restart}"
    exit 1
    ;;
esac
