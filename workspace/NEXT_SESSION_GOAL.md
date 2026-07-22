# Next Session Goal

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
