# Alpaca Paper Authentication and Monitor Heartbeat Fix Plan

Date: 2026-07-30
Status: proposed; planning only
Decision: GO WITH DIAGNOSTIC GATES

## Objective

Make the deployed portfolio monitor either:

1. connect to the intended Alpaca Paper account with the current fresh credential pair; or
2. prove, with redacted evidence, the first failing boundary and its repair owner without weakening or hiding
   the failure.

Separately, make `portfolio_monitor` heartbeat `last_attempt_at` advance on every completed polling attempt
while preserving non-attempt publications, failure history, risk thresholds, and non-live controls.

## User clarification incorporated

The Alpaca keys were generated recently. Do not rotate them again as the first action. Key age/revocation is
now a weaker candidate than account-scope mismatch, pair mismatch, environment formatting, provider account
state, host transport, or SDK-path behavior. Rotation remains a later discriminating action only if the
current pair fails a direct read-only Paper-account probe.

## Current evidence

- `vgbn-servers` runs `portfolio-monitor` from exact image `65df1d1d` with zero restarts.
- Recent monitor cycles use combined risk scope and identify `Alpaca (Paper)` correctly.
- Central and monitor projections contain only the explicit `ALPACA_PAPER_*` pair and Paper base URL; value
  fingerprints match without exposing values.
- The runtime reaches the real `AlpacaAdapter`, constructs the official SDK with `paper: true`, disables
  missing-credential simulation for aggregate portfolio reads, and calls `getAccount()` plus `getPositions()`.
- Installed gateway dependency evidence is `@alpacahq/alpaca-trade-api@3.1.3`.
- Provider acceptance is the first failed authentication layer, normalized as `authentication_failed`.
- The current evidence does not distinguish a rejected credential/account from an SDK-specific request defect.
- The monitor status advances each minute, but the service heartbeat preserves an old `last_attempt_at` while
  `attempt_count` rises. The shared writer keeps the prior timestamp unless a caller supplies a new one, and
  the portfolio monitor supplies only the attempted boolean.

## Fault-domain matrix

| Finding | Current fault domain | Repair owner | Causal status | Stub involvement | Confidence | Discriminating check |
| --- | --- | --- | --- | --- | --- | --- |
| Alpaca Paper authentication failure | `unresolved` between `operator_config_or_credentials`, `our_source`, and provider account state | Operator workflow or Alpaca adapter, depending on probe result | Provider rejection is proved; exact mechanism is not | `adapter_not_stub` | Medium | Compare a raw authenticated Paper `/v2/account` read with the existing SDK account read using the same projected environment |
| Stale heartbeat `last_attempt_at` | `our_source` | `shared/lib/runtime/service_heartbeat.js` and portfolio-monitor publication caller | Proved timestamp-preservation/caller contract defect | `none` | High | Multi-publication unit test with explicit attempted and non-attempted events |

The BTC position-notional breach is not a software defect. It remains a separate operator risk decision and
must not be cleared by changing the 25,000 threshold in this work.

## Architecture map

Alpaca account-read path:

`portfolio-monitor CLI -> backend_bridge -> gateway aggregate_portfolio -> alpaca_portfolio_scope ->
AlpacaAdapter -> resolveAlpacaSettings -> official Alpaca SDK -> Alpaca Paper account API`

Credential projection path:

`.env.central -> environment manifest -> owner-only portfolio-monitor.env -> Compose service -> gateway child`

Heartbeat path:

`portfolio-monitor publishStatus -> writeServiceHeartbeat -> service heartbeat JSON -> API/dashboard clients`

## In scope

- Redacted credential-shape and projection validation without printing or persisting secret values.
- One repository-owned, read-only Alpaca authentication diagnostic that compares raw HTTPS and current SDK
  account reads using the same Paper environment.
- Fault-domain branching based on raw-versus-SDK results.
- The narrowest source repair justified by that result.
- Heartbeat attempt-time semantics and focused regressions.
- Monitor-only exact-image deployment, rollback, and post-cutover observation if a source or environment repair
  is required and separately authorized.

## Out of scope

- Alpaca Live credentials or Live-account probing.
- Orders, cancellation, position mutation, paper-bot cycles, strategy changes, or execution authorization.
- BTC threshold changes or automatic position reduction.
- Broad Alpaca dependency upgrades. The existing v3-to-v4 compatibility batch is NO-GO until exact package/API
  mapping is available.
- Installation of an external Alpaca CLI as a runtime dependency.
- Rebuilding or recreating `web`, `backfill`, `host-health`, or `host-backup`.
- Public exposure, new bindings, deployment timers, or unrelated dependency remediation.

