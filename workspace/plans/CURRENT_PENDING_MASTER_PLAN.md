# Current Pending Master Plan

Date: 2026-07-29
Status: canonical planning index; M0 source repair implemented and verified, release closure deferred
Anchor: `main` at `0383d47b` plus the current intentionally dirty worktree

## Objective

Replace the contradictory collection of current, partial, blocked, deferred, completed, and superseded plans
with one dependency-ordered queue. The observable outcome is a single place that answers:

1. what is still pending;
2. what is already implemented and must not be repeated;
3. what is blocked on external evidence or a user decision;
4. what must happen first;
5. what evidence closes each gate without implying release, host, paper, or live readiness.

Assumption: "pending" means unresolved source, evidence, host, research, paper, monitoring, maintainability, or
distribution gates. Historical plans whose implementation is closed remain references and are not reactivated.

## Current Baseline

- The worktree closes the FULL-1 mock/PIN bypass and FULL-2 Alpaca state/inventory defects, and the focused safety
  suite passed 7/7 on 2026-07-29.
- Exact `HEAD` does not contain those closures. `0383d47b` must not be deployed or treated as the release source.
- The worktree inventory now contains 94 status entries including its own durable inventory record and the
  historical-plan correction. Load-bearing
  source and tests remain untracked, including
  `backend/cli/commands/strategy/automation_guard.js`.
- Source-evidence schema v2 now defaults to a durable ignored manifest, checkpoints the active step, and stores
  sanitized diagnostics plus content fingerprints. The per-file RAG runner now preserves nested leaf causes.
  Exact reviewed-commit and authenticated-CI evidence remain open.
- Dependency evidence remains 17 high / 11 moderate / 26 low / 0 critical. DEP-1C Alpaca/Axios and DEP-1D
  Polymarket/Ethers remain NO-GO without trustworthy compatibility inputs.
- Real combined research remains fail-closed because recorded macro observations lack usable
  release/vintage/`available_at` metadata and the bounded writer/global reader paths do not converge.
- The private target-host identity, exact source revision, installs, auth, MCP, persistence, restart, rollback,
  backup/recovery, one-writer behavior, and soak are not currently proven.
- Monitoring and cross-market research plans are specifications only. No MON batch or new paper/runtime action is
  authorized.

## Plan Inventory

This table is the current status index. When an older plan header disagrees with current state, this table and the
latest verified evidence win; the old file remains historical context.

