# Family-Aware Asset Analysis Implementation Batches - 2026-07-13

Status: Batches 1-8 implemented in research-only shadow mode. Promotion is rejected by the recorded
readiness report, and schema-v2 retirement remains gated on evidence plus explicit deletion approval.
The live schema-v2 scorecard remains canonical until the
parity, degradation, and user-approval gates below pass.

Final completion audit: 2026-07-13 session 81. Provider retrieval-time availability, policy
applicability, within-family ordering, real CLI/API parity, and actual Ink launch are covered by tests.
Serialized suite: 758 total / 756 pass / 0 fail / 2 skip.

## Objective

Deliver one canonical sectioned scorecard contract for equities, cryptoassets, FX pairs, commodities,
and indices without pretending that every family has the same fundamentals. Begin with a US common
equity, fixed three-month shadow row composed from technical, SEC-reported fundamental, macro, catalyst,
and data-quality sections. Add other family scorers only after the shared contracts prove missing-data,
point-in-time, and within-family ranking behavior.

## Non-Negotiable Boundaries

- No edits to live schema-v2 ranking in the contract batch.
- No provider fetch in contracts, analyzers, composers, or UI.
- No scoring weights until a versioned family/horizon policy has a reviewed rationale and fixture.
- No bare-symbol identity; scoreable assets use stable `asset_id` values.
- Macro, sentiment, holdings, reserves, breadth, and on-chain series are evidence, not scoreable assets.
- No cross-family ranking. Rank only within family, subtype policy, and horizon.
- Missing required evidence degrades or excludes; weights never silently renormalize.
- Contract fixtures must be labeled synthetic unless sourced from a recorded real artifact with provenance.

## Ranked Batches

### Batch 1 - Canonical contract kernel and family section registry

- **Objective:** Add runtime-validated `AssetDescriptor`, `Observation`, `FactorResult`, and
  `ScorecardRow v3` contracts plus a weight-free family/subtype section registry.
- **Why now:** The live scorecard emits schema v2 directly from the CLI, while no shared analysis schema
  exists. Implementing providers or UI first would create a second owner and make family sections drift.
- **Sources:** `workspace/plans/ASSET_ANALYSIS_UI_OVERHAUL.md` canonical-contract and family-policy
  sections; `backend/cli/commands/research/scorecard.js` schema-v2 output; `PROJECT_RULES.md` schema-first
  transition rule.
- **Ownership:** New files only under `shared/contracts/analysis/`, `tests/fixtures/analysis/`, and
  `tests/scripts/architecture/analysis/`.
- **Expected movement:** contract truth, path clarity, verification.
- **Estimated change:** 350-550 LOC.
- **Verification:** `node --test tests/scripts/architecture/analysis/analysis_contract.test.js`; fixture
  log must show input rows, accepted/rejected counts, component domains, and the invariant tested.

### Batch 2 - Asset/evidence taxonomy and compatibility inventory

- **Objective:** Classify the configured universe into scoreable assets and evidence-series descriptors;
  map legacy families to stable asset families/subtypes without changing the live resolver.
- **Why now:** `get_Full_Universe_Symbols()` currently labels macro, PMI, sentiment, reserves, and holdings
  as tradeable and deduplicates by bare symbol. A shadow composer cannot be trusted on that input.
- **Sources:** `backend/cli/lib/utils.js:426-475`; `config/markets/data_sources.yaml`; plan anti-sloppiness
  rules 1-2.
- **Ownership:** New files under `shared/lib/analysis/assets/` and a generated report under
  `workspace/reports/`; existing `utils.js` remains untouched until parity is proven.
- **Expected movement:** contract truth, artifact hygiene, runtime safety.
- **Estimated change:** 300-500 LOC.
- **Verification:** fixture-backed inventory test reports configured input count, unique asset ids,
  evidence-series count, duplicate legacy symbols, and zero scorecard rows for evidence series.

### Batch 3 - Technical v2-to-v3 shadow adapter

- **Objective:** Convert existing fresh schema-v2 technical rows into v3 technical `FactorResult` values
  without changing ranking or provider reads.
- **Why now:** Technical behavior already has freshness and exclusion tests; adapting proven output is
  safer than reimplementing indicators while the contract is new.
- **Sources:** `tests/scripts/research/scorecard_freshness.test.js`; schema-v2 timing fields in
  `backend/cli/commands/research/scorecard.js`.
- **Ownership:** `shared/lib/analysis/analyzers/technical_v2_adapter.js` and focused tests only.
- **Expected movement:** contract truth, verification, duplication reduction.
- **Estimated change:** 180-300 LOC.
- **Verification:** the same fixture yields byte-equivalent v2 direction/strength inputs and a valid v3
  technical component; stale or incomplete v2 rows are rejected rather than promoted.

