#!/usr/bin/env bash
set -euo pipefail

# Stage the real source/dist tree in tmpfs. The harness must provide a local
# Alpaca HTTP worker; no external credentials or provider network are allowed.
root="${ALPACA_CONTRACT_ROOT:-/tmp/opencode/alpaca-bot-account-seam-build}"
if [[ ! -f "$root/backend/execution/dist/index.js" ]]; then
  echo "BLOCKED: missing compiled gateway at $root/backend/execution/dist/index.js" >&2
  exit 2
fi
if ! rg --no-mmap -q 'allocations' "$root/backend/execution/dist/index.js"; then
  echo "BLOCKED: gateway build lacks --allocations contract" >&2
  exit 2
fi
if ! rg --no-mmap -q 'accountNamespace' "$root/backend/execution/dist/index.js"; then
  echo "BLOCKED: gateway build lacks account namespace contract" >&2
  exit 2
fi

env -i \
  PATH="${PATH}" \
  HOME=/tmp/opencode/alpaca-bot-account-home \
  ALPACA_CONTRACT_ROOT="$root" \
  SOVEREIGN_SKIP_DOTENV=1 \
  SOVEREIGN_SKIP_LOCAL_ENV=1 \
  node --test "$root/tests/scripts/operational/alpaca_bot_account_seam.test.js"
