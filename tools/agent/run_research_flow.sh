#!/usr/bin/env bash
# Sovereign Autonomous Strategy Research Flow Runner
# Executes fresh-context agent iterations to research, backtest, and stage quantitative strategies.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LEDGER_FILE="${REPO_ROOT}/workspace/RESEARCH_LEDGER.jsonl"
GOAL_FILE="${REPO_ROOT}/workspace/OVERNIGHT_GOAL.md"
MAX_CYCLES="${1:-10}" # default 10 cycles, pass '0' or 'inf' for continuous
LOG_FILE="/dev/shm/research-flow.log"

mkdir -p "${REPO_ROOT}/workspace"
touch "${LEDGER_FILE}"
: > "${LOG_FILE}"

echo "=== Sovereign Quantitative Research Flow ==="
echo "Target Cycles: ${MAX_CYCLES}"
echo "Ledger:        ${LEDGER_FILE}"
echo "Log:           ${LOG_FILE}"
echo "Search Tool:   /usr/local/bin/web-search"

cycle=1
while true; do
  if [[ "${MAX_CYCLES}" != "0" && "${MAX_CYCLES}" != "inf" ]] && (( cycle > MAX_CYCLES )); then
    echo "Completed ${MAX_CYCLES} research cycles. Exiting."
    break
  fi

  echo -e "\n[$(date -u +%FT%TZ)] --- Launching Research Cycle #${cycle} ---"

  # Prompt contract forcing strict state machine execution with O(1) context
  PROMPT="You are an autonomous quant researcher executing Cycle #${cycle}.
1. Inspect the last 3 lines of workspace/RESEARCH_LEDGER.jsonl and review workspace/OVERNIGHT_GOAL.md to avoid duplicate strategies.
2. If exploring an unfamiliar alpha model, run 'web-search \"<query>\"' to inspect current academic or industry literature.
3. Execute a backtest iteration using 'node tools/agent/strategy_interval_generator.js --once --archetype <archetype>'.
4. Inspect the backtest output (Trades, Sharpe, Max Drawdown).
5. Append a single-line JSON record to workspace/RESEARCH_LEDGER.jsonl with keys: timestamp, cycle, archetype, name, sharpe, max_dd, trades, status (PASS or REJECT), and rationale.
6. Output exactly one markdown table summarizing this cycle's strategy and metrics."

  opencode run --auto --archived "${PROMPT}" 2>&1 | tee -a "${LOG_FILE}"

  cycle=$((cycle + 1))
  sleep 2
done
