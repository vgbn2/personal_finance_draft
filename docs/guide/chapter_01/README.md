# Chapter 01 - Programming Foundations

## Goal

This chapter gives you the smallest set of programming ideas needed to understand the rest of the guide.

You do not need to become a software engineer here. You need enough vocabulary and mental models to follow code and config without guessing.

## What You Are Building

You are building a mental toolkit:

- what a file does
- what a folder does
- what a module does
- how programs store and pass data
- how config differs from source code

## Prerequisite Concepts

Only these:

- a file contains text or binary data
- a folder organizes files
- a terminal can run commands against those files

## Language Proficiency Required

- JavaScript/Node.js: none
- C++: none
- Rust: none
- PowerShell: beginner

## Library And Tool Requirements

- Node.js for tiny examples
- PowerShell
- a text editor

## Beginner Translation Box

- `module`: a file that exports reusable code
- `function`: a named piece of logic you can call
- `object`: a group of named values
- `array`: a list of values
- `config`: a file that changes behavior without changing source code
- `env var`: a value supplied by the runtime environment, often used for secrets

## Files, Folders, And Modules

Think about the project in three layers:

- files store content
- folders group related files
- modules are code files that other code files can call

Example:

```text
backend/
  cli/
    sovereign_cli.js
shared/
  lib/
    runtime/
      config_loader.js
config/
  system/
    app_config.yaml
```

In that example:

- `sovereign_cli.js` is a file
- `backend/cli/` is a folder
- `config_loader.js` is a module because other code can import and use it

## Data Shapes You Will See Often

The repo uses a few data shapes constantly.

### Strings

Text values such as:

```text
"BTCUSDT"
"paper"
"1d"
```

### Arrays

Lists of things:

```json
["BTCUSDT", "ETHUSDT", "SOLUSDT"]
```

### Objects

Named fields grouped together:

```json
{
  "symbol": "BTCUSDT",
  "timeframe": "1d",
  "source": "binance"
}
```

### Records

A record is just an object that describes one item. A candle, trade, quote, or status payload is usually a record.

## Config Formats

This repo mainly uses JSON and YAML.

### JSON

Good for machine-readable structured data:

```json
{
  "mode": "paper",
  "symbols": ["BTCUSDT", "ETHUSDT"]
}
```

### YAML

Good for human-edited config:

```yaml
mode: paper
symbols:
  - BTCUSDT
  - ETHUSDT
```

Use JSON when the system writes or consumes strict machine output. Use YAML when people are expected to read and edit the file more often.

## Source Code vs Config

Source code tells the program how to behave.

Config tells the program which settings to use.

Examples:

- source code: `shared/lib/runtime/config_loader.js`
- config: `config/system/app_config.yaml`

Do not hardcode values in source code if they are really operator choices.

## Environment Variables

Environment variables are runtime values that do not live directly in source code.

Examples:

- API keys
- secret tokens
- local runtime mode
- optional override paths

Why they matter:

- they keep secrets out of source files
- they allow one codebase to run in multiple modes

## Logs, Errors, And Exit Codes

Programs communicate through output and exit status.

- normal output tells you what happened
- error output tells you what failed
- exit code `0` usually means success
- non-zero usually means failure

When debugging, do not only read the last line. Read the message that tells you which file, command, or path failed.

## Minimum Working Slice

Create one tiny JSON file and one tiny Node script that reads it.

Example files:

```text
example/
  config.json
  load_config.js
```

Example `config.json`:

```json
{
  "mode": "paper",
  "symbol": "BTCUSDT"
}
```

Example `load_config.js`:

```javascript
const fs = require("fs");

const raw = fs.readFileSync("example/config.json", "utf8");
const config = JSON.parse(raw);
console.log(config.mode, config.symbol);
```

## Step-By-Step Build

1. Create the `example/` folder.
2. Add `config.json`.
3. Add `load_config.js`.
4. Run the script with Node.
5. Confirm you understand where the values came from.

## Contracts And Interfaces

Even tiny examples have a contract.

For the example above:

- input contract: `example/config.json` must contain valid JSON
- output contract: the script prints two values
- failure contract: invalid JSON causes a parse error

Later chapters use the same idea at larger scale.

## Tests And Verification

Run:

```powershell
node example\load_config.js
```

Expected output:

```text
paper BTCUSDT
```

If the output is different, the file content or path is wrong.

## Expected File Tree

```text
example/
  config.json
  load_config.js
```

## Common Failure Modes

- `Cannot find module`
  Fix: you are running the wrong file or from the wrong folder.
- `ENOENT`
  Fix: the config file path does not exist.
- `Unexpected token` in JSON
  Fix: the JSON file is malformed.

## Do Not Build Yet

- broker adapters
- network fetchers
- native build targets
- test frameworks beyond tiny smoke checks

## Checkpoint Exercise

Change `symbol` in `config.json` from `BTCUSDT` to `ETHUSDT`, then rerun the script.

If you can explain why the output changed without touching the source file, you understand the config boundary.

## Done Criteria

This chapter is done when you can explain:

- the difference between a file, folder, and module
- the difference between JSON, YAML, and source code
- why environment variables exist
- why inputs and outputs form a contract
