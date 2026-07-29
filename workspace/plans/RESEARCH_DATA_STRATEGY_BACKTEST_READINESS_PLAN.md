# Research Data, Strategy, and Cross-Market Backtest Readiness Plan

Status: deferred roadmap; no ingestion, provider polling, paper cycle, or live action is authorized by this document.

## Objective

Make the repository able to produce reproducible, comparable, paper-safe research results across the configured
OHLC markets and Polymarket betting markets, with explicit data-readiness and strategy-configuration verdicts.

The target output is not an automatic live-trading approval. It is a trustworthy research and fake-money paper
testing gate that can say whether a strategy is eligible for comparison, paper exercise, or neither.

## In scope

- Configured OHLC universe: equities, indices, commodities, FX, and crypto, at each explicitly supported timeframe.
- Normalized Polymarket resolved-market, CLOB price-history, feature, and optional order-book-lite inputs.
- Versioned strategy configurations: universe, timeframe, entry/exit rules, sizing, fees, slippage, liquidity limits,
  holding period, resolution handling, and risk limits.
- A common relative-backtest contract for OHLC and betting markets, with market-specific adapters where semantics
  differ.
- Point-in-time validation, provenance, coverage/freshness, missing-data classification, and degraded-data denial.
- Historical replay followed by bounded fake-money/paper exercise; no real order submission.

## Out of scope

- Real-capital trading or betting, live order placement, credential activation, or public exposure.
- Treating Polymarket probabilities as OHLC prices or forcing identical indicators onto both market types.
- Claiming profitability from backtest output alone.
- Bulk archive deletion, destructive migration, provider/schema changes, or enabling continuous writers.
- Broad readability refactoring or dependency upgrades unrelated to this readiness gate.

## Current evidence and gaps

- OHLC daily cache integrity has recent source evidence of 92/92 required instruments and DCS 1.0, but this is not
  host, recovery, soak, or continuing-freshness proof.
- Native and derived intraday data have separate provider-depth, session-gap, corporate-action, memory, and cadence
  constraints; synthetic lower-timeframe bars must remain excluded from trusted research.
- The combined research engine is intentionally fail-closed and remains `research_only:true` and
  `decision_ready:false` while macro release/vintage/`available_at` metadata and scoped cache wiring are incomplete.
- Polymarket archive-first replay exists for resolved markets and CLOB curves; order-book-lite is optional and
  candidate-window scoped, so liquidity and impact coverage is not yet equivalent to a full order-book archive.
- Existing private paper plans require one canonical ledger, truthful freshness, restart continuity, and a sustained
  paper gate; those operational gates remain separate from historical backtest quality.

## Ranked batches

### Batch 1 — Data-readiness contract and inventory

Inventory every configured OHLC symbol/timeframe and every Polymarket archive partition. Emit a machine-readable
readiness record containing source identity, coverage start/end, availability timestamp, timezone/session rules,
provenance, gaps, duplicate counts, synthetic/derived markers, and explicit denial reasons.

### Batch 2 — Point-in-time and market-semantic gates

Require release/vintage/`available_at` metadata for macro inputs; preserve fail-closed behavior when absent. Add
market-specific rules for OHLC sessions/corporate actions and Polymarket market open/close/resolution, token identity,
invalid/ended markets, and probability/price interpretation.

### Batch 3 — Strategy configuration registry

Define versioned, immutable configurations with canonical names, parameter schemas, allowed market families,
timeframes, data-readiness requirements, cost model, sizing/risk limits, and paper eligibility. Reject unknown,
ambiguous, out-of-range, or cross-market-incompatible configurations before a run starts.

### Batch 4 — Comparable historical replay

Use a shared result envelope but preserve market-specific metrics. Report gross/net return, costs, slippage/impact,
drawdown, turnover, exposure, hit rate, calibration where meaningful, sample count, unresolved/filtered markets,
data-denial reasons, and provenance. Never hide a fallback or compare unsupported metrics as if equivalent.

### Batch 5 — Cross-market relative evaluation

Compare strategies only after normalizing evaluation windows, capital/risk budget, cost assumptions, and selection
rules. Include out-of-sample and walk-forward splits, sensitivity to fees/slippage, survivorship/selection-bias notes,
and a clear distinction between OHLC returns and Polymarket probability/P&L/resolution outcomes.

### Batch 6 — Fake-money paper gate

Run approved configurations against a canonical paper ledger with no submit client or live credentials. Prove restart
continuity, reconciliation, stale-data denial, duplicate prevention, resolution settlement, exposure caps, and
truthful degraded status. Keep the existing private-paper duration and threshold review as a separate approval gate.

### Batch 7 — Broker-connected paper deployment

After the local replay and fake-money gates pass, qualify a bounded unattended paper deployment that can run for
hours and return structured results.

- **OHLC brokers:** qualify the Alpaca paper endpoint separately from local simulation; map every quote, account,
  position, and order-intent seam, and prove that paper credentials cannot reach a live endpoint.
- **Polymarket:** keep the default paper path as a local virtual-fill ledger. Do not describe it as broker paper
  trading unless a distinct provider-supported paper environment is identified and separately verified.
- Run only approved strategies/configurations with explicit paper mode, kill switch, exposure caps, cycle deadlines,
  stale-data denial, bounded retries, and no live execution credentials.
- Publish per-cycle JSON results containing timestamp, strategy/config version, source/readiness verdict, decisions,
  simulated or paper fills, positions, P&L, drawdown, rejected actions, errors, and heartbeat/last-success state.
