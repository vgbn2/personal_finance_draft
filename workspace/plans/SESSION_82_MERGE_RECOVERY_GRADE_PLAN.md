# Session 82 Merge-Recovery Grade Plan

Date: 2026-07-15
Mode: `mass-implement` Planning Mode
Anchor: `49560981` plus the current dirty worktree

## Objective

Restore a reproducible, testable, fail-closed repository before adding features or promoting research
outputs. Grades move only after the named verification gates pass. This plan does not target an A-grade
repository: live soak, remote RLS verification, and real schema-v3 evidence remain outside this recovery.

## Preservation Gate

Before implementation, record `git status --short`, the merge parents, and hashes/diffs for every dirty
file. Do not stash, reset, or blanket-checkout either parent. Stage and commit only the files owned by the
active batch. The current canonical shared-module repairs and four untracked shims are load-bearing and
must not be discarded.

## Ranked Batches

### Batch 1 - Restore fail-closed Polymarket execution

| Field | Plan |
|---|---|
| Objective | Semantically restore explicit `--live` authorization, CLI session/PIN handoff, explicit order-price validation, broker quote/equity/drawdown risk context, and native pre-trade approval before placement. Preserve later lifecycle and bot changes from merge parent 2. |
| Why now | Reachable production order submission can bypass the previously verified authorization and risk contract. This is the only F-grade section and blocks all live-capital use. |
| Source | `workspace/DEV_REVIEW.md` session 82 P0; `backend/gateway/src/index.ts:653-665,718-725,1844-1924,2498-2506`; `backend/cli/commands/trade/trade_polymarket.js:288-293,583-602`; hardened implementation in `49560981^1`. |
| File ownership | `backend/gateway/src/index.ts`; `backend/cli/commands/trade/trade_polymarket.js`; only directly related trading tests if a missing regression assertion is proven. |
| Difficulty / scope | High; approximately 150-300 changed LOC because this is a semantic two-parent reconciliation, not a file restore. |
| Expected grade movement | Runtime safety, contract truth, verification. `backend/gateway`: F to at most C+ after focused local gates. B requires the broad suite plus independent execution-path review; live-capital approval additionally requires a live soak. |
| Verification | Gateway TypeScript; focused gateway-risk, Polymarket preflight/auth/lifecycle, proposed-order, MCP, cloud-live-guard, and bot authorization tests; source probe proving `adapter.placeOrder()` is reachable only after authorization and native risk approval. |
| Stop condition | Any order path can submit without both explicit live authorization and native risk approval, or later lifecycle behavior cannot be preserved without a design decision. |

### Batch 2 - Make clean HEAD reproducible and restore the canonical test gate

| Field | Plan |
|---|---|
| Objective | Commit the marker-free canonical modules and intended one-line compatibility shims; restore the Node runner and only load-bearing fixtures; make structure/hygiene fail on committed conflict markers, missing package-script targets, or required untracked code. |
| Why now | The dirty tree hides an unloadable `HEAD`; `npm test` cannot start; hygiene reports a false pristine state. The API correlation failure is currently caused by the missing `tests/fixtures/backend_history_sample.json`, so production correlation code must not be changed first. |
| Source | `workspace/DEV_REVIEW.md` session 82 P0/P1; `package.json:16`; `scripts/dev/check_hygiene.js`; `tests/scripts/architecture/cli/core/structure_contract.test.js`; runner and fixtures in `49560981^2`. Current canonical diffs only remove merge markers, while the root shims redirect to the canonical locations. |
| File ownership | Four canonical shared modules; `shared/lib/env.js`, `shared/lib/ingestion.js`, `shared/lib/macro_store.js`, `shared/lib/models.js`; `tests/run_node_tests.js`; `tests/fixtures/backend_history_sample.json`; `tests/fixtures/real_bars_btc.json`; `scripts/dev/check_hygiene.js`; structure/hygiene tests. |
| Difficulty / scope | Medium; approximately 80-180 code/test LOC plus two small recorded fixtures. Do not restore the obsolete parent-2 duplicate test layout or generated output snapshots. |
| Expected grade movement | Path clarity, artifact hygiene, verification, false-health removal. Repo bootstrap: D to B- if the archive gate passes. Tests: D to C initially; higher requires the full discovered suite to pass. |
| Verification | Archive `HEAD` to a temporary clean tree; require all eight canonical/shim modules; verify every package script entrypoint exists; `npm run test:structure`; `npm run hygiene`; `npm test`; `npm run test:api`. Record discovered/pass/fail/skip counts. |
| Stop condition | The runner discovers materially different tests than its pre-merge contract, or a fixture cannot be shown to have a current caller and deterministic provenance. |

