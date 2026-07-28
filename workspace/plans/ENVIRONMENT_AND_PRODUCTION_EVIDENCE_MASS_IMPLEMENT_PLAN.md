# Environment And Production-Evidence Mass-Implementation Plan

Status: approved source batches closed; TEST-1, ENV-1B2-A, and ENV-1B3-A working-tree source implementation
closed; exact-commit/CI evidence and ENV-1B3-B approval open

Date: 2026-07-28

Lifecycle: `proposed -> preflight -> GO WITH FIXES -> implemented -> verified -> reviewed -> closed | deferred`

## Objective

Close the two connected P1 truth boundaries without broadening authority: ensure selected child processes
receive only their manifest-allowed environment, and ensure a green test result identifies exactly what source,
dependency graph, and operational claim it proves. Allowed read-only and authorized execution behavior must stay
compatible; disallowed or ambiguous child launches intentionally become named fail-closed results.

This combines the deferred environment-enforcement inventory with the production-testing truth audit. It does not
authorize deployment, service startup, provider polling, data writes, trading, public exposure, migration,
dependency upgrades, remote sync, backup/restore, or live enablement.

## Evidence And Ranking

| ID | Finding and objective | Evidence | Owner | Decision |
|---|---|---|---|---|
| TEST-1 | Distinguish worktree snapshot proof from exact-commit fresh-clone proof and preserve test evidence. | `verify_fresh_install.sh` copies tracked and untracked source; CI only tests root Node dependencies. | `scripts/dev/`, `.github/workflows/`, test contracts | **GO WITH FIXES** |
| ENV-1B2-A | Project environment for gateway child launches and the MCP CLI bridge. | Existing manifest projection is tested but unused; gateway and child bridges clone/inherit `process.env`; gateway imports `dotenv/config`. | `shared/lib/runtime/`, CLI trade callers, MCP bridge, gateway boot | **CLOSED in working-tree source** |
| ENV-1B3-A | Create the name-only service-to-key contract required for Compose isolation. | All seven Compose services share `x-central-env-files`; no required/forbidden service fixtures exist. | Compose contract owner and tests | **CLOSED in working-tree source, contract only** |
| ENV-1B3-B | Replace shared Compose injection with per-service restricted projections. | ENV-1B3-A now supplies the explicit service requirements and fixtures. | `infra/docker/`, central preparation | **NO-GO pending separate approval** |

Excluded from this plan: dependency-advisory remediation, macro `available_at` schema work, SYNC-1 in the external
workstation toolkit, real Supabase/RLS, host/MCP exercise, backup/restore, restart/rollback, one-writer, and soak.

## Refined Prompt Contract

- **Objective:** close TEST-1, ENV-1B2-A, and ENV-1B3-A in order with reproducible source evidence and no real
  environment-value access.
- **In scope:** source-evidence orchestration and CI wiring; gateway/MCP child environment projection; the
  seven-service Compose environment contract.
- **Out of scope:** actual Compose projection, dependency upgrades, macro/schema/provider work, remote sync,
  runtime qualification, and every live/public boundary.
- **Evidence:** current fresh verifier includes untracked files; CI omits four nested package roots; gateway and
  MCP children inherit `process.env`; all seven Compose services share one `env_file`.
- **Requirements:** immutable source identity, atomic pass/fail evidence, explicit command-to-surface ownership,
  name-only errors, parent-process immutability, and no implied operational qualification.
- **Handoff:** after approval, preflight and implement TEST-1 only. Do not start ENV-1B2-A until TEST-1 reaches a
  reviewed source-closure state.

## Batch 0 — Shared Preflight (`required before each batch`)

- Recheck dirty-worktree ownership. Preserve the current ENV-1A/ENV-1B1/PM-1 files and workspace records.
- Capture the pre-batch `git status --short`, `HEAD`, relevant file hashes, and focused baseline. Do not stage,
  commit, or normalize unrelated changes.
