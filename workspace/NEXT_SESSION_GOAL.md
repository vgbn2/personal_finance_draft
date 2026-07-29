# Next Session Goal

## Deferred roadmap — cross-market research readiness

Keep [RESEARCH_DATA_STRATEGY_BACKTEST_READINESS_PLAN.md](plans/RESEARCH_DATA_STRATEGY_BACKTEST_READINESS_PLAN.md)
in the queue after the current private host boundary: finalize OHLC and Polymarket data-readiness contracts,
versioned strategy configurations, comparable relative backtests, and fake-money paper gates. This does not authorize
provider polling, data mutation, paper cycles, orders, or live execution; begin with Batch 1 inventory/preflight only.
The same plan now includes Batch 8 monitoring: Bash may supervise process/heartbeat health, while Node remains the
authoritative owner of positions, portfolio, broker state, and P&L, projected through the existing authenticated
service-health/dashboard/CLI path.
Its decision-complete specification is `workspace/plans/BOT_MONITORING_MASS_IMPLEMENT_PLAN.md`: paper-only bounded
auto-restart is allowed, all operator surfaces are in scope, and the webhook destination/type are environment-owned.
Begin with MON-0 preflight only; no bot, container, provider, broker, or webhook action is implied.
The plan now includes mandatory process/concurrency, clock, cycle, state-integrity, host-pressure, webhook,
API/UI, and execution-boundary edge cases. Do not begin MON-1 until MON-0 freezes field ownership and state precedence.

## 2026-07-28 full-audit safety queue

Do not begin rsync, host qualification, dependency work, broad refactoring, or live-capable exercises before
reviewing the two new source-safety findings:

1. **FULL-1 first, bounded `codex` fix:** `SOVEREIGN_MOCK` must never reach an execution surface or bypass a
   real PIN. Add adversarial production-path tests across direct CLI, gateway child, dashboard, and MCP. The
   focused tests must be red against the current defect and green only when wrong-PIN execution is denied before
   spawn.
2. **FULL-2 separately:** corrupt Alpaca bot state and failed/ambiguous broker-position reads must preserve
   tracked positions, fail loudly, and block new entries. Only a successful explicitly empty broker response may
   reconcile holdings away.
3. Add mutation proof for both guards where practical: removing/inverting the denial or preservation branch
   must make the focused test runner fail.
4. Keep the suite green by correctly observing product failure; do not keep permanently failing tests, weaken
   assertions, skip hostile cases, or mock around the production path.

After FULL-1 and FULL-2 are independently reviewed and strict/native gates pass, rerank the remaining
FULL-3..FULL-11 backlog. The private third-host sequence remains approved in principle but should not deploy a
known PIN-bypass/state-loss source.

## 2026-07-28 next session - rsync and private third-host proof

Resume on `steamlinux`, where the source checkout currently lives. The first action is to verify that
`192.168.4.126` is actually `vgbn-servers`; the latest tool-version output came from `steamlinux`, so it is not
yet destination-host evidence.

Approved sequence:

1. From `steamlinux`, run a read-only SSH identity/tool probe against `vgbn1@192.168.4.126`.
2. Create `~/personal_finance_draft` on the destination with mode 700.
3. Rsync the current source and approved credentials over SSH without `--delete`; exclude `.git`,
   `node_modules`, dashboard/native build output, and `graphify-out`.
4. On `vgbn-servers`, set `.env` and `.env.central` to mode 600 and verify the copied source inventory.
5. Run Compose config and build only the `web` image. Stop and diagnose on any build error.
6. Start only `web`, retain the loopback bind, then prove `/health`, private login/RBAC/revocation, dashboard
   loading, container restart, and mounted-state persistence.
7. Keep writer, backfill, monitoring, research, paper, bot, order, public exposure, and live profiles stopped
   until the web-only host proof is reviewed.

The source machine tooling is confirmed: Node 24.18.0, npm 11.16.0, Docker/daemon 29.1.3, Compose 2.40.3,
Git 2.53.0, and CMake 4.2.3. These versions have not yet been confirmed on `vgbn-servers`.

Workflow note: `refactor-readability` is now available for later behavior-preserving cleanup, and
`blast-through maintainability` can rank verified hotspots first. Do not begin a broad readability rewrite
before the private third-host proof; use one cohesive, behavior-frozen slice at a time. Every skill now requires
bounded-context disclosure, evidence-class honesty, and no test manipulation merely to manufacture a pass.

## 2026-07-28 distribution qualification

Before sharing the project with third parties, separately approve a distribution-hardening batch:

1. Resolve the redistribution license and mark every non-publishable npm root `private`.
2. Commit and review the exact source; require matching committed-archive CI evidence.
3. Pin Node/npm, container base images, and CI actions; hash the ONNX runtime archive.
4. Generate an SBOM, scan source/dependencies/image/secrets, and retain structured results.
5. Build a minimal non-root, multi-stage OCI runtime image in CI, sign it with provenance, publish checksums,
   and document verification by immutable digest.
6. On a clean third amd64 Linux host, pull by digest and prove private web health, auth, persistence,
   restart, rollback, and uninstall without enabling live execution.

Do not distribute `node_modules`, `.env*`, credentials, runtime storage, or developer workspace state.

## 2026-07-28 after DEP-1 partial closure and SSH review

DEP-1A Socket.IO and DEP-1B viem are closed. DEP-1C Alpaca/Axios and DEP-1D Polymarket/Ethers ws are deferred
NO-GO; do not guess the Alpaca 4.0.1 API and do not accept the proposed Polymarket client downgrade.

Before calling the project usable on the SSH machine:

1. Rotate the exposed FRED credential and Polymarket private key.
2. Create an exact committed source state and transfer/fetch that exact commit to the SSH host.
3. On the SSH host, prove Node >=20, deterministic installs for all five package roots, builds, and
   `npm run verify:strict`.
4. Exercise real private web login/RBAC/revocation and MCP stdio with separate service principals.
5. Bind only to loopback and reach the service through SSH forwarding; start read-only/API/dashboard surfaces
   first, with no writer, bot, order, provider polling, or live profile.
6. Keep backup/restore, restart/rollback, one-writer, recovery, and soak as explicit operational gates.

Current working-tree source is usable for read-only/private research and paper-safe exercise. It is not
release-ready, public-ready, live-ready, or yet host-qualified. Current dependency evidence is 17 high,
11 moderate, 26 low, and 0 critical; strict verification is 1,003/999/0/4 and the clean worktree snapshot
gate is 1,003/993/0/10.

## 2026-07-28 after DEP-1B closure

DEP-1B viem remediation is closed with exact installed graph, targeted audit, gateway typecheck, and 51/51
focused Polymarket/MCP/paper-safety proof. Begin DEP-1C only after mapping every current Alpaca v3 production
call to the v4.0.1 API and confirming Node >=20 on CI and the intended SSH host.

Keep DEP-1D Polymarket/Ethers ws NO-GO, reject the client downgrade, and do not mix dashboard/MCP/toolchain
advisories into the Alpaca migration. Release/live and SSH operational qualification remain blocked.

## 2026-07-28 after DEP-1A closure

DEP-1A Socket.IO remediation is closed with patched locks, deterministic installs, API 25/25, and dashboard
type/build proof. Continue only with DEP-1B viem 2.55.10 and its gateway/Polymarket compatibility gates.

