---
name: context-memory
description: Preserve session state and repo decisions in HANDOFF.md and SESSION_MEMORY.md so future sessions can resume cleanly.
---

# Context Memory

Use this skill when you want the next session to inherit the current operating state.

## What To Save

- Current goals and in-scope tasks.
- What has already been verified.
- Known blockers or partial failures.
- Active agents and their roles.
- API keys or external systems required.
- Freshness or data-quality cautions.

## Canonical Files

- `HANDOFF.md` for the current-session handoff.
- `SESSION_MEMORY.md` for accumulated notes and cautions.
- `STATE.md` for the broader project state when the repo uses it.

## Update Rule

After meaningful work:

1. Record what changed.
2. Record what was verified.
3. Record what remains open.
4. Keep the notes short and factual.
5. Redact secrets and credential-bearing URLs.

## Reload Rule

At the start of a new session:

1. Read `HANDOFF.md`.
2. Read `SESSION_MEMORY.md`.
3. Read `STATE.md` if present.
4. Refresh derived context such as `graphify-out` when the repo changed.