### Batch 3 - Recover append-only workspace history

| Field | Plan |
|---|---|
| Objective | Additively recover session 73-81 review, state, prompt, and session-memory history from `49560981^1` while retaining all session-82 content and dated handoffs. |
| Why now | The merge removed 4,896 lines and reduced `DEV_REVIEW.md` from 24 headings in parent 1 to five before the session-82 correction. This is recoverable documentation loss and makes later decisions unauditable. |
| Source | `workspace/DEV_REVIEW.md` session 82 P1; `PROJECT_RULES.md` archive/history preservation rules; merge-parent heading and line-count comparison. |
| File ownership | `workspace/DEV_REVIEW.md`, `workspace/PROMPT_LOG.md`, `workspace/SESSION_MEMORY.md`, `workspace/STATE.md`, and affected dated handoff/history files only. |
| Difficulty / scope | Medium-high review burden; several thousand additive documentation lines, minimal code risk. Commit immediately after review because the files exceed 500 lines. |
| Expected grade movement | Documentation history, traceability, doc alignment. Workspace continuity: D to B if chronology and heading parity are proven. |
| Verification | Compare session headings against parent 1; confirm session-82 headings remain unique; `git diff --check`; handoff pointer resolves; inspect chronological boundaries rather than trusting line count alone. |
| Stop condition | Recovery would overwrite or duplicate post-merge notes, or provenance for a block is ambiguous. |

### Batch 4 - Repair API fallback truthfulness

| Field | Plan |
|---|---|
| Objective | Treat a located but unspawnable, non-zero, or invalid-JSON native backend as failed and continue to the Node/local fallback without weakening authenticated path-override controls. Re-evaluate correlation only after Batch 2 restores its fixture. |
| Why now | `backendDataSummary` accepts `backend.available=true` even when `ok=false`; the current native spawn returns EPERM in this environment and produces a false 503. The security tests already prove unauthenticated overrides remain rejected. |
| Source | `backend/api/server/services/cli_executor.js:580-623,683-710`; `backend/api/tests/api.test.js:44-90`; focused API result 5/7 and contracts 30/31. |
| File ownership | `backend/api/server/services/cli_executor.js`; focused API/fallback tests. Do not change correlation implementation unless its restored recorded fixture still fails. |
| Difficulty / scope | Low-medium; approximately 30-80 LOC. |
| Expected grade movement | Contract truth, fallback reliability, verification. `backend/api`: C- to B if API reaches 7/7, contracts 31/31, and auth rejection remains green. |
| Verification | Force missing, unspawnable, non-zero, and malformed native outcomes in focused tests; `npm run test:api`; `npm run test:contracts`; assert unauthenticated `input` overrides remain 401. |
| Stop condition | The repair hides a valid native computation error instead of reporting provenance, or permits caller-controlled paths without authentication. |

### Batch 5 - Reconcile TUI manifests without exposing unavailable features

| Field | Plan |
|---|---|
| Objective | Restore `bias`/`scorecard` parity and stable labels, omit six `not_implemented` ingest families, and preserve legitimate newer bot/lifecycle entries through explicit manifest parity decisions. |
| Why now | Three focused TUI failures are deterministic contract drift. Direct unavailable ingest already fails visibly, so implementing six providers would add scope without fixing the manifest truth problem. |
| Source | `backend/cli/tui/manifest.js:153-158,213-220`; `tests/scripts/architecture/cli/cli_ui_contract.test.js`; focused TUI result 35/38; parent-1 manifest diff. |
| File ownership | Legacy and dashboard manifest files plus their parity tests only. |
| Difficulty / scope | Medium; approximately 40-100 LOC. |
| Expected grade movement | UI contract truth, doc alignment, artifact clarity. Combined with Batch 1, `backend/cli`/TUI: D to C+ or B- depending on the complete focused CLI/TUI gate. |
| Verification | CLI UI contract, TUI phase-B contract, dashboard command safety, ingest manifest contract, and non-interactive command smoke tests all pass. |
| Stop condition | Parity requires advertising a `not_implemented` lane or removing a later working bot command without an explicit owner decision. |

