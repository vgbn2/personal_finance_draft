# Chapter 08 - Repository Scaffold

## Goal

This chapter shows how to scaffold a minimal version of the project structure from scratch.

You are not recreating the full repo yet. You are building the first useful skeleton that can grow into the real system.

## What You Are Building

You are building:

- the top-level repo folders
- a base `package.json`
- one CLI entrypoint
- one test file
- an explicit place for config, storage, docs, and session truth

## Prerequisite Concepts

You should already understand:

- top-level architecture
- source vs generated paths
- the local-first safe path

## Language Proficiency Required

- JavaScript/Node.js: beginner
- C++: none
- Rust: none
- PowerShell: beginner

## Library And Tool Requirements

- Node.js
- npm
- Git

## Beginner Translation Box

- `entrypoint`: the file you run first
- `smoke test`: a small test proving the basic path works
- `scaffold`: a starter structure with the right ownership boundaries

## Recommended Top-Level Skeleton

Start with this:

```text
backend/
  cli/
shared/
  lib/
config/
storage/
  data/
tests/
docs/
workspace/
```

This is intentionally smaller than the full live repo. The goal is correct direction, not complete detail.

## Why These Folders Exist

- `backend/`: runtime surfaces such as CLI, API, and native code
- `shared/`: reusable cross-surface helpers
- `config/`: operator and system settings
- `storage/`: runtime data and generated artifacts
- `tests/`: verification code
- `docs/`: human documentation
- `workspace/`: session truth and review state

## Minimum Working Slice

The minimum useful scaffold is:

- folder structure exists
- `package.json` exists
- one command prints status as JSON
- one test passes

That is enough to prove the repo is no longer just empty folders.

## Worked Example Reference

This guide now includes a miniature runnable example at:

```text
docs/guide/examples/minimal_sovereign/
```

Use it as a companion while reading this chapter. The scaffold chapter maps directly to these files:

```text
docs/guide/examples/minimal_sovereign/
  package.json
  backend/cli/sovereign_cli.js
  tests/scaffold.test.js
```

## Example `package.json`

Keep it small at first:

```json
{
  "name": "sovereign-skeleton",
  "private": true,
  "type": "commonjs",
  "scripts": {
    "test": "node --test"
  }
}
```

This is not the final package file. It is the first stable one.

## Example CLI Entrypoint

Example:

```javascript
#!/usr/bin/env node

console.log(JSON.stringify({
  ok: true,
  service: "sovereign-cli",
  mode: "bootstrap"
}, null, 2));
```

Suggested path:

```text
backend/cli/sovereign_cli.js
```

## Example First Test

Example:

```javascript
const test = require("node:test");
const assert = require("node:assert");

test("basic scaffold test", () => {
  assert.equal(true, true);
});
```

Suggested path:

```text
tests/scaffold.test.js
```

## Step-By-Step Build

1. Create the top-level folders.
2. Add the starter `package.json`.
3. Add `backend/cli/sovereign_cli.js`.
4. Add `tests/scaffold.test.js`.
5. Run `npm test`.
6. Run `node backend/cli/sovereign_cli.js`.

## Contracts And Interfaces

Even this small scaffold should establish stable ownership:

- commands live under `backend/cli/`
- shared helpers do not live inside the CLI folder
- config does not live inside random script files
- storage is reserved for runtime data, not source code

These early boundaries save refactor cost later.

## Tests And Verification

Run:

```powershell
npm.cmd test
node backend\cli\sovereign_cli.js
```

Expected outcomes:

- test runner reports a passing test
- CLI prints a small JSON payload

Example expected output:

```json
{
  "ok": true,
  "service": "sovereign-cli",
  "mode": "bootstrap"
}
```

Worked-example evidence from this repo:

- `npm.cmd test` passes in `docs/guide/examples/minimal_sovereign/`
- `node backend\cli\sovereign_cli.js status --json` prints structured status

## Expected File Tree

```text
backend/
  cli/
    sovereign_cli.js
shared/
  lib/
config/
storage/
  data/
tests/
  scaffold.test.js
docs/
workspace/
package.json
```

## Common Failure Modes

- reader puts shared helpers under `backend/cli/`
  Fix: reserve that folder for command-facing code.
- `npm test` fails because there are no tests
  Fix: create the smoke test before running it.
- PowerShell blocks `npm.ps1` with an execution-policy error
  Fix: run `npm.cmd test` instead of `npm test` on Windows when needed.
- the first CLI prints plain text while later chapters expect JSON
  Fix: start with JSON now.

## Broken Example

If `backend/cli/sovereign_cli.js` is missing, this command:

```powershell
node backend\cli\sovereign_cli.js
```

fails with a file-not-found or module-loading error.

That failure means your scaffold is incomplete, not that Node itself is broken.

## Do Not Build Yet

- dashboard
- native core
- broker integrations
- large config systems
- runtime caches

## Checkpoint Exercise

Add one more field to the CLI output, such as `"version": "0.1.0"`, then rerun it.

If you can change the JSON shape intentionally and explain the result, the scaffold is under control.

## Done Criteria

This chapter is done when you have:

- the base folder structure
- one runnable CLI file
- one passing test
- clean ownership boundaries for code, config, docs, and runtime data
