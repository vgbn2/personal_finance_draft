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
| `shared/lib/ml/` | `4ac77e8a` | 2026-06-26 | B | first stamp (s62) | ONNX runner + HMM + permutation entropy. Two low findings: silent fallback in `resolveModel()` + double-require in `onnx_runner.js`. No stubs, no dead code. Suite green. |
| `backend/cli/commands/research/` | `4ac77e8a` | 2026-06-26 | B | first stamp (s62) | bias.js ANSI DIM-vs-COLOR padding off by 1 (cosmetic); dead stdio ternary in backfill call. Functionally correct. |
| `shared/lib/providers/` | `4ac77e8a` | 2026-06-26 | B | first stamp (s62) | `binance.js` clean. WebSocket reconnect + liveFeed.stop() ordering noted (harmless). |
| `backend/api` | `03b3c8d5` | 2026-06-21 | B+ | not yet run | Sigma-band path-read oracle fixed (session 53); no stub/dup sweep done since, just the gating fix. |
| `backend/gateway` | `1c7227b7` | 2026-06-23 | B+ | done (session 58) | Session 58 deep order-placement review: exit-code propagation + fail-closed risk engine confirmed good; `processProposedOrders` failure-reporting now lands (session 55). PIN-leak finding is in the CLI wrapper, not here. No stubs/forks on order path. |
| `backend/cli` | `5e60babb`+uncommitted | 2026-06-25 | B+ | done (session 58), re-verified + cleaned (session 59 mass-implement) | Session-58 findings FIXED (`cf4f7026`): PIN stripped from gateway argv (`stripFlagValue`), `maxPositions` enforced on entry, TUI Positions view got a `--live` toggle. Session 59 audit covered the 2 commits the ledger hadn't yet seen — clean. Session 59 mass-implement: deleted 5 stale "crashes"/"TODO" dev-review comments in the dashboard manifest (doc-alignment); `utils.js`'s `stripFlagValue` is now a re-export of the canonical `shared/lib/runtime/backend_bridge` implementation (no behavior change, removes a duplicate). |
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
