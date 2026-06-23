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
| `backend/api` | `03b3c8d5` | 2026-06-21 | B+ | not yet run | Sigma-band path-read oracle fixed (session 53); no stub/dup sweep done since, just the gating fix. |
| `backend/gateway` | `0903df6b` | 2026-06-22 | B+ | not yet run | 1 dormant gap noted (`processProposedOrders` batch failure-swallowing) — see session 58 flag in `STATE.md`. |
| `backend/cli` | `17f565fb` | 2026-06-23 | B+ | not yet run | TUI/chat/dashboard surface + new Alpaca auto-trade wiring this session; real-terminal carryovers still open (see `HANDOFF.md`). |
| `shared/lib/market` | `0903df6b` | 2026-06-22 | A | done (session 55) | `renameWithRetry` Atomics fix + first-ever test coverage. 3 dead shims deleted; `polymarket_history.js` wrongly flagged dead once — see Notes on the grep lesson in the skill file. |
| `shared/lib/runtime` | `17f565fb` | 2026-06-23 | not yet graded | not yet run | New this session: `process_lock.js`, `alpaca_bot_state.js`, `alpaca_bot_cycle.js`. Author-reviewed only — first real review is part of the session 58 flag. |
| `Frontend/dashboard` | `0903df6b` | 2026-06-22 | not graded (confirmed live) | not yet run | Confirmed not dead during the session-52 audit; no deeper sweep done. |
| `backend/core` (C++) | — | — | not graded | not yet run | **Stalest entry in this ledger** — zero commits have touched it in roughly 10+ sessions; carried forward unreviewed every time. Prioritize next time C++ changes or a full sweep is in scope. |

## Stub/Duplicate Sweep status legend
- **done (session N)** — a stub/dead-export/duplicate-logic sweep was run and any findings were
  resolved or explicitly kept (with a reason) in that session.
- **not yet run** — no sweep has ever been recorded for this directory in this ledger.
- **stale (session N)** — a sweep was run before, but enough code has changed since that it should
  be re-run before trusting the old result.
