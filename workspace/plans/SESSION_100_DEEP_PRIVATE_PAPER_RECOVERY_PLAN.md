# Session 100 Deep Private Paper Recovery Plan

Date: 2026-07-24
Status: implementation-ready plan; no production implementation started
Supersedes: the execution order in `PRIVATE_PAPER_V1_PRODUCTION_PLAN.md`

## Objective

Produce one reproducible `private-paper-v1` release candidate whose aggregate verification is deterministic,
whose effective runtime policy can never submit a real order in private-paper mode, whose Polymarket paper state
is recoverable from one canonical event ledger, and whose data/MCP/backup claims are proven on a separately
qualified persistent host.

The observable completion state is:

- clean committed source and continuity history;
- zero aggregate Node failures in repeated default and serial runs;
- one effective runtime-policy decision shared by CLI, API, MCP, runner, and gateway;
- one replayable paper ledger with no snapshot/audit divergence;
- target-host integrity `ok:true`, DCS at least 0.95, and zero policy-stale required windows;
- successful host-side MCP initialize/list/read-only-status exchange;
- backup, restore, restart, rollback, and soak evidence tied to the deployed commit;
- no execution credentials, public bind, live order, or promotion approval.

## Current evidence

- Git boundary: `HEAD 111b1f6f` is one commit ahead of `origin/main`; the working tree contains only four
  continuity/audit files (`workspace/DEV_REVIEW.md`, `PROMPT_LOG.md`, `REVIEW_LEDGER.md`, and `STATE.md`),
  currently about 135 changed lines.
- Archive and hygiene: `git archive HEAD` entrypoint checks and `npm run hygiene` pass.
- Verification seam: aggregate Node is 122/138 with 16 file-level failures in both default and
  `--test-concurrency 1` runs. Representative failed files pass in focused groups, and the first six analysis
  files pass 25/25 together. The cause is not yet proven; shared state, inherited environment, child-process
  lifecycle, resource pressure, and reporter behavior are candidates.
- Data: read-only `sovereign backend integrity --json` reports 92/92 cached, 87 stale required windows,
  9 cadence-plausible notices, 0 unexplained grain, and one declared exception. DCS is 0.716.
- Runtime policy: `LIVE_TRADING`, `--live`, execution authorization, feature settings, bot state, runtime mode,
  and kill-switch results are interpreted in multiple entrypoints.
- Paper state: `fills.jsonl` is appended before `portfolio.json` is written; bot state and paper portfolio have
  different ownership and persistence semantics.
- Host/MCP: local setup and diagnostic contracts pass, but the intended host has not produced a real stdio
  handshake, writer, recovery, backup, or soak report.
- Architecture view: `docs/engineering/architecture_overview.md` still says broker routing is planned and
  trading modules do not compile.

## Classification

| Workstream | Classification | Priority |
|---|---|---|
| Aggregate test determinism | Verification / release contract | P0 |
| Effective runtime policy | Security/runtime contract | P0 |
| Canonical paper ledger | Security/state/recovery contract | P0 |
| Persistent writer and freshness | Operations/data integrity | P0 external gate |
| Architecture view correction | Documentation | P1 |
| API nested dependency installation | Environment/setup | P1 host gate |
| Read-only combined engine | Roadmap feature | P2 |
| Real-money/public/multi-user capability | Deferred | Out of scope |

## In scope

- current dirty continuity boundary and clean committed/archive proof;
- aggregate Node test failure diagnosis and isolation;
- runtime mode, feature, authorization, kill-switch, and effective-policy precedence;
- Polymarket paper intent, risk decision, fill, position, settlement, and P&L state;
- migration of proven simulated records only;
- private status parity through CLI/API/MCP/gateway;
- architecture documentation that describes the implemented owner graph;
- separate-host qualification, one writer, freshness recovery, backup/restore, and MCP proof;
- read-only exact-asset research composition after operational gates pass;
- release evidence and rollback.

## Out of scope

- real-money orders, live canaries, execution credential installation, or live promotion;
- public network binding or browser-bundled administrative credentials;
- Alpaca/MT5 execution certification;
- Supabase multi-user/RLS production approval;
- making the combined research engine drive paper or live orders;
- provider expansion, new indicators, strategy optimization, profitability claims, or model promotion;
- broad Rust deletion, unrelated stub cleanup, or destructive cache/history rewriting;
- purchasing RAM before exact host compatibility is inspected.