Do not mix DEP-1C Alpaca 4.0.1 source migration or DEP-1D Polymarket-owned ws resolution into DEP-1B. Two
unrelated dashboard highs remain. Release/live use and SSH operational qualification remain blocked.

## 2026-07-28 after DEP-1 preflight

DEP-1 network-boundary dependency remediation is NO-GO and deferred before any manifest or lockfile edit.
Explicitly authorize a restricted dependency worker to obtain current registry/advisory metadata as structured
JSON, including exact patched targets, `no_fix_available` cases, engine/peer/install-script changes, and residual
advisory IDs. Then rerun DEP-1 preflight before package resolution.

Do not trust `npm audit --offline` in this checkout: the advisory cache is absent and it reports a false zero.
Keep dependency release/live gates, macro PIT work, ENV-1B3-B, provider/runtime/data actions, and public exposure
blocked. The active specification is
`workspace/plans/DEPENDENCY_REMEDIATION_MASS_IMPLEMENT_PLAN.md`.

## 2026-07-28 after ENV-1B3-A closure

All approved source batches in
`workspace/plans/ENVIRONMENT_AND_PRODUCTION_EVIDENCE_MASS_IMPLEMENT_PLAN.md` are closed for the current dirty
working tree: TEST-1, ENV-1B2-A, and ENV-1B3-A. The schema-3 manifest now owns and fixture-tests all seven
Compose service contracts, but Compose itself is deliberately unchanged and still shares one central
`env_file`.

No further environment implementation is approved. ENV-1B3-B is the next possible batch only after separate
approval; it would generate restricted per-service files and rewire Compose without starting containers.
Direct API/CLI/dashboard/script boot projection is also still unimplemented and requires a separately scoped
inventory batch.

Before release use, rotate the FRED credential and Polymarket private key exposed to the session tool transcript.
Exact-commit/authenticated-CI evidence for TEST-1 and all deployed-host, recovery, one-writer, rollback, and soak
gates remain open. Keep live execution and public exposure blocked.

## 2026-07-28 after ENV-1B2-A closure (superseded)

ENV-1B2-A is closed for working-tree source. The next bounded implementation candidate is ENV-1B3-A only:
define and fixture-test the required/optional/forbidden key contract for all seven Compose services in the
canonical environment manifest. Do not change Compose injection in that batch. ENV-1B3-B remains separately
approval-gated and NO-GO until the service contract is verified and reviewed.

Before release use, rotate the FRED credential and Polymarket private key exposed to the session tool transcript.
Exact-commit/authenticated-CI evidence for TEST-1 and all deployed-host, recovery, one-writer, and soak gates
remain open. Keep live execution and public exposure blocked.

## 2026-07-28 environment and Polymarket boundary follow-up

ENV-1A, ENV-1B1, and PM-1 are implemented, verified, reviewed, and closed in the current working tree.

1. ENV-1B2-A gateway/MCP projected-child wiring is closed. Keep direct boot rewiring and standalone scripts
   deferred. Implement ENV-1B3-A contract fixtures only after its preflight; keep actual Compose projection
   NO-GO until every service has fixture-proven required and forbidden keys plus a rollback path.
2. Keep SYNC-1 deferred until the SSH alias, fixed remote root/sentinel, selected nested repositories, and
   external `/home/vgbn1/Documents/codeptit/bash` edit scope are explicit.
3. Continue the separate release queue with isolated dependency-high remediation and point-in-time macro
   metadata/schema work; do not mix either with environment/sync changes.
4. Do not treat manifest/projection source proof as Compose, host, fresh-install, remote, recovery, one-writer,
   or soak qualification. Keep live execution and public exposure blocked.

Current evidence: environment 118 entries / 138 names and aliases; browser allowlist 3/3; host contracts 118/118;
aggregate 979/975/0/4; Polymarket preflight/CLI 48/48; secrets 900/0; dashboard type/build and hygiene pass.

## 2026-07-28 production-evidence protocol follow-up

The combined implementation plan is
`workspace/plans/ENVIRONMENT_AND_PRODUCTION_EVIDENCE_MASS_IMPLEMENT_PLAN.md`. It sequences TEST-1 evidence
truth, ENV-1B2-A projected gateway/MCP children, and ENV-1B3-A service-key contract; actual Compose projection
remains separately NO-GO.

Before any release or production-grade testing claim, approve and implement a small evidence-protocol batch:

1. Split fresh verification into explicitly labelled worktree-snapshot and committed-archive/fresh-clone modes;
   the latter must exclude untracked files and bind output to `HEAD` plus lockfile digests.
2. Emit a machine-readable evidence manifest with commands, exit status, test/pass/fail/skip counts, environment
   class, source identity, and excluded claims; a missing final PASS manifest is a failed/inconclusive gate.
3. Make CI run the committed-archive five-root install/build/API/contracts/aggregate path and retain the manifest.
4. Keep deployed-host smoke, backup/restore, restart/rollback, one-writer, and soak as separate external levels;
   none can be inferred from source or CI green results.

Current session: host-capable `verify:strict` passed; restricted loopback API failures are sandbox-only. The
fresh-install attempt stopped during root `npm ci` before its PASS marker, so fresh-install proof is open.

The plan has been refined. If implementation is approved, start with TEST-1 only. Treat
`scripts/dev/verify_source_evidence.js` as the canonical coordinator, retain `verify_fresh_install.sh` only as a
compatibility wrapper, and do not claim exact-commit or CI closure from the dirty working tree. Stop for focused
review after TEST-1 before beginning ENV-1B2-A. ENV-1B3-B remains a separate approval even if ENV-1B3-A passes.

TEST-1 source implementation has now reached that review stop. Its bounded worktree evidence is green and
records two-job execution; exact-commit and authenticated-CI evidence remain open until commit/Actions. The next
implementation batch is ENV-1B2-A preflight only: revalidate every gateway branch and MCP capability before
wiring projected child environments. Do not mix ENV-1B3 Compose work into that batch.

## 2026-07-28 session 116 - remediate dependency highs and qualify combined evidence

The auth, exact-asset combined research, reviewed paper-intent, environment manifest, fresh-source verifier,
and current-cache recovery batches are implemented and verified in the working tree. Keep live and public
release blocked.

1. Upgrade dependency owners in isolated compatibility batches, starting with the network boundary
   (`ws`/Socket.IO, Axios, Alpaca, and viem), then MCP HTTP, ONNX/dashboard build, web3, and deprecated
   toolchain graphs. Regenerate each affected lockfile deterministically and rerun the clean-export verifier.
2. Preserve FRED release/realtime/vintage and ingestion metadata, migrate and verify `available_at` in the
   remote macro schema, and connect the combined service to one revision-aware cached macro reader. Reingest
   CPI/US02YIELD and prove as-of revision exclusion; do not weaken stale/future/synthetic or identity gates.
3. Calibrate the macro contribution with cost-aware out-of-sample evidence before changing
   `decision_ready:false`; promotion remains a human-reviewed, non-provider-submitting workflow.
4. On the intended private host, verify Supabase login/revocation/RLS, distinct service/MCP credentials,
   remote SSH/MCP, backup/restore, restart/rollback, single-writer behavior, and soak.