| Plan | Current classification | Pending content and master destination |
|---|---|---|
| `ASSET_ANALYSIS_IMPLEMENTATION_BATCHES.md` | Source batches 1-8 complete; promotion rejected | Real PIT coverage, target returns, OOS/cost/calibration, and schema-v2 retirement remain in M3-M4. |
| `ASSET_ANALYSIS_UI_OVERHAUL.md` | Superseded design reference | Family-aware source work exists; optional research UI polish moves to M7 after evidence gates. |
| `BOT_MONITORING_MASS_IMPLEMENT_PLAN.md` | Current proposed plan | MON-0 through MON-5 move to M5-M6. |
| `CENTRAL_HOST_SINGLE_WRITER_ROLLOUT.md` | Partial source contracts; host proof pending | Exact-source, web-only host, one-writer, recovery, and soak gates move to M0, M2, and M6. |
| `CODEPTIT_REMOTE_SYNC_AND_PRIVATE_DEFENSE_PLAN.md` | Separate optional project; Batch 1 waiting for inputs | Manual source-only sync moves to M8; deletion and scheduling remain NO-GO. |
| `DASHBOARD_ROBUSTNESS_PLAN.md` | Historical implementation reference | New dashboard changes are limited to M5 monitoring parity or optional M7 UX work. |
| `DEEP_BLAST_GAP_CLOSURE_PLAN.md` | Historical/superseded | Clean-source concerns are replaced by M0 exact-commit and evidence closure. |
| `DEPENDENCY_REMEDIATION_MASS_IMPLEMENT_PLAN.md` | Partially closed; release gate open | DEP-1C/1D and later dependency owners move to M1. |
| `ENVIRONMENT_AND_PRODUCTION_EVIDENCE_MASS_IMPLEMENT_PLAN.md` | Source implementation mostly closed; exact evidence open | TEST-1 durability, exact commit/CI, and runtime proof move to M0-M2. Current worktree already contains per-service Compose projection; do not redo ENV-1B3-B from the stale plan status. |
| `ENVIRONMENT_AND_REMOTE_MIRROR_BOUNDARY_PLAN.md` | Environment/Polymarket source work closed; sync residual | Exact runtime/host evidence moves to M0-M2; SYNC-1 moves to M8. |
| `FIVE_MIN_DATA_SCOPING.md` | Partially implemented; header is stale | Remaining native-depth/provider/session/corporate-action and trusted-consumer gates move to M3. |
| `FUTURE_API_AUTH_UI_DEDUP_REFINEMENT.md` | Partially complete and security-gated | Real private auth/session proof moves to M2; behavior-preserving UI/dedup work moves to M7. Wider bind remains separately approval-gated. |
| `GAP_CLOSURE_PLAN_SESSION_47.md` | Closed historical plan | Do not repeat. |
| `GLOBAL_MARKET_MONITOR_MASS_IMPLEMENT_PLAN.md` | Batches 1-5 closed; Batch 6 residual | Stress, regression, operator runbook, deployment, recovery, and soak move to M5-M6. |
| `LOAD_SMOOTHING_AND_APPEND_ONLY_STORAGE_PLAN.md` | Partially implemented; optional segment mode remains disabled | Host thresholds, durable queue, storage budgets, compaction, and soak move to M2/M6/M8. |
| `ML_SECTION_PLAN.md` | Parked research/promotion track | Real model calibration/promotion remains M8 and requires a separate user priority decision. |
| `POLYMARKET_BOT_PLAN.md` | Historical research plan with residual qualification | Archive/replay/paper requirements move to M3-M6. No live phase is inherited. |
| `PRIVATE_PAPER_V1_PRODUCTION_PLAN.md` | Superseded execution order | Canonical ledger/runtime source exists; remaining host, recovery, and paper qualification move to M2/M6. |
| `RESEARCH_DATA_STRATEGY_BACKTEST_READINESS_PLAN.md` | Current deferred roadmap | Batches 1-7 move to M3-M4/M6; monitoring Batch 8 moves to M5. |
| `SCALPING_BOT_SCOPING.md` | Parked pivot requiring venue/thesis decisions | Remains M8 and cannot start from this master plan. |
| `SCHEMA2_SCHEMA3_COMBINED_ENGINE_PLAN.md` | Header is stale; research-only engine now exists | PIT metadata, reader/writer convergence, real eligible coverage, calibration, and promotion remain M3-M4. |
| `SESSION_100_DEEP_PRIVATE_PAPER_RECOVERY_PLAN.md` | Source recovery largely subsumed; external proof residual | Exact release, MCP, backup/recovery, and paper-host gates move to M0/M2/M6. |
| `SESSION_82_MERGE_RECOVERY_GRADE_PLAN.md` | Closed historical plan | Do not repeat its seven batches. |
| `SESSION_91_MCP_RUNTIME_RECOVERY_PLAN.md` | Source setup superseded; real-host stdio proof residual | MCP identity/build/stdio parity moves to M2. |
| `SESSION_92_ZERO_COST_HOST_AND_TRUST_RECOVERY_PLAN.md` | Superseded host-selection snapshot | Current private target-host qualification moves to M2. |
| `SHARED_LIB_REORG_PLAN.md` | Main reorganization complete; compatibility shims remain | Consumer-proven shim retirement is optional M7 work; string-only deletion is forbidden. |
| `TUI_REVAMP_SPEC.md` | Phase A/B completed; historical UI reference | Further presentation work is optional M7 and must preserve non-TTY/JSON behavior. |

