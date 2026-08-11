---
name: codebase-untangler
description: Recover source-verified engineering knowledge and incrementally untangle fragmented ownership in personal_finance_draft. Use for multi-session codebase mapping, hidden-knowledge promotion, Code Atlas maintenance, canonical-owner recovery, compatibility-led migration, and staged modular convergence; route bounded refactors to refactor-readability, behavioral fixes to codex, broad approved fixes to mass-implement, and audits to blast-through.
---

# Codebase Untangler

Own long-running knowledge recovery, architecture mapping, seam selection, migration lifecycle, and staged convergence. Do not implement a clean-slate rewrite or duplicate the mechanics of existing functional skills.

## Root Boundary

Treat the repository roots as separate modules:

- `docs/` owns durable, source-linked engineering knowledge.
- `workspace/` owns operational state, active evidence, handoffs, blockers, and migration lifecycle.

A workspace fact becomes durable only through:

`candidate evidence -> source/test verification -> one canonical docs owner -> workspace disposition + link`

Never copy a complete module, algorithm, structure, protocol, topology, or architecture explanation into workspace. Never cite workspace as the canonical owner of an engineering contract.

## Modes

Declare exactly one mode:

- `map` — read-only subsystem ownership and knowledge map;
- `plan` — decision-complete seam and batch plan from verified evidence;
- `execute` — one approved untangling batch through the narrowest implementation skill;
- `continue` — resume the next unblocked ledger batch;
- `review` — re-audit a completed batch and update evidence.

Use Hard Reading Mode for a new or stale subsystem. Use Fast Reading Mode only when the source anchor, graph, docs, tests, and ledger remain current.

## Intake

Require:

- subsystem/domain and maintainer outcome;
- current `HEAD` plus dirty-tree ownership;
- entrypoints, public behavior, compatibility, and safety boundaries to preserve;
- focused and broad verification gates;
- authorization for behavior changes, deletion, migration, provider/runtime/host action, or delegation.

Default authorization excludes deletion, behavior/API/schema/data/auth/provider/execution/deployment changes, and subagents. Work directly in the main session unless the user explicitly authorizes delegation later.

## Build The Task-Local Map

Read current source, direct callers, public entrypoints, tests, config, data/state formats, generated outputs, relevant docs, workspace evidence, and history. Trace:

`operator/API/UI entrypoint -> coordinator -> canonical domain owner -> adapter/persistence -> output/status/recovery`

Classify adjacent paths as:

- canonical owner;
- façade or entrypoint;
- required compatibility shim;
- migration adapter;
- generated artifact;
- test fixture/double;
- honest unavailable feature;
- dead duplicate candidate;
- divergent production owner;
- unresolved.

Do not delete from string search alone. Prove consumers across source, aliases, compiled/generated output, configuration, tests, and packaging.

## Recover And Promote Knowledge

Mine workspace logs, handoffs, reviews, plans, graph reports, and documentation mirrors only as historical evidence. Record candidates in `workspace/reports/DOCUMENTATION_KNOWLEDGE_INVENTORY.md`.

Before promotion:

1. verify the claim against current source/config and focused tests;
2. choose exactly one docs owner and stable record id where applicable;
3. reconcile existing docs instead of creating a competing page;
4. mark evidence scope honestly: source, test, working tree, committed archive, CI, provider, host, deployment, recovery, soak, paper, or live;
5. replace closed workspace narrative with disposition and canonical link where practical.

## Documentation Ownership

Update the smallest owning surface:

- `docs/modules/` — capability owner, public contract, dependencies, failure/recovery, operations links;
- `docs/atlas/algorithms/` — equations, symbols, units, pseudocode, invariants, complexity, numerical behavior, reference vectors;
- `docs/atlas/structures/` — types/schemas, field semantics, mutation, persistence, compatibility, concurrency, recovery, cost;
- `docs/atlas/protocols/` — participants, shapes, sequencing, errors, retries/timeouts, trust, compatibility, recovery;
- `docs/atlas/topology/` — entrypoint-to-owner flow, dependency direction, state/I/O, processes, adapters, shims, failure domains;
- `docs/architecture/` or current engineering architecture owner — cross-module system boundaries;
- architecture decision records — non-obvious choices and rejected alternatives;
- `docs/research/` — validated theory and research assumptions;
- `docs/operational/` — task procedures and runbooks.

Module pages link to deep Atlas records; they do not repeat them. Workspace links to docs; it does not mirror them.

Update or create an Atlas record whenever an approved batch changes an important algorithm, equation, data structure, protocol, topology, invariant, complexity characteristic, numerical assumption, or implementation owner.

## Measure Before Movement

Record applicable before-state evidence:

- files/functions and public entrypoints;
- largest function/file and control-flow depth;
- callers/importers and cross-domain dependencies;
- duplicate/divergent policy owners;
- mutable globals, I/O, secrets, writes, processes, locks, and side effects;
- compatibility shims and unmigrated consumers;
- graph cycles/communities crossed;
- characterization/contract coverage;
- module/Atlas documentation completeness;
- incident trace: symptom -> signal -> owner -> safe recovery.

