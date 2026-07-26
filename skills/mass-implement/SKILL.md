---
name: mass-implement
description: Execute broad repository improvement passes that fill known gaps, improve blast-through grades, and convert audit findings into verified implementation batches. Use when the user asks to mass implement, fill gaps, improve grades, blast through with fixes, or continue a large implementation cleanup across multiple repo sections.
---

# Mass Implement

Use this skill when the user wants forward motion across many gaps, not a single narrow fix.

## Operating Rule

Start from evidence, then implement in ranked batches. Do not turn a broad request into random edits. Each batch must improve at least one known grade factor: path clarity, duplication/drift, verification, artifact hygiene, or doc alignment.

When the user asks for planning, produce an objective implementation plan before editing. The plan must say what will be done, why it is ranked there, and the concrete source for that claim.

## Workflow

1. Load current repo truth first:
   - `PROJECT_RULES.md`
   - latest tail of `workspace/STATE.md`
   - latest relevant section of `workspace/DEV_REVIEW.md`
   - `README.md` or the nearest task-specific doc when behavior or deployment intent matters
2. Read any current blast-through findings.
3. If the user is asking for planning or score improvement strategy, switch into Planning Mode before editing anything.
4. Build a short ranked backlog:
   - trust-breaking failures first
   - stale contract/test drift second
   - small hygiene fixes third
   - design-heavy stubs only when the required behavior is already clear
5. Run the Pre-Implementation Review Gate before the first code edit in each batch.
6. Discuss the relevant edge cases for each batch before implementation.
7. Split work into batches with disjoint file ownership.
8. Use subagents only for bounded side tasks when the user allows delegation; keep the main thread on the critical path.
9. Before edits, name the batch and the files it will touch.
10. Implement conservatively using existing repo patterns.
11. Verify with the narrowest commands that prove the changed behavior, then one broader gate when practical.
12. Recheck the touched security boundaries after implementation.
13. Append a correction note to `workspace/STATE.md` when a grade-relevant fact changes.

## Planning Mode

Use this mode when the user asks to "plan", "raise the score", "improve grades", "tell me what you're going to do", or wants an objective implementation order.

The output must be evidence-backed, not aspirational. For each planned batch include:

- `objective`: the concrete grade-lifting outcome
- `why now`: the specific risk, regression, or trust gap it closes
- `source`: exact file and note that justified the batch, such as `workspace/DEV_REVIEW.md`, `workspace/STATE.md`, `README.md`, `PROJECT_RULES.md`, or a direct code/test contract
- `expected score movement`: which grade factor should improve (`verification`, `contract truth`, `runtime safety`, `artifact hygiene`, `doc alignment`)
- `edge cases`: the relevant boundary and failure conditions, with expected behavior and a planned test or explicit deferral
- `security check`: the trust boundaries touched, likely abuse or exposure paths, and the planned negative test or explicit `not applicable`
- `verification`: the command or probe that will prove the batch is complete

Rank planning batches using this order:

1. Proven production-contract mismatches
2. Resource exhaustion or data-loss risks
3. False health or monitoring signals
4. Deployment/profile traps that look healthy while doing nothing
5. Low-cost hygiene items that remove misleading repo state

If a score claim is not tied to a source, do not include it in the plan.

## Pre-Implementation Review Gate

Before the first code edit in every batch, briefly review the current plan against current repository truth.
This is a required go/no-go gate, including when the plan was written in an earlier session.

1. Confirm the objective, active batch, acceptance criteria, intended files, safety boundaries, and verification
   commands still match the current code, tests, configuration, and latest workspace state.
2. Identify stale assumptions, newly completed work, changed paths, active runtime constraints, or missing
   dependencies. Correct the plan before implementation when any of these change the batch order or scope.
3. Add a small number of plausible, non-overlapping edge cases found from the actual code paths. Each added case
   must include `trigger`, `expected behavior`, `owner`, and `proof` or an explicit deferral.
