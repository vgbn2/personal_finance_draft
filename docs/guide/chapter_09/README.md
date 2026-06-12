# Chapter 09 - Configuration System

## Goal

This chapter explains how the project should load settings, secrets, and behavior flags without scattering them through code.

A trading and data platform becomes unmaintainable quickly if configuration lives in random modules. This chapter sets the control surface before later runtime complexity appears.

## What You Are Building

You are building a basic configuration system that can:

- load env values
- read config files
- apply defaults
- validate missing or invalid settings
- separate secret and non-secret configuration

## Prerequisite Concepts

You should already understand:

- scaffold structure
- JSON and YAML
- environment variables
- source vs config ownership

## Language Proficiency Required

- JavaScript/Node.js: beginner
- YAML/JSON: beginner
- PowerShell: beginner

## Library And Tool Requirements

- Node.js
- config parser libraries if needed
- env-loading support

## Beginner Translation Box

- `default`: a value used when the user did not specify one
- `validation`: checking whether config is acceptable before using it
- `override`: a later value that replaces an earlier one
- `secret`: a value that must not be committed into source code

## What Belongs In Config

Good config examples:

- operating mode: paper or live
- enabled symbols
- data provider selection
- strategy defaults
- environment-specific paths

Bad config examples:

- logic that belongs in a function
- secret keys hardcoded into source files
- values duplicated in five places with no owner

## Secret vs Non-Secret Config

Use environment variables or local env files for secrets:

- API keys
- API secrets
- session tokens

Use JSON or YAML for non-secret operator settings:

- symbol lists
- runtime flags
- provider preferences
- feature toggles

This split is essential. It keeps source review and runtime credential handling separate.

## Loading Order

A simple, sane order looks like this:

1. built-in defaults
2. config file values
3. environment variable overrides

That gives you:

- a stable base
- editable operator config
- a way to override safely per machine or environment

## Example Config Files

JSON example:

```json
{
  "mode": "paper",
  "symbols": ["BTCUSDT", "ETHUSDT"],
  "timeframe": "1d"
}
```

YAML example:

```yaml
mode: paper
symbols:
  - BTCUSDT
  - ETHUSDT
timeframe: 1d
```

## Example Env Values

```text
ALPACA_API_KEY=...
ALPACA_SECRET_KEY=...
SOVEREIGN_MODE=paper
```

The guide later decides which env values should win over file values.

## Minimum Working Slice

The minimum useful config system:

- loads one local config file
- reads one env override
- prints the resolved config
- fails clearly when the config is malformed

That is enough to start later CLI and data work.

## Worked Example Reference

The runnable example files for this chapter are:

```text
docs/guide/examples/minimal_sovereign/config/system/app_config.json
docs/guide/examples/minimal_sovereign/shared/lib/runtime/config_loader.js
docs/guide/examples/minimal_sovereign/backend/cli/sovereign_cli.js
```

Read those three together:

- config file defines defaults
- loader resolves defaults plus env overrides
- CLI consumes the resolved config

## Step-By-Step Build

1. Create one config file under `config/`.
2. Write one loader module under `shared/lib/runtime/`.
3. Add defaults inside the loader.
4. Read one env override such as `SOVEREIGN_MODE`.
5. Print the final resolved config from a CLI command.

## Contracts And Interfaces

The loader should guarantee:

- output has a predictable shape
- missing required settings fail clearly
- secrets are not sourced from hardcoded source constants
- the caller does not need to know where every value came from

This is a clean interface: callers ask for resolved config, not for three different raw sources.

## Tests And Verification

Run a small config command or script that prints the final resolved object.

Example check:

```powershell
$env:SOVEREIGN_MODE='paper'
node backend\cli\sovereign_cli.js status --json
```

Expected outcome:

- the output includes the resolved mode
- file and env values combine in the expected order

Worked-example evidence from this repo:

```json
{
  "ok": true,
  "command": "status",
  "mode": "paper",
  "provider": "example_provider",
  "timeframe": "1d"
}
```

Also test failure behavior by intentionally breaking the config file format and confirming the loader fails loudly.

## Broken Example

If `app_config.json` becomes invalid JSON, the loader fails before the CLI can render status.

That is good behavior. Silent fallback here would hide a real configuration problem.

## Expected File Tree

```text
config/
  system/
    app_config.yaml
shared/
  lib/
    runtime/
      config_loader.js
backend/
  cli/
    sovereign_cli.js
```

## Common Failure Modes

- secrets are committed into config files
  Fix: move them to env handling.
- callers reach into raw config files directly
  Fix: route through one loader.
- defaults and overrides are unclear
  Fix: document precedence and keep it consistent.
- the CLI reaches for config fields that the loader never guarantees
  Fix: treat the loader output as the public contract.

## Do Not Build Yet

- remote config services
- complex config migration frameworks
- silent fallback behavior for required secrets

## Checkpoint Exercise

Add one default field and one env override to your loader, then explain which value wins and why.

If you can explain the precedence order without guessing, the chapter worked.

## Done Criteria

This chapter is done when you can explain:

- what belongs in config
- what belongs in env vars
- how defaults, file values, and env overrides combine
- why the loader should expose one resolved configuration surface
