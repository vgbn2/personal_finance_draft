# Session Handoff — Pointer

**This file is now a short pointer, not an accumulating log.** As of 2026-06-08, session handoffs live
in dated files under `workspace/handoff/` — one file per calendar day — so this pointer (and a session
boot) never has to read tens of thousands of tokens of accumulated history.

## Convention

- Latest/current handoff: **`workspace/handoff/2026-06-11.md`**
- At session close: append a new `## Update - <date> session N — <title>` block to
  **today's** `workspace/handoff/<YYYY-MM-DD>.md` (create it if it doesn't exist yet for today).
  Do NOT append to this pointer file or recreate a single growing log.
- Update the "Latest/current handoff" line above whenever a new dated file is created.
- Deep history (everything accumulated before this convention started) lives in
  `workspace/handoff/_archive_through_2026-06-08.md` — read it only when you need pre-2026-06-08 detail.
- `workspace/STATE.md` was similarly trimmed; older Correction Log/Update entries (sessions ~20-79,
  2026-05-31 to 2026-06-07) are archived in `workspace/STATE_ARCHIVE.md`.

## Open carryovers (keep this list current)

- **`feat/ml-onnx-section` — AUDITED + FIXED + COMMITTED (sessions 11-12, 2026-06-11).**
  The unrecorded 2026-06-10 work was audited (7 new failing test files, broken
  `runGatewayCommand`, tracked→untracked deps), then fixed via Sonnet-delegated waves and
  landed in 6 commits (`358476f6`..`8e8b4adf`). **Full suite now 263/263 — first fully green
  run on record** (all 6 pre-existing baseline failures cleared too). Trail:
  `workspace/handoff/2026-06-11.md`, DEV_REVIEW.md "Focused Audit - 2026-06-11" + RESOLUTION.
  Branch is ready for the user's merge decision (feat/ml-onnx-section → main).
- **`backend/cli/target/` hygiene — CLOSED** (committed in `8e8b4adf`).
- **`.onnx` models latent gap — CLOSED** (binaries + serving manifest committed in `8e8b4adf`).
- **DEPRIORITIZED by user (2026-06-11, "not important, skip"):** Docker/ONNX container
  verification (Dockerfile:46 edit stays uncommitted in the working tree — don't lose it, but
  don't push it either), centralization backlog (trade.js launcher call sites,
  tools/backend.js local runBackendCommand), untracked `notebooks/`, graphify-out refresh.
  Do NOT proactively resume these; wait for the user to re-raise.

- **shared/lib reorg + workspace doc archival — DONE (session 10, 2026-06-09), but READ THIS:**
  the reorg STATE.md had been claiming as "done" since 2026-06-08 was actually sitting **entirely
  uncommitted** (new canonical `shared/lib/{runtime,market,strategy,...}` dirs untracked, old
  files gutted to shims only in the working tree — one `git clean -fd` from total loss). Same for
  the doc archival (`STATE_ARCHIVE.md`/`workspace/handoff/`/`workspace/archive/`). Landed in
  `f4a97e94` (191 files) + a follow-up commit (21 files). **Lesson for future sessions: when
  STATE.md says a restructure is "done," verify with `git status`, not just by reading the
  doc** — this is the third time this drift class has bitten the project (`648ab69e`, `4d3fb4d`,
  now this). Full trace: `workspace/handoff/2026-06-09.md` session 10.
- **New hygiene flag (not fixed)**: `backend/cli/target/` — 2,151 untracked Rust build-artifact
  files. Should probably go in `.gitignore`; currently a `git add backend/` trap (caught and
  walked back during session 10's commit, see above). Small, easy follow-up.
- **Scalping-bot pivot scoping — DONE.** Scoping doc written at `workspace/SCALPING_BOT_SCOPING.md`
  (5 sections: strategy module shape, sub-minute cycle reqs, order-book data needs, latency/fee
  modeling, open risks/decisions — all with file:line refs). Verdict: this is a second execution
  architecture, not a config change; weeks not days. The pivot decision (whether/how to proceed)
  is still the **user's** to make — doc ends with 4 open questions (venue, thesis, validation
  window, resourcing) that need answers before any planning/implementation pass starts.
- `.mcp.json` test-gate / git-hygiene drift — **DONE (session 8)**. Turned out bigger than scoped
  (4,533 files: `node_modules/` + `backend/gateway/node_modules/` + `storage/data/cache/` +
  `.mcp.json` had drifted back into tracking via the broad `4d3fb4d "changes"` commit). Fixed with
  index-only `git rm -r --cached`; `structure_contract.test.js` → 4/4; committed.
- `infra/docker/DEPLOY.md` — **DONE (session 8)**. Was untracked but accurate; committed as-is
  (gateway-service removal + `macro_features.cpp` fix were already in `4d3fb4d`).
- **Container ML ONNX enablement — BLOCKED on Docker Desktop (session 8).** Edited
  `infra/docker/Dockerfile:46` to add `-DSOVEREIGN_ENABLE_ONNX_RUNTIME=ON` (uncommitted —
  deliberately left unverified-and-uncommitted). Rebuild couldn't be verified: Docker Desktop's
  daemon was wedged by a **stale zombie `com.docker.build` process (PID 166360, idle ~22h, started
  2026-06-07 17:25 — predates this session)**; every `docker` CLI call (`images`, `ps`, `compose ps`)
  hung indefinitely. Killing the PID directly was blocked by the harness's destructive-action
  classifier. User chose to **defer the Docker Desktop restart to later** rather than do it now.
  **Next session**: user restarts Docker Desktop first (clears the wedge), then re-run
  `docker compose -f infra/docker/docker-compose.yml build && ... up -d`, verify
  `docker exec docker-web-1 ... ml compare --json` reports `"backend":"onnx_runtime"` (not
  `deterministic_baseline`, cross-check against Phase-3 parity: xgboost 0.666376 / logistic
  0.468378 / regime 0.456982), THEN commit the Dockerfile edit. Don't commit the edit before
  verifying — an unverified build-config change in `Dockerfile` could silently break the image.
- **Latent gap (flagged, not fixed)**: trained `.onnx` model files are gitignored
  (`.gitignore:64` → `models/*.onnx`). Local `docker compose build` picks them up fine (build
  context = local working tree), but a genuine "clone to fresh remote Linux node" deploy would be
  missing the trained models and silently fall back to `deterministic_baseline`. Needs a future
  user decision: commit the small (~1MB) `.onnx` binaries, or add a model-sync/retrain step to
  the documented deploy flow in `DEPLOY.md`.
- `run bot live` "stub" was investigated this session and **reclassified as resolved** (intentional
  safety redirect, not a gap) — see `workspace/DEV_REVIEW.md` and
  `workspace/handoff/2026-06-08.md` session 7 for the full trace.

## Boot reading order (for session-orchestrator)

1. This file (`HANDOFF.md`) — short pointer + carryover list.
2. The latest dated file in `workspace/handoff/` (see "Latest/current handoff" above).
3. `workspace/SESSION_MEMORY.md` and `workspace/STATE.md` as before.
4. Archives (`_archive_through_*.md`, `STATE_ARCHIVE.md`) only on demand for deep history.