5. Do not enable live execution or public exposure until dependency remediation and every operational gate
   above is independently evidenced.

Current evidence: clean-export aggregate 972/962/0/10; native 30/30; API 25/25; environment 138/138; secrets
895/0; integrity 92/92, zero stale, DCS 1.0. Dependency gate: 24 high, 11 moderate, 26 low, 0 critical.

## Deferred workstation tooling - CodePTIT remote mirror

The planned defensive threat-model and remote-sync design is at
`workspace/plans/CODEPTIT_REMOTE_SYNC_AND_PRIVATE_DEFENSE_PLAN.md`. It is not part of the Sovereign release
queue. If approved separately, first implement only the manual, SSH-authenticated, dry-run-first local-to-remote
sync command under `/home/vgbn1/Documents/codeptit/bash` after confirming the host alias and sync exclusions.
Do not add a timer, reverse sync, automatic deletion, secret/runtime replication, or remote service startup.

The companion environment boundary plan is at
`workspace/plans/ENVIRONMENT_AND_REMOTE_MIRROR_BOUNDARY_PLAN.md`. Before implementing either plan, obtain a
user-approved, redacted name-only inventory and decide developer/central/execution ownership. Preserve current
ignored `.env*` and `storage/` contents; do not infer that a portfolio read means public credential exposure.

## 2026-07-28 session 115 - close reproducibility or qualify freshness

The Global Market Monitor feature exercise and full blast-through are complete. The next bounded move is one
of the following, with no implementation assumed:

1. Prove clean archive/fresh-install reproducibility, including the nested API Supabase dependency and a reviewed
   environment-variable inventory; or
2. On an explicitly qualified single-writer host, recover the 14 policy-stale required windows and rerun
   `backend integrity --json` until it is `ok:true` with zero policy-stale required windows.

Keep live execution, provider polling from this checkout, canonical-data mutation, public exposure, migration,
segment enablement, backup/restore, restart/rollback, one-writer, MCP, and soak claims gated by separate proof.

## 2026-07-27 session 114 - exercise current features through the refined loop

The deterministic skill workflow is implemented and verified in the working tree. Use
`feature-exerciser` for the next user-facing feature batch.

1. Inventory current CLI, API, dashboard, MCP, TUI, research, data-status, and paper-safe entrypoints from
   current code/manifests.
2. Select a bounded read-only/no-network batch and update `workspace/reports/FEATURE_TEST_MATRIX.md` with
   exact result, evidence class, and limitation.
3. Diagnose failures and ask before routing fixes to `codex` or `mass-implement`.
4. Keep fresh-install, stale-data recovery, host login/SSH/MCP, backup/restore, restart/rollback, one-writer,
   and soak gates explicit.
5. Do not poll providers, mutate canonical data, change runtimes, trade, expose publicly, migrate, or promote
   without separate authorization.

Current proof: host aggregate 960/956/0/4; mirror 9/9; secrets 870/0; structure, hygiene, focused exercises,
and diff checks pass. The workflow batch is uncommitted.

## 2026-07-27 session 110 - Batch 5 committed; qualification remains

Batch 5 sanitized service-heartbeat observability is committed as the session closeout, following the deep
blast-through audit and mass-implement plan in `workspace/plans/GLOBAL_MARKET_MONITOR_MASS_IMPLEMENT_PLAN.md`.

1. Run committed-archive/fresh-install proof for the heartbeat contract and API/UI path.
2. Keep host login, SSH/MCP, backup/restore, restart/rollback, one-writer, and soak qualification explicit.
3. Recover the 14 policy-stale required data windows only under explicit writer/provider authorization.
4. Keep provider polling changes, canonical-data writes, symbol-registry migration, public binding, segment
   enablement, and live execution outside this batch.

Current evidence: host contracts pass 116/116; aggregate passes 956 total / 952 pass / 0 fail / 4 intentional
skips; focused heartbeat/monitor tests pass 12/12; frontend production build, secret scan (867 files, 0
violations), hygiene, and diff checks pass. Fresh installation and operational
qualification remain open; the prior integrity probe remains `ok:false` with DCS 0.954348 and 14 policy-stale
required windows.

## 2026-07-27 session 108 - implement global market monitor Batch 4

Batch 3 CLI/API parity is committed at `8322adfd`, and focused committed-archive proof passes. The active plan remains
`workspace/plans/GLOBAL_MARKET_MONITOR_MASS_IMPLEMENT_PLAN.md`.

1. Run the mass-implement preflight against the current dashboard API/auth/layout code.
2. Implement only Batch 4 user-facing global display: authenticated API client, snapshot counters and age,
   sortable/filterable instrument rows, last-known/stale wording, provider health retained below instrument
   health, 10-second refresh paused while hidden, and manual retry.
3. Prove loading, empty, stale, malformed, unauthorized, API-error, counter-mismatch, and 360/768/1440 viewport
   behavior without page overflow.
4. Keep service heartbeats, provider polling, data writes, symbol-registry migration, public binding, segment
   enablement, live execution, and operational-qualification claims outside Batch 4.

Current evidence: Batch 3 contracts pass 108/108; final aggregate passes 948 total / 944 pass / 0 fail /
4 intentional skips; tracked secrets pass 863/0; hygiene, syntax, and diff checks pass. The real default
BTCUSDT data summary resolves 4,067,940 canonical 1m rows without mutation. Fresh installation remains open;
the archive proof reused the checkout's installed dependency tree for dependency-bound focused files.

## 2026-07-27 session 107 - implement global market monitor Batch 3

Batches 1-2 are implemented and committed through `a65f907a`. The active plan remains
`workspace/plans/GLOBAL_MARKET_MONITOR_MASS_IMPLEMENT_PLAN.md`.

1. Run the mass-implement pre-implementation brief against current Batch 3 CLI/API/auth/cache code paths.
2. Repair the default data-summary path to use canonical time-series data and add read-only `market monitor
   --json` plus protected `GET /api/market/monitor` over `buildMarketMonitorSnapshot()`.
3. Prove CLI/API payload parity, existing 401/403 behavior, bounded filters/pagination, global counters
   independent of page size, degraded reader failures, bounded five-second caching, and zero provider/write work.
4. Keep dashboard, service heartbeats, provider polling, data writes, symbol-registry database migration,
   public binding, and segment enablement outside Batch 3.
5. Preserve the loopback-private, read-only, non-live boundary and rerun focused API/contracts plus the aggregate.

Current evidence: the current registry resolves 89 supported price rows, 44 explicit unsupported price entries,
and 93 non-price coordinates. Read-only snapshot proof completed in 59 ms with exact reconciled counters.
Contracts pass 101/101; aggregate passes 941 total / 937 pass / 0 fail / 4 intentional skips; clean committed
archive focus passes 3/3; secrets 860/0; hygiene and diff checks pass.

## 2026-07-26 session 104 mass-implement correction - commit and qualify the repaired batch

The session-104 source P1s are repaired, committed, and host-capable contracts pass. The immediate gate is a
clean archive and fresh-clone proof; do not treat the repair as operational qualification.

1. Prove the committed archive and a fresh clone install/test path before any host claim.
2. Keep segment storage opt-in. Before enabling it, quantify repeated-overlap write amplification, add durable
   retry/queue state plus thermal/disk hysteresis and free-space compaction gates, then run interrupted-recovery
   and controlled load/SSD/soak probes on disposable storage.
