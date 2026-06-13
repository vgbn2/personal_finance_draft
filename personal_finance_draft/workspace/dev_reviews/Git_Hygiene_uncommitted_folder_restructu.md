## Git Hygiene — uncommitted folder restructure — RESOLVED 2026-06-08 (commit `4d3fb4d`)
- `backend/cli/commands/*` and `backend/api/server/routes/*` (flat → subdirectory restructure from `648ab69e`, 2026-05-29) is now committed with full rename tracking (`{ => account}/auth.js`, `{ => market}/analytics.js`, etc. — verified via `git show --stat HEAD`). `git status --porcelain` for both trees is clean; `dev.review.txt` deletion landed in the same commit.
- Note: the user landed this via a broader self-driven commit (`4d3fb4d "changes"`) that also swept in unrelated monorepo-root WIP beyond the originally scoped 52-file batch — the restructure itself is intact and correctly tracked, so no follow-up needed on this entry.

