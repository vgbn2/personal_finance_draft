# Module 07 — How Tests Actually Run Today

`docs/operational/guides/testing_surface.md` is the grouped-command reference. This module explains how
the runner behaves and how to debug individual slices. Its "Hard Rule" remains the governing standard:
tests should show real data flow, not only pass/fail.

## The one gotcha that costs the most time if you don't know it

**`npx jest` does not work on this codebase's own test files and will lie to you.** It mis-parses the
`node:test`-format files and reports false failures. The real runner:

```bash
npm test                          # = node tests/run_node_tests.js
```

which spawns `node --test` against glob patterns covering `tests/scripts/**/*.test.js` and
`tests/web/**/*.test.js`. If you ever see a confusing failure that "shouldn't be possible," check which
runner produced it before debugging the code.

## Where tests live and what kind

| Folder | Kind |
|---|---|
| `tests/scripts/lib/` | Unit tests on pure functions/helpers (e.g. `alpaca_bot_cycle.test.js`, `backend_bridge.test.js`) |
| `tests/scripts/architecture/` | Contract/structure tests — API shape, config integrity, security checks |
| `tests/scripts/data/` | Backfill/ingestion regression and data-flow tests |
| `tests/scripts/integration/` | Live-path integration (some gated behind `SOVEREIGN_LIVE_TEST=1`) |
| `tests/scripts/tui/` | Interactive-UI tests via the fake-TTY harness (module 05) |
| `tests/scripts/strategy/` | Strategy-specific tests |

## C++ tests

```bash
npm run test:core
```
This seeds the required fixture, builds the Release native target, and runs every executable registered
with CTest. Read the emitted discovery/pass/fail counts rather than relying on a stale hard-coded total.

## Hygiene check

```bash
npm run hygiene
```
runs `scripts/dev/check_hygiene.js`, which checks five categories: **Git Noise** (tracked artifacts that
should be ignored), **Symlinks** (broken links, submodule drift), **Agent Skills** (stale skill folders),
**Code Markers** (lingering TODO/FIXME/"dev review" comments), **Docs Alignment** (presence of the
workspace truth files). This is a fast, deterministic pass-worth-running before claiming any session's
work is done.

## Labs

**Lab 1 — reproduce the jest gotcha yourself.**
```bash
npx jest tests/scripts/lib/alpaca_bot_cycle.test.js
```
vs
```bash
node --test tests/scripts/lib/alpaca_bot_cycle.test.js
```
Compare the two outputs. Now you'll recognize this failure mode instantly if you hit it again.

**Lab 2 — run the real full suite and read the summary line, not just "passed."**
```bash
npm test
```
What are the exact tests/pass/fail/skip counts? Open `workspace/STATE.md`'s most recent session entry
and compare — does it match what you just ran, or has something changed since the last recorded number?

**Lab 3 — find a real pure-function test and explain why it needs no mocks.** Open
`tests/scripts/lib/alpaca_bot_cycle.test.js` and find the tests for `buildExitOutcome`. Why can these run
with zero I/O, no spawned process, no fake broker — and what does that tell you about which parts of
`alpaca_bot_cycle.js` are *not* covered by these specific tests (module 04 names the function that still
has a gap here)?

**Lab 4 — run hygiene and read every category.**
```bash
npm run hygiene
```
If anything fails, that's real signal — read the specific finding rather than just noting pass/fail.
