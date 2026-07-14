# Future API, Login, UI, and Dedup Refinement - 2026-07-13

Status: active. Session 76 completed the baseline inventory, fresh bearer/session validation, narrow TUI
reachability, and Kalshi fail-visible cleanup. Browser viewport coverage, wider binding, UI character
reduction, manifest consolidation, and deletions remain gated below.

## Progress - 2026-07-13 session 76

- Batch 1 evidence and consumer classifications are recorded in `workspace/DEV_REVIEW.md`.
- Persisted candidate tokens now require provider validation; same-token backend revocation is fresh.
- Corrected TUI density baselines exist at 80/100/120 columns; clipping is no longer counted as reduction.
- No wider bind or code deletion occurred.
- Next gate: add browser/component coverage at 375/768/1440 before responsive web changes.

## Objective

Make remote/local API access safer and less repetitive, prove automatic login restoration, reduce
visible UI character bloat, and consolidate dead or divergent stubs/duplicates across trade, research,
backend, and data surfaces without weakening authentication, operational truth, or test coverage.

## Evidence

- `backend/api/app.js` defaults `SOVEREIGN_WEB_HOST` to `127.0.0.1`.
- `infra/docker/docker-compose.yml` keeps the published host bind on `127.0.0.1` by default while the
  container listens on `0.0.0.0`.
- `Frontend/dashboard/src/App.tsx` already calls `supabase.auth.getSession()` and subscribes to
  `onAuthStateChange`; the next session must test this existing restoration path before adding another.
- `backend/cli/sovereign_dashboard.mjs` still owns an inline command manifest while
  `backend/cli/tui/manifest.js` owns the legacy command schema. Existing parity tests reduce drift but do
  not remove the duplicate ownership.
- `workspace/DEV_REVIEW.md` records TUI density, duplicated manifest/controller debt, and historical
  stub/duplicate candidates. Recheck every candidate against the current tree before deletion.

## In Scope

- API bind policy, origin policy, and authentication behavior for non-loopback access.
- Supabase session restoration, expiry, logout, and unavailable-provider behavior in the dashboard.
- Persistent TUI and web chrome, labels, help copy, borders, and repeated status text.
- Duplicate command schemas, helpers, compatibility shims, exports, and honest unavailable-feature
  stubs under trade, research, backend, and data ownership trees.
- Focused tests, broad regression gates, docs, and durable workspace updates.

## Out Of Scope

- Public Internet exposure without an explicit deployment/security decision.
- Browser-bundled privileged host tokens or broker secrets.
- Implementing every unavailable provider merely to eliminate the word `not_implemented`.
- Real-capital approval, model promotion, data freshness repair, or broker soak testing.
- Bulk Rust/native/generated-artifact deletion without separate review and deletion approval.

## Ranked Batches

### Batch 1 - Baseline And Contract Inventory

- Capture current login boot states and protected-route behavior.
- Capture TUI output at 80, 100, and 120 columns and browser navigation at mobile/desktop widths.
- Build a consumer-count matrix for duplicate/stub candidates in trade, research, backend, and data.
- Classify each candidate as canonical, compatibility shim, generated artifact, honest unavailable
  feature, dead duplicate, or divergent implementation.

Acceptance criteria:

- Every later deletion or consolidation cites an owner, consumer count, and parity test.
- UI reduction claims have a reproducible before snapshot and character/line count.

### Batch 2 - Automatic Login Restoration

- Verify the existing `getSession()` path restores a valid persisted Supabase session without flashing
  an actionable dashboard as unauthenticated.
- Add an explicit restoring state if boot currently races or flashes the login page.
- Fail to login for expired, revoked, malformed, or unavailable-provider sessions.
- Ensure logout clears local session state and subsequent protected API calls have no bearer token.

Acceptance criteria:

- Valid persisted session: dashboard opens without manual login.
- Missing/expired/revoked session: login surface appears and protected calls are rejected.
- Logout survives refresh and does not silently restore the old session.
- No privileged token is compiled into browser assets.

### Batch 3 - Wider API Binding, Auth First

- Keep loopback as the default bind.
- Allow an explicit wider bind only when the deployment has a supported authentication configuration.
- Verify CORS/origin handling, security headers, websocket authorization expectations, and protected
  route denial from an unauthenticated non-loopback client.
- Document LAN/private-VPN use separately from public exposure.

Acceptance criteria:

- Default install still binds only to loopback.
- Explicit wider bind starts successfully with valid auth configuration and fails closed without it.
- Unauthenticated protected reads and all mutations remain denied.
- Authenticated HTTP and Socket.IO smoke probes pass from the configured origin.

### Batch 4 - Character-Budgeted UI Simplification

- Measure persistent non-data chrome before editing.
- Reduce static/repeated visible characters by at least 25 percent at 80 and 120 columns.
- Keep persistent labels within 18 terminal cells where practical; move long descriptions to focused
  detail/help views rather than repeating them in every row.
- Remove redundant borders, rules, headings, and duplicate status copy before removing data.

Acceptance criteria:

- No rendered terminal line exceeds viewport width at 80, 100, or 120 columns.
- Safety state, authentication state, errors, command discoverability, and decision-critical values remain.
- Keyboard navigation, resize, mobile browser layout, and screen-reader labels remain covered.
- Before/after snapshots report static character and line counts.

### Batch 5 - Stub And Duplicate Consolidation

- Make one command schema the canonical owner and adapt both TUI renderers to it.
- Consolidate repeated trade, research, backend, and data helpers only after behavior parity is locked.
- Remove zero-consumer dead duplicates and duplicate exports; retain explicit compatibility shims only
  when a tracked caller or migration contract requires them.
- Keep unavailable features honest and non-selectable rather than replacing them with synthetic success.

Acceptance criteria:

- Manifest parity is structural by construction, not a manual two-file comparison.
- No removed path has a production, test, docs, or package-script consumer.
- Direct unavailable commands fail fast with structured `not_implemented` output and no provider or
  persistence work.
- Any net source deletion over 100 lines receives user confirmation before execution.

## Verification

Run the narrowest relevant tests for each batch, then:

```bash
npm run test:api
node --test tests/scripts/tui/dashboard/command_input.test.js tests/scripts/tui/dashboard/sovereign_dashboard.test.js
node --test tests/scripts/architecture/cli/core/structure_contract.test.js
npm run hygiene
npm test
git diff --check
```

Also run the dashboard typecheck/build and an authenticated/unauthenticated API smoke probe when the
binding/login batch begins.

## First Next-Session Action

Add a frontend browser/component viewport harness at 375/768/1440 and capture the desktop-only layout's
current failures. Do not widen the API bind or delete duplicate code before the remaining live-auth,
responsive-layout, parity, and confirmation gates are satisfied.
