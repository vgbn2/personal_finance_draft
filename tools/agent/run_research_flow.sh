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
3. Execute the anti-cheat research harness: 'node tools/agent/quant_research_harness.js --once --archetype <archetype>'.
4. Inspect the harness verdict and metrics table (Trades >= 30, Sharpe >= 1.0, MaxDD <= 15%). The harness automatically intercepts the C++ backtest, asserts hard gates, purges premature YAMLs on REJECT, and commits to workspace/RESEARCH_LEDGER.jsonl.
5. Output exactly one markdown table summarizing this cycle's strategy and metrics."

  opencode run --auto --archived -m "9router/ag/gemini-3.8-flash" "${PROMPT}" 2>&1 | tee -a "${LOG_FILE}"

  cycle=$((cycle + 1))
  sleep 2
done
