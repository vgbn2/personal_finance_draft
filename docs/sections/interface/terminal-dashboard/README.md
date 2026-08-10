# Terminal Dashboard

> **Status:** Implemented for source/test scope; real-terminal, host, provider, paper, and live qualification remain separate.
> **Audience:** maintainers of the CLI, terminal UI, and command-safety boundary.
> **Canonical owners:** `backend/cli/sovereign_dashboard.mjs`, `backend/cli/tui/dashboard_exec.js`, `backend/cli/tui/dashboard_layout.js`, `backend/cli/tui/command_input.mjs`, `backend/cli/tui/chat_parser.js`.
> **Review triggers:** dashboard command schema, viewport breakpoints, input editing, command resolution, child-process mode, PIN routing, long-running command cancellation.

## Purpose And Boundary

This section owns the modern Ink terminal dashboard: command discovery, flag editing, symbol and strategy pickers, chat-style command resolution, responsive layout, command execution, and the UI-side live-PIN gate.

It does not own the legacy prompt engine, individual command behavior, broker authorization, provider ingestion, or execution policy. The tutorial [CLI & TUI Dispatch](../../../codebase_tour/05_tui_cli_dashboard.md) teaches the two-engine design; this page is the current reference contract.

## Owners And State Flow

`backend/cli/sovereign_dashboard.mjs` exports three public surfaces:

- `M`: the modern dashboard's inline command schema;
- `INTERACTIVE_CMDS`: commands that require terminal takeover;
- `App`: the Ink component and its state machine.

`App` moves among `chat`, `side`, `cmd`, `subcmd`, `flags`, `symbolPicker`, and `pin` focus modes. It builds command arguments from the selected command and flag values, then routes every run through the same PIN-aware execution decision.

Supporting owners keep pure or narrowly testable behavior outside the component:

- `dashboard_exec.js` owns command/flag conversion, dynamic strategy and symbol choices, picker rows, health classification, interactive-command matching, and daemon-status projection.
- `dashboard_layout.js` owns viewport breakpoints, row budgets, and navigation windows.
- `command_input.mjs` owns grapheme-safe editing, display-cell width, horizontal windows, and hardware-cursor placement.
- `chat_parser.js` owns deterministic text-to-command resolution and flag coercion.

## Command Schema And Known Duplication

The modern dashboard reads `M`; the legacy TUI reads `backend/cli/tui/manifest.js`. They are distinct schemas. A command or flag added to one does not appear in the other.

This duplication has focused contract coverage but remains maintainability debt. Do not describe parity unless a direct comparison proves it. A future unification should preserve renderer-specific metadata while moving command identity and flag semantics to one canonical source.

Dynamic strategy options come from the strategy registry. The symbol universe comes from the same configured/cached inventory used by the legacy asset picker, reshaped for the Ink picker.

## Responsive Layout Contract

`dashboardLayout(columns, rows)` clamps the supported viewport to at least 40 columns by 10 rows and derives all pane budgets from one reactive `useWindowSize()` source.

Below 120 columns, the dashboard stacks the navigation/content row above the output pane. At 120 columns and wider, it uses three columns. Short viewports hide optional header/footer/status rows, reduce suggestion and picker capacity, and window menu/command lists around the active item.

`windowedRange()` guarantees that the selected category or command remains visible and emits bounded “more” markers for omitted rows. Rendered text is truncated rather than wrapped where wrapping would violate cursor or pane-height calculations.

## Command Input And Resolution

`CommandInput` splits text into grapheme clusters so deletion and cursor movement do not split emoji or combined characters. Display width treats full-width and pictographic graphemes as two terminal cells. A horizontal window keeps the logical cursor within the available columns.

The deterministic chat path:

1. strips an optional leading `/`;
2. tokenizes quoted or whitespace-separated text;
3. resolves the longest exact command ID, then conservative prefix/substring fallbacks;
4. applies explicit `--flag value` pairs;
5. fills eligible selector/picker flags positionally;
6. rejects missing explicitly required flags;
7. hands the resolved command to the same run/PIN path used by the grid.