## Unified Dependency Order

The lifecycle for each implementation batch is:

`proposed -> duplicate/stub preflight -> GO | GO WITH FIXES | NO-GO -> implemented -> verified -> reviewed -> closed | deferred`

Only one implementation batch is active at a time. A NO-GO is a valid result and must not be bypassed by moving
the same behavior into another plan.

### M0 - Exact Source, Evidence, And Continuity Closure

Status: source repair implemented and verified; commit/archive/CI closure remains blocking.

Objective: produce one reviewed exact revision that contains the complete safety/evidence/workflow batch and emits
durable, diagnostic source evidence.

In scope:

- inventory every modified, deleted, and untracked item by owner and change set;
- prove the new automation guard, test runner/reporter, Compose projection, Docker, package, documentation, and
  skill changes form coherent commit groups;
- require a task-local duplicate/stub and consumer scan before any new source edit;
- make source-evidence output use an explicit durable destination and retain sanitized leaf-cause diagnostics or a
  content-addressed diagnostic reference;
- make RAG failure records preserve the actual nested cause when Node reports only a file-level failure;
- add one current-priority continuity correction and retire contradictory queue items non-destructively;
- create reviewed commits only with explicit commit authorization;
- run committed-archive verification and obtain matching authenticated CI evidence when available.

Out of scope: dependency upgrades, host writes, provider polling, data migration, paper cycles, monitoring
implementation, public exposure, and live execution.

Acceptance:

- `git archive <revision>` contains every load-bearing owner and its adversarial tests;
- wrong PIN under mock poison fails, corrupt state fails loudly, and unavailable inventory preserves state and blocks
  entry;
- interrupted verification leaves a durable non-PASS manifest with source identity, step, exit/signal/error class,
  and sanitized diagnostic evidence;
- no current plan instructs agents to redo FULL-1/FULL-2 or deploy `0383d47b`;
- focused safety, evidence contracts, hygiene, secrets, diff integrity, committed-archive source verification, and
  matching CI are explicitly separated and recorded.

Verification: `npm run test:safety`; focused source-evidence/RAG/skill contracts; `git diff --check`; hygiene and
secret scan; committed-archive coordinator; authenticated CI artifact tied to the exact revision.

Difficulty/budget: medium-high; approximately 150-350 new/changed LOC if evidence tooling requires repair, plus
reviewed commit and continuity work. This is an estimate, not implementation authorization.

### M1 - Credential, Dependency, And Supply-Chain Gates

Status: release-blocking; external facts required.

Objective: close known credential and dependency risks without guessing package compatibility or widening runtime
authority.

In scope:

- rotate the FRED credential and Polymarket private key exposed in a prior tool transcript before reuse;
- rerun five-root dependency evidence against the exact M0 revision;
- obtain a structured Alpaca v3-to-v4 production API mapping before DEP-1C;
- reject the unsafe Polymarket client downgrade and obtain a supported Ethers/ws remediation path before DEP-1D;
- continue DEP-2 through DEP-5 only as isolated owner batches;
- pin trusted Node/npm, Actions, container-base digests, and ONNX archive hash when authoritative inputs exist;
- retain scans, dependency graphs, lockfile digests, and residual advisory counts.

Out of scope: provider calls, service startup, trading, public binding, and compatibility changes without exact
package evidence.

Acceptance:

- all dependency changes are deterministic and owner-scoped;
- affected API/gateway/MCP/dashboard builds and safety contracts pass;
- residual advisories and no-fix cases remain explicit;
- no downgrade or engine/peer/install-script change is accepted without compatibility proof;
- credentials are rotated out of band and values never enter repository records.

Verification: five-root install/audit reports, `npm ls`, affected builds/typechecks, focused provider-boundary and
paper/live safety contracts, secrets, hygiene, and committed-archive evidence.

