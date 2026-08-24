# Refactor Readability And Function Mapping Plan

## Objective

Produce a source-verified function/process map, then incrementally reduce mixed responsibility and excessive
case dispatch in the highest-value coordinators without changing public behavior, safety policy, persistence,
provider semantics, or paper/live boundaries.

## Refined Interpretation

- “Generality” means one representation for genuinely shared policy or case mapping, not universal abstraction.
- “Do not spam if statements” means review repeated case enumeration, deep nesting, and mixed lifecycle branches.
  Explicit validation, authorization, risk, error, and ordered decision guards remain visible.
- The repository stays hierarchically organized by domain. Procedural top-down flow is required inside
  coordinators; pure procedural organization is not a repository-wide target.
- Function mapping is durable architecture metadata in
  `docs/engineering/function_process_map.md`, not a generated session dump.

## In Scope

- Current production JS/TS/C++ entrypoints, coordinators, persistent loops, timers, Compose services, and systemd
  supervisor paths.
- Function metadata: owner, activity class, trigger, inputs/outputs, side effects, state/concurrency, callers,
  tests, and refactor disposition.
- Large-file and control-flow triage, characterization tests, one cohesive behavior-preserving seam per batch.
- `refactor-readability`, `codebase-untangler`, `refine-suggestion`, and `session-orchestrator` workflow upgrades.

## Out Of Scope Without Separate Approval

- Behavioral/API/schema/auth/data-format/provider/dependency changes.
- Canonical-data repair, service start/restart, public exposure, Paper/live orders, migration, or deletion.
- A clean-slate rewrite, repository-wide class hierarchy, or a requirement to eliminate all conditional logic.
- Committing unrelated existing dashboard, Compose, continuity, or risk-contract changes as one opaque batch.

## Current Evidence

- `backend/gateway/src/index.ts::main`: about 805 lines, 118 control nodes, 105 `if` nodes, depth 25.
- `ingestMarketData`: about 382 lines, 62 controls, depth 8.
- `runCycle`: about 351 lines, 52 controls, depth 10.
- Ink dashboard input callback: about 285 lines, 74 controls, depth 8.
- `backfillPolymarketArchive`: about 242 lines, 35 controls, depth 8.
- `commandBacktest`: about 283 lines, 29 controls, depth 4.
- The existing changed-file audit is intentionally narrower than this inventory and currently reports two
  pre-existing changed-file depth violations.

## Ranked Batches

### Batch 0 — Mapper And Characterization

1. Turn the one-off JS/TS hotspot scan into a tested read-only repository tool.
2. Add C++ function-level mapping or explicitly label C++ metrics unavailable rather than guessing.
3. Link each selected hotspot to direct callers, public contracts, side effects, lifecycle, and focused tests.
4. Establish a clean or explicitly attributed aggregate baseline before source movement.

### Batch 1 — Polymarket Archive, Safest First Seam

Extract pure market-index merge and manifest construction, then one token archival procedure from
`backfillPolymarketArchive`. Preserve schema-v1 mirrors, schema-v2 run history, skip-existing counters, delays,
feature regeneration, provider pacing, paths, ordering, and errors.

### Batch 2 — Gateway Command Ownership

Map `main` into public/account diagnostics, Polymarket research, Polymarket execution, bot, and process command
families. Introduce one declarative command-family dispatcher only after each handler preserves runtime policy,
credential projection, risk authorization, output, and exit behavior. Execution commands are last within this
batch.

### Batch 3 — Ingestion Pipeline

Separate request/scope preparation, standard-family acquisition, options acquisition, validation/deduplication,
and persistence finalization. Preserve provider order, freshness/depth gates, scoped snapshots, PIT metadata,
macro writes, JSON caps, and merge-protected ts-index writes.

### Batch 4 — Research And UI State Machines

- Split `commandBacktest` into request resolution, run execution, pure report construction, persistence, and
  rendering.
- Model Ink key transitions as a pure reducer plus explicit effects only after PTY characterization is stable.

### Batch 5 — Remaining Candidates

Re-rank `runCycle`, strategy automation, native `main.cpp`, and files over 500 lines from fresh metrics. Retain
cohesive state machines with written keep decisions rather than splitting to satisfy a line target.

## Acceptance Criteria Per Batch

- One canonical owner per moved rule; no generic utility dumping ground or duplicate implementation.
- Public inputs, outputs, exit codes, ordering, errors, persistence, and compatibility remain unchanged unless a
  separate behavioral batch is approved.
- Selected coordinator has lower mixed responsibility and no increased maximum nesting.
- New helpers have semantic names and one activity class; I/O and mutation remain explicit.
- Characterization tests detect removal or bypass of auth, risk, one-writer, pacing, and fail-closed guards.
- Function/process map and owning docs are updated in the same batch.
- Focused tests, documentation audit, structure, hygiene, diff check, and broadest practical regression run.

## Session Closeout Contract

When the user requests release closeout for that session:

1. review exact paths and exclude unrelated dirty work;
2. run required source/test and committed-archive gates;
3. commit only reviewed paths and push the intended branch;
4. verify the remote ref;
5. preview rsync, then sync only approved source/artifacts to the exact hpdesk destination without secrets,
   runtime data, build output, or unrelated files;
6. perform read-only hpdesk revision, service state, health, safety-variable, and bounded Docker log checks;
7. do not start, restart, recreate, deploy, migrate, or trade unless that operation is explicitly authorized;
8. record source, commit, remote, sync, and runtime evidence as separate layers.

Commit, push, rsync, and host inspection remain not-run in this planning turn.

## First Next Action

Run Batch 0 in `codebase-untangler` map mode, establish an attributed baseline, and choose exactly one
characterized Polymarket archive extraction before editing production code.
