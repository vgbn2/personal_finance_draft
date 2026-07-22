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
| repo bootstrap / dependencies | `54f861eb` | 2026-07-22 | A- / clean-runner-gated | HTTPS Git pin + Node 22 workflow alignment (s89) | TradingView is commit-pinned over noninteractive HTTPS; offline lock validation and Node 844/840/0fail/4skip pass. Remote npm/Docker image proof awaits Actions. |
| `.github/workflows` | `54f861eb` | 2026-07-22 | B+ / server-run-gated | moved-path, CTest-root, Node-version, image-readiness sweep (s89) | Known deterministic failures are repaired and locally contracted; authenticated Actions run evidence remains external. |
| `backend/scripts/data_ops/ingest_market_data` | working tree | 2026-07-13 | B+ / provider-roadmap | availability + silent-stub sweep (s76) | Six unavailable lanes remain explicit; Kalshi history now fails visibly instead of returning empty success. Real provider implementation remains pending. |
| `shared/lib/providers` | working tree | 2026-07-05 | B+ | env/string sweep + alias fix (s64) | Alpaca data provider now uses the canonical broker alias resolver, so documented `ALPACA_SECRET_KEY` works alongside `ALPACA_API_SECRET`. Regression test added. |
| `backend/api` | `f9119729` | 2026-07-22 | B+ / host-deployment-gated | complete active API gate + strict inclusion (s87-s88) | API 8/8 includes TTL cache and contracts remain 31/31; private central deployment is implemented but target-host health is unverified. |
| `scripts` | working tree | 2026-07-05 | B- | connective sweep + migration repair (s65) | Polymarket helper scripts now anchor at the real repo root, honor the shared env loader, use `@polymarket/clob-client-v2`, and fail cleanly on missing credentials instead of throwing module/path errors. Remaining caveat: they still depend on the gateway install layout for CLOB imports. |
| `shared/lib/ml/` | working tree | 2026-07-11 | C- / promotion-gated | model/report truth sweep (s73) | Canonical comparison ranks architecture-named deterministic formulas and excludes real ONNX candidates; minimum promotion sample/trade floors are absent. |
| `shared/contracts/analysis` + `shared/lib/analysis` | `98bd86c3` + working tree | 2026-07-15 | A- contracts / C fixture services | v2 adapter, v3 contracts, recorded providers, parity, readiness, exact-identity audit (s82) | Contracts are strict and focused analysis is 27/27, but the v2 adapter has no production composition caller; the seven-row recorded catalog has 0 eligible and 10 synthetic evidence ids. |
| `shared/lib/data/macro_store.js` + macro migration | `98bd86c3` + working tree | 2026-07-15 | B+ / analysis-integration-gated | point-in-time revision and consumer sweep (s82) | Ingest/storage tests are 8/8 and preserve availability/revisions, but point-in-time macro selection has no production schema-3 analysis consumer. Remote Supabase state remains unverified. |
| `backend/cli/commands/research/` | `f9119729` | 2026-07-22 | B / composition-gated | prediction-interest import + real loader-boundary contracts (s87) | Provider and prediction loaders preserve the 1,825-day default, and prediction interest is fetched and asserted; no live exact-asset combined service exists. |
| `config/trading` + research history loaders | `f9119729` | 2026-07-22 | B+ / caller-contracted | five-year default + provider/prediction loader boundary (s87) | Four focused tests lock the 1,825-day default through both real loaders and prove the prediction interest caller. |
| `shared/lib/providers/` | `4ac77e8a` | 2026-06-26 | B | first stamp (s62) | `binance.js` clean. WebSocket reconnect + liveFeed.stop() ordering noted (harmless). |
| `backend/gateway` | `bc9ce6de` | 2026-07-16 | B- / live-soak-gated | execution/auth/native-risk recovery + broad gates (s83) | Bot and direct order paths require explicit authorization and native risk approval; independent review and live soak remain mandatory. |
| `backend/cli` | `f9119729` | 2026-07-22 | B / runtime-gated | deterministic dashboard scroll + complete test gates (s87-s88) | Scroll proves nonzero overflow from a deterministic fixture; production spawn remains default and live execution remains blocked. |
| `shared/lib/market` | `59045be7` + local data | 2026-07-22 | B+ / single-writer | writer-lock + preservation/cadence sweep (s88) | Cross-process append/merge unions are exact and non-shrinking; current integrity is 92/92 cached, 72 stale, 9 cadence-plausible, and 0 unexplained. |
| `shared/lib/runtime` | `59045be7` | 2026-07-22 | A / lock-contracted | ownership-token file-lock implementation and adversarial sweep (s88) | Exclusive acquire, bounded stale recovery, lost-ownership checks, and ownership-checked release pass; central writer usage is covered end to end. |
| `Frontend/dashboard` | `cb1c349f` | 2026-07-16 | B- / live-browser-gated | typecheck/build + root responsive contracts (s83) | Typecheck and production build pass; Supabase still shares the main import graph and no new browser soak was claimed. |
| `supabase` | working tree | 2026-07-13 | B / remote-RLS-gated | local RLS + account-config migration repair | `user_config` now has committed own-user RLS, composite identity, and update trigger. Remote migration/RLS state remains unverified and risk alerts only log. |
| `backend/core` (C++) | `54f861eb` | 2026-07-22 | B- / execution-gated | clean-fixture root-build CTest 30/30 (s89) | All native tests execute against tracked/rooted inputs with no ignored-cache skip; broader market-order risk proxies and test-only execution/strategy shells remain. |
| `backend/mcp_server` | working tree | 2026-07-13 | C+ / policy-gated | tool/default/dependency sweep (s73) + SDK pin/build verification (s75) | SDK is pinned and locked to tested version 1.29.0 and the build passes. Degraded-backtest policy remains the highest-impact open MCP gap. |
| `infra/deployment` | working tree | 2026-07-13 | B | manifest/entrypoint sweep (s73) + current connective pass (s75) | Kubernetes, Terraform, and Heroku now launch the real `node backend/api/app.js` entrypoint instead of the stale `web/app.js` path. |
| `infra/docker` + `infra/systemd` + `backend/scripts/ops` | `54f861eb` | 2026-07-22 | A- / target-host-gated | retry-safe updater, internal health, timer, and runtime harness sweep (s89) | Last-success marking, failed-build retry, private-bind deployment readiness, explicit web+backfill, and five-minute host pull are contracted; no automatic rollback or target Docker proof. |
| `shared/lib` canonical/root paths | `cb1c349f` | 2026-07-16 | B+ / canonical | clean archive 15-module load + structure/hygiene (s83) | Canonical modules and compatibility shims are committed, marker-free, and load from an extracted archive. |
| `tests` | `54f861eb` | 2026-07-22 | A- / broad-gate | workflow/updater/runtime/native fixture matrix (s89) | Node 844/840/0fail/4skip, API 8/8, contracts 31/31, native debug 30/30, and updater/workflow 7/7; failed-build retry and private-bind readiness execute through the real shell. |
| `docs` testing/deployment guidance | `54f861eb` | 2026-07-22 | A- / account-gated | GitHub-vs-host, Node prerequisite, retry, rollback, and private-bind truth sweep (s89) | Guides separate readiness, persistence, code transport, internal health, data freshness, and the lack of automatic rollback without claiming public/live readiness. |
| `workspace` continuity | session 89 closeout | 2026-07-22 | A- / current | sourced host decision, failure evidence, plan, DCS, and authority gate | Current handoff/goal route provisioning to Vultr Singapore only after explicit payment/account approval and preserve GitHub/Docker evidence gaps. |

## Stub/Duplicate Sweep status legend
- **done (session N)** — a stub/dead-export/duplicate-logic sweep was run and any findings were
  resolved or explicitly kept (with a reason) in that session.
- **not yet run** — no sweep has ever been recorded for this directory in this ledger.
- **stale (session N)** — a sweep was run before, but enough code has changed since that it should
  be re-run before trusting the old result.