Difficulty/budget: high and externally constrained; LOC cannot be estimated responsibly until package mappings are
known.

### M2 - Private Web-Only Host Qualification

Status: pending separate operational authorization.

Objective: prove one exact M0 revision on the intended private host without enabling writers, monitoring, paper bots,
orders, or public exposure.

In scope:

- read-only identity/tool probe for `vgbn1@192.168.4.126`; require hostname `vgbn-servers`;
- owner-only target directory and source transfer/fetch of the exact revision without `--delete`;
- deterministic installs/builds for all five package roots;
- service-specific owner-only environment files and loopback/private bind;
- Compose config/build/start for `web` only;
- `/health`, login, RBAC, revocation, dashboard load, MCP stdio, mounted-state persistence, and container restart;
- record exact deployed revision and toolchain.

Out of scope: `backfill`, writer, host-health/backup timers, monitor, paper bot, provider poll, canonical-data write,
public bind, and live execution.

Acceptance:

- destination identity and exact source revision match;
- credentials are mode 600 and absent from browser/client projections;
- only `web` runs and binds privately;
- auth denial/restoration/revocation, MCP read-only capability, restart, and persistence are directly observed;
- failure leaves services stopped and does not mutate canonical market data.

Verification: remote inventory/digests, five-root installs/builds, strict source gates, Compose config, private HTTP
and MCP probes, restart/persistence checks, and shutdown/state inspection.

Difficulty/budget: high operational work; no source LOC is implied.

### M3 - Data Readiness And Point-In-Time Truth

Status: pending after M0; provider/data mutation requires separate authorization.

Objective: emit one machine-readable readiness verdict for every configured OHLC and Polymarket research input and
make real macro composition point-in-time eligible without weakening fail-closed behavior.

In scope:

- configured OHLC symbol/timeframe and Polymarket archive inventory;
- provenance, availability, coverage, gaps, duplicates, timezone/session/corporate-action rules, and
  synthetic/derived classification;
- preserve release/vintage/`available_at`/ingestion/revision metadata;
- converge the bounded writer and canonical reader on one revision-aware cache;
- provider-backed reingestion only after explicit authorization;
- native 5m depth/session/corporate-action qualification and continued exclusion of synthetic lower-timeframe bars;
- representative DCS/readiness records, but DCS cannot override a failed integrity condition.

Out of scope: strategy tuning, paper eligibility, schema-v2 deletion, provider substitution, and treating observation
time as availability time.

Acceptance:

- every required input is eligible, degraded, excluded, or unavailable with a stable reason;
- PIT selection proves future releases/revisions cannot leak backward;
- exact asset/token identity is required; no family or bare-symbol fallback;
- repeated inventory is deterministic and does not transform data;
- promotion remains blocked below DCS 0.95 or on any failed required integrity/PIT gate.

Verification: inventory contracts, macro migration/cache tests, as-of fixtures, OHLC session/synthetic tests,
Polymarket lifecycle/archive tests, checksums/counts/time ranges, integrity output, and clean source gates.

Difficulty/budget: high; roughly 700-1,500 LOC across inventory/PIT contracts and tests, excluding any provider
adapter or migration discovered by preflight.

### M4 - Versioned Strategies And Comparable Replay

Status: depends on M3.

Objective: compare OHLC and Polymarket strategies reproducibly while preserving their different market semantics.

In scope:

- immutable, versioned strategy configurations with supported families, timeframes, data requirements, sizing,
  exposure, costs, slippage/impact, liquidity, holding, and resolution rules;
- shared result envelope with market-specific calculations;
- deterministic replay, OOS, walk-forward, fee/slippage sensitivity, turnover, drawdown, sample-size, and
  provenance reporting;
- target-return and calibration evidence for schema-v3 research rows;
- keep schema v2 canonical until promotion and explicit deletion approval.

