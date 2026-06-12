# Chapter 03 - JavaScript And Node Crash Course

## Goal

This chapter gives you just enough JavaScript and Node to understand the CLI and script layers in the repo.

The target is not "become good at JavaScript." The target is "read a repo command and understand what it is doing."

## What You Are Building

You are building a tiny CLI-shaped Node program that:

- reads a file
- parses JSON
- reads a command argument
- prints machine-readable output
- exits clearly on failure

## Prerequisite Concepts

You should already understand:

- files and folders
- JSON config
- terminal basics
- Git inspection

## Language Proficiency Required

- JavaScript/Node.js: beginner
- C++: none
- Rust: none
- PowerShell: beginner

## Library And Tool Requirements

- Node.js
- built-in modules: `fs`, `path`, `process`
- `node --test`

## Beginner Translation Box

- `require`: load another module
- `process.argv`: the list of arguments passed to the script
- `JSON.parse`: turn JSON text into a JavaScript object
- `console.log`: print normal output
- `process.exitCode`: tell the shell the script failed

## A Minimal Node Program

Example:

```javascript
console.log("hello");
```

Run it with:

```powershell
node hello.js
```

Node is the runtime. It executes JavaScript outside the browser.

## Modules And Imports

Node programs are split into modules so code can stay organized.

Example:

```javascript
const fs = require("fs");
const path = require("path");
```

This does not mean "`fs` lives in your repo." It means Node provides built-in modules for common tasks.

## Reading A File

Example:

```javascript
const fs = require("fs");
const raw = fs.readFileSync("example/config.json", "utf8");
console.log(raw);
```

What happens:

- Node opens the file
- reads it as text
- stores that text in `raw`
- prints it

## Parsing JSON

To use the file as structured data:

```javascript
const config = JSON.parse(raw);
console.log(config.symbol);
```

The file stops being "just text" and becomes usable program data.

## Reading Command Arguments

If you run:

```powershell
node cli.js BTCUSDT
```

Then `process.argv` contains those values.

Example:

```javascript
const symbol = process.argv[2] || "BTCUSDT";
console.log(symbol);
```

The index starts at `2` because the first two entries belong to Node and the script path.

## Machine Output vs Human Output

Human output is easy for a person to read:

```text
Loaded BTCUSDT in paper mode
```

Machine output is easier for scripts and tests:

```json
{
  "ok": true,
  "symbol": "BTCUSDT",
  "mode": "paper"
}
```

This repo uses both. CLI commands often support a human surface and a `--json` surface.

## Minimum Working Slice

Build this tiny CLI:

```javascript
const fs = require("fs");

const raw = fs.readFileSync("example/config.json", "utf8");
const config = JSON.parse(raw);
const symbol = process.argv[2] || config.symbol;

console.log(JSON.stringify({
  ok: true,
  mode: config.mode,
  symbol
}, null, 2));
```

Run:

```powershell
node cli.js ETHUSDT
```

Expected output:

```json
{
  "ok": true,
  "mode": "paper",
  "symbol": "ETHUSDT"
}
```

## Step-By-Step Build

1. Create `cli.js`.
2. Load the JSON file from the previous chapter.
3. Parse it.
4. Read one optional argument from `process.argv`.
5. Print JSON.
6. Change the argument and rerun it.

## Contracts And Interfaces

The tiny CLI has these contracts:

- input file contract: `example/config.json` must exist and contain valid JSON
- argument contract: the optional third CLI argument is the symbol override
- output contract: print an object with `ok`, `mode`, and `symbol`

These small contracts scale into the repo's real command surfaces.

## Tests And Verification

Run:

```powershell
node cli.js
node cli.js SOLUSDT
```

Expected outcome:

- first command prints the default symbol from the config file
- second command prints `SOLUSDT`

Optional first test:

```javascript
const test = require("node:test");
const assert = require("node:assert");

test("basic truth", () => {
  assert.equal(1 + 1, 2);
});
```

Run:

```powershell
node --test
```

## Expected File Tree

```text
example/
  config.json
cli.js
```

## Common Failure Modes

- `process.argv[2]` is `undefined`
  Fix: provide a fallback.
- JSON output prints `[object Object]`
  Fix: use `JSON.stringify`.
- file read fails with `ENOENT`
  Fix: the path is wrong or the file does not exist.

## Do Not Build Yet

- network requests
- provider ranking
- execution gateway
- TUI rendering

## Checkpoint Exercise

Add a second field to the config file, such as `timeframe`, and print it in the JSON output.

If you can do that without changing the chapter text, you understand the basic Node flow.

## Done Criteria

This chapter is done when you can explain:

- how a Node script reads a file
- how it reads an argument
- how it prints JSON
- why machine-readable output matters in this repo