## Safety constraints

- `private-paper` and `cloud-compute` are permanent non-execution modes. Poisoned environment values such as
  `LIVE_TRADING=true` must not override them.
- No provider polling, external API polling, host mutation, container start, timer installation, bot cycle,
  or order may be run by the main agent. External research must use the repository's structured JSON air gap.
- Do not load or copy execution credentials into the private-paper host environment.
- Preserve existing data. No migration may shrink history or destroy the original paper files.
- Keep the Lenovo workstation testing-only. Persistent writer/paper operation belongs only on the qualified
  spare machine.
- Preserve unrelated dirty work. Require explicit review before deleting more than 100 lines or removing a
  compatibility path.
- Focused tests are diagnostic evidence, not release proof. Only repeated aggregate, clean-archive, and
  deployed-commit evidence can clear release gates.

## Requirements

- Every gate must report structured evidence tied to an exact commit and execution environment.
- Test recovery must prove the cause of aggregate-only failures before introducing shared harness machinery.
- Effective runtime policy must be deterministic, versioned, provenance-bearing, and identical across surfaces.
- Permanent non-execution profiles must override every live request, credential, setting, and legacy state value.
- Paper events must be append-only, idempotent, exact-identity, replayable, and protected by explicit ownership.
- Derived paper snapshots must carry the ledger sequence/checksum that produced them.
- Migration must preserve originals and report accepted, rejected, duplicate, and ambiguous records.
- Data recovery must preserve or increase historical depth and record provider, row, timestamp, and checksum proof.
- MCP/API/UI must expose read-only truth and must not imply host, freshness, or promotion evidence that is absent.
- Each batch stops on a failed prerequisite; later feature work cannot compensate for an uncleared safety gate.

## Ranked batches

### Batch 0 - Seal the planning and Git boundary

Objective: create an honest source boundary before modifying production code.

Work:

1. Review the four continuity-file diffs and ensure they contain only sessions 97-100 audit/plan evidence.
2. Update the dated handoff, next-session goal, and prompt history with this plan.
3. Commit continuity separately from future production changes when the user authorizes a commit.
4. Reconcile the one local commit ahead of `origin/main`; do not force-push or rewrite origin history.
5. Extract `git archive HEAD` and require canonical runner, CLI, gateway, MCP, and plan files to exist and parse.

Acceptance:

- `git diff --check` passes;
- no source/test/config/data file is accidentally included in the continuity commit;
- committed `HEAD`, archive commit, and reported audit anchor match;
- working tree is clean before Batch 1 edits;
- origin reconciliation is explicit, not inferred.

### Batch 1 - Recover deterministic aggregate verification

Objective: make the canonical Node gate trustworthy before changing runtime or ledger behavior.

Work:

1. Capture machine-readable failure evidence for the current 16 failing files: file, exit status, signal,
   duration, stdout tail, stderr tail, inherited test context, temp paths, and child-process count.
2. Reproduce the smallest failing sequence. Do not assume shared-state contamination until a sequence or
   resource probe proves it.
3. Check these candidate classes independently:
   - fixed shared output directory (`/tmp/sovereign-test-outputs`);
   - canonical settings/cache/config writes;
   - inherited `NODE_TEST_CONTEXT`, live/auth/provider variables, and user settings path;
   - child processes left running or killed by per-file timeouts;
   - process/memory/file-descriptor pressure;
   - test reporter hiding the underlying assertion.
4. Add one reusable test-environment helper only after the root class is proven. Each file must receive unique
   settings, output, run-status, credentials-fixture, and temporary-home paths where applicable.
5. Restore every modified environment variable and canonical file in `after`/`finally` cleanup.
6. Ensure spawned CLI children receive only the minimum explicit environment needed for the test.
7. Add a contract that records pre/post checksums for canonical config and tracked fixtures during the aggregate
   run.

Acceptance:

- every previously failing file passes individually;
- the smallest prior failing sequence passes three consecutive times;
- full default aggregate passes twice consecutively with zero failures;
- full `--test-concurrency 1` aggregate passes once with zero failures;
- no orphan child remains and no canonical settings/config/storage artifact changes;
- `git diff --check`, hygiene, API, contracts, and secrets pass;
- failure reporting retains child stdout/stderr so a future file-level failure is diagnosable.

