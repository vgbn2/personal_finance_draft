# Bot Monitoring Mass-Implementation Plan

Date: 2026-07-28
Status: proposed; implementation and runtime actions are not authorized by this document
Difficulty: high
Complexity: cross-cutting runtime, state, API, CLI, dashboard, Compose, and environment contracts
Estimated change: 1,400-2,200 source/test/documentation LOC

## Objective

Deliver one private monitoring system for unattended paper bots that:

- detects uptime, delay, stalls, crashes, stale data, reconciliation failures, and risk breaches;
- shows canonical positions, portfolio, P&L, exposure, drawdown, cycle results, and host/service health;
- supports bounded paper-only automatic restart;
- exposes the same snapshot through Bash diagnostics, CLI, authenticated API, and the main dashboard;
- sends sanitized state-change alerts to an operator-selected webhook configured only through environment files.

This plan does not authorize provider polling, broker connections, paper-bot startup, webhook delivery, public
exposure, or live execution.

## Fixed product decisions

- Automatic restart is allowed only for the paper bot and is opt-in by environment.
- The operator experience covers all four surfaces: Bash, CLI, authenticated API, and dashboard.
- Webhook delivery is included. The destination and adapter type are selected through environment variables.
- Node remains authoritative for trading state, portfolio accounting, risk, and snapshot semantics.
- Bash owns child-process supervision and host-level diagnostics only.
- The existing service-heartbeat and portfolio-monitor contracts are extended, not replaced.
- The web service never receives the webhook URL or signing secret.

## Public interfaces

### Canonical monitor snapshot

Add schema `paper_monitor.v1` with:

- `snapshot_id`, `generated_at`, `overall_state`, and bounded `reason_codes`;
- runtime mode, strategy name/version/config digest, source revision, and paper/live safety verdict;
- bot instance, start time, uptime, PID/container identity, heartbeat age, restart counters, and supervisor state;
- last/next cycle, duration, structured outcome, success/failure counts, and last result identifier;
- data-readiness state and snapshot identity;
- broker/provider name, exact paper/simulation environment, connectivity state, checked time, and sanitized error code;
- paper portfolio equity/cash, realized and unrealized P&L, gross/net exposure, drawdown, position count, and bounded
  position summaries;
- risk limits, active breaches, kill-switch state, and reconciliation state;
- service/host summary including disk, memory, backup age, and dependent heartbeat states;
- webhook enabled/delivery state without URL, secret, headers, or raw response content.

States are `starting`, `healthy`, `running`, `delayed`, `stale`, `degraded`, `stopped`, `failed`,
`reconciliation_required`, and `blocked`. Missing, malformed, expired, and provider-error inputs remain distinct.

### Operator surfaces

- CLI: `paper-monitor [--once|--watch] [--interval-secs 30] [--json]`.
- API: authenticated read-only `GET /api/system/paper-monitor`, requiring `data.read`.
- Dashboard:
  - main Overview card for overall state, uptime, last cycle, portfolio equity/P&L, positions, and highest risk;
  - Bot panel for detailed cycles, positions, restart history, data/broker status, and paper-mode proof;
  - existing service-health panel remains the service/data-health owner and links to the detailed view.
- Bash supervisor: `paper_bot_supervisor.sh run|status|check`; `status` and `check` are read-only and JSON-capable.
- Local operator recovery: `paper_bot_supervisor.sh reset-restart-cap --confirm`; this action is unavailable through
  the API/dashboard and appends an audit event.

The four surfaces must consume the same canonical snapshot and agree on snapshot identity, counters, mode, and state.

### Environment contract

Add a dedicated `compose_bot_monitor` surface and `bot-monitor` Compose service under the `monitoring` profile.

Paper bot supervisor settings, available only to `compose_paper_bot`:

- `SOVEREIGN_PAPER_AUTO_RESTART=false`
- `SOVEREIGN_PAPER_RESTART_MAX=3`
- `SOVEREIGN_PAPER_RESTART_WINDOW_SECS=3600`
- `SOVEREIGN_PAPER_RESTART_BACKOFF_SECS=30,120,300`

Monitor settings, available only to `compose_bot_monitor`:

- `SOVEREIGN_PAPER_MONITOR_INTERVAL_SECS=30`
- `SOVEREIGN_MONITOR_EVENT_ROOT=/app/storage/logs/monitoring`
- `SOVEREIGN_MONITOR_WEBHOOK_URL` — secret, optional, never logged or projected elsewhere
- `SOVEREIGN_MONITOR_WEBHOOK_KIND=generic` — enum `generic|discord|slack`
- `SOVEREIGN_MONITOR_WEBHOOK_SECRET` — optional generic HMAC secret
- `SOVEREIGN_MONITOR_WEBHOOK_MIN_SEVERITY=warning` — enum `info|warning|critical`
- `SOVEREIGN_MONITOR_WEBHOOK_TIMEOUT_MS=5000`
- `SOVEREIGN_MONITOR_WEBHOOK_COOLDOWN_SECS=900`

