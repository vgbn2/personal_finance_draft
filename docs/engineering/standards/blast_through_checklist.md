# Current Blast-Through Checklist

This file now serves as the active blast-through runbook for the repo. Treat the items below as the default run order for the current session and future sessions, whether Codex or Claude is driving. Keep the historical snapshot that follows only as context.

## 0. Session Class

- [ ] Decide the session type: full audit, focused audit, debt-clearing, or verification-only.
- [ ] Write the in-scope sections before broad scanning.
- [ ] Record the current DCS and graph freshness at the top of the report.

## 1. Repo Truth Load

- [ ] Read `workspace/STATE.md`.
- [ ] Read `workspace/HANDOFF.md`.
- [ ] Read `workspace/SESSION_MEMORY.md`.
- [ ] Read `workspace/PROMPT_LOG.md` if the session needs prior prompt context.
- [ ] Refresh `graphify-out` when code changed in the prior session.
- [ ] Load or update `workspace/DEV_REVIEW.md` before the final report if the session uncovers reviewable debt.

## 2. Sub-Agent Routing

- [ ] Use the main agent for session setup, scope selection, gate decisions, and final synthesis.
- [ ] Use one sub-agent per distinct side task when the file sets do not overlap.
- [ ] Use a lightweight sub-agent for broad scanning, repeated reads, and routine evidence gathering.
- [ ] Use XHigh for hotspot validation, severity ranking, architecture ambiguity, and any file that is likely to become a gate decision.
- [ ] Send hotspots to XHigh only after the broad scan has narrowed them to a small file set or a concrete pattern.
- [ ] Keep XHigh on judgment-heavy work, not first-pass repo sweeps.
- [ ] Keep hotspot prompts narrow: exact files, exact question, exact evidence required.
- [ ] If a hotspot touches multiple sections, route one sub-agent per section and keep the handoff file overlap-free.

### Hotspot Criteria

Use XHigh when one or more of these are true:

- [ ] A file is monolithic, close to a gate threshold, or likely to need architectural judgment.
- [ ] The same logic appears in multiple places and needs severity ranking before extraction.
- [ ] A stub, security issue, or orphaned surface could change a gate status.
- [ ] A test or contract has conflicting evidence and needs an adjudication pass.
- [ ] A section has repeated D/F history or is the current cleanup bottleneck.

## 3. Scope Rules

- [ ] Prefer `graphify-out` first when the user asks for structure, connectivity, bridge nodes, or stale-doc checks.
- [ ] Use `git diff --name-only HEAD` plus gated sections to determine in-scope folders.
- [ ] Carry forward cached grades for out-of-scope sections instead of rescanning them.
- [ ] Expand scope only when a shared data path makes a neighboring section relevant.
- [ ] For feature work, check architectural hygiene: confirm the code lives in the canonical owner path, the imports point at the active surface, and no generated or compatibility path is being used as source truth.
- [ ] For feature work, check path hygiene: flag stale path names, wrong-root files, duplicated modules, and any new file that belongs under an established owner tree instead of a compatibility or scratch root.

### Section Coverage Checklist

Mark only the sections actually checked in the current blast-through.
If a child section was checked, do not also mark its parent unless the parent was reviewed separately.

