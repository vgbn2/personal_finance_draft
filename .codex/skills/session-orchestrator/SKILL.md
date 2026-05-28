---
name: session-orchestrator
description: Boot-time workflow for prompt logging, context loading, delegation, graph refresh, and end-of-session handoff.
---

# Session Orchestrator

Use this skill automatically at the start of each new session when working in this repo.

## Boot Sequence

1. Read `workspace/BOOTSTRAP.md`.
2. Read `workspace/HANDOFF.md`.
3. Read `workspace/SESSION_MEMORY.md`.
4. Read `workspace/STATE.md` if present.
5. Refresh `graphify-out` when code changed in the previous session.
6. Load the current prompt into `workspace/PROMPT_LOG.md`.
7. Reuse already-read files unless the repo state changed.

## Working Rule

- Treat the prompt log as a session history.
- Treat `HANDOFF.md` as the current objective and open work list.
- Treat `SESSION_MEMORY.md` as cumulative memory for verified facts and cautions.
- Treat `STATE.md` as the broader project state.
- Treat `workspace/PROMPT_LOG.md` as durable prompt history.

## Delegation Rule

- Use sub-agents for bounded side tasks.
- Use lighter-weight models for implementation or token-heavy routine work.
- Use the strongest available review model at the end of the session for code review.
- Use one sub-agent per distinct side task when possible.
- Prefer shared repo files over chat memory for anything that must survive sessions.

## Verification Rule

- Update `graphify-out` after meaningful code changes.
- Run the smallest relevant test set before claiming completion.
- Record what passed, what failed, and what remains open.
- If a change touches code plus docs, update both before the session closes.

## Handoff Rule

At the end of the session:

1. Update `workspace/PROMPT_LOG.md`.
2. Update `workspace/HANDOFF.md`.
3. Update `workspace/SESSION_MEMORY.md`.
4. Update `workspace/STATE.md` if the project direction changed.
5. Add short next-step ideas that the user can verify in the next session.
6. Refresh `graphify-out` before the final handoff when code changed.