- Use name-only sentinel values in fixtures; never load or print a real environment file.
- Record source identity as either `worktree_snapshot` or `committed_archive`; never use `fresh clone` for the
  former.
- Require `git diff --check`, focused contracts, secret scan, and one broad gate appropriate to the batch.
- Stop if an unknown child command, ambiguous surface, execution credential, or required service key cannot be
  classified without weakening current live/PIN/risk gates.
- Classify every failed check as regression, pre-existing defect, environment limitation, or stale expectation.
  A failed prerequisite leaves the batch `deferred` or `NO-GO`; later batches cannot compensate for it.

## Batch TEST-1 — Evidence Protocol And Committed-Archive Verifier

### Objective

Turn the existing fresh-install script into two explicit verification modes and emit an atomic machine-readable
manifest for both success and failure. The human PASS line may appear only after the successful manifest has
been written and schema-validated.

### Intended surfaces

- `scripts/dev/verify_fresh_install.sh` as a compatibility wrapper
- new `scripts/dev/verify_source_evidence.js` as the canonical coordinator
- `tests/scripts/architecture/cli/core/fresh_install_contract.test.js`
- a new focused evidence-manifest contract
- `.github/workflows/test.yml`
- `tests/scripts/architecture/cli/core/github_workflow_contract.test.js`
- `docs/operational/guides/testing_surface.md` or the nearest verification guide

### Design

1. Add package scripts with fixed semantics:
   - `verify:source-snapshot` -> `node scripts/dev/verify_source_evidence.js --mode worktree_snapshot`;
   - `verify:committed-archive` -> the same coordinator with `--mode committed_archive`;
   - `verify:fresh-install` -> compatibility alias for `verify:committed-archive`, never worktree mode.
2. `worktree_snapshot` copies tracked plus non-ignored current files, records `dirty:true|false` and a patch/tree
   fingerprint, and cannot claim exact-commit, CI, or fresh-clone proof.
3. `committed_archive` derives files solely from `git archive HEAD`, records the originating commit/tree, then
   initializes disposable Git metadata only for tests that require Git. Untracked or unstaged source cannot enter.
4. `--evidence-out <absolute-path>` controls output. Local default is a file under the verifier's validated
   temporary root; CI supplies `$RUNNER_TEMP/sovereign-source-evidence.json`. No tracked report is generated.
5. Evidence schema v1 is fixed:
   - `schema_version`, `evidence_id`, `status` (`pass|fail|inconclusive`), `mode`, start/end timestamps;
   - `source` with commit, tree, dirty state, file count, and source-list SHA-256;
   - five package-lock paths and SHA-256 digests;
   - runtime metadata limited to Node/npm version, OS, architecture, and declared environment class;
   - ordered fixed-label steps with exit code, duration, and pass/fail/skip counts when the tool exposes them;
   - `proven_claims` and `excluded_claims` arrays from a fixed allowlist.
6. Capture command output for diagnosis but persist no raw stdout/stderr in evidence. Commands are fixed by code;
   caller-supplied shell fragments are forbidden. Parse TAP/CTest summaries per step and leave counts `null` for
   install/build steps rather than inventing totals.
7. Write pass/fail/inconclusive evidence atomically using a sibling temporary file plus rename. Any uncaught
   error, signal, install failure, missing lockfile, or parser failure must attempt a non-pass manifest and exit
   nonzero. Only a validated `status:"pass"` permits `[source-evidence] PASS`.
8. CI replaces the root-only Node job with committed-archive verification, while retaining the independent C++
   sanitizer job. It uploads evidence with `actions/upload-artifact@v4` under `if: always()` and
   `if-no-files-found: error`. It may not call this host qualification.

### Edge cases and acceptance

- Untracked sentinel appears only in `worktree_snapshot`, never `committed_archive`.
- A failed install, missing lockfile, failed command, absent manifest, or malformed manifest is nonzero and cannot
  print PASS.