3. Recover the 14 required stale equity windows through an explicitly approved writer/provider action and prove
   zero policy-stale windows; DCS alone is not enough while integrity remains false.
4. With separate approval, qualify real web login/RBAC, second-machine SSH/reconnect, session retention,
   one-writer locking, MCP, backup/restore, restart/rollback, and soak. Keep live execution and public exposure
   blocked.

Current source evidence: host `npm run test:contracts` 87/87 pass; host aggregate, hygiene, diff integrity,
and repaired docs links pass. No runtime action occurred during implementation.

## 2026-07-26 session 104 critical override - repair runner and keep segment mode disabled

The full hard-reading blast-through found no P0, but the current uncommitted feature batch is not
promotion-ready. System grade is C+ / integrity-and-qualification-gated. Keep
`SOVEREIGN_TS_STORAGE=segments` disabled and do not start or restart the paper runner from this source
until the P1 defects below are repaired and independently reviewed.

Execute next, in order:

1. Move the effective interval resolver into the paper-runner loop and add a non-`--once` regression test;
   the current loop references undefined `effectiveIntervalMin` and `intervalPolicy`.
2. Redesign segment reads as one validated canonical-plus-segment view. Reject missing, corrupt, or
   hash-mismatched active segments; preserve provider priority; make compaction lock the full
   read/replace sequence; and prove interrupted/concurrent compaction recovery on disposable storage.
3. Prevent token rotation from resetting reauthentication history. Key the registry to a stable principal
   or enforce a bounded principal-level policy, add a controlled recovery path, and ignore/protect the
   private runtime registry file.
4. Separate backfill cadence from the bot interval policy, and enforce deployment-profile writer
   capability at the backfill entrypoint instead of relying on descriptive Compose/profile intent.
5. Repair the 14 broken `docs/README.md` links and replace the stale README test-count claim with a
   reproducible verification command or current evidence.
6. Rerun focused tests, the host-capable aggregate, secrets, hygiene, diff integrity, disposable segment
   fault/race proofs, and an independent severity review. Only then review/commit the dirty source batch
   and prove a clean committed archive/fresh clone.

Current evidence: 921 total / 917 pass / 0 fail / 4 intentional skips; frontend lint/build, gateway
TypeScript, secret scans, hygiene, and diff checks pass. Read-only integrity is 92/92 cached with 14
policy-stale required windows and DCS 0.954348, so integrity remains false despite crossing 0.95.

Do not infer host, writer, MCP, recovery, backup/restore, rollback, or soak readiness from local tests.
No provider poll, runtime start/stop, bot cycle, order, public exposure, destructive migration, or
promotion was authorized by the audit.

## 2026-07-26 session 103 follow-up plan - smooth polling and preserve storage

The deferred design is recorded in `workspace/plans/LOAD_SMOOTHING_AND_APPEND_ONLY_STORAGE_PLAN.md`.
The current daemon has bounded per-lane concurrency but no gradual ramp, global poll-start budget, adaptive
thermal/CPU backoff, or jitter. Current overlapping writes are logically merge-protected but can rewrite a full
binary bin; higher-than-daily derived bins are clean-rebuilt. Treat the current load rehearsal as evidence only.

Implemented in the current working tree:

- Global poll-start pacing with warm-up, jitter, and load/RAM backoff in the backfill daemon.
- Opt-in immutable SOVT segments with atomic manifests, compatibility reads, cheap coverage, and retained-old
  generation compaction support.
- Focused verification: 16 backfill tests and 3 segment-storage tests pass.

Remaining implementation order:

1. Add durable queued/retry state and fuller write-amplification instrumentation.
2. Add temperature/disk hysteresis and a controlled compaction command with free-space gates.
3. Prove segment-mode read parity and interrupted-compaction recovery on disposable storage.
4. Run controlled laptop load tests and compare data parity, SSD writes, and recovery behavior. Never silently delete old
   data.

Paper-bot cadence is now separately implemented through `shared/lib/settings/interval_policy.js`: default 1 minute,
personal setting/request, then administrator minimum. Restart the existing paper-bot process before expecting the
new cadence to take effect.
5. Run controlled laptop load tests and compare data parity, SSD writes, and recovery behavior.

The word “instead” is treated as “write immutable segments/generations, then compact only after verification.”
If indefinite version retention is intended, choose the storage budget before implementation.

## 2026-07-26 session 103 critical override - exercise the all-in-one web-only rehearsal

The role-based portable-hosting source is implemented in the current working tree above committed
`HEAD c2e28993`; it is not yet committed. The laptop may now model every machine role through the
`all-in-one` deployment profile, but plain Compose startup is web-only and the central updater refuses this
rehearsal profile. `backfill` requires the explicit `writer` Compose profile.

Current source proof:

1. Host-capable Node aggregate: 910 total / 906 pass / 0 fail / 4 intentional skips.
2. API: 21/21; contracts: 57/57; independent-review focus: 24/24.
3. Frontend TypeScript and production build pass.
4. Plain Compose renders only `web`; the `writer` profile renders `web` plus `backfill`.
5. Secrets scan: 846 files / 0 violations; hygiene and diff checks pass.
6. No service, container, timer, provider poll, writer, bot, order, public exposure, migration, or promotion ran.

Execute next:

1. Review and commit this source batch separately from the pre-existing prompt-log continuity edit. Then prove
   clean committed archive/fresh-clone installation.
2. With explicit operator approval, generate/review an owner-only `.env.central` using
   `SOVEREIGN_DEPLOYMENT_PROFILE=all-in-one`, start only `web`, and test a real Supabase login plus viewer,
   operator, and owner `401`/`403`/success boundaries.
3. Verify a second-machine SSH tunnel and Socket.IO reconnect after token refresh. Treat loopback tunnel IPs as
   opaque; do not claim original client-IP identity through SSH.
4. Prove temporary backup/restore, restart, session-registry retention, and one-writer locking.
5. Only after separate provider/data-mutation approval, start `backfill` with `--profile writer`, recover
   freshness/DCS, and soak it. Do not use `update-central-host.sh` with `all-in-one`.
6. Migrate to the mini PC by changing the deployment profile to `central-host`, restoring private env/data
   separately, and rerunning the same login, SSH, backup, restart, one-writer, MCP, and soak gates.

Keep live execution, public exposure, execution secrets, destructive migration, and promotion blocked.

## 2026-07-24 session 101 critical override - seal remote client and qualify the real host

Repository implementation is committed at `e0de66de` after the earlier continuity commit `87d896de`.
Do not rebuild the scoped client API, remote CLI, startup connectors, unpriced-exit guard, or repeated-token
settlement identity.

Current source proof:

1. Host-capable Node aggregate: 894 total / 890 pass / 0 fail / 4 intentional skips.
2. API aggregate: 10/10; gateway TypeScript, shell syntax, PowerShell parser, hygiene, and diff checks pass.
3. Read-only integrity: 92/92 cached, 87 required-window stale, 9 cadence-plausible, 0 unexplained, 1 exception.
4. No service/task/tunnel was installed and no provider poll or canonical-data write ran on the Lenovo.

Execute next:

1. Review is complete, its six findings are closed, and the source is committed. Prove clean archive and
   fresh-clone gates from `e0de66de`.