- [ ] `backend/`
- [ ] `backend/cli/commands`
- [ ] `backend/cli/tui`
- [ ] `backend/cli`
- [ ] `backend/api/server`
- [ ] `backend/api`
- [ ] `backend/core`
- [ ] `backend/gateway`
- [ ] `backend/mcp_server`
- [ ] `backend/scripts`
- [ ] `Frontend/`
- [ ] `Frontend/dashboard/`
- [ ] `shared/lib`
- [ ] `shared/lib/providers`
- [ ] `shared/lib/backfill.js`
- [ ] `shared/lib/strategy_registry.js`
- [ ] `shared/lib/prop_firms.js`
- [ ] `shared/`
- [ ] `Frontend/dashboard/src`
- [ ] `Frontend/dashboard/dist`
- [ ] `config/`
- [ ] `config/markets`
- [ ] `config/strategies`
- [ ] `config/trading`
- [ ] `config/system`
- [ ] `storage/`
- [ ] `storage/data`
- [ ] `storage/data/cache`
- [ ] `storage/data/ts`
- [ ] `storage/data/models`
- [ ] `tests/`
- [ ] `tests/scripts`
- [ ] `tests/scripts/tests`
- [ ] `tests/cpp_core`
- [ ] `tests/web`
- [ ] `tests/fixtures`
- [ ] `backend/api/tests`
- [ ] `docs/`
- [ ] `docs/engineering`
- [ ] `docs/operational`
- [ ] `docs/research`
- [ ] `docs/archive`
- [ ] `workspace/`
- [ ] `infra/`
- [ ] `scripts/`
- [ ] `data/`
- [ ] `models/`
- [ ] `supabase/`
- [ ] `notebooks/`
- [ ] `tools/`
- [ ] `graphify-out/`
- [ ] `workspace/DEV_REVIEW.md`
- [ ] `workspace/STATE.md`
- [ ] `workspace/HANDOFF.md`
- [ ] `workspace/SESSION_MEMORY.md`
- [ ] `workspace/PROMPT_LOG.md`
- [ ] Generated/local-only roots: `node_modules/`, `build/`, `dist/`, `Frontend/dashboard/node_modules/`, `Frontend/dashboard/dist/`, `storage/data/cache/`, `storage/data/ts/`, `graphify-out/`
- [ ] Legacy/compatibility paths: `data/`, `scripts/`, `shared/lib/adapters.js`, `backend/cli/sovereign_cli.og.js`, `docs/archive/`

### Section Status Notes

For each checked section, record the review outcome in one line:

- `section`: checked / cached / skipped
- `grade`: A / B / C / D / F
- `why`: short reason for the score
- `evidence`: file, command, or graph node used
- `gate`: open / gated / escalated

## 4. Core Scans

- [ ] Developer review ledger: TODO, FIXME, HACK, BUG, XXX, hardcoded test values, synthetic fixtures treated as real data.
- [ ] Pattern scan: recurring logic duplicated across two or more files.
- [ ] Surface parity: manifest vs CLI handler parity, route vs frontend endpoint parity, dead exports.
- [ ] Architecture hygiene: feature placement matches `docs/engineering/codebase_org.md`, imports follow the active dependency direction, and no deprecated path alias is being treated as canonical.
- [ ] Path hygiene: stale folder names, duplicate roots, legacy compatibility shims, generated outputs, and mislocated feature files are identified and graded explicitly.
- [ ] Security scan: secrets, dynamic require, unvalidated path reads, auth bypass, sensitive logging.
- [ ] Completeness scan: stubs, TODO wire-ups, mock handlers, unreachable menu items, not-implemented paths.
- [ ] Grade trend scan: flag repeated D/F grades as stale debt.

### System Design Review Gate

- [ ] Identify stakeholders, concerns, viewpoints, views, model kinds, and architecture rationale using the
  ISO/IEC/IEEE 42010 vocabulary before calling the system complete.
- [ ] Score the six Well-Architected quality lenses: operational excellence, security, reliability, performance
  efficiency, cost optimization, and sustainability.
- [ ] Trace the mandatory path: provider -> validated data -> canonical identity -> point-in-time analysis ->
  decision state -> paper/live policy -> risk gate -> ledger -> monitoring -> backup/restart/rollback.
- [ ] For every boundary, record the canonical owner, contract/schema, failure behavior, and evidence status:
  proven, partial, unproven, or failed.
- [ ] Treat duplicated state, fixture-only composition, unproven host/runtime behavior, and stale architecture
  docs as system-design findings even when component tests pass.
- [ ] Report a separate end-to-end system grade; never average component grades into it.
- [ ] Source references: <https://www.iso.org/standard/74393.html> and
  <https://docs.aws.amazon.com/wellarchitected/latest/userguide/waf.html>.

## 5. Evidence Rules

- [ ] Prefer real artifacts or live snapshots over synthetic examples.
- [ ] When tests are touched, report input source, transform steps, record counts, output artifact, and the invariant that explains the pass.
- [ ] If data is degraded, stop at the seam and mark it degraded instead of promoting it downstream.
- [ ] Do not claim a path is healthy without at least one visible probe or contract test.

## 6. Gate Rules

- [ ] Include a Gate Table in the final report.
- [ ] Treat any section graded `C` or below as gated for new feature work.
- [ ] Block new work in a section that has held `D` or `F` for two consecutive audits.
- [ ] Separate debt-clearing work from new-feature work in the report.

