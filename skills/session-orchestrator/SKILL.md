---
name: session-orchestrator
description: Boot, route, and close repository sessions using durable workspace state. Use automatically at session start, when the user invokes session orchestration, when work must be routed to the correct functional skill, or when closing a session with verified handoff evidence.
---

# Session Orchestrator

Own session continuity, task routing, and closeout. Do not duplicate the work performed by functional skills.

## Boot

1. Read `workspace/BOOTSTRAP.md`.
2. Read `workspace/HANDOFF.md`, then its current dated handoff.
3. Read the relevant tail of `workspace/SESSION_MEMORY.md`, `workspace/STATE.md`, and `workspace/NEXT_SESSION_GOAL.md`.
4. Read `docs/README.md` when bootstrap or the task requires documentation context.
5. Inspect `git status --short`, the current branch, and `HEAD`. Preserve unrelated changes.
6. Refresh `graphify-out` only when code changed and the graph tool exists. Otherwise record the unavailable gate once and use `rg` plus direct reads.
7. Record the prompt in `workspace/PROMPT_LOG.md` when writes are allowed. In Plan Mode or another read-only mode, defer the entry until an authorized closeout.

## Route

Select the narrowest matching functional skill:

- rough or preference-based proposal -> `refine-suggestion`
- use or test current features -> `feature-exerciser`
- audit, review, grading, gaps, or connectivity -> `blast-through`
- behavior-preserving readability or maintainability refactor -> `refactor-readability`
- one focused implementation -> `codex`
- broad approved backlog or multi-section fixes -> `mass-implement`
- Polymarket historical archive or replay -> `polymarket-history-backfill`

Persona skills are compatibility routers: `gemini` returns here, `claude` routes to `blast-through`, and `codex` routes broad batches to `mass-implement`.

Use subagents only when the user or an applicable repository instruction explicitly authorizes delegation.

## Closeout

1. Record the prompt and result once; do not duplicate an existing session entry.
2. Append verified results and open work to the current dated handoff.
3. Append durable facts and cautions to `workspace/SESSION_MEMORY.md`.
4. Update `workspace/STATE.md` only when project direction, behavior, or a grade-relevant fact changed.
5. Update `workspace/NEXT_SESSION_GOAL.md` when the next action changed.
6. Refresh graph artifacts after meaningful code changes when tooling exists.
7. Report commands run, pass/fail/blocked evidence, untouched safety boundaries, and the first next action.

Do not describe source proof as fresh-install, host, deployment, recovery, or soak qualification.

## Truthfulness And Test Integrity

- Context is bounded. Build a task-local architecture map and disclose material surfaces not read or verified.
- Never claim a file was read, command ran, test passed, host was checked, or behavior was proved without direct
  evidence. Keep source, test, clean-install, CI, host, deployment, recovery, soak, paper, and live proof distinct.
- Do not weaken, skip, delete, mock away, suppress, or rewrite tests merely to make a result pass.
- Change a stale test only with canonical contract or approved behavior evidence; report the before/after
  expectation and keep production, tests, and docs aligned.
