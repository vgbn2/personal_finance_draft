# Next Session Goal

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