No webhook variable is browser-exposed. The environment preparer writes it only to the owner-only bot-monitor
service file, and all diagnostics report names/presence rather than values.

## Ranked implementation batches

Use the lifecycle:

`proposed -> preflight -> GO | GO WITH FIXES | NO-GO -> implemented -> verified -> reviewed -> closed | deferred`

Do not begin the next batch until the active batch is closed or explicitly deferred.

### MON-0 — Ownership and contract preflight

- Revalidate heartbeat writers/readers, bot cycle state, canonical paper ledger, portfolio-risk monitor, API auth,
  dashboard panels, Compose profiles, and environment projection.
- Apply the `mass-implement` Duplicate And Stub Preflight across those owners, their callers, manifests, tests,
  compiled/distribution paths, and docs before creating another monitoring implementation.
- Resolve any remaining competing portfolio or bot-state owners before adding composition logic.
- Freeze `paper_monitor.v1`, state precedence, error codes, field bounds, and exact paper-mode proof.
- **GO condition:** one authoritative source exists for every field, and no monitor path can submit orders or mutate
  ledger/position state.

### MON-1 — Canonical snapshot and event journal

- Implement a bounded snapshot builder that composes service heartbeats, supervisor state, bot cycles, canonical paper
  ledger, portfolio-risk assessment, broker/data readiness, and host health.
- Publish atomically with mode `0600`; retain last-known data only with explicit age and degradation reasons.
- Append sanitized state transitions to daily JSONL segments. Do not log raw provider payloads, credentials, webhook
  URLs, full stack traces, or unrestricted position arrays.
- Use one event ID for retry/deduplication. Repeated identical state is not a new event.
- **Acceptance:** corrupt or partial inputs cannot produce healthy status, zero positions, or zero P&L as a fallback.

### MON-2 — Paper-only Bash supervisor and bounded restart

- Run the existing Node paper-bot loop as a child of a readable Bash PID 1 wrapper in the `bot` container.
- Emit a supervisor-liveness heartbeat every 30 seconds independently of the bot's cycle cadence. Keep cycle
  start/progress/outcome and `next_run_at` separate so a legitimate wait or long cycle is not reported as a crash.
- Forward `SIGTERM`/`SIGINT`, wait for clean child shutdown, and preserve the existing paper command and strategy.
- Before every initial start or restart, require:
  - paper command identity;
  - `LIVE_TRADING=false`;
  - `SOVEREIGN_EXECUTION_AUTHORIZED=false`;
  - no execution-class credential projection;
  - valid storage, ledger, and lock paths.
- When enabled, restart unexpected exits at 30, 120, then 300 seconds, capped at three attempts in a rolling hour.
  Persist the restart journal atomically under storage so container restart cannot reset the cap.
- At the cap or any failed safety preflight, keep the supervisor alive in `blocked`, emit a critical event, and require
  an explicit operator reset; never enter an infinite restart loop.
- Compose may retain `restart: unless-stopped` for supervisor failure, but the persisted cap remains authoritative.
- Auto-restart unexpected process exits only. A live child with a stale cycle heartbeat raises a critical stalled
  state but is not killed automatically in v1 because it may own an active ledger write or lock.
- **Acceptance:** manual Compose stop is not auto-restarted by the wrapper; live-capable/malformed environments never
  start a child.

### MON-3 — Webhook event delivery

- Deliver only state transitions, recovery, restart, restart-cap, reconciliation, data-stale, broker-unavailable,
  risk-breach, disk/storage, backup-age, and monitor-failure events.
- Keep position details in the private dashboard/API. Webhooks include only counts and aggregate equity/P&L/exposure/
  drawdown; no market titles, symbols, token IDs, account IDs, or raw payloads.
- Validate an HTTPS URL without user-info, disable redirects, bound request/response sizes, and apply a five-second
  timeout.
- Support generic JSON, Discord, and Slack payload adapters selected by `SOVEREIGN_MONITOR_WEBHOOK_KIND`.
- Sign generic payloads with HMAC-SHA256 when a secret is configured.
- Retry failed delivery after 30, 120, and 300 seconds. Deduplicate by event ID and apply the 15-minute cooldown per
  event code/instance; recovery events are always delivered.
- Honor a bounded valid `Retry-After` response for HTTP 429, preserve event ordering, and never deliver recovery before
  the corresponding unresolved failure event has been journaled.
- Webhook failure degrades notification health but never changes trading, risk, ledger, or restart decisions.
- **Acceptance:** URL/secret never appears in API, CLI, dashboard, logs, errors, process arguments, or test snapshots.