4. Run a proportionate security checkup over the exact surfaces the batch will touch. Mark irrelevant categories
   `not applicable` rather than manufacturing findings:
   - authentication, authorization, role/capability enforcement, and fail-closed defaults
   - untrusted input validation, injection, path traversal, unsafe command/URL construction, and output encoding
   - credentials, tokens, personal data, logs, error messages, file permissions, and secret persistence
   - network binding, CORS, SSRF/redirect behavior, loopback/tunnel assumptions, and public exposure
   - trading/write capability, deployment-profile boundaries, privileged operations, and kill-switch behavior
   - symlink/TOCTOU races, partial writes, atomic publication, ownership, and concurrent file access
   - dependency, generated-artifact, migration, compatibility, and rollback exposure
5. Publish a concise pre-implementation brief containing:
   - plan freshness and any corrections
   - active batch and intended files
   - added edge cases and planned proof
   - security findings with severity, evidence, owner, and disposition
   - explicit `GO`, `GO WITH FIXES`, or `NO-GO`

Implementation is `NO-GO` while a confirmed P0/P1 security issue is unresolved; authorization or safety
ownership is ambiguous; required credentials could be exposed; or the batch would cross an unapproved live,
provider, public-network, destructive-data, migration, or privileged-runtime boundary. Lower-severity findings
must be fixed in the active batch or explicitly deferred with an owner and verification gate.

This gate is a scoped preflight, not a claim of a complete penetration test. Recheck the changed trust
boundaries after implementation and report what was actually tested.

## Edge-Case Review

For every planned or active batch, discuss only edge cases that can change correctness, safety, data
preservation, resource use, or user-visible truth. Keep cases non-overlapping and tie each one to a named
requirement or current code path.

For each applicable case, record:

- `trigger`: the boundary, failure, or unusual input
- `expected behavior`: the observable fail-open, fail-closed, fallback, retry, or user-visible state
- `owner`: the component that must enforce the behavior
- `proof`: a focused test, fixture, runtime probe, or an explicit reason for deferral

Check these categories when relevant:

- missing, empty, malformed, duplicate, stale, or partially written data
- zero, negative, maximum, off-by-one, timestamp, timezone, and market-closure boundaries
- concurrent writers, retries, duplicate delivery, interruption, restart, and idempotency
- provider outage, timeout, rate limit, authentication failure, and degraded fallback
- large inputs, memory pressure, disk-full, thermal/load pressure, and bounded latency
- permission, deployment-profile, sandbox, path, and cross-platform differences
- narrow viewports, long labels, loading, empty, stale, partial, unauthorized, and error UI states
- compatibility, migration, rollback, and old-artifact behavior

Do not inflate the backlog with speculative combinations. Rank trust-breaking and data-loss cases first,
merge equivalent cases, mark irrelevant categories `not applicable`, and defer design-heavy cases whose
required behavior is not yet approved.

## Batch Selection

Prefer fixes that make current claims true:

- failing tests over missing features
- stale docs/contracts over decorative implementation
- real data normalization over synthetic demos
- source-tree hygiene over adding more scaffold
- minimal complete modules over half-filled architecture stubs

Avoid broad deletion unless the user explicitly approves cleanup of generated artifacts.

## Verification Standard

Report evidence, not vibes:

- command run
- input source or fixture
- record or row counts when data is involved
- failing assertion fixed or invariant proven
- edge cases covered, including the trigger and observed expected behavior
- output path or artifact touched

If a gate cannot run locally, state the blocker and use a source-level or direct compiler fallback only when it genuinely covers the changed files.

## Closeout

End with:

- grade movement achieved
- files changed
- commands run and result
- edge cases verified and any explicitly deferred cases
- pre- and post-implementation security checks, findings, fixes, and explicit deferrals
- remaining highest-impact gap

If the run stopped in Planning Mode without edits, end with:

- ranked batches
- source for each batch
- expected grade movement
- edge cases and their planned proof or explicit deferral
- security check scope, findings, and planned negative proof or explicit `not applicable`
- first verification gate to run after implementation starts

Do not mark the broader objective complete unless every named requirement is verified against current state.