If deterministic resolution fails, the local LLM fallback may propose a manifest-valid command. It cannot execute directly: the user must confirm, and a live command still enters the PIN gate.

## Execution Modes And Side Effects

Dashboard command selection is not itself side-effect free. The selected command determines behavior:

- In-pane commands spawn `sovereign_cli.js` with piped output and `SOVEREIGN_NONINTERACTIVE=true`; output streams into the dashboard and Escape sends `SIGINT` to the child.
- Entries in `INTERACTIVE_CMDS` defer terminal takeover to `runExternal()`, which waits one tick, unmounts Ink, spawns with inherited stdio, waits for acknowledgement, and remounts.
- Continuous `backfill-daemon` mode is detached intentionally and observed through its status file; this is an explicit service-like exception.
- `stop-backfill-daemon` reads the status projection and sends `SIGTERM` when a live PID is reported.
- Changing the layout to `legacy` exits the dashboard so the CLI boot loop can launch the other engine.

Command descriptions and defaults are not a safety boundary. The invoked CLI command still owns authentication, authorization, provider/data mutation, runtime policy, and execution checks.

## PIN And Live Boundary

`runOrGatePin()` is the only dashboard decision that may pass a live command onward. Both grid and chat paths call it. When `--live` is true and `SOVEREIGN_TRADE_PIN` is configured, the dashboard stores the pending command and displays the PIN view before execution.

The PIN is passed to the child through `SOVEREIGN_TRADE_PIN`, not appended to the displayed command arguments. This UI gate does not authorize execution by itself; downstream CLI/gateway runtime-policy, authorization, kill-switch, credential, and risk checks remain mandatory.

## Failure, Cancellation, And Recovery

In-pane child stdout/stderr is bounded by a scrollable output window. Spawn errors become visible output, and cleanup clears the running state and child reference.

Escape or `c` while a command runs sends `SIGINT`; Ctrl+C also exits the dashboard. Interactive terminal takeover temporarily absorbs the parent process's console `SIGINT` so a child interruption does not silently terminate the dashboard parent.

Unexpected top-level exceptions on a real launch are recorded in `workspace/dashboard_crash.log`, the terminal cursor/colors are restored, and the process exits nonzero. That log is operational evidence, not canonical documentation.

The daemon status indicator is observational only. It checks a status-file PID with signal 0 and can theoretically show a stale process after PID reuse; no execution decision depends on it.

## Verification

Representative focused evidence:

- `tests/scripts/tui/dashboard/command_input.test.js` covers cursor editing, grapheme width, resize, short viewports, selection visibility, and 80/100/120/160-column bounds.
- `tests/scripts/tui/dashboard/sovereign_dashboard.test.js` exercises flags, pickers, PIN routing, output scrolling, abort behavior, and command argument construction through the real Ink component.
- `tests/scripts/tui/dashboard/chat_ui.test.js` covers deterministic chat execution, mandatory LLM confirmation, cancellation, and live-PIN routing.
- `tests/scripts/tui/dashboard/dashboard_command_safety.test.js` checks noninteractive termination and cancellation across manifest command classes while excluding state-mutating and heavy-provider defaults.
- `tests/scripts/architecture/cli/cli_ui_contract.test.js` checks active command registration.

The fake-TTY harness proves component behavior under controlled dimensions. It does not reproduce every terminal emulator, operating system console, provider response, host lifecycle, paper order, or live order.

## Change Checklist

1. Update both modern and legacy schemas unless divergence is deliberate and documented.
2. Keep text mutation and hardware-cursor position on the same grapheme/cell-width model.
3. Derive pane, picker, suggestion, and output budgets from the reactive viewport policy.
4. Route every command through one argument builder and every live command through `runOrGatePin()`.
5. Classify new commands as in-pane, interactive takeover, detached, state-mutating, heavy, or long-running before extending tests.
6. Preserve child cancellation and remount behavior on errors and interrupts.
7. Do not claim provider, host, paper, or live qualification from fake-TTY or mocked command tests.
