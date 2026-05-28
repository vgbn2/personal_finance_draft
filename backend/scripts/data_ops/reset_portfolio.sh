#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

node "$repo_root/scripts/cli/sovereign_cli.js" portfolio --cash 10000 --positions "" --json