Stop condition: if failures are host/sandbox resource limits rather than repository isolation defects, record the
measured limit and create a bounded runner profile; do not rewrite production code to accommodate the harness.

### Batch 2 - Establish one effective runtime policy

Objective: make every surface consume one deterministic answer to “may this action execute?”

Required policy output:

- schema/version;
- requested profile and effective profile;
- `paper`, `research_only`, and `can_execute` booleans;
- authorization and kill-switch states;
- feature-gate results;
- ordered blocking reasons;
- source/provenance for each input;
- timestamp and deterministic policy fingerprint.

Precedence:

1. permanent profile denials (`private-paper`, `cloud-compute`, test profile);
2. global kill switch or unavailable native risk gate;
3. deployment/runtime mode;
4. explicit CLI live request;
5. explicit execution authorization and PIN/preflight;
6. feature flags;
7. bot/user settings as requested preferences only.

Work:

- choose one canonical shared owner and migrate CLI, API, MCP, runner, direct trade, bot cycle, and gateway
  callers to it;
- treat legacy `bot_state.liveTrading` as migration input, never authority;
- make private-paper status surface the effective policy and blocking reasons;
- prevent paper mode from constructing a submit-capable client;
- keep schema-2 research defaults and existing explicit live gates unchanged outside the new policy owner.

Acceptance:

- exhaustive precedence matrix, including malformed state and poisoned inherited environment;
- private-paper remains `can_execute:false` with `LIVE_TRADING=true`, `--live`, valid PIN, and credentials present;
- direct, bot, runner, API, and MCP surfaces return the same policy fingerprint;
- all live paths still require explicit CLI authorization and native risk approval;
- a static/runtime dependency test proves private-paper cannot reach CLOB submission;
- focused policy/live-guard tests and the recovered aggregate suite pass.

### Batch 3 - Converge one canonical paper event ledger

Objective: make paper portfolio state reproducible by replay and impossible to diverge silently from its audit log.

Minimum event contract:

- schema version, event ID, idempotency key, cycle ID, sequence, event time, decision time, and data-as-of;
- exact market/condition/token identity and outcome;
- strategy and source provenance;
- order intent;
- policy fingerprint and risk decision;
- paper fill;
- position open/adjust/close;
- settlement/resolution evidence;
- cash, realized P&L, and fees/slippage fields;
- prior-event or ledger checksum for continuity.

Work:

1. Make the append-only event ledger authoritative.
2. Treat portfolio, bot status, and P&L summaries as rebuildable projections/snapshots.
3. Protect append and snapshot publication with the existing ownership-token locking pattern or an equally
   explicit single-writer contract.
4. Publish snapshots atomically with version/sequence/checksum.
5. Deduplicate by deterministic cycle and intent keys.
6. Migrate only records proven virtual/simulated. Preserve existing files in a read-only migration archive and
   report accepted, rejected, duplicate, and ambiguous counts.
7. Keep live/non-dry-run history as audit-only input; never import it as paper positions.
8. Route `polymarket paper-run`, non-live `bot cycle`, runner paper loop, portfolio display, and restart recovery
   through the same ledger owner.

Acceptance:

- deterministic replay reconstructs cash, open positions, fills, settlements, and P&L byte-for-byte;
- injected crashes after intent, risk, fill, ledger append, and snapshot temp-write recover without divergence;
- duplicate cycle and repeated command produce no duplicate fill;
- concurrent second writer is rejected;
- truncated final event is detected and quarantined/fails closed;
- stale-lock recovery is ownership-checked;
- restart, resolution, and P&L tests pass;
- no credentials or submit-capable CLOB client are reachable in paper mode;
- aggregate suite passes after focused ledger tests.

### Batch 4 - Correct architecture and operator truth

Objective: make documentation and status views describe the executable ownership model.

Work:

- replace planned/uncompiled claims in `docs/engineering/architecture_overview.md`;
- document the effective-policy owner, paper-ledger owner, event/projection relationship, single-writer topology,
  private exposure, backup/restore, and blocked promotion path;
- distinguish internal Polymarket simulation, broker-hosted Alpaca paper, and live accounts;
- add a docs/runtime contract for key owner paths and commands;
- document the nested API install requirement without weakening direct dependency ownership.

