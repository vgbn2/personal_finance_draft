## Git Hygiene — uncommitted folder restructure (found 2026-06-08, session 6 blast-through)
- `backend/cli/commands/*` and `backend/api/server/routes/*` were restructured from flat files (`commands/strategy.js`) to subdirectory modules (`commands/strategy/strategy.js`) at commit `648ab69e` (2026-05-29) — **but the restructure itself was never staged or committed**. `git diff --name-only HEAD` still shows ~23 old flat files as deleted while ~40 new subdirectory files sit untracked, despite the new layout being the live, working structure for 10+ days / many sessions.
- Evidence: `git log -1 -- backend/cli/commands/strategy/strategy.js` → `648ab69e ... Savepoint: Pre-Implementation Audit State`; `git status` shows the old paths as `D` and the new tree as `??`.
- Risk: anyone running `git checkout`/`git stash`/`git clean` against this tree would destroy the active command/route layer. It also makes `git blame`/`git log` on these paths useless until reconciled.
- Reviewer decision needed: stage the deletions + additions as one rename-tracked commit (likely `git add -A -- backend/cli/commands backend/api/server/routes` + commit) — but this spans the live trading CLI, so get explicit user sign-off on the commit boundary before running it (cross-cutting, hard to reverse cleanly once other unrelated WIP lands on top).
- Verification gate: after staging, `git status --porcelain` for these two trees should show only renames (`R`), and `node backend/cli/sovereign_cli.js --help` / a TUI smoke pass should still resolve every command.

### Completeness note
- `backend/cli/commands/runner/run.js:105` (path corrected — moved from `commands/run.js:104` in the uncommitted restructure above) still hard-stops the `run bot live` path with an explicit "Not implemented here — use: sovereign bot run --live" message. It is reachable and user-visible, so it should stay on the review ledger until a proper live path or a stronger dispatcher contract replaces it.

## Centralization Backlog

| Pattern | Files (count) | Proposed unit | Effort | Grade impact |
|---|---|---|---|---|
| ANSI import spelling drift (`#shared/ansi` vs `shared/lib/ansi` vs `shared/lib/centralized_lib/ansi` — all resolve to the same 134-line module via a 1-line re-export shim) | 4 files (`auth.js`, `setup.js`, `settings.js`, `trade.js`) | none needed structurally — just standardize on `#shared/ansi` everywhere and drop the direct `centralized_lib/ansi` relative import in `auth.js` | S | note only, no functional drift (shim makes both paths equivalent) |

Noted, not flagged: `parseArgs(argv)` in `scripts/strategies/ml_smoke_alpaca.js` and `ml_smoke_polymarket.js` share a ~6-line arg-loop shape. Only 2 files, each parses different flag sets (`--qty` vs none, `--dry` shared) — below the 3-file drift threshold and a shared helper would be more code than the duplication. No action needed.
