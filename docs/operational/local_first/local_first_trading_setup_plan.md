# Local-First Trading Setup Plan

## Goal

Make the repo usable on a new user's machine without relying on hidden local state.

Secrets and broker credentials stay local by default. Cloud workers may run market scanning, backtests, paper trading, strategy scoring, alerts, and proposed-order generation, but live order submission must run on the user's machine or on an explicitly user-owned private runner.

## Deployment Modes

Use one of these modes and keep the boundary explicit:

- `local-private`: the user's own machine holds secrets and submits live orders.
- `self-hosted-server` / `private-runner`: the user runs their own server and uses it as the live-execution host.
- `cloud-compute`: shared cloud only runs non-custodial work such as scanning, backtests, paper trading, and proposed-order generation.

Rules:

- shared cloud must not hold broker secrets by default
- live order submission requires `local-private` or `self-hosted-server` / `private-runner`
- paper trading can run in any mode, but it must never submit real orders
- all diagnostic output must redact secret values

## Problem Statement

The repo currently has "works on my machine" risk across both prediction markets and traditional broker paths:

- `.env` is local and not reproducible from a guided setup flow.
- Broker secrets are read directly from environment variables in multiple modules.
- Polymarket signer, L2 credentials, funder wallet, and signature type are easy to mismatch.
- Alpaca, Gate.io, MT5, Supabase, and quote-export paths each have different setup assumptions.
- Runtime behavior depends on local Node packages, TypeScript launchers, Windows/PowerShell behavior, and endpoint reachability.
- Paper trading state under `storage/data/` is intentionally local but not yet clearly separated from cloud compute state.

## Target Architecture

### 1. Local Secrets Layer

Private keys, broker API keys, MT5 passwords, local tokens, and trading PINs stay on the user's machine.

Initial storage target:

- local `.env`
- `.gitignore` protected
- redacted in every diagnostic output

Later storage upgrade:

- Windows Credential Manager
- macOS Keychain
- Linux Secret Service
- encrypted local fallback under `storage/secrets/`

### 2. Local Execution Layer

Anything that can place a real trade runs locally or on a user-owned private runner.

Examples:

- Alpaca live orders
- Gate.io live orders
- MT5 live orders
- Polymarket live orders
- Polymarket order signing and L2 credential derivation
- broker account reads when they expose sensitive portfolio state

### 3. Cloud Compute Layer

Cloud may run non-custodial work:

- market scanning
- backtests
- paper trading
- strategy scoring
- signal generation
- proposed-order generation
- redacted dashboards and alerts

Cloud should emit proposed actions, not hold user credentials by default.

### 4. Self-Hosted Server Layer

If the user wants to run their own server, that server can act as the private runner for live execution.

This layer is user-owned infrastructure, not shared cloud compute:

- can store secrets locally on the user's server
- can run live broker order submission
- can run bot cycles and paper-trading bots
- can receive proposed orders from cloud compute
- should still redact secrets in logs and diagnostics

## Command Surface

### Unified Setup

```powershell
sovereign setup
sovereign setup alpaca
sovereign setup gateio
sovereign setup mt5
sovereign setup polymarket
sovereign setup supabase
```

Setup should:

- create local `.env` if missing
- prompt for broker-specific credentials locally
- validate field shape before writing
- write only to local storage
- print a redacted summary
- never send secrets to Supabase, dashboard APIs, cloud workers, or model calls

### Unified Doctor

```powershell
sovereign doctor --json
sovereign doctor runtime
sovereign doctor data
sovereign doctor alpaca
sovereign doctor gateio
sovereign doctor mt5
sovereign doctor polymarket
```

Doctor should report:

- Node and package install status
- CLI binary availability
- gateway launcher availability
- C++ backend availability
- `.env` presence
- required env vars present, with values redacted
- broker endpoint reachability
- paper account reachability where supported
- live account gated status
- local storage writability
- paper-trading state presence
- secret-leak scan status for tracked files

## Install Target

The repo already supports local dependency installation:

```powershell
npm install
```

It should become a proper local CLI package:

```json
{
  "bin": {
    "sovereign": "backend/cli/sovereign_cli.js"
  }
}
```

Local user flow:

```powershell
npm install
npm link
sovereign setup
sovereign doctor
sovereign status
```

Future package flow:

```powershell
npm install -g sovereign
sovereign setup
```

## Migration Path

The setup flow must not break existing users who already have local `.env` files, paper-trading state, or broker integrations.

Migration rules:

- detect existing `.env` values before prompting
- preserve existing secrets unless the user explicitly opts to replace them
- never overwrite broker values silently
- migrate old env aliases into the centralized broker env modules
- offer a `doctor` or `migrate` path that explains what changed and what still needs attention
- keep legacy local paper-trading state readable so existing history is not lost

