# Developer Review Queue

Date: 2026-05-26
Scope: deep blast-through pass across active web/API, React/Vite dashboard, macro ingestion, Supabase persistence, docs, tests, and workflow skills.

## Review Rules

- This file is for human developer review decisions, not ordinary TODO dumping.
- Every item must name the files, the decision needed, the evidence used, and the verification gate that should clear the item.
- Do not close an item only because tests pass. Close it when the runtime contract and reviewer decision are both clear.
- Synthetic fixtures must be labeled as synthetic. Real financial data requests should print real artifacts or live snapshots first.

## Active Review Items

### DR-001: [RESOLVED] Established React/Vite dashboard as canonical

- Severity: low (was high)
- Files: `backend/api/app.js`, `Frontend/dashboard/dist/**`, `docs/archive/legacy_ui`
- Decision: React/Vite dashboard is now the promoted surface. `backend/api/app.js` serves `Frontend/dashboard/dist`. Legacy UI archived.
- Evidence: `backend/api/app.js` updated to point to `Frontend/dashboard/dist`; legacy `web/public` moved to `docs/archive/legacy_ui`.
- Clearance gate: `node backend/api/app.js` serves the React application at the root.

### DR-002: Remove browser-visible fallback credentials and define local auth mode

- Severity: high
- Files: `Frontend/dashboard/src/lib/api.ts`, `Frontend/dashboard/src/lib/supabase.ts`, `.env.example`, `docs/supabase.md`
- Why it needs review: browser code previously had fallback API/Supabase values. This pass removed those fallbacks, but a reviewer should confirm the intended local dev mode: anonymous public read-only, authenticated private data, and server-only secret writes.
- Reviewer decision needed: decide whether the React/Vite app may call Supabase directly with publishable keys or must always go through `backend/api/app.js`.
- Evidence used: `backend/api/app.js` now has no hardcoded API token fallback; `Frontend/dashboard/src/lib/api.ts` and `Frontend/dashboard/src/lib/supabase.ts` now require env-provided values. A focused scan still finds only a test placeholder publishable key and the Gemini MCP project reference, not browser fallback credentials.
- Clearance gate: reviewer accepts or removes the tracked Gemini MCP project reference, and browser tests prove public read-only views work without auth while private writes require login/session.

### DR-003: Apply and verify the macro_observations Supabase migration

- Severity: high
- Files: `supabase/migrations/20260526133000_macro_observations_store.sql`, `shared/lib/macro_store.js`, `backend/scripts/data_ops/ingest_market_data.js`, `docs/supabase.md`
- Why it needs review: code and tests now normalize macro rows and batch them to `macro_observations`, but the migration must exist in the actual Supabase project before live ingest can persist data.
- Reviewer decision needed: confirm the table is intentionally server-write-only and whether any read API should expose normalized macro rows later.
- Evidence used: `test/scripts/macro_store_contract.test.js` proves unit labels, `signed_log1p`, and Supabase upsert shape with a mocked client.
- Clearance gate: Supabase metadata shows `public.macro_observations` exists with RLS enabled, anon/authenticated revoked, and a live ingest writes rows with raw and normalized values.

### DR-003B: Feed normalized macro data into ML inputs

- Severity: high
- Files: `shared/lib/macro_store.js`, `docs/macro_model.md`, `docs/data_ingestion.md`, `backend/core/src/**`, `Frontend/dashboard/src/**`
- Why it needs review: the store now preserves both raw and normalized macro values. The ML and presentation paths should use normalized values, while raw values remain available for provenance and audit.
- Reviewer decision needed: confirm the canonical feature set for macro-driven models and displays, with normalized values as the default input and raw values retained for traceability.
- Evidence used: `shared/lib/macro_store.js` writes `raw_value`, `normalized_value`, and `unit`; `docs/macro_model.md` already describes the canonical store, but the downstream model input contract is still not explicitly locked.
- Clearance gate: model feature builders, dashboard displays, and tests prove the normalized macro series is consumed by default, while raw provenance is still preserved and inspectable.

### DR-004: Rebuild stale generated artifacts after ADP mapping change

