# Schema 2 + Schema 3 Combined Research Engine Plan

Date: 2026-07-15
Mode: `blast-through` section-grade planning handoff
Status: Planned; production implementation not started
Anchor: `98bd86c3` plus the current dirty worktree

## Objective

Build one production-reachable, exact-asset research engine that composes validated schema-2 technical
evidence with point-in-time macro and other schema-3 factors. The first release remains fail-closed and
research-only: every result must declare `research_only: true` and `decision_ready: false`, and no result
may authorize or place an order.

Schema 2 remains the default scorecard contract during migration. Schema 3 remains an additive, explicitly
requested research contract until real eligible coverage, calibration, and promotion gates pass.

## Current Evidence

- `shared/lib/analysis/analyzers/technical_v2_adapter.js` validates schema-2 rows but has no production caller.
- `shared/lib/data/macro_store.js::selectMacroObservationsAsOf` provides point-in-time selection but has no
  production analysis caller.
- `shared/lib/analysis/services/recorded_family_shadows.js` composes recorded and synthetic parity factors,
  not canonical live-store factors.
- `shared/lib/analysis/assets/inventory.js` already owns canonical exact asset identities.
- The recorded schema-3 catalog has seven rows, zero eligible rows, and a measured DCS of `0.571`.
- The observed schema-2 FX candidate and schema-3 recorded FX fixture identify different instruments;
  family-level or loose-symbol composition would be false.
- Focused isolated behavior is green: analysis tests 27/27 and macro ingestion/storage tests 8/8. These tests
  do not prove a production combined engine.

## Preservation And Dependency Gate

Complete the clean-HEAD and canonical test-runner recovery in
`workspace/plans/SESSION_82_MERGE_RECOVERY_GRADE_PLAN.md` before claiming broad verification. Preserve all
current dirty-tree repairs; do not reset, blanket-checkout, or overwrite merge-recovery work.

Development may occur behind explicit research-only entrypoints, but promotion is blocked until a clean
archive loads the modules and the restored root runner reproduces focused results.

## Scope

In scope:
- exact `asset_id` resolution and same-instrument joins;
- a versioned combined research envelope;
- production wiring for the strict schema-2 technical adapter;
- a macro factor builder backed by canonical point-in-time storage;
- fail-closed composition, readiness reporting, and read-only CLI/API/MCP exposure;
- focused contract, mismatch, freshness, provenance, and deterministic-output tests.

Out of scope:
- live trading, order authorization, execution, or portfolio mutation;
- schema-2 retirement or changing its default CLI/API behavior;
- new external providers or provider polling by the combined endpoint;
- synthetic fixtures becoming eligible or actionable evidence;
- factor-score tuning, weight renormalization, or changed strength/coverage semantics;
- broad dashboard work, remote RLS validation, or real-capital approval.

## Required Contract

The combined result must:
- carry one canonical `asset_id`, decision timestamp, schema version, engine version, and policy version;
- include each component's domain, source, observed timestamp, available timestamp, freshness, quality,
  coverage, provenance, value, and exclusion reasons;
- accept only factors whose exact `asset_id` matches and whose `available_at` is not after decision time;
- reject stale, missing-required, synthetic, invalid, or mismatched factors instead of filling or joining by
  family;
- retain existing policy weights without renormalizing around missing factors;
- preserve current factor `strength` and `coverage` semantics pending calibration evidence;
- expose explicit `eligible`, `decision_ready`, `research_only`, `degraded`, and `reasons` fields;
- remain `decision_ready: false` throughout the first implementation sequence; and
- have no import, callback, route, or command path to order placement.

## Ranked Implementation Batches

### Batch 0 - Restore Reproducible Repository Gates

Work:
- complete clean-HEAD archive and canonical test-runner recovery without discarding current repairs;
- record archive module loads, discovered test counts, and remaining environment blockers.

Acceptance:
- the committed tree loads canonical analysis and macro modules;
- package scripts resolve to committed entrypoints;
- focused tests rerun from a clean archive.

Grade movement: none; this removes the verification blocker.

### Batch 1 - Exact-Asset Contract And Composition Skeleton

Files:
- `shared/lib/analysis/assets/inventory.js`
- new combined contract and service under `shared/lib/analysis/`
- focused tests under `tests/scripts/architecture/analysis/`

Work:
- define the versioned combined research envelope using existing canonical `asset_id` ownership;
- implement deterministic component ordering and fail-closed required-domain validation;
- reject bare-symbol, family-only, and cross-instrument joins before score composition;
- keep the service research-only and independent of order modules.

Acceptance:
- factors for one exact asset enter the composition skeleton;
- `EURJPY` evidence cannot combine with `EURUSD` evidence;
- duplicate, unknown, or conflicting identities fail closed;
- deterministic inputs serialize to deterministic outputs.

Grade movement: the combined engine remains D until production technical and macro adapters call it.

### Batch 2 - Canonical Point-In-Time Macro Factor