- Simulated termination or forced child failure yields `fail` or `inconclusive`; it never retains a stale pass
  artifact at the requested output path.
- A dirty tree can be verified as a snapshot but cannot be labelled a clean clone.
- Lockfile changes alter the recorded digest; output has no credential value.
- A CI contract proves the committed-archive command and artifact upload are present.
- The five-root step order is lockfile install/list -> MCP/dashboard builds -> native build/CTest -> environment,
  secrets, API, contracts, structure, and aggregate Node gates. Duplicate tests remain separate step evidence;
  their counts are not added into a misleading unique-test total.

### Verification and rollback

- Unit: fresh-install/evidence contracts, including untracked-sentinel and failed-command fixtures.
- CLI: disposable worktree and committed-archive fixture runs with reported identity and counts.
- Stress: intentionally broken nested package lockfile/command yields a failed manifest and retained diagnostic
  metadata without a false PASS.
- Broad: host-capable `npm run verify:strict`; real `verify:fresh-install` only after the script itself passes
  fixture proof.
- Closure: before commit, close only `TEST-1 source implementation` using worktree-snapshot plus committed-archive
  fixtures. Exact-commit/CI evidence remains open until the implementation is committed and an authenticated CI
  run uploads a passing manifest tied to that commit.
- Rollback: restore the prior verifier and CI step in one commit; no source, lockfile, environment, or runtime
  state is altered by the verifier.

Estimate: 180–300 LOC. Expected movement: tests B+ -> A- for source-evidence truth; CI B -> A- pending an
authenticated Actions run. Production readiness remains blocked.

## TEST-1 implementation record — 2026-07-28

Lifecycle: `proposed -> preflight -> GO WITH FIXES -> implemented -> verified -> reviewed -> closed (source
implementation)`. Exact-commit and authenticated-CI evidence remain open by design.

- Added the canonical source-evidence coordinator and separate schema validator. Worktree and committed-archive
  acquisition are fixture-proven; `verify:fresh-install` now aliases committed-archive mode.
- Evidence is atomically replaced with `inconclusive / verification_in_progress` before any work, then finalized
  pass/fail/inconclusive. A killed rerun cannot leave a stale PASS artifact.
- Fixed schema validation rejects missing locks/steps, unknown claims, raw-output fields, malformed job limits,
  and fabricated pass results. CI runs the five-root archive gate and retains the manifest.
- Default concurrency is two jobs across CMake/Make/Go/libuv/Node tests and npm sockets; `--jobs 1..8` is explicit
  and recorded. An interrupted 1.3 GB disposable tree was removed.
- Focused contracts: 15/15, including the canonical runner default. Final bounded worktree snapshot: 26/26 steps, native 30/30, API 25/25, contracts
  118/118, structure 15/15, aggregate 987 total / 977 pass / 0 fail / 10 intentional skips, snapshot secrets
  903/0. Independent host strict before the resource refinement passed API 25/25, contracts 118/118, and
  aggregate 986 total / 982 pass / 0 fail / 4 intentional skips.
- Evidence identity: `worktree_snapshot`, `dirty:true`, `HEAD=e78e1788`, five lockfiles, `job_limit:2`. The final
  manifest predates only append-only workspace closeout notes. It does not prove the implementation is committed,
  an authenticated CI run, host health, provider connectivity, recovery, soak, or live execution.

## Batch ENV-1B2-A — Projected Gateway And MCP Children

### Objective

Use the existing manifest projection at the highest-risk child boundaries without reclassifying every direct
entrypoint in one change.

### Intended surfaces

- `shared/lib/runtime/environment_manifest.js`
- `shared/lib/runtime/backend_bridge.js`
- `backend/mcp_server/lib/bridge.ts`
- `backend/gateway/src/index.ts`
- direct CLI gateway callers only where they bypass `runGatewayCommand`
- focused bridge/environment/gateway/MCP contracts

### Design

