# Quant backtest and exploration triage

Audit started: 2026-11-09T16:15:02Z. Mode: triage / Fast Reading.
Scope: native strategy dispatch, family selection, deployment ledger preservation.
Evidence: current local source and local runtime; no fresh CT 114 verification.

Tracking: [QB-01 #92](https://github.com/vgbn2/personal_finance_draft/issues/92), [QB-02 #93](https://github.com/vgbn2/personal_finance_draft/issues/93), [QB-03 #94](https://github.com/vgbn2/personal_finance_draft/issues/94).
Runnable evidence: `node tools/dev/quant_backtest_probes.cjs` (repository root; requires native build and local AAPL 1h data; current exit 1 with all three contracts failing).

## Confirmed findings

### QB-01 — HIGH: native exploration ignores selected model and strategy rules

- Boundary/owner: `shared/lib/strategy/backtest.js:1003-1019`, native CLI serialization.
- Caller: `shared/lib/strategy/interval_discovery.js:768-781` supplies model/name but not entry/exit predicates or stop/take-profit rules.
- Callee: `backend/cpp_core/src/backtest/backtester.cpp:121-148` uses its built-in momentum/RSI/MACD signal and fixed holding-period exit.
- Probe: call real `runBacktest` twice with AAPL, 1h, threshold 0.6, horizon 5, costBps 5, monteCarloRuns 0, engine cpp_native; change only model from momentum_baseline_v0 to knn_pattern_v0.
- Observed: both report sovereign_cpp_core, 2030 trades, identical metrics. Assertion expecting different metrics exits 1. Source confirms neither model nor strategy rules are serialized.
- Impact: native results cannot validate the generated hypothesis; checksumming a spec does not prove execution of that spec.
- Clear gate: execute the selected supported strategy semantics, reject unsupported specifications, and demonstrate different trade decisions on a deliberately distinguishing fixture. Verify stop/take-profit and holding units separately.
- Attribution: our_source; stub involvement none; high confidence. Native execution succeeded, excluding network/provider failure as the cause.

### QB-02 — HIGH: source sync replaces remote research history

- Boundary/owner: `tools/operational/sync_local_deploy.sh:80-100,148-149` archive exclusions and extraction.
- Probe: use the script's actual exclusion list with tar creation/extraction in an isolated temporary directory. Local ledger contains one distinct record; remote ledger contains two distinct records.
- Observed: after extraction the remote ledger contains only the local record. Preservation assertion exits 1.
- Impact: source deployment can overwrite `workspace/RESEARCH_LEDGER.jsonl`; append-only checks within the harness do not protect against external replacement.
- Clear gate: exclude runtime-owned ledger/candidate state from source deployment; prove remote records survive source sync and audit other runtime paths before deployment.
- Attribution: our_source; stub involvement none; high confidence. Real tar behavior reproduced locally; this pass did not establish the extent of historical remote loss.

### QB-03 — HIGH: family flag silently chooses an unrelated archetype

- Boundary/owner: `tools/agent/quant_research_harness.js:91-92` aliases --family to --archetype; `shared/lib/strategy/interval_discovery.js:505-507` randomly falls back when no archetype key matches.
- Probe: load the real CLI parser with an in-memory additional export, parse --family mean_reversion, pass the resulting archetype to real generateCandidateSpec. Fix Math.random to 0 solely to reproduce the existing random branch deterministically.
- Observed: requested mean_reversion, forwarded archetype mean_reversion, actual family momentum, actual archetype ema_macd_trend. Family equality assertion exits 1.
- Clear gate: family selection filters eligible archetypes, unknown families fail explicitly, and the real CLI reports only the requested family across repeated cycles.
- Attribution: our_source; stub involvement silent_fallback; high confidence. No AI or provider call participates.

## Corrections to earlier session claims

- `isTradeable()` exists only as a new, uncommitted helper in `backend/cpp_core/src/assets/instrument_type.hpp:49`; current source search found no callers. It is not an enforced gate.
- Instrument types and sidecar family labels exist. Labels do not prove native backtests enforce eligibility; native loading skips empty bar sets, not all non-tradeable types.
- A successful native build is not evidence that CTest ran. The earlier statement “34/34 CTests pass” was unsupported by that build output.
- The prior all-symbol versus three-equity comparison changed strategies and universes; it does not establish why drawdown changed.
- `trades` in the runtime probe is a numeric count, not the complete trade list. Identical metrics plus verified omitted arguments establish QB-01; no trade-by-trade comparison is claimed.

## Remaining audit queue (not verified in this pass)

1. Data eligibility: authoritative instrument identity, auxiliary/OHLC distinction, aliases, missing/empty categories, prediction contracts, exact evaluated-versus-requested coverage.
2. Execution timing: close-derived signals versus executable next-bar fills, stop/take-profit ordering, gap fills, days-versus-bars horizons.
3. Portfolio accounting: overlapping exposure, cash reservation, mark-to-market drawdown, FX/contract multipliers, financing, fees and slippage per asset class.
4. Statistical validation: untouched holdout, walk-forward leakage/purge, selection bias from repeated trials, Sharpe annualization across sessions/timeframes.
5. Promotion/provenance: strict engine identity, fallback rejection, dataset/config fingerprints, concurrent staging, identical tested and published strategy behavior.
6. Exploration quality: duplicate hypotheses and parameter novelty; token accounting for failures/retries as well as successful generations.

## Verification and next action

Three local probes produced the expected failing assertions (exit 1). They exercised the real native engine, actual family-generation logic, and real tar operations. No production repair or deployment was performed in this audit. The pre-existing uncommitted C++ helper is preserved.

Prioritize ledger preservation and native strategy fidelity before treating further AI-generated candidates as validated research. Then implement true family filtering and run the remaining audit queue.
