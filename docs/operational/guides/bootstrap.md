# Session Bootstrap

This is the shared entry point for CLI assistants. The executable workflow lives in `skills/session-orchestrator/SKILL.md`.

## Load

1. `workspace/BOOTSTRAP.md`
2. `workspace/HANDOFF.md` and its current dated handoff
3. relevant tails of `workspace/SESSION_MEMORY.md`, `workspace/STATE.md`, and `workspace/NEXT_SESSION_GOAL.md`
4. `docs/README.md` and task-specific docs when needed
5. current Git status, branch, and `HEAD`
6. `graphify-out/GRAPH_REPORT.md` only when current and available
7. `skills/session-orchestrator/SKILL.md`

## Route

- rough proposal -> `refine-suggestion`
- current feature use/test -> `feature-exerciser`
- audit/review -> `blast-through`
- bounded implementation -> `codex`
- broad approved implementation -> `mass-implement`
- domain-specific history/replay -> the matching domain skill

## Rules

- Record prompts and closeout state only when the active mode permits writes.
- Reuse verified reads until repository state changes.
- Preserve unrelated changes and redact secrets.
- Delegate only with explicit user or governing-instruction authorization.
- Distinguish source/local proof from fresh-install, host, deployment, recovery, and soak qualification.