## Ranked batches

Use:

`proposed -> preflight -> GO | GO WITH FIXES | NO-GO -> implemented -> verified -> reviewed -> closed | deferred`

Do not start a later batch until the active batch is closed or explicitly deferred.

### ALP-A0 — Non-provider preflight and evidence freeze

1. Record current monitor image, container ID, restart count, cycle, scope, safety flags, status timestamp, and
   unchanged BTC threshold.
2. Validate only redacted credential properties in the central environment, monitor projection, and container:
   canonical variable names, non-empty presence, pair fingerprint equality, Paper endpoint class, byte length,
   and absence of leading/trailing whitespace, CR/LF, surrounding quotes, or legacy/Live aliases.
3. Confirm the current container actually consumes the intended owner-only projection and that no parent
   environment overrides the scoped Paper names.
4. Record host clock synchronization plus DNS/TLS reachability classifications without treating reachability
   as authentication success.
5. Preserve the current service projection and exact monitor image reference as rollback inputs.

GO condition: the current pair reaches the exact Paper runtime path with no formatting, projection, override,
or endpoint ambiguity. Any failed local layer routes to ALP-A2 without a provider probe.

### ALP-A1 — Raw-versus-SDK read-only authentication isolation

Implementation first:

1. Add a repository-owned diagnostic owner rather than an ad hoc shell command or external CLI.
2. Use the resolved Paper base URL and the current `ALPACA_PAPER_*` pair.
3. Perform only:
   - raw HTTPS `GET /v2/account` with standard Alpaca authentication headers; and
   - the existing SDK `getAccount()` call with `paper: true`.
4. Return structured redacted JSON containing scope, endpoint class, attempted time, path kind
   (`raw_http`/`sdk`), outcome (`accepted`, `rejected`, `unavailable`, `rate_limited`, `inconclusive`), HTTP class
   where safely available, latency, and normalized error code.
5. Never return headers, key prefixes, secret lengths, account identifiers, balances, raw bodies, SDK error
   objects, stack traces, or unrestricted response text.
6. Unit-test both paths with controlled local fakes before any external call.

Runtime gate: a real probe is external provider polling. Run it only after explicit user authorization under
the repository restricted-delegation boundary. It must be read-only, Paper-only, bounded by timeout, and
produce structured redacted evidence.

### ALP-A2 — Branch on the diagnostic result

| Raw HTTPS | SDK | Attribution | Required action |
| --- | --- | --- | --- |
| Accepted | Accepted | `our_host_or_deployment` or stale monitor state | Trace gateway child environment/status publication; recreate only the monitor after source identity is proved |
| Accepted | Rejected | `our_source` | Repair current SDK construction/account-read handling; do not upgrade dependencies without the deferred compatibility map |
| Rejected | Rejected | `operator_config_or_credentials` or provider account state | Verify the key pair was created under the Paper trading environment and belongs to the same account; only then generate one replacement pair and rerun |
| Unavailable/rate-limited | Same | `our_host_or_deployment` or `external_provider` remains unresolved | Resolve DNS/TLS/time/rate-limit/provider availability before touching credentials |
| Rejected | Accepted | Diagnostic defect | Fix the raw diagnostic; do not change production adapter |
| Any divergent/inconclusive result | Any | `unresolved` | Preserve failure and run the first missing discriminating check; do not manufacture healthy status |

If a newly generated replacement pair also fails raw and SDK reads, preserve the redacted evidence and route
the issue to Alpaca account/provider support. Do not continue changing repository code without contrary
evidence.

### ALP-A3 — Narrow source or environment repair

Select exactly one branch:

- **Formatting/projection defect:** fail closed on malformed scoped values, repair the environment preparer or
  projection owner, and regenerate only `portfolio-monitor.env`.
- **SDK-path defect:** keep `@alpacahq/alpaca-trade-api@3.1.3` unless exact upgrade evidence is supplied; repair
  the constructor/account-read path or use one canonical bounded raw account-read adapter only when raw success
  proves it necessary. Cover both account and positions reads.
- **Stale monitor/runtime defect:** rebuild an exact labeled image and recreate only `portfolio-monitor`.
- **Credential/account/provider defect:** make no production-source change. Complete the operator/provider
  handoff and retain truthful degraded status.

Every branch requires adversarial tests showing Paper and Live credentials cannot cross scopes and missing or
rejected credentials cannot silently produce an empty healthy portfolio.

### HB-A1 — Heartbeat attempt-time repair