## Secret Storage Fallback Order

Secrets should have one clear local storage precedence so the repo does not behave differently on each machine.

Recommended order:

1. OS-native secret store when available.
2. Encrypted local file under `storage/secrets/` when the OS store is unavailable.
3. Local `.env` only as a compatibility fallback or initial bootstrap path.

Rules:

- never place broker secrets in shared cloud storage by default
- never echo raw secrets back to the terminal
- never include raw secrets in `doctor`, `setup`, or error output
- keep secret migration explicit and reversible

## Diagnostics Split

Diagnostics must be split into two classes so the user can safely inspect them without exposing keys.

### Safe diagnostics

- install status
- Node/runtime version
- gateway launcher status
- storage writability
- endpoint reachability
- paper-trading state presence
- broker feature availability

### Sensitive diagnostics

- signer address
- funder/proxy address
- signature mode
- key presence
- account mapping
- credential completeness

Rules:

- safe diagnostics may be printed in full
- sensitive diagnostics must be redacted or summarized
- JSON output must still be useful without exposing raw secret values

## User Journey

One end-to-end path should be documented and testable so a random user can succeed without guessing the architecture.

Recommended flow:

```powershell
npm install
npm link
sovereign setup polymarket
sovereign doctor polymarket
sovereign polymarket paper-run --strategy low_prob_dip --virtual-balance 100 --sizing-mode notional --size 1 --max-position-usd 1 --json
sovereign trade process proposed_orders.json --live
```

The paper command above writes only to the internal append-only virtual ledger. Use `--sizing-mode units` when
`--size` is a share count, or `--sizing-mode risk_budget --size <virtual USD> --stop-price <price>` for
stop-based risk sizing. Paper sizing never grants live authorization and does not make Alpaca Paper, MT5, or a
live Polymarket account ready.

If the user wants their own server:

```powershell
sovereign setup --mode private-runner
sovereign doctor --mode private-runner
sovereign trade process proposed_orders.json --live
```

The docs should show this flow with one broker example plus one traditional market example.

## Broker Capability Matrix

Create `config/system/broker_capabilities.json`.

```json
{
  "alpaca": {
    "paper": true,
    "live": true,
    "requires_local_secret": true,
    "requires_local_terminal": false,
    "cloud_compute_allowed": true,
    "cloud_live_execution_allowed": false
  },
  "gateio": {
    "paper": false,
    "live": true,
    "requires_local_secret": true,
    "requires_local_terminal": false,
    "cloud_compute_allowed": true,
    "cloud_live_execution_allowed": false
  },
  "mt5": {
    "paper": true,
    "live": true,
    "requires_local_secret": true,
    "requires_local_terminal": true,
    "cloud_compute_allowed": true,
    "cloud_live_execution_allowed": false
  },
  "polymarket": {
    "paper": true,
    "live": true,
    "requires_local_private_key": true,
    "requires_local_terminal": false,
    "cloud_compute_allowed": true,
    "cloud_live_execution_allowed": false
  }
}
```

## Proposed-Order Handoff

Cloud bots should output proposed orders:

```json
{
  "broker": "alpaca",
  "symbol": "AAPL",
  "side": "buy",
  "amount_usd": 25,
  "order_type": "market",
  "reason": "strategy_signal"
}
```

Local execution should remain explicit:

```powershell
sovereign trade process proposed_orders.json --live
```

This keeps live broker credentials and signing keys local.

## Checklist

### Phase 0: Audit and Canonical Decisions

- [x] Inventory every broker credential currently read from `process.env`.
- [x] Inventory every local runtime assumption: Node, ts-node, tsx, C++ binary, MT5 terminal, quote export files.
- [x] Decide the canonical Polymarket signature-type mapping and remove conflicting comments/docs.
- [x] Decide whether broker account reads are allowed in cloud mode or must be local-only.
- [x] Define the redaction standard for every doctor/setup output.
- [x] Decide the default deployment mode for a fresh install and name the self-hosted server path clearly.
- [x] Decide the secret storage fallback order and document how migrations work from `.env` to the preferred local secret store.
- [x] Decide the exact safe/sensitive split for diagnostics and required redaction behavior.

### Phase 1: Installable CLI

- [x] Add `bin.sovereign` to `package.json`.
- [x] Ensure `backend/cli/sovereign_cli.js` is executable or has a Windows-safe launch path.
- [x] Add `npm link` local install instructions.
- [x] Add a smoke test proving the linked command can call `status --json`.
- [x] Document `npm install` as the required dependency install step.

### Phase 2: Broker Env Modules