Out of scope: universal cross-family scoring, headline-return promotion, live submission, schema-v2 retirement, and
unverified full-order-book claims.

Acceptance:

- same frozen input/config produces equivalent results and denial classes;
- unsupported metrics are unavailable, not zero or fabricated;
- OHLC return and Polymarket probability/resolution/P&L semantics remain distinct;
- no result is `decision_ready:true`;
- paper eligibility requires independently green data, replay, OOS, cost, and calibration gates.

Verification: representative fixture matrix, deterministic reruns, OOS/walk-forward and cost sensitivity, malformed
configuration and lifecycle cases, native/JS parity where both owners exist, and broad source regression gates.

Difficulty/budget: high; approximately 900-1,800 LOC depending on registry and replay gaps found in preflight.

### M5 - Canonical Monitoring Source

Status: MON-0 may begin only after M0 closes.

Objective: create one paper-monitoring contract without adding a second portfolio, position, P&L, or heartbeat owner.

In scope:

- MON-0 duplicate/stub/owner/caller/environment/state-precedence preflight;
- freeze `paper_monitor.v1`;
- atomic mode-0600 snapshot and bounded sanitized event journal;
- paper-only Bash supervisor with PID/start-time/heartbeat identity and bounded opt-in restart;
- environment-selected generic/Discord/Slack webhook adapter with redaction, idempotency, ordering, and backoff;
- parity across Bash diagnostics, CLI, authenticated API, dashboard, and existing service-health owners;
- absorb Global Market Monitor Batch 6 stress/runbook work.

Out of scope: starting a bot, contacting a broker/provider/webhook, public exposure, order placement, Bash-derived
trading truth, and live restart.

Acceptance:

- MON-0 issues GO/GO WITH FIXES/NO-GO before production edits;
- Node owns trading/portfolio semantics; Bash owns process/host supervision only;
- missing, corrupt, stale, partial, split-brain, clock-skewed, and unavailable inputs never become healthy/zero truth;
- API/UI/Bash/CLI agree on snapshot identity and counters;
- restart is denied outside the verified paper profile and stops after bounded failures.

Verification: owner/route/environment matrices, schema/state-machine tests, atomic/concurrency/clock/PID tests,
auth/redaction tests, controlled local webhook fixture, API/dashboard parity, mutation proof, and broad source gates.

Difficulty/budget: high; existing estimate 1,400-2,200 source/test/documentation LOC.

### M6 - Paper, Writer, Recovery, And Soak Qualification

Status: depends on M2-M5 and separate runtime/provider authorization.

Objective: qualify fake-money and provider-paper operation on the private host while preserving one writer, one
ledger, and zero path to live execution.

In scope:

- local virtual-fill paper ledger and restart/replay/reconciliation proof;
- Alpaca provider-paper as a separately labelled environment;
- Polymarket remains local virtual-fill unless a real provider paper environment is identified;
- one authorized backfill writer, catch-up, integrity, append-only/compaction/storage budgets, and host-pressure
  behavior;
- monitoring two-hour smoke, 72-hour infrastructure soak, and seven consecutive paper-cycle days;
- backup/restore, restart/rollback, one-writer, recovery, partial fill, settlement, duplicate prevention, stale-data
  denial, kill switch, exposure/drawdown limits, and structured per-cycle results.

Out of scope: live endpoints/credentials, real capital, public bind, schema promotion, and silent automatic recovery.

Acceptance:

- every scheduled cycle has a structured result or explicit failure;
- writer/ledger state survives restart and restores from tested backups;
- confirmed-empty inventory remains distinct from unavailable/incomplete inventory;
- provider paper and local simulation are visibly distinct;
- monitor catches stalls within the bounded heartbeat age and cannot restart endlessly;
- no live-submit client or execution credential is reachable.

