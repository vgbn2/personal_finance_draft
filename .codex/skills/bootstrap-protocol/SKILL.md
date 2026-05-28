---
name: bootstrap-protocol
description: Maintain session continuity and state persistence by following the project-wide bootstrap protocol.
---
# Bootstrap Protocol Skill

Use this skill to govern session initialization and state management according to `BOOTSTRAP.md`.

## Always Load
1. `workspace/PROMPT_LOG.md`
2. `workspace/HANDOFF.md`
3. `workspace/SESSION_MEMORY.md`
4. `workspace/STATE.md`
5. `graphify-out/GRAPH_REPORT.md` (if codebase changed)

## Mandatory Actions
- Record user prompts in `workspace/PROMPT_LOG.md`.
- Restate session objectives in `workspace/HANDOFF.md`.
- Ensure unfinished work is visible.
- Refresh `graphify-out` after meaningful code changes.
- Use sub-agents for bounded tasks.
