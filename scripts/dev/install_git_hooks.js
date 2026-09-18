#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const GIT_HOOKS_DIR = path.join(REPO_ROOT, '.git', 'hooks');
const PRE_PUSH_TARGET = path.join(GIT_HOOKS_DIR, 'pre-push');

const PRE_PUSH_SCRIPT = `#!/bin/sh
# Sovereign pre-push hook: prevent pushing workspace/, storage/, and agent prompt files to GitHub
remote="$1"
url="$2"

# Only guard remote destinations targeting GitHub
case "$url" in
  *github.com*) ;;
  *) exit 0 ;;
esac

zero_sha="0000000000000000000000000000000000000000"

while read -r local_ref local_sha remote_ref remote_sha; do
  if [ "$local_sha" = "$zero_sha" ]; then
    continue # branch deletion
  fi

  if [ "$remote_sha" = "$zero_sha" ]; then
    if git rev-parse --verify origin/main >/dev/null 2>&1; then
      range="origin/main..$local_sha"
    else
      range="$local_sha"
    fi
  else
    range="$remote_sha..$local_sha"
  fi

  blocked_diff=$(git diff --name-only --diff-filter=ACMR "$range" -- 'workspace/' 'storage/' 'CLAUDE.md' 'GEMINI.md' 'AGENTS.md' '*CLAUDE.md' '*GEMINI.md' '*AGENTS.md' 2>/dev/null || true)
  if [ -n "$blocked_diff" ]; then
    echo "\\033[31m✖ [PRE-PUSH BLOCKED]\\033[0m Attempting to push private/local files (workspace/, storage/, or agent prompts) to GitHub."
    echo "\\033[33mworkspace/, storage/, CLAUDE.md, GEMINI.md, and AGENTS.md are local/private to host and must not be pushed to GitHub.\\033[0m"
    echo "Violating files in $range:"
    echo "$blocked_diff" | head -n 10
    exit 1
  fi
done

exit 0
`;

function installHooks() {
  if (!fs.existsSync(GIT_HOOKS_DIR)) {
    return;
  }
  fs.writeFileSync(PRE_PUSH_TARGET, PRE_PUSH_SCRIPT, { mode: 0o755 });
  console.log('✔ Installed .git/hooks/pre-push (blocks workspace/ push to GitHub)');
}

if (require.main === module) {
  installHooks();
}

module.exports = { installHooks };