1. Define shared semantics:
   - explicit valid `last_attempt_at` wins;
   - `attempted: false` preserves the previous attempt time and does not increment `attempt_count`;
   - a completed publication with `attempted: true` advances `last_attempt_at` to publication time and increments
     `attempt_count`;
   - omitted `attempted` retains the existing shared-writer default only after all callers are inventoried.
2. Make the portfolio monitor publish `attempted: false` for the pre-attempt `polling` state and
   `attempted: true` for the completed assessment.
3. Add multi-cycle regressions proving:
   - two completed failed attempts produce two increasing attempt times and counts;
   - a polling or stopped publication does not move the attempt time;
   - `last_success_at` remains null across failures and advances only on success;
   - atomic write failure leaves the prior heartbeat intact.
4. Do not change broker/risk status precedence or convert the real BTC breach into service health.

### DEP-A1 — Exact monitor-only cutover

Run only if ALP-A3 or HB-A1 changes production behavior and deployment is separately authorized:

1. Run focused tests, gateway TypeScript, environment/Compose contracts, hygiene, secrets, and diff integrity.
2. Review and commit the complete bounded batch; produce exact committed-archive evidence.
3. Synchronize the exact revision to `vgbn-servers` without exposing credential values.
4. Back up the owner-only monitor projection with mode 0600 and retain the current `65df1d1d` image as rollback.
5. Build a provenance-labeled image and recreate only `portfolio-monitor`.
6. Observe at least three completed cycles and verify container identity, zero restarts, heartbeat progression,
   Alpaca classification, combined risk scope, unchanged thresholds, and non-live flags.
7. Roll back only the monitor image and projection if any invariant fails; leave shared storage intact.

## Acceptance criteria

1. The raw and SDK Paper-account paths have separate structured outcomes from the same projected environment.
2. No secret, key prefix, account identifier, balance, raw provider body, or credential-bearing command appears
   in logs, process arguments, evidence, tests, or tracked files.
3. The Alpaca failure is assigned to a proved repair domain or remains explicitly unresolved with one named
   discriminating check.
4. If our source is responsible, the selected repair makes both authorized read-only paths accept the same
   Paper account and keeps missing/rejected credentials fail-closed.
5. If account/provider state is responsible, repository source remains unchanged apart from the diagnostic and
   truthful reporting contract.
6. `portfolio_monitor.last_attempt_at` advances on every completed attempt, remains unchanged for
   `attempted:false`, and agrees with attempt-count progression.
7. The deployed monitor, if cut over, runs the exact reviewed image with zero restarts for at least three cycles.
8. `PORTFOLIO_MONITOR_SCOPE=both`, `PORTFOLIO_MONITOR_ALPACA_SCOPE=paper`, BTC
   `max_position_notional=25000`, `LIVE_TRADING=false`, and `SOVEREIGN_EXECUTION_AUTHORIZED=false` remain
   unchanged.
9. No order, cancel, position mutation, bot cycle, public bind, or additional service recreation occurs.

## Verification

Focused source gates:

```bash
node --test tests/scripts/integration/trading/alpaca_env_scope.test.js
node --test tests/scripts/operational/portfolio_monitor.test.js
node --test tests/scripts/operational/service_heartbeat.test.js
node --test tests/scripts/operational/prepare_central_env.test.js
node --test tests/scripts/architecture/cli/core/environment_manifest.test.js
node node_modules/typescript/bin/tsc -p backend/gateway/tsconfig.json --noEmit
npm run test:secrets
npm run hygiene
git diff --check
```

Add diagnostic tests with controlled local HTTP/SDK fakes and include them in the focused gate. Run the broad
host-capable Node suite and committed-archive verifier before deployment. Provider evidence, host deployment,
restart/rollback, and soak remain separate gates from source tests.

## Safety constraints

- Planning and source implementation do not authorize a provider probe.
- A Paper `/v2/account` read requires explicit external-polling authorization and restricted structured output.
- Never place credentials in command arguments, shell history, temporary transfer files, test fixtures, or logs.
- Never weaken risk thresholds or hide broker unavailability to obtain a green monitor.
- Preserve the current dirty worktree and all unrelated changes.
- Keep the central host private, Paper-only for Alpaca account reads, and execution-disabled.

## Implementation handoff

First action: route ALP-A0 and the source-only portion of ALP-A1 through one bounded `codex` batch. Implement
and test the redacted diagnostic without calling Alpaca. Then request explicit authorization for one Paper-only
read probe. Run HB-A1 independently so the heartbeat repair can close even if Alpaca provider evidence remains
unavailable.