2. On the separately approved central host only, regenerate or update `.env.central` with a distinct
   `SOVEREIGN_CLIENT_TOKEN`, keep the API loopback/private, and recover DCS to at least 0.95 with zero
   policy-stale required windows.
3. Validate the authenticated SSH tunnel and cached `/api/client/status` from one Linux and one Windows client.
   Install the per-user connector only on those clients; verify login, bounded reconnect, logs/status, and
   uninstall. Interactive CLI auto-open stays off unless explicitly opted in.
4. Prove central one-writer ownership, MCP stdio, backup/restore, restart/rollback, and soak before release claims.
5. Return to full bot-ledger projection convergence if G3/private-paper-v1 certification is still the target;
   the two reproduced lifecycle defects are fixed, but broad `bot_state.json` convergence remains a separate gate.

Keep the Lenovo testing-only. Client machines must never poll providers or write canonical market data. Do not
start a host, container, timer, bot cycle, live order, public bind, destructive migration, or promotion without
the relevant explicit operator gate.

## 2026-07-24 session 100 critical override - finish G3 bot-ledger convergence

Continue `workspace/plans/SESSION_100_DEEP_PRIVATE_PAPER_RECOVERY_PLAN.md` from the current working-tree source
batch after continuity commit `87d896de`.

Completed and verified:

1. The apparent aggregate isolation defect was sandbox `spawnSync EPERM`; host aggregate is green.
2. One fail-closed runtime policy now protects CLI/gateway and appears in CLI/API/MCP-backed status.
3. The canonical Polymarket simulator now has a replayable checksummed ledger, atomic projection, writer lock,
   idempotency, crash recovery, settlement, and strict legacy migration/archive.
4. Final host JUnit: 876 total / 872 pass / 0 fail / 4 intentional skips; focused policy 9/9 and ledger 12/12.

Execute next:

1. Adapt non-live `bot cycle`, bot status, and `bot_state.json` so paper positions/fills/closes are projections
   of `paper_ledger.js`; keep live audit state separate and fail closed on ambiguous migration.
2. Add bot restart, duplicate-cycle, close/P&L, projection parity, and no-credential/no-submit tests; rerun the
   canonical host suite and hygiene.
3. Review and commit the source batch separately from `87d896de`; prove committed archive/clean-source gates.
4. Then qualify the separate Ubuntu host, recover DCS to at least 0.95, and prove one writer, MCP stdio,
   backup/restore, restart/rollback, and soak.

Do not poll providers or mutate canonical data on the Lenovo test machine. Do not start a host, container, timer,
bot cycle, live order, public bind, destructive migration, or promotion without the plan's explicit gate.

## 2026-07-24 session 100 critical override - recover test trust, then Private Paper v1

The current execution plan is
`workspace/plans/SESSION_100_DEEP_PRIVATE_PAPER_RECOVERY_PLAN.md`. It supersedes the batch order in the
older Private Paper plan.

Execute in this order:

1. Seal the four continuity/audit files and establish a clean committed/archive boundary. Current `HEAD
   111b1f6f` is one commit ahead of `origin/main`; do not force-push or mix source changes into continuity.
2. Diagnose and fix the aggregate Node gate. Current evidence is 122/138 with 16 failures in both default and
   serial aggregate runs, while representative files pass in focused groups. Prove the root class before
   adding a shared isolation helper.
3. Require two consecutive default aggregate passes and one serial aggregate pass with no canonical
   settings/config/storage mutation.
4. Implement one effective runtime-policy contract and prove `private-paper` cannot execute even under poisoned
   live/auth/credential inputs.
5. Implement one replayable paper event ledger and route paper-run, non-live bot cycle, runner, portfolio,
   settlement, and restart recovery through it.
6. Correct architecture/operator docs, then qualify the separate host, recover DCS to at least 0.95, and prove
   host MCP/backup/restart/soak.
7. Only after those gates, implement the read-only exact-asset combined research service and certify release.

Keep the Lenovo testing-only. No provider polling, host mutation, container/timer, bot cycle, live order,
execution credential, public bind, destructive migration, or promotion is authorized by this plan.

## 2026-07-23 session 94 critical override - implement Private Paper v1

The refined implementation plan is saved at
`workspace/plans/PRIVATE_PAPER_V1_PRODUCTION_PLAN.md`. This session ended in planning only; no production
implementation was started.

Execute in order:

1. Batch 0: classify and seal the current dirty tree; do not reset or discard session-93 work. Require clean
   archive/fresh-clone proof before new feature edits.
2. Batch 1: unify runtime policy and make `private-paper` permanently non-live.
3. Batch 2: converge `polymarket paper-run` and non-live `bot cycle` into one canonical paper ledger.
4. Batch 3: qualify the spare Ubuntu host, inspect exact RAM compatibility before any purchase, deploy one
   writer, and recover data integrity to DCS >= 0.95 with zero policy-stale required windows.
5. Batch 4: implement the read-only combined engine and prove host-side MCP/API/UI parity.
6. Batch 5: run 72-hour infrastructure soak, seven-day paper soak, backup/restore, rollback, and release proof.

Keep the Lenovo test-only, the API private, live trading disabled, Supabase/public-user features disabled, and
real-capital/schema/model promotion blocked. The first next-session command is a read-only `git status` plus
dirty-tree classification; do not start a bot cycle.

## 2026-07-23 session 93 critical override - qualify the spare host and prove MCP on real stdio

The repository-side parts of the session-91 MCP plan are complete in the current working tree. Do not
rebuild the platform-aware setup generator, host-stdio self-test, SDK probe, hardware preflight, Supabase
package/env contracts, Rust status docs, or removed zero-caller stubs.

The immediate gate is the separate spare Ubuntu machine:

1. Collect `uname -m`, `free -h`, `df -h`, and
   `sudo dmidecode -t system -t baseboard -t memory`.
2. Do not buy or install "any RAM module." Match the machine's DIMM/SO-DIMM form factor, exact DDR
   generation, non-ECC/ECC and buffered/unbuffered support, slot capacity, and motherboard/CPU maximum.
   The full-universe gate is 8 GB installed total; 16 GB total is recommended for the 6 GB V8 backfill heap
   plus OS, Docker, API, and build headroom.
3. Select the machine only if it is x86_64/amd64, passes the memory gate, has at least 40 GB usable persistent
   disk (80 GB preferred), and can remain reliably powered and connected.
4. On that machine, build `backend/mcp_server`, run `npm run setup:mcp`, and require
   `node scripts/mcp_stdio_probe.js` to return `ok:true` before calling MCP operational.
5. Then follow Batches 1-3 of
   `workspace/plans/SESSION_92_ZERO_COST_HOST_AND_TRUST_RECOVERY_PLAN.md` and require DCS at least 0.95
   after catch-up and soak.

Current-source verification is green, including a clean temporary Git snapshot, but the implementation is
not committed. Review and commit the multi-session working tree before using clean committed `HEAD` as a
deployment claim. Keep the Lenovo test bench, live trading, public exposure, schema/model promotion, and
remote Supabase/RLS approval blocked.

## 2026-07-23 session 92 critical override - qualify spare host, then recover MCP

