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
| system design (cross-cutting) | working tree + `80df461f` | 2026-07-28 | B- / release-gated | deep audit, auth/combined implementation, fresh-source and qualification sweep (s116) | Private identities and research-only combined workflow are coherent; dependency highs and external operational proof still block release/live claims. |
| repo bootstrap / dependencies | working tree + `80df461f` | 2026-07-28 | B / advisory-gated | five-root clean-export install/build plus restricted advisory (s116) | Reproducibility passes, but 24 high, 11 moderate, and 26 low vulnerable nodes require isolated owner upgrades before release. |
| `.github/workflows` | `54f861eb` | 2026-07-22 | B+ / server-run-gated | moved-path, CTest-root, Node-version, image-readiness sweep (s89) | Known deterministic failures are repaired and locally contracted; authenticated Actions run evidence remains external. |
| `backend/scripts/data_ops/ingest_market_data` | working tree | 2026-07-13 | B+ / provider-roadmap | availability + silent-stub sweep (s76) | Six unavailable lanes remain explicit; Kalshi history now fails visibly instead of returning empty success. Real provider implementation remains pending. |
| `shared/lib/providers` | working tree | 2026-07-23 | B+ / explicit-unavailable | TradingView caller/export and unavailable-provider sweep (s93) | Quote ingestion remains wired; the zero-caller empty screener export is removed. Other unavailable lanes remain typed and fail closed. |
| `backend/api` | working tree + `80df461f` | 2026-07-28 | A- / deployment-auth-gated | private-default routes, stable principals, body/CSP/origin, combined workflow contracts (s116) | API 25/25 and clean install pass; real Supabase/RLS, proxy/TLS, remote login, and dependency remediation remain external. |
| `scripts` | working tree | 2026-07-23 | B+ / host-runtime-gated | MCP setup/probe and stale automation implementation sweep (s93) | Setup paths are valid and atomic; the probe diagnoses host stdio before SDK stages; the placeholder automation file is removed. Real-host MCP proof remains. |
| `shared/lib/ml/` | working tree | 2026-07-11 | C- / promotion-gated | model/report truth sweep (s73) | Canonical comparison ranks architecture-named deterministic formulas and excludes real ONNX candidates; minimum promotion sample/trade floors are absent. |
| `shared/contracts/analysis` + `shared/lib/analysis` | working tree + `80df461f` | 2026-07-28 | B+ / calibration-gated | exact-asset PIT composition and immutable reviewed-workflow sweep (s116) | Production callers share one fail-closed research service; macro contribution stays neutral and decision readiness stays false pending calibration. |
| combined actionable engine | working tree + `80df461f` | 2026-07-28 | B- / research-only and macro-gated | CLI/API/MCP parity, identity/PIT/revision/rejection/promotion contracts (s116) | The engine now exists and is deterministic, but real EURUSD output fails closed because 0/86 fetched macro rows are PIT eligible and cannot submit or approve live action. |
| `shared/lib/data/macro_store.js` + macro migration | working tree + `80df461f` | 2026-07-28 | B / metadata-and-wiring-gated | PIT consumer, bounded FRED ingest, schema and cache-path sweep (s116) | Required rows were fetched, but provider availability/vintage metadata is dropped, remote schema lacks `available_at`, and scoped/global cache wiring differs. |
| `backend/cli/commands/research/` | `f9119729` | 2026-07-22 | B / composition-gated | prediction-interest import + real loader-boundary contracts (s87) | Provider and prediction loaders preserve the 1,825-day default, and prediction interest is fetched and asserted; no live exact-asset combined service exists. |
| `config/trading` + research history loaders | `f9119729` | 2026-07-22 | B+ / caller-contracted | five-year default + provider/prediction loader boundary (s87) | Four focused tests lock the 1,825-day default through both real loaders and prove the prediction interest caller. |
| `backend/gateway` | `e0de66de` | 2026-07-24 | B / convergence-gated | bot dry-run exit and repeated-token settlement lifecycle implementation (s101) | Unpriced positions remain open and reopened-token settlements use lifecycle identity; canonical bot-state projection remains a broader G3 gate. |
| `backend/cli` | working tree + `80df461f` | 2026-07-28 | A- / monitor-exercised | runtime doctor, global monitor CLI, aggregate and connectivity checks (s115) | CLI paths are bounded and truthful; provider/data freshness and host qualification remain external. |
| `shared/lib/market` | `80df461f` + local data | 2026-07-28 | A- / bounded-cache-qualified | authorized 14-window refresh plus integrity and strict snapshot validation (s116) | Configured cache is 92/92 with zero stale and DCS 1.0; remote persistence, single-writer, recovery, and soak are not proven. |
| `shared/lib/market/append_only_segments.js` | working tree | 2026-07-26 | B / integrity-contracted | mixed-store, checksum/file integrity, coverage, precedence, compaction, durability, and disposable-recovery sweep (s104) | P1 correctness failures are repaired and tested; write-amplification, free-space, retry, thermal/disk, and soak gates keep enablement opt-in. |
| `shared/lib/settings/interval_policy.js` + runner | working tree | 2026-07-26 | B / scheduler-contracted | resolver, CLI caller, persistent scheduler injection, backfill separation, and host-contract sweep (s104) | Effective paper cadence reaches the scheduler and bot policy no longer changes backfill cadence; runtime workload proof remains external. |
| `shared/lib/runtime` | working tree + `80df461f` | 2026-07-27 | B+ / heartbeat-atomicity-contracted | run-loop status repair plus heartbeat contract tests (s110, s111) | Status publication is atomic and errors are bounded; external restart/soak proof remains open. |
| `Frontend/dashboard` | working tree + `80df461f` | 2026-07-28 | A- / browser-exercised | host-capable responsive global-monitor exercise (s115) | 10/10 browser cases pass at 360/375/768/1440px; deployed service, login, and soak remain external. |
| `supabase` | working tree | 2026-07-13 | B / remote-RLS-gated | local RLS + account-config migration repair | `user_config` now has committed own-user RLS, composite identity, and update trigger. Remote migration/RLS state remains unverified and risk alerts only log. |
| `backend/core` (C++) | working tree | 2026-07-23 | B / explicit-x64 | binary discovery, hardware preflight, build, and CTest sweep (s93) | Current amd64 binary is discoverable and native 30/30 passes; arm64 is now rejected before deployment until its ONNX path is implemented. |
| `backend/mcp_server` | working tree + `80df461f` | 2026-07-28 | B+ / real-host-stdio-and-advisory-gated | distinct principal, per-tool/resource capability, combined research, build/contracts (s116) | Source policy and build pass; real host stdio/SSH and MCP HTTP dependency remediation remain open. |
| `infra/deployment` | working tree | 2026-07-13 | B | manifest/entrypoint sweep (s73) + current connective pass (s75) | Kubernetes, Terraform, and Heroku now launch the real `node backend/api/app.js` entrypoint instead of the stale `web/app.js` path. |
| `infra/docker` + `infra/systemd` + `backend/scripts/ops` | working tree + `80df461f` | 2026-07-27 | B+ / heartbeat-contract-gated | Compose profile/no-socket plus durable host-health/backup heartbeat wiring (s110, s111) | Profiles remain private/no-socket; actual host restart/backup/recovery proof remains external. |
| `shared/lib` canonical/root paths | `cb1c349f` | 2026-07-16 | B+ / canonical | clean archive 15-module load + structure/hygiene (s83) | Canonical modules and compatibility shims are committed, marker-free, and load from an extracted archive. |
| `infra/client` | `e0de66de` | 2026-07-24 | B+ / real-login-gated | Linux user-systemd, Windows scheduled-task, secret handling, reconnect, and uninstall sweep (s101) | Contract and parser tests pass with auto-open disabled by default; no actual service/task/tunnel was installed or exercised. |
| `tests` | working tree + `80df461f` | 2026-07-28 | A / fresh-source-exercised | clean-export five-root install/build/native/security/aggregate gate (s116) | Host 972/968/0/4 and clean-export 972/962/0/10 pass; commit, deployed runtime, restart, and soak remain external. |
| `docs` testing/deployment guidance | working tree | 2026-07-26 | B / aligned-source-gated | role hosting, deployment commands, docs-link, baseline, and source/runtime claim sweep (s104) | The canonical hub links and README evidence label are repaired; host qualification guidance remains intentionally gated. |
| `workspace` continuity | working tree | 2026-07-28 | A- / current | security/auth report, restricted evidence, matrix, state, prompt, handoff, next-goal sync (s116) | Durable records distinguish source/cache proof from dependency, commit, deployment, and live qualification gates. |

## Stub/Duplicate Sweep status legend
- **done (session N)** — a stub/dead-export/duplicate-logic sweep was run and any findings were
  resolved or explicitly kept (with a reason) in that session.
- **not yet run** — no sweep has ever been recorded for this directory in this ledger.
- **stale (session N)** — a sweep was run before, but enough code has changed since that it should
  be re-run before trusting the old result.
