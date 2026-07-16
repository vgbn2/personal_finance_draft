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
| repo bootstrap / dependencies | `cb1c349f` | 2026-07-16 | B+ / reproducible | clean archive + six package roots + full gate matrix (s83) | Committed archive loads 15 modules, the canonical runner exists, and all six dependency roots resolve. |
| `backend/scripts/data_ops/ingest_market_data` | working tree | 2026-07-13 | B+ / provider-roadmap | availability + silent-stub sweep (s76) | Six unavailable lanes remain explicit; Kalshi history now fails visibly instead of returning empty success. Real provider implementation remains pending. |
| `shared/lib/providers` | working tree | 2026-07-05 | B+ | env/string sweep + alias fix (s64) | Alpaca data provider now uses the canonical broker alias resolver, so documented `ALPACA_SECRET_KEY` works alongside `ALPACA_API_SECRET`. Regression test added. |
| `backend/api` | `cb1c349f` | 2026-07-16 | B / deployment-gated | API/contracts/auth fallback recovery (s83) | API 7/7 and contracts 31/31 pass with protected-route rejection intact; remote deployment remains unverified. |
| `scripts` | working tree | 2026-07-05 | B- | connective sweep + migration repair (s65) | Polymarket helper scripts now anchor at the real repo root, honor the shared env loader, use `@polymarket/clob-client-v2`, and fail cleanly on missing credentials instead of throwing module/path errors. Remaining caveat: they still depend on the gateway install layout for CLOB imports. |
| `shared/lib/ml/` | working tree | 2026-07-11 | C- / promotion-gated | model/report truth sweep (s73) | Canonical comparison ranks architecture-named deterministic formulas and excludes real ONNX candidates; minimum promotion sample/trade floors are absent. |
| `shared/contracts/analysis` + `shared/lib/analysis` | `98bd86c3` + working tree | 2026-07-15 | A- contracts / C fixture services | v2 adapter, v3 contracts, recorded providers, parity, readiness, exact-identity audit (s82) | Contracts are strict and focused analysis is 27/27, but the v2 adapter has no production composition caller; the seven-row recorded catalog has 0 eligible and 10 synthetic evidence ids. |
| `shared/lib/data/macro_store.js` + macro migration | `98bd86c3` + working tree | 2026-07-15 | B+ / analysis-integration-gated | point-in-time revision and consumer sweep (s82) | Ingest/storage tests are 8/8 and preserve availability/revisions, but point-in-time macro selection has no production schema-3 analysis consumer. Remote Supabase state remains unverified. |
| `backend/cli/commands/research/` | `98bd86c3` + working tree | 2026-07-15 | B / composition-gated | scorecard schema split, adapter/service consumer, and fixture-gate sweep (s82) | Schema 2 remains truthful/default and schema 3 remains explicitly research-only, but no live exact-asset combined service exists. |
| `shared/lib/providers/` | `4ac77e8a` | 2026-06-26 | B | first stamp (s62) | `binance.js` clean. WebSocket reconnect + liveFeed.stop() ordering noted (harmless). |
| `backend/gateway` | `bc9ce6de` | 2026-07-16 | B- / live-soak-gated | execution/auth/native-risk recovery + broad gates (s83) | Bot and direct order paths require explicit authorization and native risk approval; independent review and live soak remain mandatory. |
| `backend/cli` | `cb1c349f` | 2026-07-16 | B- / runtime-gated | TUI/ingest/trade/scheduler parity + full suite (s83) | Manifest and unavailable-provider truth are restored; trade flags normalize and consumed PINs stay out of child argv. |
| `shared/lib/market` | `cb1c349f` + local data | 2026-07-16 | B- / one-grain-blocked | cadence classification + append/rename integrity (s83) | 92/92 cached, 0 required-window stale, 8 cadence-plausible suspects, and 1 blocking `SOYB 5m` seam excluded before analysis. |
| `shared/lib/runtime` | `5e60babb`+uncommitted | 2026-06-25 | A | done (session 58), bug fixed + tested (session 59 mass-implement) | The two live-capital gaps were FIXED (`cf4f7026`): `resolveEntryQty` records broker filled qty, `resolveExitQty`+per-symbol counter clamps exit sells (no broker oversell). Session 59 audit found the clamp's *bookkeeping* was wrong on that same path (`realizedPnl` off the pre-clamp qty, unsold remainder dropped). Session 59 mass-implement FIXED it: new pure `buildExitOutcome` helper (same pattern as `decideExit`/`resolveExitQty`) computes P&L off the actually-sold qty and returns the unsold remainder as a still-tracked position; 4 new tests (full-exit regression, the partial-clamp fix, dryRun flag, defensive over-clamp). Also centralized the PIN strip into `buildTradeGatewayLaunch` itself (covers all 8 callers, not just `commandTrade`) + 3 new tests. B→A. |
| `Frontend/dashboard` | `cb1c349f` | 2026-07-16 | B- / live-browser-gated | typecheck/build + root responsive contracts (s83) | Typecheck and production build pass; Supabase still shares the main import graph and no new browser soak was claimed. |
| `supabase` | working tree | 2026-07-13 | B / remote-RLS-gated | local RLS + account-config migration repair | `user_config` now has committed own-user RLS, composite identity, and update trigger. Remote migration/RLS state remains unverified and risk alerts only log. |
| `backend/core` (C++) | working tree | 2026-07-11 | C / execution-gated | native contract + compiled-shell sweep (s73) | Market-order risk receives zero notional/static portfolio proxies; 9 dead placeholder headers and test-only execution/strategy shells remain. Compute build is broad and real, not wholly stubbed. |
| `backend/mcp_server` | working tree | 2026-07-13 | C+ / policy-gated | tool/default/dependency sweep (s73) + SDK pin/build verification (s75) | SDK is pinned and locked to tested version 1.29.0 and the build passes. Degraded-backtest policy remains the highest-impact open MCP gap. |
| `infra/deployment` | working tree | 2026-07-13 | B | manifest/entrypoint sweep (s73) + current connective pass (s75) | Kubernetes, Terraform, and Heroku now launch the real `node backend/api/app.js` entrypoint instead of the stale `web/app.js` path. |
| `shared/lib` canonical/root paths | `cb1c349f` | 2026-07-16 | B+ / canonical | clean archive 15-module load + structure/hygiene (s83) | Canonical modules and compatibility shims are committed, marker-free, and load from an extracted archive. |
| `tests` | `cb1c349f` | 2026-07-16 | B+ / host-smoke-gated | restored runner + full/contract/native matrices (s83) | Root runner discovers 821 tests: 817 pass, 0 fail, 4 skip; API 7/7, contracts 31/31, native 29/29. |
| `workspace` continuity | `d851d7c6` + closeout | 2026-07-16 | B+ / recovered | exact parent parity + ordered history recovery (s83) | Ninety session 73-81 sections were restored additively with zero deletion; current handoff and next-goal pointers are refreshed. |

## Stub/Duplicate Sweep status legend
- **done (session N)** — a stub/dead-export/duplicate-logic sweep was run and any findings were
  resolved or explicitly kept (with a reason) in that session.
- **not yet run** — no sweep has ever been recorded for this directory in this ledger.
- **stale (session N)** — a sweep was run before, but enough code has changed since that it should
  be re-run before trusting the old result.
