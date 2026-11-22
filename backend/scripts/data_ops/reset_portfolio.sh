#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

node "$repo_root/frontend/cli-tui/sovereign_cli.js" portfolio --cash 10000 --positions "" --json
