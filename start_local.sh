#!/usr/bin/env bash
echo "--- Starting Sovereign Local Suite (Linux) ---"

# Ensure log files directory exists or use current dir logs
mkdir -p logs

# 1. Start Ingestor (CLI watch)
echo "[1/3] Starting Data Ingestor (CLI watch)..."
node backend/cli/sovereign_cli.js watch > logs/ingestor.log 2>&1 &
INGESTOR_PID=$!

# 2. Start Web API & Dashboard
echo "[2/3] Starting Web API & Dashboard..."
node backend/api/app.js > logs/dashboard.log 2>&1 &
DASHBOARD_PID=$!

# 3. Start Execution Gateway
echo "[3/3] Starting Execution Gateway..."
node backend/cli/lib/run_trade_gateway.js --demo > logs/gateway.log 2>&1 &
GATEWAY_PID=$!

echo "All systems launched in the background."
echo "PIDs: Ingestor ($INGESTOR_PID), Dashboard ($DASHBOARD_PID), Gateway ($GATEWAY_PID)"
echo "Logs are written to logs/ingestor.log, logs/dashboard.log, and logs/gateway.log"
echo "Dashboard is available at: http://localhost:8787"
echo "Press Ctrl+C to stop all services."

# Handle graceful shutdown on Ctrl+C
cleanup() {
    echo -e "\nStopping background processes..."
    kill $INGESTOR_PID $DASHBOARD_PID $GATEWAY_PID 2>/dev/null
    exit 0
}
trap cleanup SIGINT SIGTERM

# Keep script running to wait for background processes
wait
