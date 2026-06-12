# Chapter 15 - TUI Surface

## Goal

This chapter explains how to build a terminal UI that helps the operator instead of hiding state behind a pretty menu.

The TUI is not there to replace architecture. It is there to expose the existing command surface in a guided, stateful, readable way.

## What You Are Building

You are building a small interactive terminal layer that can:

- present menus
- route selections to commands
- keep navigation visible
- keep operator state legible

## Prerequisite Concepts

You should already understand:

- CLI command dispatch
- human vs JSON output
- repo runtime boundaries

## Language Proficiency Required

- JavaScript/Node.js: intermediate
- Terminal concepts: beginner

## Library And Tool Requirements

- Node.js
- terminal prompt helpers
- ANSI rendering awareness

## Beginner Translation Box

- `manifest`: a structured description of menus and actions
- `submenu`: a nested menu entered from a higher-level menu
- `prompt`: the question or selection UI shown in the terminal
- `visible state`: the user can tell where they are and what mode they are in

## Why The TUI Exists

The CLI is efficient, but some workflows are easier with guided menus:

- choosing commands
- picking symbols or strategies
- navigating recurring operator tasks

A TUI helps when users benefit from structure, but it should still preserve honesty:

- show what action is happening
- show where the user is
- avoid fake abstraction over risky actions

## Manifest-Driven Menus

A good TUI does not scatter menu definitions across random files. A manifest gives one place to define:

- menu label
- submenu label
- bound action
- prompt text

That makes the interface easier to extend and test.

## One Menu, One Action Path

Each menu item should map to a real command or function path.

If the menu item is vague, users cannot predict what it does. If the menu item triggers hidden multi-step behavior, debugging becomes painful.

The TUI should act like a guided layer above real command boundaries, not like a separate secret application.

## Minimum Working Slice

The minimum TUI slice:

- one main menu
- one submenu
- one action that calls a known command path
- one visible exit or back path

That is enough to prove the interaction model.

## Worked Example Reference

The example subtree does not implement a full TUI. That is intentional.

This chapter builds on the example CLI first, because a TUI without a clear command surface underneath it becomes harder to debug than it is to use.

When you extend the example later, start by mapping one menu item to the existing `status` command instead of inventing new behavior.

## Step-By-Step Build

1. Create a tiny menu manifest.
2. Render one top-level choice list.
3. Enter one submenu.
4. Trigger one known command.
5. Display a simple result.
6. Return to the previous menu or exit.

## Contracts And Interfaces

The TUI should guarantee:

- visible navigation
- predictable command mapping
- safe defaults
- no silent live-action shortcuts

The TUI is an interface contract, not just a visual convenience layer.

## Tests And Verification

Run the TUI entrypoint or a small prompt demo:

```powershell
node backend\cli\sovereign_cli.js tui
```

Expected outcome:

- the main menu appears
- you can enter one submenu
- selecting one action maps to a known command path

You should also be able to explain where "back" and "exit" live. If the operator can get trapped in a menu, the design is poor.

## Broken Example

If a TUI menu item triggers behavior that does not exist in the CLI or backend command layer, the operator can no longer reason about where failures come from.

That is why this chapter insists on command mapping rather than menu magic.

## Expected File Tree

```text
backend/
  cli/
    tui/
      manifest.js
      engine.js
```

## Common Failure Modes

- the TUI invents behavior not present in the CLI
  Fix: route to real command paths.
- menus hide current state
  Fix: display location, mode, or context clearly.
- navigation is inconsistent between menus
  Fix: standardize back and exit behavior.

## Do Not Build Yet

- heavy visual polish
- pseudo-graphical dashboards
- deep nested menus with unclear ownership

## Checkpoint Exercise

Take one existing CLI action and describe how the TUI should expose it in a menu without changing the underlying behavior.

## Done Criteria

This chapter is done when you can explain:

- why the TUI exists
- why menu manifests help
- how a menu action maps to a real command
- how to keep terminal state visible and recoverable