## 7. Handoff Rules

- [ ] Update `workspace/PROMPT_LOG.md`.
- [ ] Update `workspace/HANDOFF.md`.
- [ ] Update `workspace/SESSION_MEMORY.md`.
- [ ] Update `workspace/STATE.md` only if project direction changed.
- [ ] Add the next debt-clearing move, not a new feature request.

## 8. Model-Agnostic Notes

- [ ] Codex is strongest when it keeps the repo truth, graph, and handoff state tight.
- [ ] Claude is strongest when it synthesizes the broad review into a clean narrative.
- [ ] The checklist should force both agents into the same observable process: load truth, narrow scope, scan, evidence, gate, handoff.
- [ ] If a future session feels vague, start by filling this checklist rather than improvising the audit order.

## Historical Snapshot

This checklist tracks the current state of the active repo surface, not the earlier setup-era snapshot.

## 1. Active Zones

- [x] `backend/cli/` is functioning as the primary local CLI and orchestration surface.
- [x] `backend/core/src/` now contains real implementations for the major feature, portfolio, execution, research, and data seams.
- [x] `backend/api/` and `Frontend/dashboard/` now read as an active local dashboard/API bridge.
- [x] `docs/` describe the current prototype instead of a pure setup shell.
- [x] `config/` labels the app as an active prototype.
- [x] Strategy-plan fixtures and CLI help no longer advertise a setup-only strategy file.
- [x] Quote-feed imports now report usable row counts and partial rejection reasons.
- [x] TUI manifest routing is directly covered through `findCommandSpec()`.
- [x] Signal/backtest dashboard hydration is backed by current `/api/signal` and `/api/backtest` surfaces.
- [x] Served dashboard HTML is route-contract tested against current local API endpoints and retired signal route drift.
- [x] GitHub Actions now installs locked Node dependencies, checks active JS entrypoints, type-checks the execution gateway, and runs the full Node suite.
- [x] ONNX/Kronos default builds now use an explicit deterministic baseline while external ONNX Runtime linkage is opt-in.
- [x] Local native readiness is visible through `npm run native:doctor` and covered by the Node suite.
- [x] `scripts/tests/` contains only test files; developer probes/utilities live under `scripts/dev` and are covered by focused utility tests.
- [x] JavaScript and C++ model registries are parity-checked by `npm run models:parity` and direct native `model_registry_test` compile/run evidence.
- [x] `workspace/STATE.md` remains the durable audit anchor.

## 2. Current Grade Snapshot

- `repo-root`: B
- `backend/cli/`: B+
- `backend/core/src/`: B+
- `backend/api/ + Frontend/dashboard/`: B+
- `docs/`: B+
- `workspace/`: B
- `config/`: B+
- `.github/`: B
- `test/`: B+

## 3. Remaining Cleanup

- [ ] Promoted ONNX/Kronos runtime inference still needs real ONNX Runtime calls behind the opt-in linkage flag.
- [ ] Local CMake configure/build/CTest verification is still unavailable until CMake and CTest are installed on PATH.
- [ ] The append-only workspace history still contains historical setup-era wording.
- [ ] Some workflow and source-tree polish remains, but the repo is now past the largest empty-shell debt.

## 4. Verification Notes

- Active source scans now come back clean for the major legacy markers in the live areas.
- Recent graph refreshes continue to show the code graph growing as the active modules are filled in.
- Latest verified graph refresh after quote-import telemetry: `2369` nodes, `3412` edges, `318` communities.
- Latest verified graph refresh after CI workflow alignment: `2370` nodes, `3413` edges, `320` communities.
- Latest verified graph refresh after ONNX/Kronos dependency gating: `2374` nodes, `3417` edges, `321` communities.
- Latest verified graph refresh after native toolchain preflight: `2388` nodes, `3433` edges, `327` communities.
- Latest verified graph refresh after test/dev utility hygiene: `2414` nodes, `3464` edges, `320` communities.
- Latest verified graph refresh after model registry parity guard: `2427` nodes, `3480` edges, `325` communities.
- Latest verified graph refresh after served dashboard contract guard: `2435` nodes, `3489` edges, `320` communities.
