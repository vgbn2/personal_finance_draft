#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
exec node "$repo_root/scripts/dev/verify_source_evidence.js" \
  --mode committed_archive \
  "$@"
