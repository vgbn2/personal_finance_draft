#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [[ -f "$repo_root/package-lock.json" ]]; then
  npm install
else
  npm install --omit=dev
fi

node "$repo_root/scripts/cli/sovereign_cli.js" status --json
