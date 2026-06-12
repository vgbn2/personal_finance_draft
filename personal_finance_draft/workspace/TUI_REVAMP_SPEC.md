# TUI Revamp Spec — Roadmap Item 2 (animations / coloring / layout)

**Status:** SPEC — written 2026-06-12 (session 18) from a full read-only inventory of the TUI stack.
Implementation is a delegated Sonnet wave; do not start a workstream without this spec's file
ownership and gates.

## Goal

Make the TUI feel alive and visually coherent: feedback during long operations (spinner +
progress), one consistent color language, and layout that adapts to the real terminal size.
No functional/menu-structure changes — this is presentation only.

## Non-goals

- No menu restructuring, no new commands, no manifest changes (manifest is also a dirty parked file).
- No external UI libraries (blessed/ink). The stack stays raw stdin/stdout + ANSI.
- No changes to search semantics, custom-selection behavior, or post-command keymap (test-pinned).

## Hard constraints (violating any of these = abort the workstream)

1. **Windows ConPTY:** `CUR_SAVE`/`CUR_RESTORE` (ESC[s/u) are broken — the engine repaints by
   counting visual lines (`engine.js:280-285`, `visualLineCount` at `engine.js:16-28`) and moving
   the cursor up. Any new rendering MUST either go through that mechanism or write strictly
   single-line `\r`-rewrites (spinner/progress). Never emit cursor save/restore.
2. **ASCII-first:** default glyphs come from `shared/lib/ui/ansi.js` `GLYPH` (all ASCII). Unicode
   (Braille spinner frames, `█░` bars) is allowed ONLY behind the existing `isRichTerminal()`
   gate exported by `engine.js`, with ASCII fallbacks (`| / - \`, `#`/`.`).
3. **Non-TTY safety:** every animation must no-op (single static line, no timer) when
   `!process.stdout.isTTY` or `--json`/`--verbose` is in argv — the automation tests drive the TUI
   through a pseudo-terminal harness and JSON consumers must never receive control sequences.
4. **Dirty-file boundary (parked 2026-06-11 batch — DO NOT TOUCH):**
   `backend/cli/tui/manifest.js`, `backend/cli/tui/asset_picker.js`,
   `backend/cli/commands/operational/status.js`,
   `tests/scripts/tests/sovereign_cli_human_surfaces.test.js`,
   `tests/scripts/tui_terminal_automation.test.js`. Workstreams below are scoped to avoid them;
   Phase B (deferred) covers what lands there after the parked batch is committed.
5. **Test-pinned behaviors that must stay green** (from `tests/scripts/tui_search_contract.test.js`,
   `tests/scripts/cli_ui_contract.test.js`):
   - `searchTerms` splits on `&`; `buildCustomSelection` auto-selects matches; missing terms
     reported separately.
   - Post-command keymap exactly: Enter→menu, R→rerun, B/ESC→back.
   - Heatmap cells exactly 9 chars wide, centered; legend present; FX defaults `fx-returns`.
   - Up/Down skip header rows; ESC semantics in search.
   - Manifest contracts (no `--prop-firm` flags on backtest/optimize, etc.) — untouched anyway
     per constraint 4.

## Phase A workstreams (clean files only — can run now)

### W1 — Spinner for loading commands (S)

- **New file** `backend/cli/tui/spinner.js`: `startSpinner(label)` → `{ stop(finalText?) }`.
  - ASCII frames `['|','/','-','\\']` default; Braille frames behind `isRichTerminal()`.
  - 100-120ms interval; renders `\r<frame> <label>...` + `CLR_LINE`; `stop()` clears the line
    or writes `finalText`. Timer must be `unref()`'d. No-op (print `<pointer> label...` once,
    return inert handle) when non-TTY.
- **Wire-up:** `backend/cli/tui/intersection.js:86-89` — replace the static
  `"<pointer> Label..."` print for `spec.loading` commands with start/stop around
  `handleCommand` dispatch (stop in `finally`).
- **Files owned:** `backend/cli/tui/spinner.js` (new), `backend/cli/tui/intersection.js`.
- **Tests:** new `tests/scripts/tui_spinner_contract.test.js` — non-TTY no-op shape, frame
  advance, stop() restores line, rich/ASCII frame selection.

### W2 — Semantic color layer + consistency pass (S)

- **Extend** `shared/lib/ui/ansi.js` with a `SEMANTIC` map (additive — do not rename existing
  exports): `HEADER` (cyan), `SELECTED`/`SUCCESS` (green), `WARN`/`PARTIAL` (yellow),
  `ERROR` (red), `MUTED` (gray), `VALUE` (white/bold). One definition, one comment block stating
  the language.
- **Audit + migrate** color usage in `backend/cli/tui/engine/engine.js` and
  `backend/cli/tui/visualizations.js` onto the semantic names. Visual output may change ONLY
  where current usage contradicts the language (e.g., cyan used for selection). Heatmap 5-level
  scale and 9-char cells stay byte-identical (test-pinned).
- **Files owned:** `shared/lib/ui/ansi.js`, `backend/cli/tui/engine/engine.js` (color refs only),
  `backend/cli/tui/visualizations.js` (color refs only).
- **Tests:** `tui_search_contract.test.js` must pass unmodified; add a small contract that
  `SEMANTIC` keys exist and map to defined codes.

### W3 — Render-helper extraction in the engine (S/M)

- **New file** `backend/cli/tui/engine/render_helpers.js`: `renderHeader(question, matchCount)`,
  `renderSeparator(width)`, `renderSearchBar(...)` (move from engine), `renderItemRow(option,
  {selected, checked, partial, isHeader})` — deduping the three near-identical `render()` bodies
  in `promptSelect`/`promptMultiSelect`/`promptText`.
- Pure refactor: rendered byte output must be identical before/after (assert by capturing one
  frame of each prompt in a test fixture). Separator width: take from
  `Math.min(process.stdout.columns || 80, 80)` instead of hardcoded 80 — this is the ONE
  permitted visual change (narrow terminals stop wrapping).
- **Files owned:** `backend/cli/tui/engine/render_helpers.js` (new),
  `backend/cli/tui/engine/engine.js`.
- **Abort condition:** if identical-output refactor proves impossible without touching search or
  keymap logic, abort and report rather than altering behavior.

### W4 — Dynamic page size / width awareness (M)

- `layoutConfig()` consumers (`engine.js:196,411`) currently use fixed page sizes per preset
  (compact 8/10, research 14/16, default 10/12 — `shared/lib/settings/runtime.js:44-52`).
  Change: treat preset values as a **cap**, derive effective page size from
  `process.stdout.rows` (rows − chrome lines, min 5), re-evaluated per prompt invocation
  (cheap; no SIGWINCH listener needed for v1).
- Single-column layout stays (multi-column is out of scope — open user decision below).
- **Files owned:** `backend/cli/tui/engine/engine.js` (page-size derivation only),
  `shared/lib/settings/runtime.js` (comment + cap semantics only; defaults unchanged).
- **Tests:** unit test the derivation function (rows→page size, preset cap, non-TTY default).

### W5 — Progress bar utility (M, partially deferred)

- **New file** `backend/cli/tui/progress.js`: `createProgress(label, total)` →
  `{ tick(n?, note?), done() }`; renders `\r[####....] 42% label (note)` single-line, ASCII
  default, throttled to ≥100ms between paints, non-TTY → prints 25/50/75/100% milestone lines.
- **Wire-up now (clean file):** mass-backfill / backfill loop in
  `backend/scripts/data_ops/ingest_market_data/` is DIRTY (parked) — so v1 wires ONLY
  `backend/cli/commands/research/research.js` backtest/optimize iteration loops IF clean
  (verify `git status` first; if dirty, ship the utility + tests with no call sites and note it).
- **Files owned:** `backend/cli/tui/progress.js` (new), plus at most one clean call site.

## Phase B (DEFERRED until the parked 2026-06-11 batch is committed)

- Cockpit/status card visual polish (`status.js` — dirty), incl. replacing the `═`/`■` Unicode
  with `GLYPH`/rich-gated equivalents.
- Asset-picker hierarchy caching + step-header restyle (`asset_picker.js` — dirty).
- `?` help overlay listing keybinds (touches `tui_terminal_automation.test.js` expectations —
  dirty).
- Manifest label/loading-flag tuning (`manifest.js` — dirty).

## Gates (run by the orchestrator, not the agents)

1. `node --check` on every touched file.
2. Targeted: `tui_search_contract`, `cli_ui_contract`, new spinner/progress/layout tests.
3. Full `npm test` — baseline 284/284, target ≥284 with new tests added.
4. Manual smoke: `node backend/cli/sovereign_cli.js` interactive — menu nav, search, multi-select,
   one `loading: true` command (spinner visible, line restored), resize-narrow terminal sanity.
5. Non-TTY smoke: pipe a command with `--json` and assert zero ANSI control bytes in output.

## Open user decisions

1. Unicode polish (Braille spinner, `█░` bars, box-drawing) default-on for rich terminals, or
   ASCII everywhere until explicitly enabled in settings?
2. Multi-column layout for wide terminals — wanted at all? (Adds real complexity to the
   repaint model; recommended: no for v1.)
3. Phase B timing — land the parked 2026-06-11 batch first (recommended), or carve Phase B
   around it?