Current DCS is 0.716: 92/92 assets are cached, but 87 required windows are stale. The immediate external
evidence gate is read-only hardware qualification of the known spare Ubuntu machine using Batch 0 of
`workspace/plans/SESSION_92_ZERO_COST_HOST_AND_TRUST_RECOVERY_PLAN.md`. Do not enable this Lenovo test
bench as the host.

If the spare machine is amd64/x86_64 with at least 8 GB RAM, at least 40 GB usable persistent disk
(80 GB preferred), reliable power/network, and acceptable uptime, select it as the zero-provider-fee host
and continue the private single-writer deployment. If it fails those gates, do not start the full universe;
either write a measured reduced-profile proposal or evaluate the Oracle Arm fallback only after arm64 image
support is proven.

The previous MCP problem has its own plan:
`workspace/plans/SESSION_91_MCP_RUNTIME_RECOVERY_PLAN.md`. First correct the generated Linux backend path
and probe diagnostics, then require a real host-side read-only stdio handshake. The sandbox timeout is not
proof of server failure, and direct CLI success is not host MCP proof.

Keep live trading, public exposure, schema-v3/model promotion, remote Supabase/RLS approval, provider polling
on this laptop, and broad Rust/stub deletion blocked.

## 2026-07-22 session 90 critical override - current laptop is testing only

The operator rejected both paid hosting and using the current Lenovo laptop as the always-on host. Do not
install `sovereign-central-update.timer`, change this laptop's lid/sleep policy, grant its interactive user
Docker socket access, or start the continuous `backfill` service. No persistent central host is selected.

Local deployment-validation support is committed at `df3c5c57`: Compose v2 is installed, `.env.central` was
generated locally with mode 600 and no execution credentials, Compose config renders, focused deployment
contracts pass 4/4, secret scan is 828/0, hygiene passes, and full Node is 846/842/0fail/4skip. The clean-tree
preflight passes every gate except Docker-daemon access for the interactive user; that remaining failure is
intentional on this test bench. No systemd unit, power policy, container, or provider poll was started.

The next deployment action is blocked until the operator supplies a separate persistent zero-cost machine or
explicitly changes the hosting decision. Until then, keep the central-host architecture dormant and use this
laptop only for config/contracts/tests. Live trading, public exposure, schema-v3/model promotion, and remote
Supabase/RLS approval remain blocked.

## 2026-07-22 session 89 critical override

The repository-side GitHub/deployment repair is complete in `54f861eb`. Do not rebuild the readiness workflow, native
fixture migration, HTTPS dependency pin, or host-side systemd updater. The selected target is Vultr Singapore
`vc2-4c-8gb` at USD 40/month, with DigitalOcean Singapore 4 vCPU / 8 GB / 160 GB at USD 48/month as fallback.

The next step requires operator authority:

1. Approve a provider and monthly spend, verify the account can create the exact Singapore x86_64 shape, and
   provision Ubuntu 24.04. Do not select OCI Free Arm without a separate arm64 clean-build deployment proof.
2. Install Docker Engine/Compose v2, Git, `flock`, and `curl`; create a non-root deployment user with a
   read-only Git deploy key; clone `origin/main`; create owner-only `.env.central` without execution secrets.
3. Run the manual central updater once. Only after web health and the sole `backfill` writer are green, install
   `infra/systemd/install-central-updater.sh` and verify its journal plus timer.
4. Reach port 8787 only through SSH forwarding or an access-controlled private VPN. Let backfill catch up and
   record target-host integrity; current source-host data is 92/92 cached but 72 stale with DCS 0.765.
5. Obtain authenticated Actions evidence for the pushed Test, Build, and Central Host Readiness runs. Do not
   infer GitHub green status from local tests.

Live trading, public exposure, schema-v3/model promotion, and remote Supabase/RLS approval remain blocked.

## 2026-07-22 session 88 critical override

The repository implementation is committed at `59045be7`, and publication/closeout is complete through
pushed commit `309679ba`.
Do not rebuild the writer lock, central preflight/updater, or session-87 test repairs. The private central
host is code-ready but not runtime-proven because no target host was supplied and this workstation has no
usable Docker Compose plugin or daemon.

Complete the external host gate in this order:

1. On the selected private Docker host, clone or fast-forward `origin/main`, copy
   `.env.central.example` to `.env.central`, set mode 600, create a random API token, and provide only the
   required data-provider credentials. Do not include trade PINs or Polymarket private/L2 credentials.
2. Keep port 8787 on loopback or an access-controlled private VPN address. Run
   `SOVEREIGN_CENTRAL_ENV_FILE="$PWD/.env.central" infra/docker/update-central-host.sh` and require both
   the loopback `/health` check and a running `backfill` container.
3. Let the sole backfill writer catch up, then record `backend integrity --json`. The current workstation
   baseline is 92/92 cached, 72 required-window stale, 9 cadence-plausible notices, and 0 unexplained
   grain; do not claim runtime completion until the target host freshness gate is green.
4. Client machines should reach the API/dashboard through an SSH tunnel or private VPN and push reviewed
   code through Git. They must not mount or write the central `storage/data/ts` tree.

Agent-run external provider polling remains subject to the repository structured-air-gap rule. Live
trading, public exposure, schema-v3 promotion, and remote Supabase/RLS approval remain out of scope.

## 2026-07-22 session 87 critical override

The rigorous test-debugging batch is complete; do not rerun its repairs. The current working-tree baseline
is API 8/8, contracts 31/31, secrets 818 files / 0 violations, Node 826 total / 822 pass / 0 fail / 4
intentional skip, native CTest 30/30, dashboard 13/13, and responsive browser 6/6. Frontend
lint/typecheck/build, gateway TypeScript, MCP build, dependency roots, hygiene, and diff integrity pass.

Continue with one evidence gate, in order:

1. Decide how the existing multi-session dirty tree should be staged or committed. Preserve unrelated
   session-84 skill, workspace, and data-repair work; the session-87 changes are not isolated in a clean tree.
2. If test-runner ergonomics are the priority, fix only the low-severity argument-order seam in
   `tests/run_node_tests.js`: user `--test-name-pattern` or file selectors currently follow discovery
   globs and therefore do not reliably narrow the run. Until then, use direct `node --test` invocations
   for focused selection.
3. Keep live trading blocked until independent execution-path review and host live soak are complete. If
   that work is not authorized, the next feature gate remains Batch 1 of
   `workspace/plans/SCHEMA2_SCHEMA3_COMBINED_ENGINE_PLAN.md`: exact canonical identity and an always-
   `decision_ready:false` research envelope.

The clean-HEAD archive passed runner/entrypoint syntax smoke, but the complete 826-test proof belongs to
the repaired working tree. `graphify-out` remains unavailable. No real-capital or schema-v3 promotion is
approved by this testing batch.

## 2026-07-17 session 84 critical override

The session-83 data-repair gate is complete; do not rerun the `SOYB 5m` merge. Integrity is green at
92/92 cached, 0 required-window stale, 9 cadence-plausible grain suspects, and 0 unexplained. The repaired
bin has 6,052 rows and checksum `c73f8c5d3df8a111f2bcae6fedf30816fa9aad4e96cc01bbe6a55ed8679dbed9`.
The five-year research default is restored and contract-tested.

Continue with one evidence gate, in order:

1. Keep live trading blocked until an independent execution-path review and host live soak verify the
   restored Polymarket authorization and native-risk seams.