### Batch 6 - Classify and gate grain-suspect market data

| Field | Plan |
|---|---|
| Objective | Classify each of the nine suspects using source cadence and market-session expectations; mark unexplained required bins degraded in integrity and scorecard consumers; rebuild only bins proven incorrect, using append/merge preservation. |
| Why now | Integrity returns `ok:true` with nine suspects, but not every suspect is corruption: BNO 4h appears cadence-plausible while CPER/SOYB intraday bins need evidence. A blanket rebuild or zero-suspect target would be dishonest. |
| Source | `backend/cli/commands/tools/backend_integrity.js:129-134,270-289`; `shared/lib/market/coverage.js:22-45`; `backend/cli/commands/research/scorecard.js`; session-82 row/gap measurements. |
| File ownership | Coverage/integrity/scorecard policy and focused tests; only confirmed-bad local bins through existing data commands. No manual binary edits. |
| Difficulty / scope | High; approximately 80-180 LOC plus bounded data operations. Runtime depends on provider availability. |
| Expected grade movement | Data coverage truth, fail-closed behavior, verification. `shared/lib/market`: C to at most B- after zero unexplained suspects and preserved row-history proof. No numeric DCS increase is promised before real measurements. |
| Verification | Emit per-bin source, expected cadence, row count, first/last timestamp, and gap percentiles before/after; test scorecard rejection for an unexplained suspect; rerun integrity and grain/equivalence tests; prove no history truncation with counts and checksums. |
| Stop condition | Source cadence cannot be established, provider data is unavailable, or a rebuild would reduce historical coverage. Keep the seam degraded instead. |

### Batch 7 - Broad closeout and low-cost truth cleanup

| Field | Plan |
|---|---|
| Objective | Run the full local gate matrix, fix only newly isolated regressions, correct the stale intraday-rollup example and test baseline, then reassess grades from evidence. |
| Why now | Broad failures are not actionable until runner, fixtures, and P0 paths are restored. Running this earlier would mix infrastructure noise with product defects. |
| Source | `README.md` tests/live-execution claims; `backend/cli/commands/data/data_rollup.js:218-219`; `PROJECT_RULES.md` empirical verification rule; session-82 verified-island results. |
| File ownership | Documentation and any narrowly proven residual-test owner. Broad orphan deletion is excluded and requires a separate reviewed cleanup. |
| Difficulty / scope | Medium and result-dependent; documentation changes should remain under 30 LOC unless a residual failure proves code work. |
| Expected grade movement | Verification and doc alignment. Target repository posture is C+/B- engineering health, not A and not real-capital approval. |
| Verification | Root test, API, contracts, secrets, gateway TypeScript, frontend lint/build, native gates where runnable, `git diff --check`, and clean archive smoke. Record all counts and environment blockers. |
| Stop condition | A failing test is fixed by weakening an assertion, hardcoding values, forging JSON, or substituting synthetic data for a real contract. |

## Explicit Deferrals

- No new provider implementation for the six unavailable ingest lanes.
- No schema-v3 promotion, schema-v2 retirement, or model-score tuning.
- No broad stale-orphan deletion, especially files over the repository deletion threshold.
- No frontend redesign; the current B- frontend is not on the critical grade path.
- No claim of live-capital readiness without independent review and live soak after Batch 1.

## Realistic Grade Ceiling

If Batches 1-5 pass, the repo can move from an F/D trust posture to roughly C+/B- engineering health:
gateway C+ locally, bootstrap B-, tests C or better depending on the full suite, workspace B, API B, and
CLI/TUI C+ to B-. Batch 6 can raise market-data trust to B- only with source-backed measurements. A-grade
or real-money readiness remains blocked by live soak, remote RLS verification, and real eligible schema-v3
evidence.

## Execution Result - 2026-07-16 session 83

All seven batches completed in six scoped commits: `bc9ce6de`, `713b1f98`, `d851d7c6`, `8e08ab6d`,
`d8d78545`, and `cb1c349f`. The final root suite is 821 total / 817 pass / 0 fail / 4 skip; API 7/7;
contracts 31/31; native 29/29; frontend/gateway/MCP/package/secrets/hygiene/archive gates pass. The planned
C+/B- engineering ceiling was reached without claiming live-capital or schema-v3 promotion. One unexplained
`SOYB 5m` grain remains fail-closed and requires provider-backed repair.