1. Add one pure `buildChildEnvironment(environment, surface, options)` owner beside the manifest loader. It
   projects classified names for the explicit profile/surface, accepts only allowlisted overrides, and freezes
   the result. Unknown names and forbidden overrides are dropped or rejected by name; values are never reported.
2. Preserve an explicit cross-platform process allowlist needed to spawn Node: `PATH`, `PATHEXT`, `SystemRoot`,
   `SYSTEMROOT`, `ComSpec`, `COMSPEC`, `WINDIR`, `TEMP`, `TMP`, `TMPDIR`, `APPDATA`, `LOCALAPPDATA`, `USERPROFILE`,
   `LANG`, `LC_ALL`, `LC_CTYPE`, `TERM`, `COLORTERM`, `NO_COLOR`, `FORCE_COLOR`, `CI`, and `NODE_OPTIONS`.
   No arbitrary unknown environment name is preserved.
3. Add an exhaustive gateway-command classifier covering every active `index.ts` top-level and Polymarket/bot
   subcommand branch. Classification is argument-sensitive: public/history/dry-run -> `gateway_public`;
   credentialed portfolio/diagnostic reads -> `gateway_account`; any live order, credential derivation, or
   order-capable bot/process path -> `execution`. Unknown branches fail before spawn.
4. `buildTradeGatewayLaunch` returns `{command,args,shell,env,surface}` and never mutates parent `process.env`.
   All direct `spawnSync` callers must use `env: launch.env`; a static contract inventories every caller.
   `options.env` can add only names permitted for the classified surface. `SOVEREIGN_EXECUTION_AUTHORIZED` is
   accepted only on an `execution` launch.
5. Remove gateway `dotenv/config`. Require a classified surface at gateway main entry and scrub the current child
   process before adapters/clients are constructed. Direct standalone invocation without a valid surface exits
   with `environment_surface_required`; the canonical launcher supplies it.
6. Route MCP CLI children through the `mcp` projection. The MCP process never receives provider, account, PIN, or
   execution secrets through this batch. Cached/read-only tools remain functional. Capability-authorized backfill
   may still use credential-free providers but receives no keyed-provider secret; live/account tools return a
   stable `environment_surface_denied` response before spawn when their required secret surface exceeds `mcp`.
   A future dedicated worker/execution principal is outside scope.

### Edge cases and acceptance

- Sentinel Polymarket private/L2 credentials, trade PIN, and execution authorization are absent from public,
  MCP, and default read-only child launches.
- Account-only commands receive no submission authorization; execution commands require the already-existing
  caller authorization and still cannot run on forbidden profiles.
- Required Node runtime values (`PATH`, compatible `NODE_OPTIONS`) survive without mutating the parent process.
- Invalid surface/profile/catalog command reports names only; no secret values are echoed.
- Existing public browser, account portfolio, dry-run, explicit live denial, and PIN stripping contracts retain
  their current behavior.
- Every active gateway parser branch has exactly one expected classification; additions to the parser without a
  catalog entry fail the structure contract.
- MCP denial is a structured security outcome, not a generic missing-credential/provider error, and includes no
  environment value.

### Verification and rollback

- Unit: catalog classification, unknown-command denial, projection purity, parent-env immutability, required
  runtime preservation, and forbidden-key sentinels.
- CLI/integration: mocked gateway and MCP child launch capture their received environment names only; verify
  public/account/execution selection and denied unknown paths.
- Stress: repeated concurrent child launches do not cross-contaminate environment or parent authorization.
- Negative integration: poison the parent with every execution-class sentinel; public/dry-run/MCP child capture
  contains none. Explicit authorized execution capture contains only execution-surface names and keeps all
  existing order gates active.
- Broad: gateway TypeScript no-emit, MCP build, targeted Polymarket/auth tests, `npm run test:contracts`, and
  host-capable strict suite.
- Rollback: revert the shared launch helper and bridge wiring together; no environment file is modified.

