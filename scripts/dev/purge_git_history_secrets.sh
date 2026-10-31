#!/usr/bin/env bash
# Sovereign Trading Platform - Isolated RAM tmpfs Git Commit History Secret Purge
# Usage: ./scripts/dev/purge_git_history_secrets.sh [REMOTE_URL]
set -euo pipefail

REPO_URL="${1:-$(git config --get remote.origin.url || echo '')}"
if [ -z "$REPO_URL" ]; then
  echo "[ERROR] No remote origin URL found. Please provide repository URL as first argument." >&2
  exit 1
fi

TIMESTAMP=$(date +%s)
WORKDIR="/dev/shm/sovereign_repo_purge_${TIMESTAMP}"

echo "=== SOVEREIGN GIT HISTORY SECRET PURGE ==="
echo "Staging isolated mirror clone in RAM tmpfs: $WORKDIR"
mkdir -p "$WORKDIR"

git clone --mirror "$REPO_URL" "$WORKDIR"
cd "$WORKDIR"

echo "Executing git-filter-repo across entire commit graph..."
# Purge historical sensitive paths identified in GitHub secret scanning alerts #1-#13
git filter-repo --invert-paths \
  --path .env \
  --path secrets.env.example \
  --path polymarket_screener/secrets.env.example \
  --path _orchestrator/.env \
  --path _tools/llm_feeder/.env \
  --path _research/ptit_studies/Telecom_Quant_Finance/tools/deep_openai_extractor.py \
  --path _research/ptit_studies/Telecom_Quant_Finance/tools/deep_gemini_extractor.py \
  --path signalbots/telegram.py \
  --path _tools/signalbots/integrations/telegram.py \
  --path-glob 'temp_gemini/*' \
  --path temp_gemini \
  --force

echo "Expiring reflogs and executing aggressive packfile garbage collection..."
git reflog expire --expire=now --all
git gc --prune=now --aggressive

echo "Restoring remote origin configuration..."
git remote add origin "$REPO_URL"

echo ""
echo "=== PURGE STAGED SUCCESSFULLY IN RAM TMPFS ==="
echo "Location: $WORKDIR"
echo "To publish the rewritten commit graph to GitHub, run:"
echo "  cd $WORKDIR && git push origin --force --all && git push origin --force --tags"
echo "Collaborators must rebase or freshly clone after force-push."
