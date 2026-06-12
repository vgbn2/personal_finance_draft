---
name: gemini
description: Gemini umbrella skill for session bootstrap, continuity logging, and research-oriented context loading in personal_finance_draft.
---

# Gemini

Use this skill for session startup, continuity, and research-oriented context loading.

## Responsibilities

- Boot from workspace truth.
- Append prompt and session objective notes.
- Refresh graph context when the codebase changed materially.
- Keep the current carryover visible.

## Boot Order

1. `workspace/HANDOFF.md`
2. active dated handoff under `workspace/handoff/`
3. `workspace/SESSION_MEMORY.md`
4. `workspace/STATE.md`
5. `docs/engineering/codebase_org.md`
6. `graphify-out/GRAPH_REPORT.md` when relevant