Estimate: 260–420 LOC. Expected movement: ENV entrypoint boundary B1 primitive -> A- for the gateway/MCP child
subset. Direct API/CLI/dashboard/standalone entrypoints remain unqualified.

## ENV-1B2-A implementation record — 2026-07-28

Lifecycle: `proposed -> preflight -> GO WITH FIXES -> implemented -> verified -> reviewed -> closed` for
working-tree source.

- Added frozen, allowlisted child projections and exhaustive argument-sensitive gateway/MCP classification.
  Gateway public, account-read, and execution children now receive distinct environments; the trade PIN is
  always removed and execution authorization can be injected only for an execution-class launch.
- Every direct gateway `spawnSync` caller consumes `launch.env`. Gateway-local dotenv loading is disabled even
  through imported modules, and direct unclassified gateway invocation fails with
  `environment_surface_required`.
- MCP CLI children receive only the `mcp` surface plus forced local-env skip flags. Account reads, live
  execution, auto-trade, and credential derivation return structured `environment_surface_denied` before
  spawn. Local cached/help execution remains available.
- Review corrected indirect shared-env reloading, added the already-called but missing `positions` gateway
  branch, preserved paper-mode simulation-adapter behavior, and promoted `polymarket derive-creds` from account
  read to execution.
- Focused and broad sequential verification passed, including 250 repeated poisoned-parent projections.
  MCP TypeScript build, manifest discovery (120 entries / 140 names and aliases / 0 unclassified),
  `git diff --check`, and the host-capable two-worker `npm run verify:strict` all pass.

This does not qualify direct API/CLI/dashboard/script boots, Compose services, a deployed host, fresh install,
recovery, one-writer behavior, soak, public exposure, or live execution. ENV-1B3-A is the next bounded batch;
ENV-1B3-B remains NO-GO.

## Batch ENV-1B3-A — Compose Service-Key Contract Only

### Objective

Create an explicit required/optional/forbidden key matrix for the seven Compose services before changing their
runtime environment injection.

### Intended surfaces

- `config/system/environment_manifest.json` as the only environment/service policy owner; bump schema 2 -> 3
- `infra/docker/docker-compose.yml` read-only contract parsing
- `backend/scripts/ops/prepare_central_env.js`
- deployment/central-host contract tests and a new service-projection fixture

### Required matrix rows

Add schema-v3 service surfaces `compose_web`, `compose_paper_bot`, `compose_backfill`,
`compose_portfolio_monitor`, `compose_host_health`, `compose_host_backup`, and `compose_polymarket_research`.
The manifest's existing entries declare service eligibility; a top-level `compose_services` map points each
Compose service to exactly one surface and states profile, command identity, required keys, optional/defaulted
keys, mounts, and forbidden environment classes. Do not create a second JSON/YAML policy file.

All seven central services forbid the `execution` class. `web`, host health, and host backup receive no provider
or account credentials. Backfill receives provider-read credentials required by configured lanes. Paper bot and
Polymarket research receive public/research inputs only. Portfolio monitor receives no live-account credential in
this contract and must degrade explicitly to cached/local evidence; dual-use Alpaca or wallet credentials remain
an unresolved authority risk and are not silently treated as read-only.

### Edge cases and acceptance

- A declared required key missing from a service fixture is a named fail-closed result.
- A forbidden key present in any service fixture fails; errors report names only.
- Profile-disabled services are not accidentally rendered as default services.
- Shell interpolation defaults are represented explicitly and do not create hidden required keys.
- The matrix exposes whether `web` actually needs provider keys; no inferred permission is accepted.
- Manifest schema 2 is rejected after migration; schema 3 validation requires all seven services exactly once,
  forbids unknown Compose services, and proves every referenced key belongs to the declared service surface.
- Existing central fixed overrides (`LIVE_TRADING=false`, `SOVEREIGN_EXECUTION_AUTHORIZED=false`, runtime/profile,
  host/port and bounded intervals) are recorded separately from env-file-projected names.

### Verification and rollback

