#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

node "$repo_root/backend/cli/sovereign_cli.js" check --strict --json
