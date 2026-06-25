# Module 05 — CLI & TUI Dispatch

For "which commands exist and do they currently work," read `docs/engineering/tui_feature_map.md` first
— it's a maintained, dated PASS/PARTIAL/BROKEN table (last full pass 2026-06-11; missing the chat
suggestion dropdown, the legacy-engine switch, the chart upgrade, and the Alpaca position tracker added
in sessions 55-58 — known gap, not yet refreshed). This module covers the *mechanism*, not the inventory.

## The boot decision: dashboard vs legacy engine

`backend/cli/sovereign_cli.js`. Non-TTY (CI, pipes) always gets the legacy menu. Otherwise,
`loadSettings().layout === 'legacy'` (or `LEGACY_TUI=1` env) spawns the old `runInteractiveMenu()`
engine; anything else spawns `sovereign_dashboard.mjs` as a child process. The boot loop only relaunches
the other engine if the layout setting actually *changed* during that run — a naive "always relaunch"
version was built and reverted in session 56 because it trapped a normal quit in an infinite loop.

## The structural trap: two menu definitions, not one

This has caused real bugs more than once. There are **two separate, unrelated command-menu definitions**:

| | File | Used by |
|---|---|---|
| The Ink dashboard's own model | a constant called `M`, inline inside `sovereign_dashboard.mjs` | Only the modern Ink dashboard |
| `COMMAND_MANIFEST` | `backend/cli/tui/manifest.js` | Only the legacy `runInteractiveMenu()` engine |

**Editing `manifest.js` does nothing to the dashboard, and editing the dashboard's `M` does nothing to
the legacy menu.** This exact mistake produced a real bug in session 57: a position-tracker menu entry
was added to `manifest.js` and the session genuinely believed it was visible in the dashboard. It wasn't
— it took until session 58 to notice and add the equivalent entry to `M`.

## `INTERACTIVE_CMDS` — the full-screen-takeover switch

A `Set` near the top of `sovereign_dashboard.mjs`. Membership means: unmount the Ink dashboard, `spawnSync`
with `stdio:'inherit'` (the child gets the real terminal). Absence means: run in-pane — spawned with piped
stdio, output captured into the dashboard's own output panel, `SOVEREIGN_NONINTERACTIVE=true` set so any
prompt the child *would* have shown instead auto-resolves or fails closed.

This set should only ever contain commands that are **genuinely interactive on every invocation** —
multi-step wizards with no flag-driven shortcut. Two real bugs were exactly "a command was in this set
that didn't need to be, because its manifest entry had no flags so it always fell into an interactive
fallback branch" (the trade-section fix in session 58, and the `alpaca` entry fix in session 59 — same
bug class, different command, fixed by adding real flags instead of removing the command from the
dashboard).

## Chat input resolution

Two stages. `chat_parser.js`'s `parseChatInput()` tries deterministic resolution first — tokenize,
match against the real manifest, fill flags positionally or via `--flag value`. Only if that returns
`ok:false` does `chat_llm_fallback.js`'s `resolveWithLLM()` fire — it builds a prompt from the real
manifest, calls local Ollama, and validates the response against the real manifest before ever offering
it. Either path always goes through a mandatory confirm step before `handleRun()` — there's no direct
LLM-output-to-execution path.

## Testing interactive code without a real terminal

`tests/scripts/tui/dashboard/_harness.js` fakes a TTY: a `PassThrough` stream stubbed with `isTTY:true`
and a no-op `setRawMode()` for stdin, and a buffering `Writable` for stdout whose `snapshot()` strips
ANSI and extracts just the latest frame. This is how `sovereign_dashboard.test.js` drives a real Ink
component and asserts on rendered output without a real conhost/pty — and also why some fixes in this
repo (anything genuinely about Windows conhost rendering quirks) still need a human at a real terminal
to confirm, since the fake TTY can't reproduce terminal-specific rendering bugs.

## Labs

**Lab 1 — prove the two-manifest trap to yourself.** Open both `sovereign_dashboard.mjs` (search for
`const M =`) and `tui/manifest.js` (search for `COMMAND_MANIFEST`). Pick one command that exists in
*only one* of them. What happens if you try to invoke it from the other engine?

**Lab 2 — read `INTERACTIVE_CMDS` and predict behavior before running anything.** For each entry
currently in the set, write down: does this command have manifest flags that would let it run without
any prompt? If yes, that's a candidate for the same fix already applied to `alpaca`/`strategy`/
`prop-firms`/`run`/`trade favorites`.

**Lab 3 — drive the fake-TTY harness yourself.**
```bash
node --test tests/scripts/tui/dashboard/sovereign_dashboard.test.js
```
Open the test file and find one test that types something via the chat bar. Trace which of the two
chat-resolution stages (deterministic vs LLM) it's actually exercising.

**Lab 4 — the legacy switch, both directions.** Read `Settings > Layout` in both `M` and
`COMMAND_MANIFEST`. Confirm for yourself: picking `legacy` from the dashboard, and picking
`default`/`compact`/`research` from inside the legacy menu, both terminate their current process rather
than just changing a flag in place. Why does that matter for a process that's mid-spawn of a child
command?
