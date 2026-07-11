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
| repo bootstrap / dependencies | working tree | 2026-07-05 | A- | dependency + connective sweep (s64) | Ubuntu migration sweep. `start_local.sh` no longer relies on undeclared `npx tsx`; root runtime deps now include Alpaca SDK + ethers; nested package roots verified clean with `npm ls --prefix ... --depth=0`. Remaining declaration-hygiene caveat: gateway directly imports transitive `axios`. |
| `backend/scripts/data_ops/ingest_market_data` | working tree | 2026-07-11 | B | availability contract + test-isolation fix (s70) | Six unavailable lanes carry canonical `not_implemented` metadata, fail before I/O, plan zero dry-run fetches, and are omitted from TUI selection. Real provider implementation remains pending. |
| `shared/lib/providers` | working tree | 2026-07-05 | B+ | env/string sweep + alias fix (s64) | Alpaca data provider now uses the canonical broker alias resolver, so documented `ALPACA_SECRET_KEY` works alongside `ALPACA_API_SECRET`. Regression test added. |
| `backend/api` | working tree | 2026-07-05 | B | connective sweep + migration repair (s65) | Supabase config loading now uses the shared env loader, so `SOVEREIGN_ENV_FILE` works again in the API stack. Added a regression for the migrated env-file path. |
| `scripts` | working tree | 2026-07-05 | B- | connective sweep + migration repair (s65) | Polymarket helper scripts now anchor at the real repo root, honor the shared env loader, use `@polymarket/clob-client-v2`, and fail cleanly on missing credentials instead of throwing module/path errors. Remaining caveat: they still depend on the gateway install layout for CLOB imports. |
| `shared/lib/ml/` | `4ac77e8a` | 2026-06-26 | B | first stamp (s62) | ONNX runner + HMM + permutation entropy. Two low findings: silent fallback in `resolveModel()` + double-require in `onnx_runner.js`. No stubs, no dead code. Suite green. |
| `backend/cli/commands/research/` | `4ac77e8a` | 2026-06-26 | B | first stamp (s62) | bias.js ANSI DIM-vs-COLOR padding off by 1 (cosmetic); dead stdio ternary in backfill call. Functionally correct. |
| `shared/lib/providers/` | `4ac77e8a` | 2026-06-26 | B | first stamp (s62) | `binance.js` clean. WebSocket reconnect + liveFeed.stop() ordering noted (harmless). |
| `backend/api` | `03b3c8d5` | 2026-06-21 | B+ | not yet run | Sigma-band path-read oracle fixed (session 53); no stub/dup sweep done since, just the gating fix. |
| `backend/gateway` | working tree | 2026-07-05 | B+ | connective sweep + dependency fix (s64) | Runtime install and TypeScript gates are clean. Direct `axios` import is now matched by direct `backend/gateway` dependency declaration. |
| `backend/cli` | working tree | 2026-07-05 | B+ | command-string sweep (s64) | Command routing and TUI string connectivity checked clean. Settings surface is now wired; space-containing ids like `auto-trade status` are intentionally split by dashboard executor. |
| `shared/lib/market` | `0903df6b` | 2026-06-22 | A | done (session 55) | `renameWithRetry` Atomics fix + first-ever test coverage. 3 dead shims deleted; `polymarket_history.js` wrongly flagged dead once — see Notes on the grep lesson in the skill file. |
| `shared/lib/runtime` | `5e60babb`+uncommitted | 2026-06-25 | A | done (session 58), bug fixed + tested (session 59 mass-implement) | The two live-capital gaps were FIXED (`cf4f7026`): `resolveEntryQty` records broker filled qty, `resolveExitQty`+per-symbol counter clamps exit sells (no broker oversell). Session 59 audit found the clamp's *bookkeeping* was wrong on that same path (`realizedPnl` off the pre-clamp qty, unsold remainder dropped). Session 59 mass-implement FIXED it: new pure `buildExitOutcome` helper (same pattern as `decideExit`/`resolveExitQty`) computes P&L off the actually-sold qty and returns the unsold remainder as a still-tracked position; 4 new tests (full-exit regression, the partial-clamp fix, dryRun flag, defensive over-clamp). Also centralized the PIN strip into `buildTradeGatewayLaunch` itself (covers all 8 callers, not just `commandTrade`) + 3 new tests. B→A. |
| `Frontend/dashboard` | `0903df6b` | 2026-06-22 | not graded (confirmed live) | not yet run | Confirmed not dead during the session-52 audit; no deeper sweep done. Out of session-58 scope (order-placement only). |
| `backend/core` (C++) | `1c7227b7` | 2026-06-23 | B | done (session 58, lightweight) | First-ever stamp. Builds; **28/29 ctest green** (`ctest -C Debug`); the one fail (`kronos_integration_test`) is a data-availability failure ("need ≥4 points"), not a code regression. All order-relevant tests green (`kill_switch`, `execution`, `portfolio_risk`). No obvious stub/dead code on the order path. No longer carried-forward-unreviewed. |

## Stub/Duplicate Sweep status legend
- **done (session N)** — a stub/dead-export/duplicate-logic sweep was run and any findings were
  resolved or explicitly kept (with a reason) in that session.
- **not yet run** — no sweep has ever been recorded for this directory in this ledger.
- **stale (session N)** — a sweep was run before, but enough code has changed since that it should
  be re-run before trusting the old result.
