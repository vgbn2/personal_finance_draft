# Workspace Index

This directory is the repo's append-only working state. Keep durable decisions here when they matter beyond a single chat, and treat dated snapshots as history unless they are explicitly promoted back into `STATE.md`, `HANDOFF.md`, or `SESSION_MEMORY.md`.

## Canonical Live Truth

- [STATE.md](./STATE.md): current status anchor and latest durable corrections.
- [HANDOFF.md](./HANDOFF.md): carryover for the next agent/session.
- [SESSION_MEMORY.md](./SESSION_MEMORY.md): append-only session memory and current findings.
- [PROMPT_LOG.md](./PROMPT_LOG.md): prompt/session request log.
- [DEV_REVIEW.md](./DEV_REVIEW.md): active manual review queue.
- [DEV_COMMENTS.md](./DEV_COMMENTS.md): developer-facing notes and comments.
- [Structural audit report](reports/STRUCTURAL_AUDIT_REPORT.md): structural audit summary and grade notes.
- [BLAST_THROUGH_REPORT.md](./BLAST_THROUGH_REPORT.md): audit summary for broad repo passes.
- [Feature test matrix](reports/FEATURE_TEST_MATRIX.md): current feature audit matrix.
- [Feature repair plan](reports/FEATURE_REPAIR_PLAN.md): current repair plan for findings.
- [Cross-project learnings](history/CROSS_PROJECT_LEARNINGS.md): retained historical lessons; verify any claim before promotion.
- [archive/README.md](./archive/README.md): archived snapshots and superseded session artifacts.

## Working Plans

These are useful task-planning surfaces, but they are not the canonical truth by themselves.

- [NEXT_SESSION_GOAL.md](./NEXT_SESSION_GOAL.md)
- [Polymarket bot plan](plans/POLYMARKET_BOT_PLAN.md)
- [ML section plan](plans/ML_SECTION_PLAN.md)
- [Phase 8 test report](reports/PHASE_8_TEST_REPORT.md)

## Historical Snapshots

These are snapshots that may still contain useful evidence, but they should be treated as archives once their lessons are folded into the live truth files.

- [archive/BLAST_THROUGH_SESSION_53.md](./archive/BLAST_THROUGH_SESSION_53.md)
- [archive/BLAST_THROUGH_SESSION_76.md](./archive/BLAST_THROUGH_SESSION_76.md)
- [archive/FEATURE_TEST_MATRIX_2026_06_04.md](./archive/FEATURE_TEST_MATRIX_2026_06_04.md)

## Redundant Or Superseded

These files overlap with newer canonical surfaces or are better treated as transition artifacts.

- `archive/FEATURE_TEST_MATRIX_2026_06_04.md` is superseded by `FEATURE_TEST_MATRIX.md`.
- `archive/BLAST_THROUGH_SESSION_53.md` and `archive/BLAST_THROUGH_SESSION_76.md` are session snapshots; fold their conclusions into `BLAST_THROUGH_REPORT.md`, `STATE.md`, or `SESSION_MEMORY.md` instead of extending them.
- `PHASE_8_TEST_REPORT.md` is a phase artifact; keep it only as evidence if the phase is still relevant.
- `NEXT_SESSION_GOAL.md` is a transient pointer and should not become a second source of truth.

## Reading Order

1. `STATE.md`
2. `HANDOFF.md`
3. `SESSION_MEMORY.md`
4. `DEV_REVIEW.md`
5. The relevant plan or report if the task is scoped to a batch

The workspace is append-only. If something is stale, correct it by appending a note or promoting the truth into `STATE.md`, not by rewriting the history files.
