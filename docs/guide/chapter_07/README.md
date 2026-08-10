# Chapter 07 - Architecture Blueprint

## Goal

This chapter maps the system at a high level before you start creating or moving code.

The purpose is to stop random file placement. A repo like this becomes expensive fast if you do not know which subsystem owns which responsibility.

## What You Are Building

You are building an architectural map of the project:

- where config lives
- where provider code lives
- where runtime data lives
- where CLI, API, UI, and native code meet

## Prerequisite Concepts

You should already understand:

- the product boundary
- source vs generated outputs
- basic folder and module structure

## Language Proficiency Required

- JavaScript/Node.js: beginner
- C++: beginner awareness
- Rust: none

## Library And Tool Requirements

- none beyond the repo itself

## Beginner Translation Box

- `boundary`: where one subsystem stops and another begins
- `orchestration`: code that coordinates work instead of performing heavy computation itself
- `provider layer`: code that fetches or normalizes external data
- `data plane`: the storage and movement of runtime data

## Canonical Path Truth

For folder ownership, the main path map is:

- [Codebase organization](../../engineering/codebase_org.md)

This chapter is a learning-oriented overview. The path map remains the canonical placement source.

## High-Level System Shape

At a high level, the system looks like this:

```text
config/ -> providers/scripts -> storage/data -> core/cli/api/ui
```

Expanded:

```text
config/
  settings and market definitions
        |
        v
shared/lib/providers + backend/scripts
  fetch and normalize data
        |
        v
storage/data/
  cache, runtime artifacts, model outputs
        |
        +--> backend/core/
        +--> backend/cli/
        +--> backend/api/
        +--> Frontend/dashboard/
```

## Main Top-Level Areas

### `backend/`

Owns the main runtime surfaces:

- CLI and TUI
- API server
- native core
- execution gateway
- MCP-related server code
- backend scripts

### `shared/`

Owns reusable logic shared across surfaces:

- runtime helpers
- provider logic
- market utilities
- strategy helpers
- broker and settings helpers

### `config/`

Owns system and market configuration:

- markets
- strategies
- trading and broker-related config
- system-level behavior flags

### `storage/`

Owns runtime data and generated operational artifacts:

- cache
- time-series storage
- model outputs
- runtime state files

### `docs/`

Owns human-facing project documentation. Not all docs here are equal in authority.

### `workspace/`

Owns session truth, handoff, and active review notes. This is operational state, not product runtime state.

## Dependency Direction

Keep dependency flow simple:

- UI and CLI call into backend and shared code
- shared provider modules perform I/O and data normalization
- native core should not depend on UI code
- generated outputs should not become source dependencies unless promoted intentionally

When a code path violates that shape, complexity rises quickly.

## Generated Paths vs Source Paths

Source-like paths:

- `backend/`
- `shared/`
- `config/`
- `docs/`
- `tests/`

Generated or runtime paths:

- `build/`
- `dist/`
- `node_modules/`
- `storage/data/cache/`
- `storage/data/ts/`
- `graphify-out/`

Do not treat generated roots as stable architecture unless the repo explicitly promotes them.

## The Role Of The Native Core

`backend/core/` is not the whole system. It is one compute-focused subsystem.

The architecture assumes:

- most orchestration is not native
- native code is a performance or capability layer
- CLI and API surfaces still define much of the operator experience

That split matters when deciding where new logic belongs.

## Minimum Working Slice

A reader should be able to point to these folders and explain their purpose:

- `backend/`
- `shared/`
- `config/`
- `storage/`
- `docs/`
- `workspace/`

If you cannot explain those, do not create new folders yet.

## Step-By-Step Build

1. Open the canonical path map.
2. Open the repo root in a file listing.
3. Group top-level directories by responsibility.
4. Write down which ones are source, config, runtime data, docs, and generated output.
5. Compare your notes to the map.

## Contracts And Interfaces

Important architecture contracts:

- shared code should be reusable across multiple runtime surfaces
- config should not be hidden in random modules
- runtime data should flow through owned storage paths
- status truth and architecture truth should not be mixed carelessly

Those are not style preferences. They keep the repo navigable.

## Tests And Verification

Verification for this chapter is a classification test:

Can you classify these correctly?

- `backend/api/`
- `shared/lib/market/`
- `storage/data/cache/`
- `workspace/STATE.md`
- `Frontend/dashboard/`

If not, reread before moving on.

Helpful inspection command:

```powershell
Get-ChildItem
```

Expected outcome:

- you can see the top-level repo directories
- you can group them into source, config, runtime, docs, or generated categories

## Expected File Tree

```text
backend/
shared/
config/
storage/
docs/
workspace/
tests/
```

## Common Failure Modes

- new code goes into a random root folder
  Fix: place it according to `codebase_org.md`.
- runtime state and docs truth get mixed together
  Fix: keep operational state in `workspace/`.
- generated outputs get treated as a design source
  Fix: trace ownership back to hand-written source.

## Do Not Build Yet

- deep provider internals
- optimization details
- cross-cutting refactors
- new top-level folders without a strong reason

## Checkpoint Exercise

Sketch the architecture in one short diagram of your own. If your diagram cannot explain how config becomes data and then becomes CLI or API output, you need one more pass.

## Done Criteria

This chapter is done when you can:

- explain the role of each major top-level folder
- describe the basic data flow
- distinguish source, runtime, and generated ownership
- use the canonical path map instead of guessing placement
