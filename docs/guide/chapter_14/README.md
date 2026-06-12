# Chapter 14 - CLI Foundation

## Goal

This chapter explains how the command-line interface becomes the first real operator surface of the system.

The CLI matters because it is usually the fastest way to verify new features, inspect system state, and reproduce behavior without a full web or TUI layer.

## What You Are Building

You are building a small CLI foundation that can:

- dispatch one command by name
- support both human output and JSON output
- return clear failures
- grow into grouped command modules later

## Prerequisite Concepts

You should already understand:

- config loading
- provider and cache basics
- the difference between human-readable and machine-readable output

## Language Proficiency Required

- JavaScript/Node.js: intermediate
- PowerShell: beginner

## Library And Tool Requirements

- Node.js
- local parser code or a minimal argument helper
- `node --test`

## Beginner Translation Box

- `dispatcher`: the code that decides which command runs
- `subcommand`: a named action under a CLI
- `stdout`: normal program output
- `stderr`: error output

## Why The CLI Comes Before The TUI

The CLI is simpler:

- easier to script
- easier to test
- easier to debug
- easier to read in logs

That makes it the right first operator surface. The TUI should build on clear CLI behavior, not replace missing CLI structure.

## A Minimal Dispatcher

You do not need a huge parser first. A minimal dispatcher can inspect `process.argv` and route to one handler.

Conceptually:

1. read the command name
2. check whether `--json` is present
3. run the matching handler
4. print either JSON or text

That structure already mirrors the shape of a larger CLI.

## Human Output And JSON Output

Every important CLI surface should answer two audiences:

- humans reading the terminal
- scripts, tests, or tools reading structured output

Example human output:

```text
Status: ok
Mode: paper
Cached symbols: 2
```

Example JSON output:

```json
{
  "ok": true,
  "mode": "paper",
  "cached_symbols": 2
}
```

Do not make tests parse decorative text if the command can expose a clean JSON mode.

## Minimum Working Slice

The minimum useful CLI slice:

- one `status` command
- one `status --json` mode
- one predictable exit path on error

That is enough to support later data, gateway, and strategy commands.

## Worked Example Reference

Use the example CLI at:

```text
docs/guide/examples/minimal_sovereign/backend/cli/sovereign_cli.js
```

It already demonstrates:

- one dispatcher
- one `status` command
- one `--json` mode
- one clear unknown-command failure path

## Step-By-Step Build

1. Read the command name from `process.argv`.
2. Detect `--json`.
3. Route `status` to one handler.
4. Print JSON if requested.
5. Print human text otherwise.
6. Return a non-zero exit code if the command name is unknown.

## Contracts And Interfaces

The CLI foundation should guarantee:

- command names route predictably
- JSON mode stays stable enough for tests
- unknown commands fail clearly
- output mode is chosen explicitly, not by guesswork

Later command groups depend on these guarantees.

## Tests And Verification

Run:

```powershell
node backend\cli\sovereign_cli.js status
node backend\cli\sovereign_cli.js status --json
```

Expected outcome:

- the human mode prints a readable status summary
- the JSON mode prints a structured payload

Example JSON output:

```json
{
  "ok": true,
  "command": "status",
  "mode": "paper"
}
```

Also test one failure case:

```powershell
node backend\cli\sovereign_cli.js unknown_command
```

Expected outcome:

- the command fails clearly
- the process exits non-zero

Worked-example evidence from this repo:

- `node backend\cli\sovereign_cli.js status --json` succeeds
- `node backend\cli\sovereign_cli.js unknown_command` is expected to fail clearly

## Expected File Tree

```text
backend/
  cli/
    sovereign_cli.js
tests/
  cli_status.test.js
```

## Common Failure Modes

- human and JSON modes drift into different meanings
  Fix: derive both from the same internal data.
- unknown commands print vague errors
  Fix: fail explicitly and name the missing command.
- the dispatcher becomes a giant file with embedded business logic
  Fix: keep routing and command logic separated.

## Broken Example

If the CLI prints only human text and no structured JSON, tests and downstream tooling must scrape output that was never meant to be stable.

That is a design mistake, not only a testing inconvenience.

## Do Not Build Yet

- full TUI
- broker execution
- command auto-discovery frameworks
- decorative terminal output that hides the real signal

## Checkpoint Exercise

Add one more status field, such as `timeframe` or `data_path`, and confirm it appears in both human and JSON modes.

## Done Criteria

This chapter is done when you can explain:

- how the dispatcher chooses a command
- why `--json` matters
- how failure should behave
- why the CLI is the first real operator surface
