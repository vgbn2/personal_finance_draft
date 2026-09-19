#!/usr/bin/env bash
# Purge stale Claude Code agent worktrees from /tmp to recover tmpfs/swap pressure.
# Safe: only removes dirs that contain .claude/ or .agent/ markers AND have no open file handles.
# Usage: bash scripts/ops/cleanup_tmp_worktrees.sh [--dry-run]
set -euo pipefail

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

freed=0
found=0

for dir in /tmp/*/; do
  [[ -d "$dir" ]] || continue
  # Must have agent markers to be a candidate
  if [[ ! -d "${dir}.claude" && ! -d "${dir}.agent" ]]; then
    continue
  fi
  found=$((found + 1))
  size_bytes=$(du -sb "$dir" 2>/dev/null | awk '{print $1}')
  size_human=$(du -sh "$dir" 2>/dev/null | awk '{print $1}')
  open_handles=$(lsof +D "$dir" 2>/dev/null | wc -l)
  if [[ "$open_handles" -gt 0 ]]; then
    echo "SKIP (in use, ${open_handles} handles): $dir [${size_human}]"
    continue
  fi
  echo "${DRY_RUN:+DRY-RUN }REMOVE: $dir [${size_human}]"
  if [[ "$DRY_RUN" == "false" ]]; then
    rm -rf "$dir"
    freed=$((freed + size_bytes))
  fi
done

if [[ "$found" -eq 0 ]]; then
  echo "No stale agent worktrees found in /tmp."
  exit 0
fi

if [[ "$DRY_RUN" == "false" ]]; then
  freed_mb=$(( freed / 1024 / 1024 ))
  echo "Done. Freed ~${freed_mb}MB."
  echo ""
  free -h
  swapon --show 2>/dev/null || true
fi
