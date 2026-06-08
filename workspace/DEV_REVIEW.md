## Git Hygiene — uncommitted folder restructure — RESOLVED 2026-06-08 (commit `4d3fb4d`)
- `backend/cli/commands/*` and `backend/api/server/routes/*` (flat → subdirectory restructure from `648ab69e`, 2026-05-29) is now committed with full rename tracking (`{ => account}/auth.js`, `{ => market}/analytics.js`, etc. — verified via `git show --stat HEAD`). `git status --porcelain` for both trees is clean; `dev.review.txt` deletion landed in the same commit.
- Note: the user landed this via a broader self-driven commit (`4d3fb4d "changes"`) that also swept in unrelated monorepo-root WIP beyond the originally scoped 52-file batch — the restructure itself is intact and correctly tracked, so no follow-up needed on this entry.

### Git Hygiene — `node_modules`/`.mcp.json` re-drift — RESOLVED 2026-06-08 session 8
- The `4d3fb4d "changes"` commit above (broader-than-scoped) also re-introduced 4,533 files into tracking: `node_modules/` (1,116), `backend/gateway/node_modules/` (3,374), `storage/data/cache/` (42), `.mcp.json` (1) — the same drift class originally fixed in session 2. `structure_contract.test.js` regressed to 3/4.
- Fixed with index-only `git rm -r --cached node_modules backend/gateway/node_modules storage/data/cache .mcp.json` (zero risk to working-tree files). `structure_contract.test.js` → 4/4; full suite unchanged at 226/232 before/after (6 pre-existing unrelated failures — the old "241/241" figure in session memory is stale, corrected here).
- User approved the commit explicitly given the size (~4,533 deletions in the index).

### Container ML — ONNX runtime flag — IN PROGRESS, blocked on Docker daemon (session 8)
- `infra/docker/Dockerfile:46` was missing `-DSOVEREIGN_ENABLE_ONNX_RUNTIME=ON` (flag exists in `backend/core/CMakeLists.txt:9`, default OFF) — container ML silently ran `deterministic_baseline` instead of the real trained models proven in Phase 3.
- Edit made (`cmake .. -DCMAKE_BUILD_TYPE=Release -DSOVEREIGN_ENABLE_ONNX_RUNTIME=ON`) but **left uncommitted** — verification blocked by a wedged Docker Desktop daemon (zombie `com.docker.build` process, idle ~22h, predates this session; every `docker` CLI call hangs). User deferred the Docker Desktop restart needed to clear it. See `workspace/handoff/2026-06-08.md` session 8 for the full trace and exact resume steps (rebuild → `ml compare --json` → confirm `onnx_runtime` backend → commit).
- Also surfaced a latent gap: `storage/models/*.onnx` are gitignored (`.gitignore:64`), so a genuine fresh-clone-to-remote-node deploy would silently fall back to baseline — flagged for a future user decision (commit the ~1MB binaries vs. add a model-sync step to `DEPLOY.md`'s flow), not silently fixed.

### `run bot live` redirect — RESOLVED 2026-06-08 (reclassified, not a stub)
- `backend/cli/commands/runner/run.js:105` hard-stops `sovereign run bot live` with "Not implemented here — use: sovereign bot run --live". Traced both paths: `run bot {paper|live}` is the *persistent unattended loop* manager (`runPaperBotLoop`/`run_loop.js`, used for `paper`/`backfill`); `bot run --live` (`commandBot` in `trade.js:1359` → gateway `runBotLoop`/`runCycle` in `cycle.ts:441`) is the real, fully-wired live path — gated by `featureGate('bot_autopilot')`, `canLiveExecute('alpaca')`, and an interactive `requireAuth` (PIN) prompt.
- Conclusion: the redirect is an intentional safety boundary, not a completeness gap. Wiring `run bot live` to start an unattended persistent *live-money* loop would bypass the per-session auth/PIN gate that `bot run --live` enforces — a real-money safety regression, not an improvement. Leaving the hard-stop in place is correct design. Removing this from the open ledger; no code change needed.

## Centralization Backlog

| Pattern | Files (count) | Proposed unit | Effort | Grade impact |
|---|---|---|---|---|
| ~~ANSI import spelling drift~~ — RESOLVED 2026-06-08 (commit `4d3fb4d`): `auth.js` now imports `shared/lib/ansi` (matches `settings.js`, same shim target) | was 4 files, outlier fixed | — | S | done |

Noted, not flagged: `parseArgs(argv)` in `scripts/strategies/ml_smoke_alpaca.js` and `ml_smoke_polymarket.js` share a ~6-line arg-loop shape. Only 2 files, each parses different flag sets (`--qty` vs none, `--dry` shared) — below the 3-file drift threshold and a shared helper would be more code than the duplication. No action needed.