2. If live-soak work is not authorized, start Batch 1 only from
   `workspace/plans/SCHEMA2_SCHEMA3_COMBINED_ENGINE_PLAN.md`: exact canonical asset identity and a
   research-only `decision_ready:false` envelope. Do not tune weights or expose actionable labels.
3. Remote Supabase migration/RLS verification remains deployment work and must not be inferred from local
   migration contracts.

Current baseline: Node 823/819/0fail/4skip; integrity 92/92/0 stale/0 unexplained; hygiene and diff
integrity pass. Real-capital execution and schema-v3 promotion remain blocked.

## 2026-07-16 session 83 critical override

Merge recovery is complete through `cb1c349f`; do not rerun the session-82 repair batches. Start with one
of these evidence gates, in order:

1. Repair the blocking `SOYB 5m` grain only through an existing provider/backfill path. Record provider,
   row count, first/last timestamp, gap percentiles, and pre/post checksums; stop if history would shrink.
2. Keep live trading blocked until an independent execution-path review and host live-soak verify the
   restored Polymarket authorization and native-risk seams.
3. If no data repair or live-soak is authorized, start Batch 1 only from
   `workspace/plans/SCHEMA2_SCHEMA3_COMBINED_ENGINE_PLAN.md`: exact canonical asset identity and a
   research-only `decision_ready:false` envelope. Do not tune weights or expose actionable labels.

Current baseline: Node 821/817/0fail/4skip, API 7/7, contracts 31/31, native 29/29, secret scan 814/0,
and integrity 92/92 cached / 0 required-window stale / 1 unexplained blocking grain. `graphify` is absent.

## 2026-07-15 session 82 critical override

Detailed Planning Mode batches and verification gates are recorded in
`workspace/plans/SESSION_82_MERGE_RECOVERY_GRADE_PLAN.md`.

Before new evidence acquisition, analysis promotion work, TUI cleanup, or live trading, run one
reviewed merge-recovery batch from `workspace/DEV_REVIEW.md` session 82:

1. Restore Polymarket live authorization/PIN and broker-backed/native pre-trade risk gates from
   `49560981^1`, preserving legitimate later lifecycle work. Include env-driven bot execution:
   `LIVE_TRADING=true` must not let cycle/run/force-sell bypass CLI authorization or equivalent native
   pre-trade risk approval when `--live` is absent.
2. Reconcile the four conflict-marked canonical shared modules and track the intended root shims.
3. Restore the canonical Node test runner and make clean-`HEAD` archive/module validation a gate.
4. Recover missing session 73-81 workspace history without deleting the session-82 audit trail.
5. Only after 1-4 are green, resolve the nine grain suspects and API/TUI merge regressions.

Live execution is blocked until the P0 gateway repair passes independent review. The older research
evidence backlog below remains valid but is no longer first on the critical path.

Resume from `workspace/handoff/2026-07-13.md`, then reread `workspace/STATE.md` and the current
worktree diff before making any new edits.

The responsive dashboard and family-aware analysis Batches 1-2 are complete. Next, implement only Batch 3
from `workspace/plans/ASSET_ANALYSIS_IMPLEMENTATION_BATCHES.md`: adapt fresh schema-v2 technical rows into
validated v3 technical `FactorResult` values in shadow mode. Prove direction, source-time, validity, and
stale/incomplete rejection parity before touching macro, SEC fundamentals, or scoring weights.

After that batch is proven, resume the terminal TUI-only login/auth/bind and character-budgeted cleanup
backlog from `workspace/plans/FUTURE_API_AUTH_UI_DEDUP_REFINEMENT.md`. Keep API binding on loopback by
default until wider bind behavior and session-restoration behavior are both verified.

Keep API binding on loopback. Do not begin broad duplicate deletion or manifest consolidation until the
recorded consumer/parity gates in `workspace/DEV_REVIEW.md` are applied.
## 2026-07-13 session 80 restart gate

Capture one provenance-recorded SEC Company Facts artifact for a US common equity, then implement and
verify SEC point-in-time normalization plus the research-only equity 3m composer. Do not start the shadow
service, family expansion, TUI work, or schema-v2 retirement until this gate passes.

## 2026-07-13 session 81 correction - Batches 5-8 complete

Do not retire schema v2. The shadow readiness report rejects promotion: seven rows contain zero eligible,
four degraded, three excluded, and ten synthetic-parity evidence ids. Next evidence work is official
structured index breadth and BTC/ETH on-chain history, then point-in-time target returns, baseline/OOS
comparison, turnover/cost modeling, and calibration. Deletion requires explicit approval after those gates.

## 2026-07-28 full recovery next goal

Diagnose the final worktree-snapshot verifier at its root `npm ci` boundary while retaining structured stderr
and without weakening the gate. If it passes, preserve the evidence artifact. If it fails, classify package,
cache, resource, or environment cause explicitly.

After that, take one behavior-preserving ownership slice: either extract strategy registry/prop-firm
presentation from the 1,276-line `strategy.js`, or extract one coherent adapter family from the 1,235-line
`cli_executor.js`. Keep public payloads, authorization, fail-closed state, fallback provenance, and tests
unchanged.

Do not start dependency major upgrades, PIT migration/reingestion, Docker/Compose services, provider polling,
target-host deployment, paper bots, orders, public exposure, or live execution without their separate
evidence and authorization gates.

## 2026-07-29 authoritative pending-plan consolidation

`workspace/plans/CURRENT_PENDING_MASTER_PLAN.md` is the current plan index and execution order. It supersedes
older next-action ordering without deleting historical sections above.

Begin **M0 only**:

1. inventory all 83 worktree entries into coherent owners and commit groups;
2. map every load-bearing untracked edge;
3. preflight the durable source-evidence/RAG diagnostic repair;
4. issue GO/GO WITH FIXES/NO-GO before implementation or commit.

FULL-1/FULL-2 are closed in the worktree and must not be reimplemented, but exact `HEAD` remains unsafe. Do not
begin MON-0, private-host writes, dependency changes, provider/PIT work, refactoring, paper/runtime actions,
public exposure, or live execution until M0 is reviewed and closed or explicitly deferred.

## 2026-07-29 M0 source-repair completion override

M0 reached `GO WITH FIXES -> implemented -> verified -> reviewed`; final closure is deferred at the
commit/archive/CI boundary.

Do not redo the durable-evidence or RAG runner repair. Next:

1. review `workspace/plans/M0_WORKTREE_CHANGESET_INVENTORY.md`;
2. obtain explicit user authorization before staging or committing;
3. ensure the exact reviewed revision contains every load-bearing untracked owner and adversarial test;
4. run `verify:committed-archive` against that revision and retain the schema-v2 artifact;
5. obtain the matching authenticated CI artifact before calling M0 closed.

Until then, do not deploy `0383d47b` or begin M1-M8, host writes, provider/PIT work, paper/runtime actions,
public exposure, or live execution.

## 2026-07-29 exact-source gate passed

The atomic batch is committed at `8275a9acfc60dad36a15a24f5e8cde512307b6f8`, and its schema-v2
committed-archive evidence is PASS. Do not repeat the gitlink fingerprint repair or source-install gate.

Next:

