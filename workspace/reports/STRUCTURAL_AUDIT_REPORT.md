# Structural Health Check - 2026-05-31

Scope: repo structure, architecture drift, generated artifacts, path consistency, and refactor readiness.

Verdict after cleanup pass: B operationally, C+ structurally.

The repo is runnable around the current domain layout, but it is carrying heavy historical drag. The active system is not the strict `apps/`, `packages/`, `native/` monorepo layout from the Sovereign Architect skill. The live repo has converged on `backend/`, `Frontend/`, `shared/`, `infra/`, `storage/`, `tests/`, and `docs/`, and the root build files support that layout. The main risk is not that the code cannot run; the risk is that docs, fixtures, tracked generated data, and old path references disagree enough to make future refactors expensive.

## Evidence Snapshot

- Source-like files excluding `node_modules`, `build`, `dist`, `graphify-out`, and cache folders: 1916.
- Largest source-like roots after exclusions: `storage` 1280, `backend` 355, `tests` 88, `docs` 58, `Frontend` 35, `shared` 31.
- Full recursive file pressure including generated/dependency folders: `Frontend` 14843, `backend` 8643, `node_modules` 5021, `graphify-out` 2653, `storage` 1295, `build` 1243.
- Cleanup pass retired tracked dependency/generated pressure for root `node_modules`, `backend/gateway/node_modules`, `storage/data/cache`, and `.mcp.json`.
- Structure contract added at `tests/scripts/structure_contract.test.js` to guard active entrypoints, ignore rules, and generated/local-only index hygiene.
- Current live build/runtime anchors: root `CMakeLists.txt` delegates to `backend/core`; Docker starts `backend/api/app.js`; package scripts use `backend/scripts`, `backend/api/tests`, and `build/backend/core`.

## Findings

### 1. Architecture Standard Drift

Severity: High

The named Sovereign Architect standard says the canonical top-level folders are `apps/`, `packages/`, `native/`, `docs/`, `scripts/`, `storage/`, and `tests/`. The repo does not have `apps/`, `packages/`, or `native/`. However, `docs/ARCHITECTURE.md`, `package.json`, `Dockerfile`, and `CMakeLists.txt` all describe or depend on the current domain layout instead.

This means a blind migration would be high-risk. The repo has two competing standards:

- Skill-level target: `apps/`, `packages/`, `native/`.
- Repo-current target: `backend/`, `Frontend/`, `shared/`, `infra/`, `storage/`, `tests/`.

Recommendation: pick one canonical target before moving files. For the next pass, prefer documenting and hardening the domain layout unless there is a real reason to pay the cost of a full monorepo migration.

### 2. Docs Still Point To Removed Paths

Severity: High

Many docs still reference removed or renamed paths:

- `cpp_core/` appears throughout operational and engineering docs, but the active native root is `backend/core`.
- `web/` and `web_page/` still appear in README and docs, while the active dashboard root is `Frontend/dashboard` and API server is `backend/api/app.js`.
- `scripts/cli`, `scripts/lib`, and `scripts/data_ops` appear in docs, while current active code lives under `backend/cli`, `shared/lib`, and `backend/scripts/data_ops`.

Impact: future agents and humans will follow stale commands, add code to nonexistent folders, or misjudge what is active.

Recommendation: run a docs-sync pass that updates README, quickstart, engineering standards, web API docs, and capability manifests to the current paths.

### 3. Generated And Dependency Files Were Tracked

Severity: Retired for the inspected paths

The repo previously tracked thousands of files that should normally be untracked:

- `node_modules`: 2023 tracked files.
- `backend/gateway/node_modules`: 3374 tracked files.
- `storage/data/cache`: 3472 tracked files.
- `.mcp.json`: tracked local MCP configuration.

Cleanup performed:

- Added ignore rules for actual generated/dependency/cache paths.
- Removed the inspected paths from the Git index with `git rm --cached`, leaving files on disk.
- Added `npm run test:structure` to prevent this from silently regressing.