Acceptance:

- architecture, codebase organization, deployment, MCP, and CLI docs agree on owners and commands;
- no research or paper page implies real execution readiness;
- docs/runtime contract and aggregate suite pass.

### Batch 5 - Qualify the host and recover data trust

Objective: prove the separate Ubuntu machine as the sole persistent writer/private-paper host.

Operator evidence required before mutation:

- `uname -m`, `free -h`, `df -h`;
- system, baseboard, and memory inventory;
- DIMM/SO-DIMM form, DDR generation, ECC/buffering, installed modules, free slots, and platform maximum;
- power/network/uptime suitability.

Minimum selection:

- x86_64/amd64;
- 8 GB installed minimum, 16 GB target;
- 40 GB usable persistent disk minimum, 80 GB preferred;
- reliable private SSH and power/network;
- Node 22 and Docker/Compose support.

Work after explicit host approval:

- install nested dependencies and build from the exact committed release candidate;
- create owner-only research/paper environment with no execution secrets;
- run preflight;
- start exactly one writer;
- catch up data without shrink;
- deploy private API/dashboard and read-only MCP;
- prove backup, restore, reboot, restart, and rollback.

Acceptance:

- 92/92 cached, zero missing, zero policy-stale required windows, zero unexplained grain;
- integrity `ok:true`, DCS at least 0.95;
- row counts, first/last timestamps, providers, and checksums prove no shrink;
- one writer and no stale lock;
- real MCP initialize/list/read-only-status exchange succeeds;
- backup restores ledger, projections, configuration, and data consistently;
- 72-hour infrastructure soak has no unexplained high-severity error.

### Batch 6 - Add read-only exact-asset combined research

Objective: raise the combined engine from D/nonexistent to a production-reachable but permanently
non-actionable research service.

Work:

- compose one exact canonical `asset_id`;
- use point-in-time technical and macro evidence;
- reject stale, missing, synthetic, late, revised-after-decision, or mismatched factors;
- emit deterministic `research_only:true`, `decision_ready:false`, `promotion_approved:false`;
- expose parity through CLI, authenticated private API, MCP, and truthful UI;
- keep schema-2 default behavior intact;
- prohibit order/ledger dependencies from the combined research service.

Acceptance:

- same-asset success and cross-asset rejection;
- stale/missing/revision/provenance rejection;
- deterministic CLI/API/MCP parity;
- host-side MCP proof;
- static dependency test confirms no order or paper-ledger write path;
- responsive UI evidence at 375/768/1440;
- combined engine grade can rise only after the production caller and evidence gates exist.

### Batch 7 - Certify `private-paper-v1`

Objective: release an exact, rollback-capable, evidence-backed private-paper build.

Acceptance:

- local HEAD, origin commit, clean archive/clone, CI commit, and deployed commit match;
- all Node, API, contract, security, native, frontend, gateway, MCP, Compose, and hygiene gates pass;
- seven consecutive days of paper cycles after the 72-hour infrastructure soak;
- at least 99% of scheduled cycles produce structured outcomes;
- zero duplicate fills, ledger divergence, unresolved locks, execution attempts, or secret leaks;
- backup, restore, restart, rollback, DCS, MCP, and paper-readiness reports pass;
- profitability remains a separate research report and does not imply live approval.

## Verification matrix

| Gate | Required proof | Blocks |
|---|---|---|
| G0 source | clean committed/archive boundary | all production edits |
| G1 test trust | repeated default + serial aggregate green | runtime and ledger implementation claims |
| G2 policy | precedence/parity/no-submit proof | paper host |
| G3 ledger | replay/crash/idempotency/migration proof | persistent paper cycles |
| G4 host/data | preflight, freshness, MCP, backup/restart/soak | operational release |
| G5 research | exact-asset point-in-time parity and no-order dependency | combined-engine grade |
| G6 release | exact commit, CI, deployed evidence, rollback and soak | `private-paper-v1` tag |

## Handoff

First next-session action:

1. read-only `git status --short`, `git diff --check`, and `git log origin/main..HEAD`;
2. review and seal the four continuity files;
3. start Batch 1 by capturing a diagnosable aggregate failure artifact;
4. do not edit runtime policy or paper code until G1 is green or the host-limit exception is measured and
   documented.
