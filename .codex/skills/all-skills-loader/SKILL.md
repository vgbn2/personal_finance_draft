---
name: all-skills-loader
description: Bootstrap skill that points sessions at the repo's workflow, memory, review, and research skills so they can be loaded without manual selection.
---

# All Skills Loader

Use this skill when the user wants the workspace to behave like it already knows the workflow.

## Purpose

- Give the session a single obvious entry point.
- Point the assistant to the repo's other workflow skills.
- Reduce manual skill selection.
- Keep the same boot path for Gemini, sub-agents, and other CLI assistants that can read repo files.

## Load Order

1. `repo-global-protocol`
2. `evidence-first-testing`
3. `subagent-contracts`
4. `technical-debt-ledger`
5. `verification-gates`
6. `session-orchestrator`
7. `context-memory`
8. `blast-through`
9. `code-review`
10. `multi-agent-research`

## What To Do

1. Read `workspace/BOOTSTRAP.md`.
2. Load `workspace/PROMPT_LOG.md`, `workspace/HANDOFF.md`, `workspace/SESSION_MEMORY.md`, `workspace/STATE.md`, and `workspace/NEXT_SESSION_GOAL.md`.
3. Identify whether the current session is execution-heavy, review-heavy, or research-heavy.
4. Use the matching downstream skill instead of asking the user to name it again.
5. Refresh `graphify-out` when the repo changed.

## Operating Rule

- If the session is mostly coding, hand off to `session-orchestrator`.
- If the session is mostly review or audit, hand off to `blast-through` and `code-review`.
- If the session needs parallel side work, hand off to `multi-agent-research`.