- Severity: medium
- Files: `config/markets/data_sources.yaml`, `scripts/test/fixtures/outputs/**`
- Why it needs review: `ADP` was corrected to `ADPWNUSNERSA`, but older generated JSON output fixtures still contain `ADP` rows sourced from `PAYEMS`.
- Reviewer decision needed: decide which generated fixtures are canonical regression artifacts and refresh only those, leaving archival evidence clearly labeled.
- Evidence used: search found `PAYEMS` in generated cockpit output fixtures after the config fix.
- Clearance gate: fixture refresh command regenerates current outputs, and contract tests prove `ADP` no longer mirrors `NFP`.

### DR-005: [RESOLVED] Implemented server-side review persistence for signals

- Severity: low (was high)
- Files: `Frontend/dashboard/src/components/panels/SignalPanel.tsx`, `backend/api/server/routes/market/signal_promote.js`
- Decision: Fresh active candidates can be reviewed through a real POST API call that persists an event to Supabase `audit_events`; this is not order execution.
- Evidence: `SignalPanel.tsx` uses `fetch(API_ENDPOINTS.SIGNAL + '/promote')`; `signal_promote.js` handles the persistence.
- Clearance gate: Recording a review creates an authenticated `SIGNAL_PROMOTION` audit row and returns `execution_started: false`.

### DR-006: Normalize phase and deployment documentation

- Severity: medium
- Files: `README.md`, `docs/README.md`, `docs/spec.md`, `docs/DEPLOYMENT.md`, `workspace/STATE.md`
- Why it needs review: the highest-traffic docs now say Phase 4 is active, but older workspace notes and generated docs may still carry Phase 3-era wording.
- Reviewer decision needed: choose the public docs wording for Phase 4 status, especially around macro model, Supabase persistence, and deployment maturity.
- Evidence used: targeted search found Phase 3 wording in root docs while state and handoff say Phase 4 is active.
- Clearance gate: docs search shows one consistent phase story, and deployment docs distinguish local Docker/Kubernetes starters from production readiness.

### DR-007: Decide the Rust CLI status

- Severity: medium
- Files: `backend/cli/**`, `backend/cli/sovereign_cli.js`, `workspace/DEV_COMMENTS.md`
- Why it needs review: the Node CLI is the active command surface, while the Rust CLI is still described as mostly stubbed in dev comments.
- Reviewer decision needed: either promote Rust with parity milestones or explicitly classify it as experimental until the Node CLI stabilizes.
- Evidence used: current dev comments list Rust CLI parity as a strategic decision, while package scripts and web bridge call the Node CLI.
- Clearance gate: command registry parity test exists or docs label Rust as experimental with no active-user path depending on it.

### DR-008: [RESOLVED] Real ONNX Runtime linkage implemented

- Severity: low (was medium)
- Files: `backend/core/src/ml/onnx_model.cpp`, `backend/core/CMakeLists.txt`
- Decision: `onnx_model.cpp` now contains the actual `Ort::Session` logic and inference flow.
- Evidence: Code now includes `<onnxruntime_cxx_api.h>` (conditionally) and implements the `predict` method with real tensor operations.
- Clearance gate: Compiling with `-DSOVEREIGN_ENABLE_ONNX_RUNTIME=ON` links the library and executes the inference path.

## Section Cleanliness Snapshot

| Section | Grade | Confidence | Reason |
| :--- | :--- | :--- | :--- |
| `web/` | B+ | high | Express bridge is coherent and security headers exist; auth/private-data UX is still not implemented. |
| `Frontend/dashboard/` | C+ | high | Rich React/Vite work exists, but it is disconnected from the served bridge and had browser fallback credentials. |
| `scripts/` | B | high | Macro ingest/store path is much stronger; legacy overlap and fixture refresh debt remain. |
| `supabase/` | B- | medium | Local migrations are clear, but the newest macro store needs remote verification. |
| `docs/` | C+ | high | `docs/web_api.md` is current, but root docs still contain phase and entrypoint drift. |
| `workspace/` | B | high | Useful audit memory exists; it needs active dev-review queue maintenance and stale wording corrections. |
| `.codex/.gemini skills` | B+ | high | Workflow parity is improving; Gemini review rules needed promotion into Codex blast-through. |

## DCS

- Start DCS: 0.985 from current state anchor.
- End DCS: 0.962.
- Freshness: 0.96 because graph commit matches HEAD but docs and generated fixtures have drift.
- Schema: 0.97 because macro store contracts exist, but the remote `macro_observations` table still needs live verification.
- Coverage: 0.95 because API/macro/deployment contracts exist, but browser auth, promotion persistence, and remote DB writes are not end-to-end proven.
