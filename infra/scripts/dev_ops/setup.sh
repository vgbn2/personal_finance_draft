#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$repo_root"

if [[ -f "$repo_root/package-lock.json" ]]; then
  npm install
else
  npm install --omit=dev
fi

node "$repo_root/frontend/cli-tui/sovereign_cli.js" status --json