### MON-4 — API, CLI, Bash diagnostics, and main dashboard

- Add the protected API and CLI surfaces over the shared snapshot builder.
- Add concise human output plus stable JSON; `--watch` refreshes in place without mutating runtime state.
- Add the Overview summary and expand BotPanel with uptime, cycle schedule/outcomes, canonical portfolio/risk,
  restarts, broker/data truth, and monitoring delivery state.
- Preserve the current service-health and market-monitor distinction: service uptime must not override canonical data
  freshness, and stale portfolio truth remains visibly stale.
- Bound the API/dashboard position list to 100 entries with validated counters; paginate if the canonical portfolio can
  exceed that limit.
- **Acceptance:** unauthenticated/insufficient-capability API reads fail; browser/CLI errors are sanitized and retain
  labelled last-known data only.

### MON-5 — Operational proof and staged rollout

- Source gate: focused contracts, API auth, dashboard type/build/responsive checks, Bash syntax/signal tests,
  environment/Compose contracts, hygiene, secret scan, diff integrity, and the broad strict suite.
- Failure gate: corrupt heartbeat/ledger/supervisor files, silent child stall, process crash, restart storm, webhook
  timeout/429/5xx, malformed URL, broker outage, stale prices, disk pressure, backup expiry, duplicate event, and
  reconciliation mismatch.
- Host gate: deploy the exact committed source privately; run a two-hour smoke, force one controlled paper-bot crash,
  prove restart/recovery and snapshot continuity, then inspect event and webhook evidence.
- Qualification gate: 72-hour infrastructure soak followed by seven consecutive days of paper cycles. Require at least
  99% scheduled cycles to produce a structured success or explicit failure, zero silent stalls, zero ledger divergence,
  zero duplicate fills, and zero restart-cap bypass.
- Rollback: disable auto-restart and webhook in the environment, restore the prior bot command, and leave heartbeat/
  ledger data intact.

## Required edge cases

The active batch cannot close until its applicable cases are reproduced with fixtures or controlled processes:

- **Process identity and concurrency:** PID reuse, duplicate supervisors, split-brain instances, container replacement,
  stale instance IDs, persisted restart counters, and simultaneous Compose/supervisor restart attempts.
- **Shutdown and restart:** manual stop versus crash, unexpected clean exit, crash during backoff, host reboot during
  restart, restart-cap persistence, invalid cap reset, and safety preflight changing between attempts.
- **Time:** host suspend/resume, backward/forward wall-clock jumps, future timestamps, timezone changes, delayed
  scheduler wakeups, and monotonic cycle-duration calculation.
- **Cycle truth:** healthy bot with no trade opportunities, no positions, long valid cycles, overlapping cycle locks,
  child alive with missing cycle progress, process exited during ledger publication, and provider timeout/rate limit.
- **State integrity:** partial/corrupt heartbeat, supervisor, ledger, or portfolio JSON; atomic rename interruption;
  confirmed-empty portfolio versus unavailable/incomplete broker inventory; duplicate positions/fills; partial fills;
  resolved Polymarket markets; stale marks; missing quotes; non-finite/negative metrics; and reconciliation mismatch.
- **Data versus uptime:** a healthy process with stale or ineligible market data remains degraded/blocked; service
  uptime must never promote data readiness.
- **Host pressure:** read-only/full storage, event-journal growth, low memory, CPU saturation, missing mount, expired
  backup, and monitor-process failure. Monitoring failure alone must not restart the paper bot.
- **Webhook:** invalid/rotated secret, DNS/TLS failure, timeout, redirect, 429/5xx, oversized response, duplicate
  delivery, prolonged outage, cooldown/recovery ordering, adapter mismatch, and URL/secret redaction.
- **API/UI:** missing authentication, insufficient capability, malformed/oversized response, stale last-known state,
  position-count mismatch, pagination snapshot change, hidden-tab recovery, narrow viewport, and browser retry storms.
- **Safety:** execution-capable environment poisoning, execution credential bleed, command substitution/path
  injection, symlinked state paths, world-readable artifacts, raw broker errors, and webhook URL leakage.

## Safety and non-goals

- Paper monitoring never authorizes real-capital execution or strategy promotion.
- The monitor is read-only with respect to positions, fills, ledger, strategy configuration, and broker orders.
- Auto-restart is a lifecycle action only and is denied outside the verified paper profile.
- Webhook configuration is operator-owned external state; implementation tests use a local controlled receiver.
- No public bind, live canary, external webhook call, broker call, provider poll, container start, or host deployment
  occurs during source implementation without separate authorization.
- Existing dirty-worktree changes remain user-owned and must be preserved.

## First action

Run MON-0 preflight only. Produce a field-to-owner map, route/caller map, environment projection matrix, and GO/NO-GO
decision before editing production source.
