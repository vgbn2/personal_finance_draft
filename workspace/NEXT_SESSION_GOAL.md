# Next Session Goal

## 2026-07-24 session 101 critical override - seal remote client and qualify the real host

Repository implementation is complete in the current dirty source tree after continuity commit `87d896de`.
Do not rebuild the scoped client API, remote CLI, startup connectors, unpriced-exit guard, or repeated-token
settlement identity.

Current source proof:

1. Host-capable Node aggregate: 894 total / 890 pass / 0 fail / 4 intentional skips.
2. API aggregate: 10/10; gateway TypeScript, shell syntax, PowerShell parser, hygiene, and diff checks pass.
3. Read-only integrity: 92/92 cached, 87 required-window stale, 9 cadence-plausible, 0 unexplained, 1 exception.
4. No service/task/tunnel was installed and no provider poll or canonical-data write ran on the Lenovo.

Execute next:

1. Review is complete and its six findings are closed. Commit the combined session-100/101 source batch
   separately from `87d896de`; prove clean archive and fresh-clone gates.
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
