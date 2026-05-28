#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if (($#)); then
  node "$repo_root/scripts/data_ops/ingest_market_data.js" "$@"
else
  node "$repo_root/scripts/data_ops/ingest_market_data.js" --help
fi
