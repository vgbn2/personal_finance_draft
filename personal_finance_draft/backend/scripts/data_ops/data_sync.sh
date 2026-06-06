#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if (($#)); then
  node "$repo_root/backend/scripts/data_ops/ingest_market_data/index.js" "$@"
else
  node "$repo_root/backend/scripts/data_ops/ingest_market_data/index.js" --help
fi
