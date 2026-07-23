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
| repo bootstrap / dependencies | working tree | 2026-07-23 | A- / clean-snapshot | package ownership, lock, build, and clean-source sweep (s93) | API now owns exact Supabase 2.106.2; offline lock refresh and focused tests pass from a clean current-source snapshot. Commit proof remains pending. |
| `.github/workflows` | `54f861eb` | 2026-07-22 | B+ / server-run-gated | moved-path, CTest-root, Node-version, image-readiness sweep (s89) | Known deterministic failures are repaired and locally contracted; authenticated Actions run evidence remains external. |
| `backend/scripts/data_ops/ingest_market_data` | working tree | 2026-07-13 | B+ / provider-roadmap | availability + silent-stub sweep (s76) | Six unavailable lanes remain explicit; Kalshi history now fails visibly instead of returning empty success. Real provider implementation remains pending. |
| `shared/lib/providers` | working tree | 2026-07-23 | B+ / explicit-unavailable | TradingView caller/export and unavailable-provider sweep (s93) | Quote ingestion remains wired; the zero-caller empty screener export is removed. Other unavailable lanes remain typed and fail closed. |
| `backend/api` | working tree | 2026-07-23 | B+ / direct-dependency-contracted | direct import, exact package lock, API and deployment sweep (s93) | The standalone API owns Supabase SDK 2.106.2 directly; API 8/8 and clean-snapshot lock verification pass. Target image runtime remains external. |
| `scripts` | working tree | 2026-07-23 | B+ / host-runtime-gated | MCP setup/probe and stale automation implementation sweep (s93) | Setup paths are valid and atomic; the probe diagnoses host stdio before SDK stages; the placeholder automation file is removed. Real-host MCP proof remains. |
| `shared/lib/ml/` | working tree | 2026-07-11 | C- / promotion-gated | model/report truth sweep (s73) | Canonical comparison ranks architecture-named deterministic formulas and excludes real ONNX candidates; minimum promotion sample/trade floors are absent. |
| `shared/contracts/analysis` + `shared/lib/analysis` | `cebd0658` | 2026-07-23 | A- contracts / C fixture services | exact-identity production-caller rescan (s92) | Strict contracts and named-fixture services remain; no new production exact-asset composition caller exists. |
| combined actionable engine | `cebd0658` | 2026-07-23 | D / nonexistent | production reachability and exact-asset composition gate (s92) | Fixture-only schema-3 CLI/API selectors do not constitute a combined engine; no production path composes required point-in-time domains for one exact asset. |
| `shared/lib/data/macro_store.js` + macro migration | `98bd86c3` + working tree | 2026-07-15 | B+ / analysis-integration-gated | point-in-time revision and consumer sweep (s82) | Ingest/storage tests are 8/8 and preserve availability/revisions, but point-in-time macro selection has no production schema-3 analysis consumer. Remote Supabase state remains unverified. |
| `backend/cli/commands/research/` | `f9119729` | 2026-07-22 | B / composition-gated | prediction-interest import + real loader-boundary contracts (s87) | Provider and prediction loaders preserve the 1,825-day default, and prediction interest is fetched and asserted; no live exact-asset combined service exists. |
| `config/trading` + research history loaders | `f9119729` | 2026-07-22 | B+ / caller-contracted | five-year default + provider/prediction loader boundary (s87) | Four focused tests lock the 1,825-day default through both real loaders and prove the prediction interest caller. |
| `backend/gateway` | `bc9ce6de` | 2026-07-16 | B- / live-soak-gated | execution/auth/native-risk recovery + broad gates (s83) | Bot and direct order paths require explicit authorization and native risk approval; independent review and live soak remain mandatory. |
| `backend/cli` | `f9119729` | 2026-07-22 | B / runtime-gated | deterministic dashboard scroll + complete test gates (s87-s88) | Scroll proves nonzero overflow from a deterministic fixture; production spawn remains default and live execution remains blocked. |
| `shared/lib/market` | `cebd0658` + local data | 2026-07-23 | B- / freshness-gated | live integrity and preservation-policy sweep (s92) | Writer locking remains contracted and coverage/schema are complete, but freshness fell to 5/92 fresh: 87 required windows stale, 0 unexplained grain. |
| `shared/lib/runtime` | `59045be7` | 2026-07-22 | A / lock-contracted | ownership-token file-lock implementation and adversarial sweep (s88) | Exclusive acquire, bounded stale recovery, lost-ownership checks, and ownership-checked release pass; central writer usage is covered end to end. |
| `Frontend/dashboard` | working tree | 2026-07-23 | B+ / configured | runtime env/example/docs/build parity sweep (s93) | The shipped example now contains the public Vite API and Supabase variables and excludes secret/service-role keys; typecheck/build pass. |
| `supabase` | working tree | 2026-07-13 | B / remote-RLS-gated | local RLS + account-config migration repair | `user_config` now has committed own-user RLS, composite identity, and update trigger. Remote migration/RLS state remains unverified and risk alerts only log. |
| `backend/core` (C++) | working tree | 2026-07-23 | B / explicit-x64 | binary discovery, hardware preflight, build, and CTest sweep (s93) | Current amd64 binary is discoverable and native 30/30 passes; arm64 is now rejected before deployment until its ONNX path is implemented. |
| `backend/mcp_server` | working tree | 2026-07-23 | B / real-host-stdio-gated | SDK probe, generated-path, diagnostics, build, and clean-snapshot sweep (s93) | Config and diagnostic defects are closed; SDK success fixtures and build pass. A real host must still complete initialize/list/read-only status. |
| `infra/deployment` | working tree | 2026-07-13 | B | manifest/entrypoint sweep (s73) + current connective pass (s75) | Kubernetes, Terraform, and Heroku now launch the real `node backend/api/app.js` entrypoint instead of the stale `web/app.js` path. |
| `infra/docker` + `infra/systemd` + `backend/scripts/ops` | working tree | 2026-07-23 | A- / real-host-gated | deployment, x64/RAM qualification, clean-snapshot, and zero-cost-host sweep (s93) | Preflight now rejects non-x64 and sub-8GB-class hosts; Compose and focused contracts pass. No spare host/poller is yet proven. |
| `shared/lib` canonical/root paths | `cb1c349f` | 2026-07-16 | B+ / canonical | clean archive 15-module load + structure/hygiene (s83) | Canonical modules and compatibility shims are committed, marker-free, and load from an extracted archive. |
| `tests` | working tree | 2026-07-23 | A- / external-runtime-gated | full Node, native, focused, clean-snapshot, and sandbox-boundary sweep (s93) | Node 859/855/0fail/4skip, native 30/30, focused 20/20, and clean snapshot pass; real MCP/Docker soak remains external. |
| `docs` testing/deployment guidance | working tree | 2026-07-23 | A- / aligned | MCP, host hardware, stack/Rust, owner, and canonical-rule sweep (s93) | Rust retirement, active ONNX/CI, setup/probe, and RAM/architecture guidance now match runtime truth. |
| `workspace` continuity | session 93 implementation | 2026-07-23 | A- / current | plan execution, prompt/handoff, grade, RAM gate, and proof-boundary sync (s93) | Repository batches are complete; the next queue is spare-machine qualification, real-host MCP proof, then writer catch-up. DCS stays 0.716. |

## Stub/Duplicate Sweep status legend
- **done (session N)** — a stub/dead-export/duplicate-logic sweep was run and any findings were
  resolved or explicitly kept (with a reason) in that session.
- **not yet run** — no sweep has ever been recorded for this directory in this ledger.
- **stale (session N)** — a sweep was run before, but enough code has changed since that it should
  be re-run before trusting the old result.