- Unit: parse/validate all seven rows and reject unknown service/key/surface/profile names.
- CLI: fixture Compose rendering or equivalent name-only projection report validates every row.
- Stress: forbidden execution sentinels and missing required-key permutations across all services.
- Broad: deployment manifest, central preparation/preflight, and environment contract suites.
- Rollback: remove the contract-only files/tests; Compose remains byte-for-byte unchanged in this batch.
- Closure: the batch closes contract clarity only. Since Compose still shares one `env_file`, runtime isolation
  remains explicitly unimplemented and ENV-1B3-B stays NO-GO.

Estimate: 180–260 LOC. Expected movement: Compose ownership B+ -> A- contract clarity. Actual isolation is still
unimplemented.

## ENV-1B3-A implementation record — 2026-07-28

Lifecycle: `proposed -> preflight -> GO WITH FIXES -> implemented -> verified -> reviewed -> closed` for
working-tree contract source.

- Environment-manifest schema 3 is the sole owner of exact contracts for all seven Compose services, including
  surfaces, profiles, command identities, required/optional/defaulted keys, fixed safe overrides, mounts, and
  forbidden classes. Validation rejects missing, extra, duplicate, unknown, or unsafe declarations.
- Added pure name-only validation and projection helpers plus a central-environment preparation preview. The
  preview generates no service files and emits no values.
- Contract tests bind every manifest row to the current Compose service identity, profile, mount, and fixed
  override. Missing-required permutations and execution-poison tests cover all seven services.
- Focused ENV-1B3-A checks pass 13/13; adjacent central-host/deployment/runtime contracts pass; environment
  discovery passes with 120 entries, 140 names and aliases, and 0 unclassified. `git diff --check` passes.
- Final host-capable strict verification ran with a two-worker ceiling and passed 1,003 total / 999 pass /
  0 fail / 4 intentional skips.

`infra/docker/docker-compose.yml` is byte-for-byte unchanged by this batch and all services still consume the
shared central `env_file`. Therefore actual runtime isolation remains unimplemented. ENV-1B3-B remains NO-GO
until separately approved.

## Batch ENV-1B3-B — Compose Projection (`deferred / NO-GO`)

Begin only after ENV-1B3-A is verified, independently reviewed, and approved. Replace shared `env_file` injection
with per-service generated/restricted projections, preserve central mode-600 handling and private bind, prove
rendered service environments against all matrix rows, and rehearse failure/rollback on disposable inputs. No
container start is authorized by this batch. Estimate: 280–480 LOC.

Implementation shape is preselected for the later approval: `prepare_central_env.js` generates seven owner-only
service files under one validated host-local directory, Compose attaches exactly one generated file per service,
and the updater validates all projections before build/recreate. Generation is atomic and cleans only its own
validated temporary files. Existing `.env.central` remains the host-local source and is never mounted directly.

## Cross-Batch Security Review

- No process receives execution credentials merely because its parent has them.
- No test artifact or CI upload contains values, only names/digests/status.
- No command catalog weakens existing authentication, PIN, runtime mode, broker risk, or native pre-trade gates.
- No Compose projection copies `.env.execution`; central execution credentials remain forbidden.
- No source result is described as host, recovery, one-writer, or soak proof.
- Dual-use provider credentials are reported as such; naming them `provider` does not prove read-only authority.

## Batch Closeout Contract

For each batch, record lifecycle state, exact files, added/deleted LOC, focused and broad commands, counts,
security recheck, rollback result, grade movement, and remaining claims. No batch is `closed` from a test that did
not exercise its active production owner. Workspace continuity edits stay separate from application-source
commit selection. Net deletion above 100 lines requires user confirmation before execution.

## Closure Boundary

The approved TEST-1, ENV-1B2-A, and ENV-1B3-A source batches are closed in order. This closure does not authorize
ENV-1B3-B, broader direct-entrypoint projection, deployment, or any live/public action. ENV-1B3-B remains
separately approval-gated.
