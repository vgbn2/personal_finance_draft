# Local-First Setup

This guide is the default onboarding path for a new user on their own machine.

## Install

```powershell
npm install
npm link
```

## Configure

```powershell
sovereign setup
sovereign doctor --json
```

Broker-specific setup:

```powershell
sovereign setup alpaca
sovereign setup gateio
sovereign setup mt5
sovereign setup polymarket
sovereign setup supabase
```

## Run

```powershell
sovereign status --json
sovereign doctor runtime --json
sovereign doctor data --json
```

## Rules

- Secrets stay local by default.
- Shared cloud can compute signals and paper trades.
- Live execution requires `local-private` or a user-owned `private-runner`.
