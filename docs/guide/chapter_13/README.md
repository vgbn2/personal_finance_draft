# Chapter 13 - C++ Core Engine

## Goal

This chapter connects the earlier C++ overview to the actual role of the native core inside the wider system.

The key point is that the native layer is not an isolated academic exercise. It is one execution path inside a larger platform, and it needs a clean boundary to stay useful.

## What You Are Building

You are building a small bridge between the JavaScript runtime and the native core that can:

- call a native executable or target
- pass input in a predictable way
- read structured output
- fail clearly when the native path is unavailable

## Prerequisite Concepts

You should already understand:

- the role of the native core
- scaffold layout
- JSON output contracts
- provider and storage basics

## Language Proficiency Required

- JavaScript/Node.js: beginner to intermediate
- C++: beginner
- Build tooling: beginner

## Library And Tool Requirements

- CMake
- a C++ compiler
- Node.js process-spawn support

## Beginner Translation Box

- `bridge`: code that connects two different layers
- `spawn`: start another process from a running program
- `structured output`: output shaped for machines, usually JSON
- `fallback`: a simpler path used when the preferred path is unavailable

## Why The Core Needs A Bridge

The CLI should not know every detail of the C++ build layout.

Instead:

- JavaScript command code asks a bridge to run the native path
- the bridge knows where the executable is
- the bridge returns parsed output or a clear failure

That keeps the rest of the codebase from depending on fragile build-path details.

## The Smallest Useful Native Contract

A beginner-friendly native contract looks like this:

- input comes in via arguments or a file path
- output is JSON
- non-zero exit means failure

That contract is easy for JavaScript to consume and easy for tests to verify.

## Example Bridge Behavior

Conceptually:

1. CLI command asks the bridge to run the native command.
2. Bridge locates the native executable.
3. Bridge executes it.
4. Bridge reads stdout.
5. Bridge parses JSON.
6. Bridge returns the result or surfaces a clear error.

If parsing fails, the error should say so directly instead of pretending the native output was valid.

## Minimum Working Slice

The minimum slice for this chapter:

- one native command prints JSON
- one JavaScript bridge executes it
- one caller prints the parsed result

That is enough to prove the cross-language boundary works.

## Step-By-Step Build

1. Build the native target with CMake.
2. Confirm the executable exists.
3. Write one bridge helper under a runtime or backend helper path.
4. Have the bridge call the executable and parse stdout.
5. Call that bridge from one simple CLI command.

## Contracts And Interfaces

The bridge should guarantee:

- it knows the native executable discovery path
- it returns parsed data, not raw text, when JSON is expected
- it surfaces native failures honestly
- callers do not duplicate spawn logic everywhere

This is important because duplicate bridge logic tends to drift and break in subtle ways.

## Tests And Verification

Run:

```powershell
cmake -S backend\core -B backend\core\build
cmake --build backend\core\build --config Release
node backend\cli\sovereign_cli.js
```

Expected outcome:

- native build succeeds
- CLI can invoke the bridge path
- parsed JSON appears on the JavaScript side

If the native executable is missing, the bridge should fail with a direct message rather than a cryptic downstream parse error.

## Expected File Tree

```text
backend/
  core/
    CMakeLists.txt
    src/
    build/
shared/
  lib/
    runtime/
      backend_bridge.js
backend/
  cli/
    sovereign_cli.js
```

## Common Failure Modes

- every caller spawns the native process differently
  Fix: centralize the bridge.
- native output is plain text when callers expect JSON
  Fix: standardize the contract early.
- missing executable becomes a misleading JSON parse failure
  Fix: validate process success before parsing.

## Do Not Build Yet

- ONNX integration
- performance tuning
- large native feature surface
- silent JS fallbacks that hide native failures

## Checkpoint Exercise

Describe the full call chain in one paragraph:

`CLI command -> bridge -> native executable -> JSON stdout -> parsed result`

If you can explain each arrow cleanly, the chapter worked.

## Done Criteria

This chapter is done when you can explain:

- why the native core needs a bridge
- why the bridge should parse structured output
- why callers should not each invent their own spawn logic
- how native failures should surface to the rest of the system