### Batch 4 - Point-in-time macro observation repair

- **Objective:** Normalize release, availability, vintage, and revision fields so macro evidence can be
  joined as-of a historical decision time.
- **Why now:** Period-end-only joins leak revised macro values into earlier decisions and invalidate
  backtests.
- **Sources:** `shared/lib/data/macro_store.js`; macro storage contracts; plan Batch 4 gate.
- **Ownership:** Macro normalization/storage and its focused tests; no composer changes in this batch.
- **Expected movement:** runtime safety, data integrity, verification.
- **Estimated change:** 250-450 LOC plus migration if schema alignment is required.
- **Verification:** point-in-time fixture logs releases and proves a later revision is unavailable to an
  earlier decision timestamp.

### Batch 5 - US equity three-month shadow policy

- **Objective:** Define a versioned, research-only equity policy and compose technical, SEC fundamental,
  macro, catalyst, and data-quality components into a shadow `ScorecardRow v3`.
- **Why now:** The user selected personal use, free-data-first, US common equities, and a three-month
  horizon. This is the narrowest complete vertical slice.
- **Sources:** dated handoff session 77; plan provider and family-policy sections.
- **Ownership:** `shared/lib/analysis/policies/equity_3m_v1.js`, pure composer, SEC normalization adapter,
  and fixtures. API/UI remain out of scope.
- **Expected movement:** contract truth, data provenance, verification.
- **Estimated change:** 700-1,200 LOC.
- **Verification:** recorded SEC fixture -> normalized observations -> factor rows -> one shadow scorecard
  row, with counts and samples at every stage. Missing required fundamentals must degrade/exclude.

### Batch 6 - Canonical shadow service and CLI/API parity

- **Objective:** Expose v3 shadow output through one service consumed by thin CLI and authenticated API
  adapters while schema v2 remains live.
- **Why now:** Only after the composer is pure and verified can consumers share it without duplicating
  ownership.
- **Sources:** API scorecard worker/route contracts; target dependency direction in the architecture plan.
- **Ownership:** New analysis service plus thin adapters; current v2 route remains the default.
- **Expected movement:** path clarity, contract truth, doc alignment.
- **Estimated change:** 350-650 LOC.
- **Verification:** one fixture is identical through service, CLI JSON, and API JSON; auth and worker
  responsiveness contracts continue to pass.

### Batch 7 - Family expansion, one policy at a time

- **Objective:** Add independent policies in this order: FX macro/rates, index breadth, energy commodity
  fundamentals/positioning, BTC/ETH native chain, then DeFi protocol tokens.
- **Why now:** These policies require different evidence semantics. Implementing them together would hide
  applicability and coverage failures behind a generic score.
- **Sources:** family research-policy table and provider sections in the architecture plan.
- **Expected movement:** contract truth, coverage, data provenance.
- **Estimated change:** 600-1,500 LOC per family depending on provider normalization.
- **Verification:** each family has a point-in-time data-flow fixture, explicit applicable/not-applicable
  sections, excluded/degraded counts, and within-family ranking tests before the next family begins.

### Batch 8 - Research UI and retirement gates

- **Objective:** Add family home, screener, and asset workbench against the canonical v3 client; retire v2
  only after shadow parity, browser contracts, and user approval.
- **Why now:** UI should present proven contract state, not own or infer scoring behavior.
- **Sources:** plan UI information architecture; completed 375/768/1440 browser harness.
- **Expected movement:** doc alignment, verification, path clarity.
- **Estimated change:** 900-1,800 LOC.
- **Verification:** typed fixture parity, authenticated API tests, and browser contracts at all three
  viewports including excluded/degraded rows and provenance drill-down.

## Tiered Execution

- High-tier main thread owns planning, contract boundaries, integration review, and hallucination audit.
- Lower-tier workers may implement only bounded batches with disjoint write ownership.
- The first delegated worker owns Batch 1 new files only. It must not edit schema v2, universe resolution,
  providers, package manifests, workspace history, or existing dirty files.
- After every delegated batch, the main thread checks naming against existing conventions, validates data
  and error semantics, runs focused tests, and decides whether the next phase gate is clear.

## First Gate

Batch 1 is complete only when valid stock, crypto, FX, commodity, and index descriptors can share one
contract; subtype-specific sections remain explicit; invalid timestamps, duplicate factor domains,
unlabeled synthetic fixtures, and missing exclusion reasons fail validation; and no live scorecard output
changes.

## Progress - 2026-07-13 session 79

- Batch 1 complete: canonical v3 validators, weight-free family section registry, and clearly synthetic
  fixtures pass 5/5 focused tests.