1. identify the requested deployment target and approved profile;
2. push the final reviewed revision only if remote publication is authorized;
3. require matching authenticated CI before release/deployment claims;
4. run only the target-specific private-host qualification sequence.

No generic Compose start, public bind, provider polling, writer, bot, paper cycle, order, or live action is
authorized by the word "deploy" without a named target/profile.

## 2026-07-29 private central host deployed

Do not repeat first deployment or the Docker runtime fixes. `vgbn-servers` at `192.168.4.135` is running the
private `central-host` web plus sole-writer stack from `89771802`; live execution remains forced off.

Next operational actions, in order:

1. install a read-only GitHub deploy key for the host and prove non-interactive `git fetch origin main`;
2. observe matching authenticated CI before release claims;
3. qualify post-start data freshness/DCS without adding a second writer;
4. prove controlled restart, persisted storage, rollback/recovery, and soak;
5. only then decide whether to install the five-minute updater timer.

The pre-deploy server worktree remains recoverable as `stash@{0}`. Do not drop or apply it without a separate
review. Keep bot, paper, monitoring, research, public exposure, orders, and live execution stopped unless
separately authorized.

## 2026-07-29 closeout override - finish bounded service activation

Preserve the five uncommitted finance continuity/report files from this session. First next action:

1. route the portfolio-monitor Compose ownership defect to `codex`;
2. remove the Compose-owned `--once`/restart loop in favor of the CLI's persistent loop while preserving
   nonzero one-shot exit semantics and critical/degraded status publication;
3. add a focused Compose contract plus persistent-loop breach regression and run the operational monitor tests;
4. obtain explicit bounded Polymarket market/token IDs before creating `storage/polymarket/scope.json`;
5. obtain explicit restricted-delegation authorization before any research or paper provider poll;
6. keep central-host live/execution overrides false.

Separately, decide how to reconcile the Bash toolkit before adding a server `origin`: the workstation
`/home/vgbn1/Documents/codeptit/bash` checkout contains substantial uncommitted work, while the server is an
independent `master` repository. The installer and six links are already repaired; do not broad-rsync or
rewrite either Git history without review.

## 2026-07-29 deep current-run override - restore runtime identity and monitor stability

First obtain an explicit user decision on whether the healthy local `steamlinux` paper bot should continue.
Do not stop, recreate, or otherwise mutate it implicitly.

Then route one bounded `codex` batch:

1. replace Compose-owned monitor one-shot retries with the CLI persistent loop while preserving direct
   `--once` exit semantics, risk thresholds, degraded publication, and signal handling;
2. add a multi-cycle breach/status regression, clear stale transport errors after successful assessments,
   and align the environment manifest, architecture contracts, and deployment guide;
3. add exact source revision/tree identity to built images;
4. make the updater either safely recreate only already-running optional services or publish per-service
   revision/digest evidence and explicitly scope the deployed-head marker to web/backfill;
5. build from a clean exact commit, recreate only explicitly approved services, and prove source/image parity,
   stable monitor restart count, and repeated breach publication.

Keep live/execution false. Do not weaken the BTC threshold, invent provider credentials, start research, create
orders, or infer `vgbn-servers` state from the local `steamlinux` audit.

## 2026-07-29 runtime-integrity implementation override

The source batch is implemented and worktree-verified. Do not reimplement the monitor, health, backup,
provenance, or updater contracts.

Next:

1. review the production/test diff and obtain explicit authorization before staging or committing;
2. commit the coherent source/test/docs/continuity batch, then run `verify:committed-archive`;
3. create or validate the required owner-only `.env.services/*` projections without exposing values;
4. capture local paper ledger/projection hashes, backup due time, active set, image IDs, restart counts, and
   safety flags;
5. build the exact commit-labeled image and rehearse only on local `steamlinux`, recreating the captured active
   set while research remains stopped;
6. observe monitor and host-health for at least two cycles, prove backup did not run early, prove paper parity,
   and retain rollback evidence.

Until commit authorization and the clean exact-source gate exist, do not build/recreate containers. Keep
`LIVE_TRADING=false`, execution authorization false, BTC thresholds unchanged, and remote/provider/public/live
boundaries closed.

## 2026-07-30 vgbn deployment override

The exact-image deployment is complete at `9fef3ef79682d71ba21e9eaea66bfc1fef2d0a44`. Do not rebuild or
redeploy it merely to re-prove current state.

Next:

1. install a read-only GitHub deploy key and prove non-interactive `git fetch origin main`;
2. observe matching authenticated CI for `9fef3ef7`;
3. plan and execute an explicit restart/rollback/recovery drill using the recorded deployment manifest;
4. run a longer five-service soak and retain monitor/health/backup cycle evidence;
5. resolve the BTC notional breach and Alpaca authentication through an approved risk/credential decision,
   never by weakening thresholds or fabricating health.

Keep paper, research, orders, public exposure, and live execution stopped unless separately authorized.

## 2026-07-30 deferred Alpaca monitor edge case

First next-session implementation candidate:

1. route one bounded batch through `codex`;
2. define a least-privilege Alpaca account-read environment surface for `portfolio-monitor` without granting
   execution credentials or capabilities;
3. make monitor scope explicit: paper-only, live-only, or both, and ensure the selected bucket is the one risk
   assessment evaluates;
4. add regressions proving paper keys are not mislabeled as `Alpaca (Live)`, missing projections fail clearly,
   and execution remains impossible;
5. regenerate the owner-only monitor projection, recreate only `portfolio-monitor`, then observe at least two
   cycles without exposing keys or weakening the BTC threshold.

Do not assume the existing credentials are invalid: host evidence showed they are present in `.env.central`
and the backfill projection but intentionally absent from the monitor projection.

## 2026-07-30 Alpaca monitor source implementation override

Do not reimplement monitor account scope or environment projection. The source batch is reviewed and green.
The authorized next actions are:

1. commit all remaining reviewed repository changes;
2. run committed-archive evidence for the exact revision;
3. synchronize that revision to `vgbn-servers`;
4. regenerate owner-only service projections without printing values;
5. rebuild/recreate only the already-active `portfolio-monitor`;
6. observe at least two cycles and prove the paper account is labeled `Alpaca (Paper)`, the BTC threshold is
   unchanged, restart count is stable, and live/execution flags remain false.

Keep paper bot, research, orders, public exposure, threshold changes, and live execution out of scope.

## 2026-07-30 Alpaca monitor service deployment complete

Do not reimplement or blindly redeploy the projection/scope repair. Commit `b5f35e8b` is published, its exact
committed archive passed, and the monitor-only server cutover is complete.

Next:

1. rotate or reissue a valid Alpaca Paper credential pair with the minimum provider-side account-read
   permissions available, then recheck the structured monitor status without printing values;
2. preserve the unchanged BTC 25,000 limit and resolve the real exposure breach through an explicit risk
   decision;
3. install a read-only GitHub deploy key and observe authenticated CI;
4. decide whether to roll the other four services to `b5f35e8b` in an authorized maintenance window, then
   regenerate a coherent global deployment manifest;
5. complete restart/rollback/recovery and longer soak qualification.

The current server is intentionally mixed revision: only `portfolio-monitor` uses `b5f35e8b`; the other four
active services and the global deployment marker remain at `9fef3ef7`. Keep paper bot, research, orders,
public exposure, and live execution stopped.
