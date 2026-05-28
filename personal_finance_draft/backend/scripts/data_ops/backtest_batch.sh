#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if (($#)); then
  node "$repo_root/scripts/cli/sovereign_cli.js" backtest "$@"
else
  node "$repo_root/scripts/cli/sovereign_cli.js" backtest --help
fi
