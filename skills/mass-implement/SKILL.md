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

## Duplicate And Stub Preflight

Before implementing each feature or fix, scan its task-local architecture map for duplicate owners, divergent
implementations, incomplete stubs, orphan exports, stale compatibility paths, and generated copies. Include source,
entrypoints, callers, imports/exports, configuration/manifest wiring, tests, build/distribution artifacts, and docs.

Classify every candidate as one of:

- canonical owner;
- required compatibility shim;
- generated artifact;
- test fixture;
- honest unavailable feature;
- dead duplicate;
- divergent production implementation.

Do not delete from string search alone. Prove ownership and consumers across source, aliases, compiled output,
configuration, tests, and packaging. If a dead duplicate is safely inside the approved batch, remove it and verify
caller/contract parity in that batch. If a divergent or incomplete production path would compete with the new owner,
use `GO WITH FIXES` to consolidate it first or `NO-GO` to re-scope the migration; do not leave poison code beside the
new implementation. Preserve required shims, fixtures, and generated inputs, and document why they remain.

## Batch Lifecycle

Use exactly:

`proposed -> preflight -> GO | GO WITH FIXES | NO-GO -> implemented -> verified -> reviewed -> closed | deferred`

Do not begin the next batch until the current batch is verified, reviewed, and closed or explicitly deferred.

## Workflow

1. Load `PROJECT_RULES.md`, current state/handoff/review evidence, and the nearest behavioral docs.
2. Rank production-contract mismatches, data-loss/resource risks, false health, deployment traps, then hygiene.
3. Revalidate the active batch against current code, dirty-tree ownership, acceptance criteria, and verification.
4. Complete the Duplicate And Stub Preflight and resolve competing production ownership before adding code.
5. Add only non-overlapping edge cases that affect correctness, safety, preservation, resource use, or user-visible truth.
6. Check applicable trust boundaries: auth, input/path/command safety, secrets/logs, network exposure, trading/write capability, concurrency/atomicity, dependencies, migration, and rollback.
7. Publish a concise preflight with intended files, duplicate/stub classifications, edge cases, security findings, and GO status.
8. Implement conservatively through existing owners.
9. Run focused proof, then one broader practical gate.
10. Recheck changed trust boundaries and classify every failure as regression, pre-existing defect, environment limitation, or stale expectation.
11. Apply the Readable Implementation Contract and remove batch-introduced duplication or narrative drift.
12. Update grade-relevant state and close the batch with evidence.

Use subagents only when the user explicitly allows delegation. Keep file ownership disjoint when delegation is authorized.

## Readable Implementation Contract

Work like an engineer contributing to an unfamiliar production codebase: read before editing, preserve local
rules and working legacy behavior, and improve incrementally instead of imposing a clean-slate style.

Every batch must leave touched code understandable without reconstructing the generating session:

- preserve one canonical owner for each domain rule; do not fork a second plausible implementation;
- follow established local naming, module, async, validation, error, and configuration conventions;
- use domain-intent names and top-down control flow; prefer focused functions and early exits over deep nesting;
- keep invariants, side effects, mutation, trust boundaries, and failure states explicit;
- comment why a decision exists, not what the next line does;
- avoid speculative abstractions, generic dumping-ground utilities, and wrappers with no semantic value;
- update comments/docs/contracts in the same batch when behavior or ownership moves;
- do not use passing tests to justify unreadable ownership or unexplained coupling.

Treat size as a review signal, not a mechanical limit. Avoid net growth in a touched file already above 500
lines unless cohesion would be worse after extraction. For a touched file above 1,000 lines, record its
responsibilities and an explicit split-or-keep decision. Report before/after sizes for materially refactored
hotspots.

## Stop and Replan

Use `NO-GO` for an unresolved P0/P1, ambiguous authorization, credential exposure, destructive or irreversible uncertainty, or an unapproved live/provider/public/migration/privileged boundary.

When verification fails, stop batch progression, reproduce the failure, classify it, correct the plan if needed, and rerun the focused gate. Do not bury a regression inside aggregate noise.

In Plan Mode or another non-mutating mode, produce the decision-complete batch plan only.

## Closeout

Report the batch state, files changed, commands/results, edge cases, security check, grade movement, deferred items, and highest-impact next gap. Do not mark the broad objective complete until every named requirement is verified.

## Truthfulness And Test Integrity

- Context is bounded. Build a task-local architecture map and disclose material surfaces not read or verified.
- Never claim a file was read, command ran, test passed, host was checked, or behavior was proved without direct
  evidence. Keep source, test, clean-install, CI, host, deployment, recovery, soak, paper, and live proof distinct.
- Do not weaken, skip, delete, mock away, suppress, or rewrite tests merely to make a result pass.
- Change a stale test only with canonical contract or approved behavior evidence; report the before/after
  expectation and keep production, tests, and docs aligned.
