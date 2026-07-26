# Review Ledger

Centralized, single-file record of when each top-level directory was last reviewed by a
blast-through audit, what grade it got, and whether a stub/duplicate sweep has been run against
it. This formalizes blast-through's existing "Standardized Section Grades" output (previously a
one-shot table buried per-run in `workspace/DEV_REVIEW.md`'s history) into a cumulative record, so
"what's stale" never has to be re-derived from memory or git history.

**Update rule:** every blast-through run updates a row for every directory it actually graded —
this is a required last step of the audit (see `skills/blast-through/SKILL.md`), not optional
cleanup. Update in place; this file is a snapshot of "last reviewed," not a log — session-by-session
detail still belongs in `DEV_REVIEW.md` and the dated `workspace/handoff/` files.

| Directory | Last Reviewed (commit) | Last Reviewed (date) | Grade | Stub/Dup Sweep | Notes |
|---|---|---|---|---|---|
| system design (cross-cutting) | working tree + `883681fd` | 2026-07-27 | B / qualification-gated | deep audit plus Batch 5 closure (s110) | Atomic sanitized heartbeat contract and separate authenticated service-health context address the three audited P1 gaps; external runtime/data qualification remains open. |
| repo bootstrap / dependencies | working tree | 2026-07-23 | A- / clean-snapshot | package ownership, lock, build, and clean-source sweep (s93) | API now owns exact Supabase 2.106.2; offline lock refresh and focused tests pass from a clean current-source snapshot. Commit proof remains pending. |
| `.github/workflows` | `54f861eb` | 2026-07-22 | B+ / server-run-gated | moved-path, CTest-root, Node-version, image-readiness sweep (s89) | Known deterministic failures are repaired and locally contracted; authenticated Actions run evidence remains external. |
| `backend/scripts/data_ops/ingest_market_data` | working tree | 2026-07-13 | B+ / provider-roadmap | availability + silent-stub sweep (s76) | Six unavailable lanes remain explicit; Kalshi history now fails visibly instead of returning empty success. Real provider implementation remains pending. |
| `shared/lib/providers` | working tree | 2026-07-23 | B+ / explicit-unavailable | TradingView caller/export and unavailable-provider sweep (s93) | Quote ingestion remains wired; the zero-caller empty screener export is removed. Other unavailable lanes remain typed and fail closed. |
| `backend/api` | working tree + `883681fd` | 2026-07-27 | A- / service-health-authenticated | monitor parity, service-health route, and client-status boundary (s110) | Monitor and service-health auth/parity are verified; legacy poller outcomes are bounded before client exposure. |
| `scripts` | working tree | 2026-07-23 | B+ / host-runtime-gated | MCP setup/probe and stale automation implementation sweep (s93) | Setup paths are valid and atomic; the probe diagnoses host stdio before SDK stages; the placeholder automation file is removed. Real-host MCP proof remains. |
| `shared/lib/ml/` | working tree | 2026-07-11 | C- / promotion-gated | model/report truth sweep (s73) | Canonical comparison ranks architecture-named deterministic formulas and excludes real ONNX candidates; minimum promotion sample/trade floors are absent. |
| `shared/contracts/analysis` + `shared/lib/analysis` | `cebd0658` | 2026-07-23 | A- contracts / C fixture services | exact-identity production-caller rescan (s92) | Strict contracts and named-fixture services remain; no new production exact-asset composition caller exists. |
| combined actionable engine | `cebd0658` | 2026-07-23 | D / nonexistent | production reachability and exact-asset composition gate (s92) | Fixture-only schema-3 CLI/API selectors do not constitute a combined engine; no production path composes required point-in-time domains for one exact asset. |
| `shared/lib/data/macro_store.js` + macro migration | `98bd86c3` + working tree | 2026-07-15 | B+ / analysis-integration-gated | point-in-time revision and consumer sweep (s82) | Ingest/storage tests are 8/8 and preserve availability/revisions, but point-in-time macro selection has no production schema-3 analysis consumer. Remote Supabase state remains unverified. |
| `backend/cli/commands/research/` | `f9119729` | 2026-07-22 | B / composition-gated | prediction-interest import + real loader-boundary contracts (s87) | Provider and prediction loaders preserve the 1,825-day default, and prediction interest is fetched and asserted; no live exact-asset combined service exists. |
| `config/trading` + research history loaders | `f9119729` | 2026-07-22 | B+ / caller-contracted | five-year default + provider/prediction loader boundary (s87) | Four focused tests lock the 1,825-day default through both real loaders and prove the prediction interest caller. |
| `backend/gateway` | `e0de66de` | 2026-07-24 | B / convergence-gated | bot dry-run exit and repeated-token settlement lifecycle implementation (s101) | Unpriced positions remain open and reopened-token settlements use lifecycle identity; canonical bot-state projection remains a broader G3 gate. |
| `backend/cli` | working tree + `883681fd` | 2026-07-27 | B+ / heartbeat-wired | monitor CLI plus five status-owner heartbeat wiring (s110) | Status owners publish atomic bounded heartbeats; host qualification and real failure/restart evidence remain external. |
| `shared/lib/market` | `c2e28993` + local data | 2026-07-26 | B / policy-stale | live integrity, canonical coverage, and segment fallback sweep (s104) | DCS is 0.954348 with 92/92 cached and zero unexplained grain, but 14 required windows remain stale and integrity is false. |
| `shared/lib/market/append_only_segments.js` | working tree | 2026-07-26 | B / integrity-contracted | mixed-store, checksum/file integrity, coverage, precedence, compaction, durability, and disposable-recovery sweep (s104) | P1 correctness failures are repaired and tested; write-amplification, free-space, retry, thermal/disk, and soak gates keep enablement opt-in. |
| `shared/lib/settings/interval_policy.js` + runner | working tree | 2026-07-26 | B / scheduler-contracted | resolver, CLI caller, persistent scheduler injection, backfill separation, and host-contract sweep (s104) | Effective paper cadence reaches the scheduler and bot policy no longer changes backfill cadence; runtime workload proof remains external. |
| `shared/lib/runtime` | working tree + `883681fd` | 2026-07-27 | B+ / heartbeat-atomicity-contracted | run-loop status repair plus heartbeat contract tests (s110) | Status publication is atomic and errors are bounded; external restart/soak proof remains open. |
| `Frontend/dashboard` | working tree + `883681fd` | 2026-07-27 | A- / service-health-rendered | global monitor plus separate service-health context (s110) | Service rows are bounded and safe-error filtered; instrument freshness and provider health remain separate. |
| `supabase` | working tree | 2026-07-13 | B / remote-RLS-gated | local RLS + account-config migration repair | `user_config` now has committed own-user RLS, composite identity, and update trigger. Remote migration/RLS state remains unverified and risk alerts only log. |
| `backend/core` (C++) | working tree | 2026-07-23 | B / explicit-x64 | binary discovery, hardware preflight, build, and CTest sweep (s93) | Current amd64 binary is discoverable and native 30/30 passes; arm64 is now rejected before deployment until its ONNX path is implemented. |
| `backend/mcp_server` | working tree | 2026-07-23 | B / real-host-stdio-gated | SDK probe, generated-path, diagnostics, build, and clean-snapshot sweep (s93) | Config and diagnostic defects are closed; SDK success fixtures and build pass. A real host must still complete initialize/list/read-only status. |
| `infra/deployment` | working tree | 2026-07-13 | B | manifest/entrypoint sweep (s73) + current connective pass (s75) | Kubernetes, Terraform, and Heroku now launch the real `node backend/api/app.js` entrypoint instead of the stale `web/app.js` path. |
| `infra/docker` + `infra/systemd` + `backend/scripts/ops` | working tree + `883681fd` | 2026-07-27 | B+ / heartbeat-contract-gated | Compose profile/no-socket plus durable host-health/backup heartbeat wiring (s110) | Profiles remain private/no-socket; actual host restart/backup/recovery proof remains external. |
| `shared/lib` canonical/root paths | `cb1c349f` | 2026-07-16 | B+ / canonical | clean archive 15-module load + structure/hygiene (s83) | Canonical modules and compatibility shims are committed, marker-free, and load from an extracted archive. |
| `infra/client` | `e0de66de` | 2026-07-24 | B+ / real-login-gated | Linux user-systemd, Windows scheduled-task, secret handling, reconnect, and uninstall sweep (s101) | Contract and parser tests pass with auto-open disabled by default; no actual service/task/tunnel was installed or exercised. |
| `tests` | working tree + `883681fd` | 2026-07-27 | A- / heartbeat-contract-verified | monitor contracts plus atomic/TTL/sanitization/legacy-projection tests (s110) | Local contract coverage is green; fresh-install and live restart/soak proof remain external. |
| `docs` testing/deployment guidance | working tree | 2026-07-26 | B / aligned-source-gated | role hosting, deployment commands, docs-link, baseline, and source/runtime claim sweep (s104) | The canonical hub links and README evidence label are repaired; host qualification guidance remains intentionally gated. |
| `workspace` continuity | working tree | 2026-07-26 | A- / current | audit, mass-implement closure, DCS, grades, prompt, handoff, proof-boundary, and next-goal sync (s104) | Durable records distinguish repaired source contracts from stale-data, commit, and external-runtime qualification gates. |

## Stub/Duplicate Sweep status legend
- **done (session N)** — a stub/dead-export/duplicate-logic sweep was run and any findings were
  resolved or explicitly kept (with a reason) in that session.
- **not yet run** — no sweep has ever been recorded for this directory in this ledger.
- **stale (session N)** — a sweep was run before, but enough code has changed since that it should
  be re-run before trusting the old result.
