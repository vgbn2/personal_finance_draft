#!/usr/bin/env bash
# Sovereign Autonomous Overnight Quant Harness
# Runs unattended strategy discovery using local 9Router (Gemini 3.8 Flash) inside a detached tmux session.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GOAL_FILE="${REPO_ROOT}/workspace/OVERNIGHT_GOAL.md"
SESSION_NAME="sovereign-quant"
ENGINE="${1:-agy}" # 'agy' or 'opencode'

if [[ ! -f "${GOAL_FILE}" ]]; then
  echo "Error: Goal file not found at ${GOAL_FILE}" >&2
  exit 1
fi

# Ensure build is fresh
cd "${REPO_ROOT}"
npm run native:build >/dev/null

# Zero-SSD-wear tmpfs
export TMPDIR="/dev/shm"
LOG_FILE="/dev/shm/sovereign-quant.log"
: > "${LOG_FILE}"

echo "=== Sovereign Autonomous Quant Harness ==="
echo "Engine:  ${ENGINE}"
echo "Model:   ag/gemini-3.8-flash (via local 9Router)"
echo "Session: tmux attach -t ${SESSION_NAME}"
echo "Goal:    ${GOAL_FILE}"
echo "Log:     ${LOG_FILE}"

# Terminate any stale existing session
tmux kill-session -t "${SESSION_NAME}" 2>/dev/null || true

RUN_CMD=""
if [[ "${ENGINE}" == "agy" ]]; then
  RUN_CMD="agy --dangerously-skip-permissions --model gemini-3.8-flash-high --print \"\$(cat '${GOAL_FILE}')\" 2>&1 | tee -a '${LOG_FILE}'; echo '[$(date -u +%FT%TZ)] Quant run finished. Shell kept open for inspection.'; exec bash"
elif [[ "${ENGINE}" == "opencode" ]]; then
  RUN_CMD="opencode run --auto \"\$(cat '${GOAL_FILE}')\" 2>&1 | tee -a '${LOG_FILE}'; echo '[$(date -u +%FT%TZ)] Quant run finished. Shell kept open for inspection.'; exec bash"
else
  echo "Unknown engine: ${ENGINE}. Use 'agy' or 'opencode'." >&2
  exit 1
fi

tmux new-session -d -s "${SESSION_NAME}" -c "${REPO_ROOT}" "bash -c '${RUN_CMD}'"

echo "✔ Session launched in background!"
echo "To monitor live:  tmux attach -t ${SESSION_NAME}"
echo "To view raw log:  tail -f ${LOG_FILE}"
echo "To preview log:   tmux capture-pane -pt ${SESSION_NAME}"
echo "To terminate:     tmux kill-session -t ${SESSION_NAME}"