- [x] Add `shared/lib/brokers/alpaca_env.js`.
- [x] Add `shared/lib/brokers/gateio_env.js`.
- [x] Add `shared/lib/brokers/mt5_env.js`.
- [x] Add `shared/lib/brokers/polymarket_env.js`.
- [x] Each module returns required fields, optional fields, redacted summary, and validation errors.
- [x] Update broker adapters to use the broker env modules instead of direct scattered env resolution.

### Phase 3: Setup Commands

- [x] Add `sovereign setup`.
- [x] Add `sovereign setup alpaca`.
- [x] Add `sovereign setup gateio`.
- [x] Add `sovereign setup mt5`.
- [x] Add `sovereign setup polymarket`.
- [x] Add `sovereign setup supabase`.
- [x] Setup writes only to local `.env` or approved local secret storage.
- [x] Setup refuses to print raw secrets after entry.

### Phase 4: Doctor Commands

- [x] Add `sovereign doctor --json`.
- [x] Add `sovereign doctor runtime`.
- [x] Add `sovereign doctor data`.
- [x] Add `sovereign doctor alpaca`.
- [x] Add `sovereign doctor gateio`.
- [x] Add `sovereign doctor mt5`.
- [x] Add `sovereign doctor polymarket`.
- [x] Add `sovereign doctor supabase`.
- [x] Doctor reports missing credentials without exposing values.
- [x] Doctor checks endpoint reachability separately from credential validity.
- [x] Doctor checks local storage writability.
- [x] Doctor checks that secrets are not tracked by git.

### Phase 5: Cloud vs Local Execution Guard

- [x] Add `config/system/broker_capabilities.json`.
- [x] Add a runtime mode flag: `local-private`, `cloud-compute`, or `private-runner`.
- [x] Add an explicit `self-hosted-server` or `private-runner` path for users who want to run their own server.
- [x] Block live execution in `cloud-compute` mode.
- [x] Allow paper trading and signal generation in `cloud-compute` mode.
- [x] Require explicit `private-runner` mode before any cloud-hosted live execution.
- [x] Add tests proving live broker execution is blocked without local/private-runner mode.

### Phase 6: Proposed-Order Contract

- [x] Define proposed-order JSON schema.
- [x] Add schema validation for `trade process`.
- [x] Add broker-specific proposed-order normalization.
- [x] Add dry-run preview for every proposed-order file.
- [x] Add a test proving cloud-generated proposed orders can be processed locally.
- [x] Add a test proving malformed or unsupported orders fail closed.

### Phase 7: Secret-Leak Tests

- [x] Add tests that doctor output redacts private keys and API secrets.
- [x] Add tests that setup summaries redact private keys and API secrets.
- [x] Add tests that Polymarket error output redacts L2 headers.
- [x] Add tests that no tracked file contains `.env` secret values.
- [x] Add a pre-commit or CI check for common secret patterns.

### Phase 8: Documentation

- [x] Add `docs/operational/local_first_setup.md`.
- [x] Add `docs/operational/broker_setup.md`.
- [x] Add `docs/operational/cloud_compute_vs_local_execution.md`.
- [x] Add a migration guide for existing `.env` users and existing paper-trading state.
- [x] Add a clear trust-boundary diagram or table for local-private, private-runner, and cloud-compute.
- [x] Update `README.md` quickstart with `npm install`, `npm link`, `sovereign setup`, and `sovereign doctor`.
- [x] Update `.env.example` so broker sections match the centralized env modules.

## Verification Gates

- [x] `npm install` completes from a fresh clone.
- [x] `npm link` exposes `sovereign`.
- [x] `sovereign doctor --json` runs without broker credentials and reports actionable missing fields.
- [x] `sovereign setup polymarket` stores a private key locally and never prints it afterward.
- [x] `sovereign setup alpaca` stores paper/live credentials locally and never prints secrets afterward.
- [x] `sovereign doctor polymarket --json` reports signer/funder/signature mode with redacted credentials.
- [x] `sovereign doctor alpaca --json` reports paper/live account reachability without exposing keys.
- [x] `sovereign doctor --json` separates safe output from sensitive output cleanly.
- [x] `sovereign trade process proposed_orders.json --live` remains the local execution path.
- [x] A user-owned self-hosted server can run the same live execution path without sending secrets to shared cloud compute.
- [x] Cloud mode can run paper bots but cannot submit live orders.
- [x] The documented user journey works for at least one traditional broker and one Polymarket flow.

## Current Highest-Risk Items

- Polymarket signature-type drift between docs, state notes, and implementation.
- Direct broker env reads are scattered across gateway and CLI files.
- `npm install` exists, but there is no installable `sovereign` CLI command yet.
- Local secrets are ignored by git, but setup and doctor flows do not yet make that safe path obvious for a new user.
- Cloud deployment docs do not yet enforce the rule that live execution requires local/private-runner custody.