Residual risk: other generated paths may still exist outside the inspected set, so future hygiene passes should keep checking `git ls-files` for dependency/build/cache roots.

### 4. Dual Data Roots

Severity: Medium

Both `data/` and `storage/data/` exist. The state file says storage partitioning is the current architecture, and `storage/data/cache/<family>` is the healthy data plane. But C++ defaults and some tests still reference `data/cache/backtest_history.json`.

Impact: tools can silently read the wrong cache, or tests can pass against stale compatibility data while runtime uses storage partitions.

Recommendation: centralize default cache paths in one shared constant layer for JS and C++ bridge calls, then make `data/cache` either an explicit legacy fixture path or remove it.

### 5. Script Boundary Split

Severity: Medium

Root `scripts/` now has only a few helper wrappers, while active logic lives in `backend/scripts`. Some docs and small root scripts still treat root `scripts/data_ops` as active.

Impact: contributor confusion and duplicate helper creation.

Recommendation: either keep root `scripts/` as thin compatibility wrappers with docs saying so, or migrate wrappers fully into `backend/scripts` and remove the root split.

### 6. Test Path Drift

Severity: Medium

Some legacy tests in `tests/scripts/tests` import `../lib`, `../cli`, `../data_ops`, and `../dev` even though the active modules are now under `shared/lib`, `backend/cli`, and `backend/scripts`. This matches earlier observed failures in `sovereign_cli.test.js` and `dev_utilities.test.js`.

Impact: the test tree cannot be trusted as a broad structure-safety net until import paths are normalized.

Recommendation: update or retire legacy path tests, then add one structural contract test that asserts active entrypoints exist.

## Recommended Cleanup Order

1. Continue path truth pass for lower-traffic docs and fixtures.
2. Data-root consolidation: choose `storage/data` as canonical and make any `data/cache` usage explicit legacy compatibility.
3. Test import repair: fix legacy `tests/scripts/tests` imports or quarantine them under an archive/legacy label.
4. Architecture decision: either bless the current domain layout or plan a staged `apps/packages/native` migration with path aliases and contract tests first.

## Debt Ledger

Owner: repo architecture maintainer.

## Architecture Rating To Implement

Current rating: `B-` for the code architecture, `C+` for the repo as a whole.

Implementation target:
- raise the code architecture to `B+` or better
- reduce generated/runtime bulk noise so repo-wide cleanliness reaches `B`
- remove the remaining legacy CLI and adapter overlap

Retirement condition: the active CLI shape is singular, `shared/lib/adapters.js` no longer mirrors live ingest/backfill behavior, and the docs/state files no longer treat compatibility shims as part of the main mental model.

Owner: repo architecture maintainer.

Deferred: physical migration to `apps/`, `packages/`, and `native/`.

Reason deferred: current build, Docker runtime, package scripts, and state docs already depend on the domain layout. Moving files now would be a large refactor touching CMake, Node imports, tests, Docker, docs, MCP server paths, and generated fixtures.

Where the debt lives: root folder layout, `docs/ARCHITECTURE.md`, README/operational docs, package scripts, CMake, Dockerfile, and path defaults in JS/C++ bridge code.

What breaks if ignored: docs drift gets worse, agents add code to stale paths, and future structural moves become increasingly risky.

Retirement condition: one canonical architecture decision is recorded, stale path references are below an agreed threshold, and the structural contract test passes in CI.

Deferred: historical mentions of `backend/cli/sovereign_cli.og.js` should be treated as archive notes only.

Reason historical: the active CLI now lives in `backend/cli/sovereign_cli.js`, and the older `.og.js` file is no longer present in the tree.

Where the history lives: legacy references in CLI docs, workspace notes, and any older review entries that still mention the archive shape.

What to avoid: treating the old entrypoint as an active runtime surface or a current cleanup blocker.

Current condition: the active CLI contract is covered by tests and docs; archive mentions can remain only as historical context.

Owner: repo architecture maintainer.