Use size as a review signal, not a splitting target. Any second plausible production owner is a consolidation blocker. Compatibility deletion without complete consumer proof is `NO-GO`.

## Freeze Behavior Before Movement

Use existing contracts first. Add focused characterization tests only for reachable behavior that is not sufficiently specified. Tests exercise the intended production owner rather than replacing it with a mock.

Freeze applicable inputs/outputs, errors, ordering, retries, pacing, caches, clocks, data formats, provenance, one-writer rules, auth/risk decisions, CLI/API/UI/native parity, resource bounds, degraded behavior, and recovery.

If current behavior is unsafe or incorrect, stop structural work and route the behavioral repair to `codex` or `mass-implement`; do not encode a defect as the desired contract without review.

## Select One Incremental Seam

Prefer:

1. pure value/contract extraction;
2. request/options parsing;
3. pure report/projection construction;
4. adapter/acquisition boundary;
5. persistence/finalization boundary;
6. lifecycle/state machine boundary;
7. public entrypoint or compatibility retirement last.

For the seam record responsibility moved, old/new owner, migration abstraction, callers in scope, compatibility retained, retirement condition, behavior proof, rollback, documentation impact, and expected comprehension/coupling improvement.

Avoid generic utility dumping grounds, circular dependencies, arbitrary file splitting, and wrappers without semantic ownership.

## Route Execution

- read-only findings/review -> `blast-through` with exactly one audit mode;
- one behavior-preserving seam -> `refactor-readability`;
- one behavioral repair -> `codex`;
- broad approved multi-section migration -> `mass-implement`;
- runtime/feature exercise -> `feature-exerciser`.

The untangler owns the ledger and sequencing, not duplicate implementation mechanics.

## Batch Lifecycle

Use exactly:

`candidate -> mapped -> characterized -> planned -> approved -> implementing -> verified -> reviewed -> migrated -> retired | deferred | blocked`

Only one batch may be `implementing`. Do not start the next batch until the current batch is verified, reviewed, and migrated/retired or explicitly deferred/blocked.

## Batch Update Contract

Every executed seam updates, when applicable:

- canonical source owner and names;
- characterization/contract tests;
- owning module page;
- related Atlas records;
- JSDoc/Doxygen or invariant comments near public source contracts;
- architecture decision record for a consequential choice;
- documentation manifest;
- workspace promotion inventory and untangling ledger.

Keep docs and workspace changes as separate checklist sections. Do not put session narrative in source comments or durable docs.

## Verification

Run in order:

1. syntax/type/build for touched languages;
2. focused characterization/contract tests;
3. affected CLI/API/UI/native protocol probe;
4. `node scripts/dev/audit_documentation.js` when docs/Atlas/workspace ownership changes;
5. structure, documentation, hygiene, and diff checks;
6. broadest practical aggregate gate;
7. graph refresh/comparison after meaningful code movement when tooling exists;
8. independent `blast-through` review mode appropriate to the batch;
9. exact staging and committed-archive proof only when separately authorized.

Classify every failure as regression, pre-existing defect, stale expectation, environment limitation, external blocker, or not-run.

## Stop And Replan

Use `NO-GO` when:

- ownership remains ambiguous;
- P0/P1 correctness, security, or data-integrity findings remain in the seam;
- observable behavior is not characterized;
- deletion consumers are unresolved;
- the batch crosses unapproved behavior/API/schema/data/auth/provider/execution/deployment boundaries;
- the abstraction adds coupling or a second plausible owner;
- focused or broad verification regresses;
- rollback is undefined for persistence/runtime changes;
- dirty-tree overlap cannot be separated safely;
- a docs target would duplicate an existing owner.

Never use a clean-slate rewrite, grep-only deletion, generated narrative dump, hidden behavior change, or test weakening to force convergence.

## Required Outputs

Maintain a subsystem ledger using `references/untangling-ledger-template.md` with objective/anchor, ownership map, mined/verified knowledge, classification ledger, frozen behavior, before/after metrics, ranked seams, lifecycle, module/Atlas status, decisions, verification, limitations, retirement conditions, and first next action.

At closeout report before/after ownership/dependency path, meaningful size/depth/coupling movement, behavior proof, compatibility retained/retired, durable facts promoted, commands/evidence layers, untouched safety boundaries, and next seam.

## Truthfulness And Test Integrity

- Context is bounded. Build a task-local architecture map and disclose material surfaces not read or verified.
- Never claim a file was read, command ran, test passed, host was checked, or behavior was proved without direct
  evidence. Keep source, test, clean-install, CI, host, deployment, recovery, soak, paper, and live proof distinct.
- Do not weaken, skip, delete, mock away, suppress, or rewrite tests merely to make a result pass.
- Change a stale test only with canonical contract or approved behavior evidence; report the before/after
  expectation and keep production, tests, and docs aligned.
