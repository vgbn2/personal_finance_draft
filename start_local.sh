#!/usr/bin/env bash
set -euo pipefail

echo "--- Starting Sovereign Local Suite (Linux/Ubuntu Universal) ---"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${script_dir}"

# Ensure log files directory exists
mkdir -p logs

# Dynamic Node binary lookup for NVM / System Node
NODE_BIN="${SOVEREIGN_NODE_BIN:-$(command -v node || true)}"
if [[ -z "${NODE_BIN}" || ! -x "${NODE_BIN}" ]]; then
  echo "Error: Node.js executable not found in PATH." >&2
  exit 1
fi

# 1. Check for port conflicts on 8787
if command -v fuser >/dev/null 2>&1; then
  fuser -k 8787/tcp >/dev/null 2>&1 || true
fi

# 2. Start Data Ingestor (CLI watch)
echo "[1/3] Starting Data Ingestor (CLI watch)..."
"${NODE_BIN}" backend/cli/sovereign_cli.js watch > logs/ingestor.log 2>&1 &
INGESTOR_PID=$!

# 3. Start Web API & Dashboard
echo "[2/3] Starting Web API & Dashboard..."
"${NODE_BIN}" backend/api/app.js > logs/dashboard.log 2>&1 &
DASHBOARD_PID=$!

# 4. Start Execution Gateway
echo "[3/3] Starting Execution Gateway..."
if command -v npx >/dev/null 2>&1; then
  npx tsx backend/gateway/src/index.ts --demo > logs/gateway.log 2>&1 &
  GATEWAY_PID=$!
else
  "${NODE_BIN}" backend/gateway/src/index.ts --demo > logs/gateway.log 2>&1 &
  GATEWAY_PID=$!
fi

echo "All systems launched in the background."
echo "PIDs: Ingestor ($INGESTOR_PID), Dashboard ($DASHBOARD_PID), Gateway ($GATEWAY_PID)"
echo "Logs are written to logs/ingestor.log, logs/dashboard.log, and logs/gateway.log"
echo "Dashboard is available at: http://localhost:8787"
echo "Press Ctrl+C to stop all services."

# Handle graceful shutdown on Ctrl+C
cleanup() {
    echo -e "\nStopping background processes..."
    kill $INGESTOR_PID $DASHBOARD_PID $GATEWAY_PID 2>/dev/null || true
    exit 0
}
trap cleanup SIGINT SIGTERM

# Keep script running to wait for background processes
wait
