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
| repo bootstrap / dependencies | working tree | 2026-07-13 | B- | package-root dependency + test-script sweep (s75) | API dependency bloat and MCP moving-version drift are fixed; all 22 explicit npm-script test references resolve. Remaining package risk is the recorded frontend transitive advisory set. |
| `backend/scripts/data_ops/ingest_market_data` | working tree | 2026-07-13 | B+ / provider-roadmap | availability + silent-stub sweep (s76) | Six unavailable lanes remain explicit; Kalshi history now fails visibly instead of returning empty success. Real provider implementation remains pending. |
| `shared/lib/providers` | working tree | 2026-07-05 | B+ | env/string sweep + alias fix (s64) | Alpaca data provider now uses the canonical broker alias resolver, so documented `ALPACA_SECRET_KEY` works alongside `ALPACA_API_SECRET`. Regression test added. |
| `backend/api` | working tree | 2026-07-13 | B- / deployment-gated | auth/cache + session-81 audit repairs | Protected requests revalidate bearer sessions; signal promotion now rejects malformed IDs exactly; `/api/config` has a migrated, validated storage contract. Remote RLS/live-provider soak remain open. |
| `scripts` | working tree | 2026-07-05 | B- | connective sweep + migration repair (s65) | Polymarket helper scripts now anchor at the real repo root, honor the shared env loader, use `@polymarket/clob-client-v2`, and fail cleanly on missing credentials instead of throwing module/path errors. Remaining caveat: they still depend on the gateway install layout for CLOB imports. |
| `shared/lib/ml/` | working tree | 2026-07-11 | C- / promotion-gated | model/report truth sweep (s73) | Canonical comparison ranks architecture-named deterministic formulas and excludes real ONNX candidates; minimum promotion sample/trade floors are absent. |
| `shared/contracts/analysis` + `shared/lib/analysis` | working tree | 2026-07-13 | A- / promotion-blocked | v3 contracts, recorded providers, parity, readiness, freshness repair | Recorded FX/EIA/DefiLlama factors now anchor `data_as_of` and validity to source observations while retaining retrieval as availability provenance. Promotion remains blocked and v2 stays live/default. |
| `shared/lib/data/macro_store.js` + macro migration | working tree | 2026-07-13 | B+ / remote-migration-gated | point-in-time revision sweep (s80) | Source preserves release, availability, ingestion, vintage, and revisions; as-of tests prevent later or delayed-ingest leakage. Remote Supabase migration remains unverified. |
| `backend/cli/commands/research/` | working tree | 2026-07-13 | B+ / data-readiness-gated | scorecard state/output/quorum sweep | Schema 2 reports empty/excluded/degraded/filter states compactly and truthfully; schema 3 separates catalog from evidence drill-down. Current provider coverage remains stale/incomplete. |
| `shared/lib/providers/` | `4ac77e8a` | 2026-06-26 | B | first stamp (s62) | `binance.js` clean. WebSocket reconnect + liveFeed.stop() ordering noted (harmless). |
| `backend/gateway` | working tree | 2026-07-13 | B+ / fail-closed | Polymarket lifecycle/valuation + live-bot authorization repair | Position lifecycle remains fail-closed and bot callers now reuse the canonical Polymarket capability/session/PIN authorization contract. |
| `backend/cli` | working tree | 2026-07-13 | C / duplication-gated | viewport/navigation + scorecard parity + automation safety repair | Scorecard flags are identical across both manifests and output is width-bounded. The 51-vs-49 manifests still have separate owners, so broader drift risk remains. |
| `shared/lib/market` | working tree | 2026-07-11 | B- / concurrent-writer gated | ts-index persistence sweep (s73) | Single-writer append/merge is crash-safe and heavily tested; no per-bin cross-process serialization prevents append/append or append/merge lost updates. |
| `shared/lib/runtime` | `5e60babb`+uncommitted | 2026-06-25 | A | done (session 58), bug fixed + tested (session 59 mass-implement) | The two live-capital gaps were FIXED (`cf4f7026`): `resolveEntryQty` records broker filled qty, `resolveExitQty`+per-symbol counter clamps exit sells (no broker oversell). Session 59 audit found the clamp's *bookkeeping* was wrong on that same path (`realizedPnl` off the pre-clamp qty, unsold remainder dropped). Session 59 mass-implement FIXED it: new pure `buildExitOutcome` helper (same pattern as `decideExit`/`resolveExitQty`) computes P&L off the actually-sold qty and returns the unsold remainder as a still-tracked position; 4 new tests (full-exit regression, the partial-clamp fix, dryRun flag, defensive over-clamp). Also centralized the PIN strip into `buildTradeGatewayLaunch` itself (covers all 8 callers, not just `commandTrade`) + 3 new tests. B→A. |
| `Frontend/dashboard` | working tree | 2026-07-13 | B- / live-browser-gated | Chrome viewport contract + responsive implementation (s78) | Production build passes a 6-test Chrome harness at 375/768/1440: all ten destinations activate, controls collapse/reopen below 1024px, overview grids reflow 1/2/4, and active panels do not overflow main. Authenticated live-provider browser soak remains open. |
| `supabase` | working tree | 2026-07-13 | B / remote-RLS-gated | local RLS + account-config migration repair | `user_config` now has committed own-user RLS, composite identity, and update trigger. Remote migration/RLS state remains unverified and risk alerts only log. |
| `backend/core` (C++) | working tree | 2026-07-11 | C / execution-gated | native contract + compiled-shell sweep (s73) | Market-order risk receives zero notional/static portfolio proxies; 9 dead placeholder headers and test-only execution/strategy shells remain. Compute build is broad and real, not wholly stubbed. |
| `backend/mcp_server` | working tree | 2026-07-13 | C+ / policy-gated | tool/default/dependency sweep (s73) + SDK pin/build verification (s75) | SDK is pinned and locked to tested version 1.29.0 and the build passes. Degraded-backtest policy remains the highest-impact open MCP gap. |
| `infra/deployment` | working tree | 2026-07-13 | B | manifest/entrypoint sweep (s73) + current connective pass (s75) | Kubernetes, Terraform, and Heroku now launch the real `node backend/api/app.js` entrypoint instead of the stale `web/app.js` path. |

## Stub/Duplicate Sweep status legend
- **done (session N)** — a stub/dead-export/duplicate-logic sweep was run and any findings were
  resolved or explicitly kept (with a reason) in that session.
- **not yet run** — no sweep has ever been recorded for this directory in this ledger.
- **stale (session N)** — a sweep was run before, but enough code has changed since that it should
  be re-run before trusting the old result.
