# Security And Authentication Checkup - 2026-07-28

## Decision

Authentication is required for this private deployment.

Only `/health`, `/api/auth/status`, and `/api/supabase/config` are public reads. Market data, research,
portfolio, host inspection, user configuration, promotions, paper operations, and every unknown `/api/*`
read require an authenticated principal. Unknown mutations fail closed behind `host.manage`.

Local CLI research remains available to the operating-system user without HTTP authentication. That is a local
process boundary, not a remotely exposed API boundary.

## Implemented controls

| Surface | Control |
|:---|:---|
| Human browser/API | Supabase access token; role comes only from the server role map, trusted app metadata, or the safe viewer default |
| Service API | Salted-hash service-principal registry with one-time tokens and explicit capabilities |
| MCP | A distinct `SOVEREIGN_MCP_SERVICE_TOKEN`; no fallback to a browser token or the host bootstrap token |
| IP/session | Stable subject/service session identity; IP is audit/risk metadata, never the authorization identity |
| API reads | Private by default; unknown `/api/*` reads require `status.read` |
| Mutations | Capability-specific authorization; unknown mutations require `host.manage` |
| Combined promotion | `signal.promote`; envelope must be current, exact-asset, and eligible |
| Combined paper operation | `paper.operate`; promotion must exist in the same stable principal scope |
| Workflow persistence | Hash-chained append-only JSONL, idempotency keys, owner-only directories/files |
| Live execution | Still requires `live.execute`; promotion and paper capabilities never imply it |
| HTTP hardening | Configured origin allowlist, scoped CSP, no generic HTTPS connect source, one-MiB default body limit |
| Secrets | Service tokens are not stored in plaintext; source secret scan is clean |

## Verified evidence

- Auth/service-focused tests: service creation, hashing, authentication, revocation, role trust, loopback-only
  legacy credentials, stable sessions, and capability denial all pass.
- API contract gate passes with protected-route 401/403 coverage and oversized-body rejection.
- MCP compiles and its policy test proves a read-only identity can use research tools but cannot run research,
  write data, operate paper, or execute live.
- Combined-engine tests reject bare/mismatched assets, future/stale/synthetic macro evidence, and expose
  deterministic research-only results.
- Promotion-store tests prove checksum tamper detection, idempotency, and cross-principal isolation.
- Environment classification, source secret scanning, structure/hygiene, and fresh-install verification pass.

## Required operational setup

1. Configure Supabase URL and publishable key for browser users.
2. Keep the default human role at `viewer`; map stable user IDs to `analyst`, `operator`, or `owner` server-side.
3. Generate a separate service principal for each API/MCP consumer and assign only the required capabilities.
4. Store the one-time MCP credential as `SOVEREIGN_MCP_SERVICE_TOKEN`; do not put it in frontend variables.
5. Keep binding loopback/private until reverse-proxy trust, TLS, and a remote login exercise are separately
   qualified.
6. Back up and protect `storage/runtime/service_principals.json`, `auth_sessions.json`, and the combined
   workflow ledger as private state.

## Gates that remain open

- The read-only dependency advisory found 61 vulnerable package nodes across all five package roots:
  24 high, 11 moderate, 26 low, and 0 critical. No dependency or lockfile upgrade was applied.
- High-severity findings affect network-facing/runtime owners including the API websocket stack, provider
  clients, MCP HTTP stack, ONNX runtime archive path, and dashboard build stack. Paper-only use is conditional;
  release and live execution remain blocked until isolated upgrade batches pass compatibility tests.
- Install-script owners (`onnxruntime-node`, dashboard `esbuild`, and optional `fsevents`) require explicit
  allowlist review during dependency remediation. The TradingView Git dependency is immutable-commit pinned.
- Real Supabase login, revocation, migration, and RLS behavior have not been verified against the deployment.
- No remote-host MCP stdio/SSH connector, restart, rollback, backup/restore, or soak was performed.
- Current combined output is not paper-promotable. A bounded refresh fetched 86 required macro rows, but none
  is point-in-time eligible because release/vintage metadata is dropped, `available_at` is absent remotely,
  and scoped/global cache wiring differs.
- The combined macro contribution remains deliberately neutral until cost-aware out-of-sample calibration.
- Live execution and public exposure remain blocked.

Structured dependency evidence:
`reports/restricted_dependency_advisory_2026-07-28.json`.

Structured macro evidence:
`workspace/reports/restricted_macro_qualification_2026-07-28.json`.