Verification: disposable recovery fixtures, private-host runtime evidence, integrity/checksum/count comparisons,
auth/MCP/dashboard parity, fault injection, backup/restore, restart/rollback, two-hour smoke, 72-hour infrastructure
soak, seven-day paper report, and explicit no-live proof.

Difficulty/budget: very high operational qualification; source LOC depends on M3-M5 findings.

### M7 - Behavior-Preserving Maintainability And UX

Status: deferred until M0 and preferably M2 are closed.

Objective: reduce ownership and readability debt without changing public payloads, authorization, fail-closed state,
fallback provenance, or operator truth.

In scope:

- one slice at a time: strategy registry/prop-firm presentation from `strategy.js` or one coherent adapter family
  from `cli_executor.js`;
- consumer-proven shared-lib shim retirement;
- optional TUI/web character-budget cleanup and research UI polish;
- duplicate/stub classification before every edit;
- characterization tests and behavior freeze before movement.

Out of scope: clean-slate rewrites, combined behavior/refactor batches, string-only deletion, wider API bind, and
schema-v2 retirement.

Acceptance:

- one canonical owner per moved policy;
- callers and payloads remain byte/semantically compatible;
- authorization, denial, state preservation, fallback provenance, non-TTY/JSON output, and responsive UI contracts
  remain unchanged;
- any net deletion above 100 LOC receives explicit user confirmation.

Verification: focused characterization/parity tests, direct CLI/API/dashboard probes, safety suite, relevant
aggregate gates, hygiene, and diff integrity.

Difficulty/budget: medium per slice; approximately 150-400 changed LOC per approved ownership extraction.

### M8 - Distribution And Optional Separate Roadmaps

Status: parked; each item needs separate approval and must not block private research by default.

Items:

- distribution: license decision, SBOM, scans, minimal image, signature, provenance, checksums, immutable digest,
  clean third-host install and uninstall;
- manual one-way CodePTIT source sync after host alias/root/sentinel/repository inputs; no delete or timer;
- adaptive backfill thresholds, durable queue, segment/compaction budgets, and optional segment mode;
- ML calibration/promotion;
- unresolved 5m provider/depth expansion beyond M3 requirements;
- further UI polish;
- scalping architecture only after venue and motivating thesis are explicitly selected.

Acceptance: each item receives its own refined prompt, authority boundary, rollback, evidence class, and
GO/NO-GO. None inherits live, public, destructive, provider, or spending authority from this master plan.

## Global Safety Constraints

- Preserve the dirty worktree and never use blanket reset/checkout/clean.
- Never commit, push, rsync, deploy, start services, poll providers, mutate canonical data, send webhooks, run a
  bot cycle, place an order, widen a bind, rotate credentials, or delete data unless that exact action is separately
  authorized.
- Keep API/dashboard loopback/private. Wider binding is a security change.
- Keep `research_only:true` and `decision_ready:false` until real PIT/OOS/calibration/promotion evidence exists.
- Keep local Polymarket virtual fills distinct from Alpaca/provider paper.
- Node owns portfolio, positions, P&L, broker/data truth, and risk. Bash owns supervision only.
- Before every broad implementation, scan for duplicate owners, divergent implementations, incomplete stubs,
  shims, generated artifacts, fixtures, and honest unavailable features.
- Do not weaken, skip, delete, mock away, suppress, or rewrite tests to manufacture a pass.
- Keep source, worktree snapshot, committed archive, CI, host, deployment, recovery, soak, paper, and live evidence
  separate.

## First Handoff

Begin M0 only. The first action is a read-only commit-boundary inventory that maps all 83 worktree entries to
coherent owners and identifies every load-bearing untracked edge. Then produce a GO/GO WITH FIXES/NO-GO decision
for:

1. the evidence/RAG durability repair;
2. continuity correction;
3. coherent commit groups.

Do not begin MON-0, private-host writes, dependencies, provider/PIT work, refactoring, or paper/runtime activity
until M0 is reviewed and closed or explicitly deferred.
