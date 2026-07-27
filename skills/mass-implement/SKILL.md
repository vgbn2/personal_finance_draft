---
name: mass-implement
description: Convert approved, evidence-backed repository findings into ranked, verified implementation batches across multiple personal_finance_draft sections. Use for broad gap closure, grade improvement, multi-section cleanup, or continuing an approved implementation backlog; do not use for audit-only work or a single bounded fix.
---

# Mass Implement

Implement approved broad work in deterministic batches. Start from current evidence; never convert a vague request into random edits.

## Required Intake

Each finding or requirement must have:

- identifier and objective;
- current evidence and severity;
- acceptance criteria;
- intended owner/surface;
- safety boundary;
- focused verification gate.

If these are missing, route the request through `refine-suggestion` or `blast-through` before editing.

## Batch Lifecycle

Use exactly:

`proposed -> preflight -> GO | GO WITH FIXES | NO-GO -> implemented -> verified -> reviewed -> closed | deferred`

Do not begin the next batch until the current batch is verified, reviewed, and closed or explicitly deferred.

## Workflow

1. Load `PROJECT_RULES.md`, current state/handoff/review evidence, and the nearest behavioral docs.
2. Rank production-contract mismatches, data-loss/resource risks, false health, deployment traps, then hygiene.
3. Revalidate the active batch against current code, dirty-tree ownership, acceptance criteria, and verification.
4. Add only non-overlapping edge cases that affect correctness, safety, preservation, resource use, or user-visible truth.
5. Check applicable trust boundaries: auth, input/path/command safety, secrets/logs, network exposure, trading/write capability, concurrency/atomicity, dependencies, migration, and rollback.
6. Publish a concise preflight with intended files, edge cases, security findings, and GO status.
7. Implement conservatively through existing owners.
8. Run focused proof, then one broader practical gate.
9. Recheck changed trust boundaries and classify every failure as regression, pre-existing defect, environment limitation, or stale expectation.
10. Update grade-relevant state and close the batch with evidence.

Use subagents only when the user explicitly allows delegation. Keep file ownership disjoint when delegation is authorized.

## Stop and Replan

Use `NO-GO` for an unresolved P0/P1, ambiguous authorization, credential exposure, destructive or irreversible uncertainty, or an unapproved live/provider/public/migration/privileged boundary.

When verification fails, stop batch progression, reproduce the failure, classify it, correct the plan if needed, and rerun the focused gate. Do not bury a regression inside aggregate noise.

In Plan Mode or another non-mutating mode, produce the decision-complete batch plan only.

## Closeout

Report the batch state, files changed, commands/results, edge cases, security check, grade movement, deferred items, and highest-impact next gap. Do not mark the broad objective complete until every named requirement is verified.
