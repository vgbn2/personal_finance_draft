# Canonical Domain Sections

Domain sections explain one source-owned capability across its entrypoint, implementation, evidence, and failure boundaries. They complement module pages and Code Atlas records without replacing either.

## Interface

- [Terminal dashboard](interface/terminal-dashboard/README.md) — Ink viewport policy, input/navigation state, command resolution, execution modes, and safety gates.

## Execution Boundaries

- [Polymarket bot cycle](execution/polymarket-bot-cycle/README.md) — current dry-run/live split, state and order boundaries, and explicit unresolved execution blockers.

## Data Boundaries

- [Polymarket history archive](data/polymarket-history-archive/README.md) — local archive readers, normalization, and explicit provider/write backfill boundaries.

## Research

- [RSI reversal analysis](research/rsi-reversal-analysis/README.md) — local RSI/ATR event analysis, Bayesian estimates, trust tiers, and OOS-gated research signals.
- [Correlation analysis](research/correlation-analysis/README.md) — local snapshot selection, alignment preflight, native matrix execution, and correlation provenance.
- [Backtest execution](research/backtest-execution/README.md) — CLI orchestration, feature-frame splits, JavaScript/native dispatch, metrics, and degraded-mode evidence.

Each section must declare its owners and review triggers in `docs/documentation_manifest.json`. Historical session evidence stays in `workspace/`; tutorials stay in `docs/codebase_tour/`.
