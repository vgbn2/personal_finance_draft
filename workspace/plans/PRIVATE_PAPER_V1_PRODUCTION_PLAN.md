# Private Paper v1 Production Plan

Date: 2026-07-23
Status: next-session implementation plan; no implementation started in session 94

## Objective

Deliver `private-paper-v1`: a reproducible, privately hosted Polymarket paper-trading and research platform
with fresh data, truthful status surfaces, one canonical paper ledger, working MCP/API/UI, backups, restart
recovery, and no possible real-money submission.

Development and short-lived tests run on the Lenovo workstation. Persistent deployment is allowed only on the
qualified spare Ubuntu machine. The combined engine remains read-only and is not coupled to Polymarket paper
decisions.

## Release boundary

In scope: dirty-tree recovery, one runtime policy, Polymarket paper execution, persistent data freshness,
private API/dashboard, real host-side MCP proof, read-only combined research, monitoring, backup, rollback,
and release certification.

Deferred: real-money orders, live canaries, Alpaca/MT5 certification, public exposure, Supabase multi-user/RLS
production, strategy-to-live promotion, and making the combined engine drive Polymarket trades.

## Ranked batches

### Batch 0 - Seal the current baseline

- **Objective:** make session-93 work reproducible from committed `HEAD`.
- **Why now:** 28 modified/untracked paths separate working-tree proof from deployable proof.
- **Source:** `workspace/STATE.md` session 93, current `git status`, `PROJECT_RULES.md`.
- **Work:** classify and preserve current source/tests/docs/workspace changes; review the existing deletion;
  commit functional changes separately from continuity files; prove a clean archive and temporary fresh clone.
- **Verification:** focused session-93 tests, `npm run verify:strict`, `npm run test:core`, frontend/MCP builds,
  Compose render, hygiene, secrets, diff check, clean archive module loads.

### Batch 1 - Establish one fail-closed runtime policy

- **Objective:** produce one truthful answer to what is enabled and whether it can execute.
- **Why now:** user settings enable the bot while repository YAML disables it, and `bot_state` stores a separate
  live value.
- **Source:** `config/system/feature_flags.yaml`, `shared/lib/settings/user_settings.js`,
  `shared/lib/brokers/capabilities.js`, `backend/gateway/src/bot_state.ts`.
- **Work:** add `local-test` and `private-paper` profiles; make hard denials, runtime mode, and kill switch
  override settings and bot state; migrate legacy live state as requested-only; remove or document the unused
  YAML after proving zero consumers; expose effective mode and blocking reasons through existing status/health.
- **Verification:** precedence matrix, inherited `LIVE_TRADING=true`, malformed legacy state, missing auth/PIN,
  CLI/API/MCP parity, and proof that private paper cannot reach CLOB submission.

### Batch 2 - Converge Polymarket paper execution

- **Objective:** use one paper broker and one canonical ledger for `paper-run` and non-live `bot cycle`.
- **Why now:** `bot_state.json` and `storage/data/paper_trading/portfolio.json` have different semantics.
- **Source:** `backend/gateway/src/cycle.ts`, `backend/gateway/src/bot_state.ts`,
  `backend/gateway/src/polymarket_paper.js`, `workspace/plans/POLYMARKET_BOT_PLAN.md`.
- **Work:** implement `signal -> order intent -> risk decision -> paper fill -> position` flow; use
  `low_prob_dip` as the first candidate; make Truth Machine optional; retain one append-only ledger under
  `storage/data/paper_trading/`; migrate only proven simulated records; retain non-dry-run history as audit.
  Default to $100 virtual balance, $1 per market, five positions, 15-minute cycles, 10% daily stop, and 30%
  drawdown stop.
- **Verification:** duplicate-cycle replay, crash recovery, stale-lock recovery, network/orderbook failure,
  resolution/P&L reconciliation, restart continuity, and no credentials or submit client in paper mode.

### Batch 3 - Qualify host and recover data trust

- **Objective:** make the spare Ubuntu machine the sole persistent writer and paper host.
- **Why now:** DCS is 0.716 with 87 stale required windows because no persistent writer exists.
- **Source:** `workspace/plans/SESSION_92_ZERO_COST_HOST_AND_TRUST_RECOVERY_PLAN.md` and
  `workspace/plans/CENTRAL_HOST_SINGLE_WRITER_ROLLOUT.md`.
- **Work:** require x86_64, 8 GB minimum, 16 GB target, 40 GB usable disk minimum, reliable power/network,
  Node 22, Docker/Compose, private SSH, owner-only research env, exactly one writer, mounted storage, and
  backup/restore. Inspect DDR generation, DIMM/SO-DIMM form, ECC/buffering, slots, and platform maximum before
  buying RAM. Keep Lenovo testing-only and rebuild provider data on the spare by default.
- **Verification:** preflight, 92/92 cached, zero missing, zero policy-stale required windows, zero unexplained
  grain, integrity `ok:true`, DCS >= 0.95, no shrink, backup restore, reboot recovery, and 72-hour soak.

### Batch 4 - Build read-only combined research and MCP/API/UI surfaces

- **Objective:** raise the combined engine from D/nonexistent to a verified research-only service.
- **Why now:** exact-identity adapters and fixtures exist, but no production composition caller or host MCP
  exchange exists.
- **Source:** `workspace/plans/SCHEMA2_SCHEMA3_COMBINED_ENGINE_PLAN.md`, session-91 MCP plan, and `docs/engineering/web_api.md`.
- **Work:** exact `asset_id` composition, point-in-time technical/macro factors, stale/missing/synthetic/late/
  mismatched rejection, deterministic envelopes, `research_only:true`, `decision_ready:false`, schema-2 default
  parity, authenticated private API, read-only MCP registry, truthful PAPER/freshness UI, and explicit disabled
  Supabase/public-user capability.
- **Verification:** same-asset success, mismatch/revision rejection, CLI/API/MCP parity, no-order dependency
  check, real host MCP initialize/list/read-only-status exchange, auth/private-bind tests, and responsive tests
  at 375/768/1440.

### Batch 5 - Certify and release

- **Objective:** produce a tagged rollback-capable `private-paper-v1` release.
- **Why now:** local green tests alone do not prove host, restart, backup, MCP, or ledger reliability.
- **Work:** deploy the exact committed release to the spare host; verify rollback; run 72-hour infrastructure soak
  followed by at least seven consecutive days of paper cycles; keep strategy profitability as a separate evidence
  report rather than an arbitrary live-promotion gate.
- **Verification:** committed HEAD/CI/clean clone/deployed commit match; full test/build/security matrix; no
  execution credentials; 99% of scheduled cycles produce structured outcomes; zero ledger divergence, duplicate
  fills, unresolved locks, or unexplained high-severity errors; backup, restore, restart, rollback, DCS, MCP, and
  paper-readiness reports all pass.

## Safety constraints

- No live order, canary, execution credential, public bind, or provider polling by the main agent.
- External evidence follows the structured JSON air-gap rule.
- No cache shrink or destructive migration; preserve dirty-tree work and obey the >100-line deletion review rule.
- Do not infer real-money readiness from tests, DCS, paper fills, or a working MCP build.

## First next-session action

Start Batch 0 by reviewing the current dirty tree and creating the clean-HEAD evidence boundary. Do not begin
new paper-engine code until that gate passes.
