# Feature Repair Plan - 2026-06-08

This plan comes from the current `rigorous-feature-testing` pass. It focuses only on surfaces that are still partial, drifted, or verification-limited.

## Priority Findings

1. Docs drift was the strongest confirmed mismatch, and the TUI feature map has now been refreshed.
   - Evidence: current probes show `backend integrity --json` returns `ok:true`, `84/84 cached`, `0 missing`, `0 stale`, `2 exceptions`; `docs/engineering/tui_feature_map.md` now matches that baseline and separates latest-fetch freshness from configured-cache integrity.
   - Impact: future agents or operators should no longer chase the retired backend-integrity failure as if it were current.

2. Data health is honest but still split across two scopes.
   - Evidence:
     - `status --json` -> `records: 82`, `usable_records: 9`, `rejected_records: 73`, `stale_records: 73`, `freshness_scope:"last_fetch_snapshot"`
     - `backend integrity --json` -> `ok:true`, `84/84 cached`, `0 missing`, `0 stale`, `2 exceptions` (`RNDRUSDT`, `VRE`)
   - Impact: configured-cache integrity is green, but latest-fetch-derived workflows remain degraded.

3. Gateway verification still stops short of a real spend boundary.
   - Evidence: focused gateway suite `29/29` passed, including live-guard, account resolution, paper-run, error classification, and proposed-order validation, but no real `buy` was attempted in this pass.
   - Impact: contract confidence is good, but live-submit confidence still depends on explicit user approval for a tiny real order.

4. API/Web contract tests depend on loopback bind permission in this environment.
   - Evidence: sandbox run failed with `listen EACCES 127.0.0.1`; approved rerun passed `2/2`.
   - Impact: a sandbox-only pass can misclassify environment restrictions as product failures unless the harness is adjusted.

## Repair Checklist

- [x] Refresh `docs/engineering/tui_feature_map.md` to match the current audit baseline.
  - Expected behavior: backend integrity, Polymarket notes, and any degraded markers should reflect the current probes.
  - Evidence target: readback diff against `workspace/FEATURE_TEST_MATRIX.md`.

- [ ] Remove `VRE` from the integrity exception list through exchange-aware VN ticker mapping.
  - Expected behavior: `backend integrity --json` should keep `ok:true` without needing `VRE` in `integrity_exceptions`.
  - Evidence target: compact integrity probe with only the deliberate long-tail exception(s) remaining.

- [ ] Close the paper-trading deployment gate by logging resolved-position PnL in the documented artifact shape.
  - Expected behavior: paper-trading outputs should reconcile with the planned `pnl_log.jsonl` contract rather than adjacent files only.
  - Evidence target: focused paper-trading contract plus artifact readback.

- [ ] Decide whether to make API contract tests sandbox-safe or keep escalation as the expected verification path.
  - Expected behavior: either the suite avoids local bind restrictions, or the runbook explicitly records the required escalation.
  - Evidence target: one repeatable test path that does not produce false-negative `EACCES` regressions.

## Not Needed Right Now

- MCP discovery and representative tool call are green on the built stdio server.
- CLI, TUI, strategy, config, and no-spend gateway contracts are green in the current pass.
- The old Polymarket `buy` crash shape is no longer the active top issue; the remaining boundary is real-money verification, not raw SDK failure.

## Suggested Next Pass

1. Implement exchange-aware VN ticker mapping for `VRE`.
2. Only with explicit user approval, run a tiny live Polymarket order to move Gateway confidence past the no-spend ceiling.