Files:
- `shared/lib/data/macro_store.js`
- new macro factor builder under `shared/lib/analysis/analyzers/`
- focused macro storage and analysis tests

Work:
- build macro components only from `selectMacroObservationsAsOf` output;
- map observations to reviewed exact asset IDs, never family inference;
- carry revision, observation time, `available_at`, selection time, freshness, and rejection reasons;
- exclude missing, stale, late, or invalid required observations.

Acceptance:
- later revisions are invisible before their `available_at` time;
- stale or missing required macro data excludes the combined row;
- each accepted value has point-in-time provenance to canonical storage;
- no recorded fixture silently replaces missing store data.

Grade movement: macro-to-analysis connectivity can reach C+/B-; the combined engine remains D until Batch 3.

### Batch 3 - Wire Schema-2 Technical Evidence Into Same-Asset Composition

Files:
- `shared/lib/analysis/analyzers/technical_v2_adapter.js`
- the combined service from Batch 1
- `shared/lib/analysis/validation/shadow_readiness.js` or a narrowly named combined validator
- focused analysis tests

Work:
- call the strict schema-2 adapter from a production research service;
- resolve its market/symbol to the same canonical `asset_id` required by macro evidence;
- enforce technical observation freshness and provenance before composition;
- leave policy weights and existing schema-3 score semantics unchanged.

Acceptance:
- exact-asset technical and macro evidence produces one research envelope;
- stale technical, stale macro, or mismatched evidence returns excluded/degraded output;
- synthetic parity factors remain inspectable only in fixture mode and cannot become actionable;
- every first-release output remains `decision_ready: false`.

Grade movement: D to C+ research-only after a real production caller and negative tests exist.

### Batch 4 - Read-Only CLI, API, And MCP Surface

Files:
- `backend/cli/commands/research/scorecard.js` or one narrowly named combined command
- `backend/api/server/services/cli_executor.js`
- `backend/mcp_server/tools/research.ts`
- focused CLI, API, and MCP contract tests

Work:
- add one opt-in combined research command without changing schema-2 defaults;
- expose the same envelope through authenticated/read-only API and MCP paths;
- prohibit provider refresh, data writes, order imports, and execution callbacks;
- retain exclusion reasons and component provenance end to end.

Acceptance:
- CLI, API, and MCP return equivalent envelopes for the same cached inputs;
- default schema-2 scorecard output remains unchanged;
- stale, missing, mismatched, or synthetic inputs cannot yield `review_only`, `buy`, or `sell`;
- source inspection and tests prove no route reaches order placement.

Grade movement: C+ to B- as a verified research-only engine, not an actionable trading engine.

### Batch 5 - Calibration And Promotion Readiness

Work:
- measure real eligible coverage by family and horizon;
- run point-in-time replay with out-of-sample splits, costs, slippage, and benchmark comparison;
- calibrate contribution, strength, coverage, and abstention behavior from recorded evidence;
- require a separate reviewed promotion decision.

Acceptance:
- coverage and freshness are measured rather than inferred from fixtures;
- performance survives out-of-sample and cost sensitivity gates;
- abstention, degradation, and revision behavior are tested;
- independent review approves any move beyond research-only.

Grade movement: B+/A and any actionable label remain blocked until this evidence exists.

## Verification Matrix

- `node --test tests/scripts/architecture/analysis/*.test.js`
- focused macro-store and macro-ingestion tests with visible revision and rejection counts
- focused combined CLI tests proving schema-2 default parity
- focused API tests proving authenticated, cached, read-only behavior
- `npm run build --prefix backend/mcp_server`
- focused MCP contract tests and a host stdio probe when child-process pipes are available
- restored root test, API, contract, secret, structure, and hygiene gates after Batch 0
- clean-archive module loads and package-script target checks
- `git diff --check`

Every data-flow test must report source, timestamps, row/revision counts, rejected inputs, output sample, and
the invariant that produced the result.

## Final Acceptance Criteria

- Only exact canonical asset IDs join; no family or bare-symbol fallback exists.
- Point-in-time macro and technical freshness/provenance checks fail closed.
- Same-asset evidence composes; mismatched-asset evidence is rejected explicitly.
- Synthetic fixtures cannot produce actionable or decision-ready output.
- Schema-2 default behavior and existing score semantics remain unchanged.
- CLI, API, and MCP expose the same versioned research-only envelope.
- No execution dependency or order-placement path exists.
- Focused and clean-archive evidence is recorded with counts and blockers.

## Grade Target

The current combined actionable engine remains **D / nonexistent**. Batches 1-4 can raise it to **C+ or
B- as a research-only combined engine**. They cannot justify an actionable, B+, or A grade. Those grades
require real eligible coverage, point-in-time out-of-sample evidence, cost-aware calibration, and a separate
promotion review.

## Next Execution Handoff

Use `$mass-implement` for Batch 0 if merge recovery is incomplete; otherwise start Batch 1 only. Keep commits
batch-scoped and stop at the first failed identity, freshness, provenance, or clean-archive gate.
