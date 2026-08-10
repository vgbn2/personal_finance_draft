# Polymarket Bot Cycle

> **Status:** Implemented source exists; **not qualified and live execution is blocked** by unresolved bot-state, live-authorization, and order-semantics findings.
> **Audience:** maintainers reviewing bot-cycle safety and convergence work.
> **Canonical owner:** `backend/gateway/src/cycle.ts`.
> **Review triggers:** live-mode resolution, authorization, risk approval, order type, bot-state persistence, paper-ledger convergence, quote source, position lifecycle, external API boundary.

## Purpose And Non-Authority

`backend/gateway/src/cycle.ts` orchestrates a Polymarket bot pass: it can inspect configured state, obtain candidate bets, review tracked positions, select possible entries, and persist cycle state. It is not a release-ready execution engine.

This page records the current source contract and known blockers. It does not authorize a bot cycle, provider/account request, paper action, or live order. Do not treat a dry-run result, an action label, or a passing unit test as operational readiness.

The architecture-level paper-ledger boundary is described in [Architecture Overview](../../../engineering/architecture_overview.md). That ledger is authoritative for internal paper events; this older bot cycle still maintains a separate `bot_state.json` projection and has not converged to the ledger.

## Entry Points And Modes

The module exports:

- `runBotHealth()` for configuration, endpoint, balance, and local-state checks;
- `runCycle(args, options)` for one pass;
- `runForceSell(positionId, args, options)` for a targeted close request;
- `runBotLoop(args, options)` for repeated passes;
- testable helpers for exit decisions, observable prices, FOK authorization, and interval parsing.

`live` is inferred from `LIVE_TRADING=true` or `--live`. Before the cycle acquires the local lock or loads bot state, it calls `liveBotAuthorizationError()` and rejects a live request unless runtime policy allows it. A live cycle also requires an injected `authorizeOrder` callback; `submitRiskApprovedFokOrder()` refuses to create or post an order without an approved decision.

The intended non-live mode avoids creating a credentialed CLOB client for balance or quote reads. It can still call external candidate/market helpers during a real run, so “dry-run” is not equivalent to offline simulation. This documentation pass did not invoke any of those paths.

## Cycle Shape

After authorization and credential checks, `runCycle()` takes a local ownership lock and loads bot state. The lock is released in `finally`.

1. **Balance:** live mode may initialize a credentialed CLOB client and read collateral; non-live mode records that credentialed initialization was skipped.
2. **Candidate input:** fetches AI bets and indexes them by market slug. Fetch failure becomes a reported error rather than an exception escaping the cycle.
3. **Position review:** resolves an observable price, determines an exit reason (resolved, target, stop loss, AI reversal, or time decay), and either submits a risk-approved sell in live mode or removes the state position in non-live mode.
4. **Entry scan:** only occurs when local config enables the bot and capacity remains. It computes YES/NO edge, filters by threshold, resolves market/token information, applies active/negative-risk/deadline guards, then records a would-buy item.
5. **Fill/state:** a live matched order is logged and state is updated; non-live mode marks a synthetic fill and updates local state. The cycle stores at most 50 recent result summaries.

`runBotLoop()` repeats `runCycle()` using a positive `--interval` value. It catches per-pass errors and schedules the next pass. It is a persistent runtime action and outside this documentation loop’s permitted execution scope.

## Current Safety Boundaries

- Live cycle and force-sell paths require an execution-capable runtime-policy decision and a pre-trade authorizer before `createOrder()` or `postOrder()`.
- `submitRiskApprovedFokOrder()` invokes the injected authorizer before signing or posting.
- Missing L2 credentials stop live execution before account/client work.
- The source uses an ownership lock so concurrent cycle calls fail with an explicit error instead of entering parallel state mutation.
- Position exit logic refuses an invalid, zero, or missing observable price.
- FOK unmatched responses are reported as errors and include a defensive cancellation attempt when an order identifier is available.

These are source-level controls, not evidence that the complete live path is safe. The checklist below is authoritative when reading this module.

## Open Blockers — Do Not Downgrade

The following reviewed findings remain open and block any live-readiness interpretation:

1. **Paper-state convergence (P0):** non-live `bot cycle` mutates `storage/data/cache/bot_state.json` instead of projecting the canonical paper ledger. A position can be removed from this state without a corresponding canonical ledger close. Convergence, replay/projection parity, and restart behavior remain required.
2. **Non-live quote/exit integrity (P1):** non-live mode intentionally avoids a credentialed CLOB client, yet exit decisions need a valid observable price. The module now skips when no usable price resolves, but an injectable credential-free quote source and regression proof against unpriced aged-position removal remain required.
3. **Live authorization/risk coverage (P0/P1):** authorization must be consistent for every environment-driven and explicit live invocation, including force-sell. Every submit must retain canonical runtime, feature, PIN/CLI-authorization, and equivalent pre-trade risk guarantees.
4. **FOK order semantics (high):** live order behavior must be verified against the actual SDK/order-type contract so unmatched orders cannot rest and create duplicate-sell exposure on retry.
5. **External dependency behavior:** Truth Machine, Gamma, CLOB, and account endpoints are external boundaries. Local mocks and source tests do not prove their production availability, semantics, rate limits, or reconciliation behavior.

Do not “fix” any of these gaps by suppressing errors, accepting zero prices, weakening authorization, or treating `bot_state.json` as a ledger.

## Evidence And Limits

Representative focused tests:

- `tests/scripts/integration/polymarket/polymarket_bot_risk.test.js` covers fail-closed live credentials/authorization and injected risk decisions.
- `tests/scripts/integration/polymarket/polymarket_preflight.test.js` covers gateway-level live-bot authorization boundaries.
- `tests/scripts/architecture/settings/settings_runtime_contract.test.js` covers feature-flag and noninteractive/PIN policy gates.
- `tests/scripts/architecture/auth/access_policy.test.js` covers execution authority before a child process is spawned.

These tests establish selected source contracts. They do not run a bot loop, perform an external API request, submit paper/live orders, prove account state, qualify a host, or close the listed blockers.

## Change Checklist

1. Resolve paper-cycle ownership before adding capabilities: make the canonical paper ledger authoritative and test replay/projection parity.
2. Keep dry-run/non-live mode credential-free while supplying a testable, trustworthy observable-price policy.
3. Resolve live mode once and apply the same explicit authorization/risk decision to cycle, loop, and force-sell.
4. Verify FOK/FAK behavior against the exact SDK before relying on unmatched-order handling.
5. Add isolated negative tests for environment-only live requests, zero/unavailable quote exits, duplicate submits, and stale lock recovery.
6. Treat external endpoint and account behavior as separate provider/operational qualification, never as source-test evidence.