- Batch 2 complete: the real market config inventories 316 configured entries into 122 scoreable asset
  candidates, 108 evidence descriptors, and 30 explicit unsupported/ambiguous entries. It reports 45
  repeated declarations, 57 repeated legacy-symbol declarations, zero current identity conflicts, and
  zero current cross-asset symbol collisions.
- High-tier audit corrected delegated contract drift: observations use the planned top-level provider
  provenance, quality is validated, composite strength is non-negative, factor applicability and policy
  family/horizon must match, and degraded/excluded rows require reasons.
- High-tier audit also separated repeated config declarations from contradictory identity metadata.
- Live schema-v2 scorecard, universe resolver, and market config hashes stayed unchanged.
- Next gate: Batch 3 technical v2-to-v3 shadow adapter.

## Progress - 2026-07-13 session 80

- Batch 3 complete: a pure shadow adapter converts only complete, fresh schema-v2 rows into validated
  v3 technical `FactorResult` values.
- The adapter preserves v2 direction, score, confidence/strength, conservative `data_as_of`, and
  `valid_until`; deterministic evidence ids identify every accepted timeframe input.
- Incomplete timeframe sets, histories below 20 bars, malformed timing, and expired row or timeframe
  validity are rejected rather than promoted.
- The real schema-v2 fixture adapted 2/2 timeframes with exact `long`, `0.208` score, and `0.21` strength
  parity, then rejected 3/3 degraded variants.
- Live schema-v2 ranking, provider reads, family policies, weights, API, and UI remain unchanged.
- Next gate: Batch 4 point-in-time macro observation repair.

## Progress - 2026-07-13 session 80 - Batch 4

- Batch 4 complete at source and migration-contract level. Macro rows now preserve period end, release,
  availability, ingestion, vintage, revision identity, and explicit point-in-time eligibility.
- Historical as-of selection requires both provider availability and local ingestion by the decision
  timestamp. It selects the latest visible revision per series/period and excludes period-only legacy rows.
- Fixture evidence: 4 revisions in, 3 structurally eligible, 1 legacy row rejected; the 2026-05-01
  decision sees value 100 and cannot see the delayed or later revision, while 2026-06-01 sees value 102.
- A forward migration adds revision-aware storage, timestamp-order checks, and the as-of lookup index.
  The migration is source-verified but has not been applied to or inspected on the remote Supabase project.
- Next gate: Batch 5 US common-equity, three-month shadow policy. It must remain research-only and use
  recorded SEC and point-in-time macro fixtures before any service, API, or TUI integration.

## Progress - 2026-07-13 session 81 - Batch 5

- Recorded the official Apple Inc. SEC Company Facts response with source URL, retrieval time, CIK,
  entity name, content type, and fair-access note. The exact parsed response contains 503 `us-gaap`
  concepts and is retained as the provider fixture.
- A pure SEC adapter selects only 10-Q/10-K facts filed by the decision time, conservatively makes them
  available the following UTC day, preserves accession/form/frame provenance, and selects the latest
  visible restatement per fiscal period.
- The artifact normalized into 1,392 observations across eight metrics. Quarterly revenue compares the
  same calendar quarter a year earlier; quarter and year-to-date durations are not mixed. Missing revenue,
  future-filed facts, and stale fundamentals fail closed.
- The versioned `equity/3m-v1-shadow` policy is research-only and not decision-ready. It keeps absent
  evidence weight absent instead of renormalizing around it; missing fundamentals exclude the row.
- API, CLI, TUI, live schema-v2 ranking, and remote storage remain unchanged. Next gate is Batch 6 only.

## Progress - 2026-07-13 session 81 - Batches 6-8

- Batch 6: one canonical service produces byte-identical schema-v3 output through the real CLI JSON path,
  authenticated API route, and direct service. Schema v2 remains the default; v3 requires a named fixture.
- Batch 7 uses recorded ECB/Treasury, EIA, and DefiLlama fixtures. Official S&P breadth and Coin Metrics
  returned HTTP 403/unavailable, so SPX/BTC/ETH are excluded rather than substituted.
- The canonical catalog contains seven rows: 0 eligible, 4 degraded, 3 excluded. Synthetic parity inputs
  remain labeled and prevent any decision-ready claim.
- Batch 8 terminal research UI stays inside the scorecard command/manifest: home catalog, family/state
  screener, symbol workbench, 80/100/120-column rendering, factor/reason/evidence drill-down.
- The readiness report returns `promotion_approved=false`: no point-in-time target returns, OOS baseline,
  turnover/cost model, or calibration sample exists.
- Serialized full Node verification passed 755 total / 753 pass / 0 fail / 2 skip. Schema-v2 retirement
  remains blocked by failed promotion evidence and the explicit deletion-approval rule.
