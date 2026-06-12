---
name: codex
description: Codex umbrella skill for repository truth, implementation, verification, and workspace updates in personal_finance_draft.
---

# Codex

Use this skill for non-trivial implementation work in this repository.

## Responsibilities

- Load repo truth before editing.
- Implement the requested fix or feature.
- Verify with focused probes before broad claims.
- Update workspace state when behavior changes.

## Default Load Order

1. `workspace/STATE.md`
2. `workspace/HANDOFF.md` or the active dated handoff
3. `workspace/SESSION_MEMORY.md`
4. `workspace/PROMPT_LOG.md` when continuity matters
5. `docs/engineering/codebase_org.md`
6. `workspace/DEV_REVIEW.md` when there is active debt

## Working Rules

- Search first, read targeted sections, and keep claims evidence-backed.
- Prefer code and tests over prose-only fixes.
- Preserve append-only workspace history.
