# Session Bootstrap

This file is the shared entry point for Gemini sessions, sub-agents, and other CLI-based assistants.

## Always Load

1. `workspace/PROMPT_LOG.md`
2. `workspace/HANDOFF.md`
3. `workspace/SESSION_MEMORY.md`
4. `workspace/STATE.md`
5. `workspace/NEXT_SESSION_GOAL.md`
6. `graphify-out/GRAPH_REPORT.md` when the codebase changed recently
7. `.gemini/skills/all-skills-loader/SKILL.md`

## Always Do

- Record the user prompt in `workspace/PROMPT_LOG.md`.
- Restate the session objective in `workspace/HANDOFF.md`.
- Keep unfinished work visible.
- Prefer targeted reads over broad rereads.
- Refresh `graphify-out` after meaningful code changes.
- Use sub-agents for small bounded tasks.
- Use lighter models for routine implementation and a stronger model for end-of-session review.

## Shared Working Rules

- Do not ask the user to re-explain the session history.
- Do not rely on memory alone for ongoing work.
- Keep notes short, factual, and current.
- Redact secrets and credential-bearing URLs.