- Prove unattended operation for a bounded multi-hour run first, then complete the longer infrastructure and paper
  gates in `PRIVATE_PAPER_V1_PRODUCTION_PLAN.md` before calling the deployment persistent or reliable.

### Batch 8 — Bot and portfolio monitoring

Add one monitoring surface for unattended paper runs and wire it into the existing main status path.
The decision-complete implementation specification is
`workspace/plans/BOT_MONITORING_MASS_IMPLEMENT_PLAN.md`.

- **Bash role:** provide a readable, non-authoritative supervisor/health command that checks process existence,
  PID/start time, heartbeat age, exit code, log/result-file growth, disk space, and last successful cycle. It may
  restart only under an explicitly approved paper profile and must report restart count and reason.
- **Node/domain role:** remain the owner of bot state, broker connectivity, positions, virtual/paper portfolio,
  fills, P&L, exposure, drawdown, stale-data state, and reconciliation. Bash must not parse or recreate trading
  semantics from ad-hoc log text.
- **Canonical projection:** publish a bounded, sanitized heartbeat/status record through the existing authenticated
  service-health path. Extend the current main dashboard/CLI status view rather than creating a second dashboard or
  competing portfolio owner.
- **Minimum status fields:** bot mode and strategy version, uptime/start time, last cycle start/end, last success,
  next expected cycle, cycle latency, current state, position count and summarized positions, virtual/paper equity,
  realized/unrealized P&L, exposure, drawdown, broker/provider connectivity, data-readiness verdict, error code,
  heartbeat age, and last result location or identifier.
- **Alert states:** healthy, running, delayed, stale, degraded, stopped, failed, reconciliation-required, and
  blocked. State transitions must be explicit and distinguish missing, expired, malformed, and provider-error data.
- **Safety:** never expose private keys, PINs, account tokens, raw broker payloads, or unsanitized nested errors;
  keep the endpoint private/authenticated and keep public health limited to non-sensitive liveness if needed.
- **Locked choices:** support bounded paper-only auto-restart, expose all Bash/CLI/API/dashboard surfaces, and send
  sanitized webhook alerts to the environment-selected generic, Discord, or Slack destination.

## Acceptance criteria

- Every backtest result identifies the exact strategy version, data snapshot/commit, market universe, timeframe,
  cost model, and readiness verdict.
- A missing required PIT field, stale required input, malformed record, synthetic forbidden bar, unresolved identity,
  or incomplete Polymarket lifecycle causes a visible denial or exclusion with a machine-readable reason.
- OHLC and Polymarket runs share reproducible orchestration and result schemas but retain semantically correct,
  market-specific calculations.
- Re-running the same frozen inputs and configuration produces equivalent results and identical denial classifications.
- Relative comparisons include at least in-sample, out-of-sample, walk-forward, and cost-sensitivity views; no single
  headline return is sufficient for paper eligibility.
- Paper mode cannot reach provider order submission, live credentials, public binds, or real-capital ledgers.
- No result is labelled `decision_ready` until the data, strategy, replay, and paper gates are independently green.
- An hours-long run is successful only if every scheduled cycle has a structured outcome or an explicit, surfaced
  failure; silent stalls, duplicate fills, ledger divergence, stale inputs, and restart-induced state loss fail the gate.
- Broker-connected paper proof must identify the exact provider endpoint and credentials class; local Polymarket
  virtual fills must remain visibly distinct from provider paper execution.
- Monitoring must identify a silent/stalled bot within a bounded heartbeat age, show the last known portfolio truth,
  and visibly mark stale or reconciliation-required state rather than presenting old positions as current.
- The main dashboard/CLI and the monitoring command must agree on snapshot identity, counters, mode, and status;
  no independent Bash-derived portfolio or position totals are accepted as authoritative.

## Verification

- Focused contract tests for inventory, PIT selection, identity, lifecycle, strategy schemas, cost models, and result
  provenance.
- Fixture replay tests for representative equities, FX, crypto, index/commodity OHLC, resolved Polymarket, unresolved
  Polymarket, missing-data, stale-data, synthetic-bar, and malformed-input cases.
- Deterministic repeat-run comparison over frozen fixtures and a small cross-market matrix.
- Adversarial tests proving unexpected eligibility, hidden fallback, state loss, duplicate fills, or live-submit access
  turns the runner red.
- A bounded multi-hour unattended smoke on the qualified paper host, followed by restart and resume, provider/error
  injection, ledger reconciliation, and result-file inspection.
- Bash syntax/help/diagnostic tests; heartbeat expiry/malformed-record tests; dashboard/CLI/API parity tests; and
  a supervisor test proving stalled, exited, duplicate, and restarted bot states are surfaced correctly.
- Broad Node, native, hygiene, secret, and diff gates after implementation; fresh-install, host, recovery, and soak
  evidence remain separately labelled.

## Safety constraints

- Preserve the current dirty worktree and do not mix this roadmap with unrelated implementation batches.
- Keep provider polling, canonical-data writes, continuous daemons, bot cycles, orders, public exposure, and live
  enablement disabled until a separately approved execution step.
- Keep generated archives and paper ledgers local/ignored unless repository documentation explicitly promotes fixtures.
- Do not weaken PIT, freshness, provenance, liquidity, or paper safety gates to manufacture an eligible comparison.

## Handoff

After the approved private host identity/qualification boundary is resolved, begin with Batch 1 preflight only:
map current OHLC and Polymarket sources, owners, tests, and generated-state boundaries before writing production code.
