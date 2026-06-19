---
name: session-retrospective
description: A session-close retrospective workflow that extracts architectural truths and lessons learned for future planning.
---

# Sovereign Engineering Master Retrospective

## Core Principle
> **The Agentic Memory Skill**: Every session must conclude with an architectural 'truth' extraction. These lessons inform future planning and prevent regressions in high-performance agentic systems.

---

## 🏗️ Architectural Truths (Cross-Project)

### 1. Terminal UI Performance (The Drift Truth)
- **Problem**: High-frequency terminal loops (20Hz+) are extremely sensitive to I/O and algorithmic complexity.
- **Learning**: Synchronous calls to `predictor.forecast()` or database scans during a render cycle *will* cause `Errno 22` on Windows.
- **Solution**: Decouple Render from Logic. Use throttled internal caches and incremental state (O(1) caching).

### 2. High-Fidelity Data Extraction (The Vision Truth)
- **Problem**: OCR and vector extractors (pdfplumber) fail on dense grids or custom icons (e.g., insulin markers).
- **Learning**: High-resolution rasterization (576+ DPI) combined with HSV color-space masking is superior to OCR for physiological marker detection.
- **Solution**: Isolation of color ranges (Purple/Orange) before centroid detection.

### 3. API Signature Integrity (The Keyword Truth)
- **Problem**: Positional arguments are fragile in evolveable agentic systems.
- **Learning**: Passing objects where lists are expected (or vice versa) without explicit keyword guards leads to silent logic drift or runtime `TypeError`.
- **Solution**: Enforce keyword-only signatures for critical trajectory/prediction methods.

### 4. Logic Priority (The Verdict Truth)
- **Problem**: Generic alerts can mask high-risk physiologic states.
- **Learning**: Critical safety checks (e.g., Faint Risk vs Hyperglycemia) must be ordered by physiological severity, not numerical value.
- **Solution**: Reorder decision matrices to capture trend-based risks before threshold-based alerts.

### 5. Large File Bottleneck (The Log Truth)
- **Problem**: Attempting to read or search extremely large files (85MB+ logs) using standard tools causes timeouts and encoding crashes.
- **Learning**: Use "Early Instrumentation" (proactive logging) rather than "Late Searching". Use targeted range-reads for forensics.
- **Solution**: Instrument `main.py` entry points for full traceback capture.

### 6. ESM/TypeScript Resolution (The Resolution Truth)
- **Problem**: TypeScript `TS2307` errors when using explicit `.js` extensions in source files for ESM compatibility.
- **Learning**: Explicit `.js` extensions in imports are required for Node.js ESM at runtime but require `moduleResolution: "nodenext"` or `"bundler"` in `tsconfig.json` to resolve correctly to `.ts` source files.
- **Solution**: Standardize `tsconfig.json` across frontend and backend to avoid "Invisible Module" errors.

### 7. Native Module Sync (The Binding Truth)
- **Problem**: Systems relying on C++ native bridges (e.g., `terminus_core`) fail if bindings are out of sync with the TypeScript interfaces.
- **Learning**: Native module interfaces should be treated as "Hard Contracts". Any change in the C++ layer must be mirrored by an immediate version-bump in the TS type definitions.
- **Solution**: Use an Automated Binding Generator or a shared `definitions.h` to minimize divergence.

### 8. The Re-Initialization Paradox (The State Paradox)
- **Problem**: Re-initializing stateful filters (Kalman, DSP) on every data point causes performance degradation and mathematical noise.
- **Learning**: DSP filters must maintain persistent state buffers even across "stale data" gaps to ensure convergence.
- **Solution**: Implement "Warm-Start" logic for filters that stores the last valid state in a persistence layer.

### 9. Session Filter Boundary (The Hour-vs-Gap Truth)
- **Problem**: `filterEquitySessionGaps` initially used a 10-minute intra-session gap rule. Normal bars (09:30 → 12:00) are 150 minutes apart — well above the threshold — so all mid-session bars were silently dropped.
- **Learning**: Equity session filtering must operate on *absolute time-of-day bounds* (NYSE 09:30–16:00 ET), never on consecutive-bar spacing. Inter-bar gaps within a session are expected and unbounded (up to 6.5h).
- **Solution**: Filter by session hour only. The consecutive-gap rule is only meaningful at session *boundaries* (overnight/weekend), not within a live session.

### 10. PowerShell Heredoc Corruption (The Shell Escape Truth)
- **Problem**: Writing Node.js files containing template literals (`` ` ``) via PowerShell `@"..."@` heredocs corrupts the output — backtick-dollar sequences (`${}`) are interpreted by PS before reaching node.
- **Learning**: PowerShell heredocs are *not* raw strings — they expand `${}` and backtick escape sequences. Any JS code containing template literals written through `@"..."@` will be silently broken.
- **Solution**: Write JS source files via a separate `.js` temp script (`Set-Content` for the script, `node _write.js`) or use `[System.IO.File]::WriteAllText` with careful quoting. Never use PS `@"..."@` for multi-line JS with template literals.

### 11. Subagent CLI Wiring Gap (The Contract Boundary Truth)
- **Problem**: The FW3 subagent correctly implemented `commandIntradayAccumulate` in `data.js` but could not touch `sovereign_cli.js` (outside its file ownership contract). The command was unreachable until the orchestrator wired it post-report.
- **Learning**: Subagent contracts must explicitly list the CLI entry-point file as *owned* by whichever agent adds the command — or the orchestrator must budget a mandatory wiring step after every new-command subagent reports.
- **Solution**: Add a standard "CLI registration" task to every new-command subagent contract, or create an explicit orchestrator reconcile step: *for each new exported command, verify it appears in sovereign_cli.js handlers before marking the task done*.

### 12. Pre-existing Env Failure Masking (The Green-Suite Illusion)
- **Problem**: `npm test` reported 450/450 on `feat/ml-onnx-section` but 444/450 on `main` post-merge, appearing as 6 merge regressions.
- **Learning**: Environment-dependent tests (broker creds absent, live API unavailable, cockpit LIVE card) can pass in one run and fail in another based on timing or test-runner ordering — not code changes. Never conclude "merge introduced regressions" without verifying the failures exist on the pre-merge branch too.
- **Solution**: Before investigating apparent merge regressions, always run the failing tests in isolation on the *source branch*. If they fail there too, they are pre-existing env guards, not regressions.

### 13. TTY Raw-Mode Boundary (The Piped-TUI Truth)
- **Problem**: Ink-based TUI dashboards fail (`Raw mode is not supported`) in CI or automated testing environments because standard input is piped and does not support raw mode.
- **Learning**: Ink applications require a real terminal TTY to capture key input. Never boot an Ink dashboard unconditionally in entrypoints targeted by automated pipe-based test harnesses.
- **Solution**: Check `process.stdin.isTTY` before launching the dashboard. Fall back to a standard readline-based TUI or non-interactive mode if false.

### 14. Object Safe Checks (The Optional-Manifest Truth)
- **Problem**: Reading keys of undefined properties (like `cmd.flags`) causes immediate crash on navigation.
- **Learning**: In customizable dashboards, commands may have different structures (some have flags, some have sub-commands, some have neither).
- **Solution**: Always use safe default guards (e.g., `cmd.flags || {}`) when querying schema metadata dynamically in loop iterations.

---

## ⚠️ The Mistakes Log (Documentation of Error)

### 2026-04-15: Log Hunt Failure (Sovereign Wealth)
- **Mistake**: Attempted broad `open().read()` and `grep` on an 85MB log file.
- **Why it was a mistake**: Triggered `UnicodeEncodeError` and wasted 15+ minutes on tool timeouts. Inefficient "needle-in-haystack" approach.
- **Correction**: Abandoned log search for proactive data hardening in `schema.py`.

### 2026-04-15: ESM Extension Mismatch (Terminus)
- **Mistake**: Using explicit `.js` extensions in `import` statements without configuring `nodenext` resolution.
- **Why it was a mistake**: Caused project-wide `TS2307` errors where sibling files existed but were "unresolvable" to the compiler.
- **Correction**: Aligned `tsconfig.json` module resolution settings.

### 2026-04-13: Cardiac Import Regression (Bio-Quant)
- **Mistake**: Forgot to export `CARDIAC_` constants in `medical_constants.py` secondary refactor.
- **Why it was a mistake**: Caused a total system `ImportError` on boot, blocking the ingestion pipeline.
- **Correction**: Implemented "Import Guarding" with safe defaults for optional modules.

### 2026-04-12: Uninitialized HR Constants (Hyperglycemia)
- **Mistake**: Referencing `HEART_RATE_MAX` before its definition in the global settings loop.
- **Why it was a mistake**: Crashed the metabolic coordinator on first run after a config change.
- **Correction**: Moved all biological constants to a top-level `Registry` that initializes *before* any logic modules.

### 2026-04-11: Unit Detection Ambiguity (Nightscout)
- **Mistake**: Assumed `mmol/L` units from Nightscout without verifying the raw JSON header value.
- **Why it was a mistake**: Caused 18x scaling errors in the forecast engine (mg/dL to mmol/L mismatch).
- **Correction**: Implemented automated unit heuristic detection at the `IngestionLayer`.

### 2026-06-13: Session Filter Over-Restriction (Sovereign Wealth)
- **Mistake**: `filterEquitySessionGaps` had a 10-minute consecutive-gap rule that dropped all normal mid-session bars (09:30→12:00 is 150 min > 10 min threshold → silently dropped).
- **Why it was a mistake**: The gap rule conflated *session boundary gaps* (overnight/weekend, correct to drop) with *normal intra-session spacing* (incorrect to drop). 5/6 tests passed because the failing case was the normal in-session scenario.
- **Correction**: Removed the consecutive-gap rule entirely. Hour-of-day bounds (09:30–16:00 ET) are sufficient and correct for equity session filtering.

### 2026-06-13: PowerShell Template Literal Corruption (Sovereign Wealth)
- **Mistake**: Used PowerShell `@"..."@` heredoc to write a Node.js test file containing template literals. The `${}` sequences were consumed by PowerShell, producing `timestamp: ${dateSuffix}T::.000Z` (corrupted) in the output file.
- **Why it was a mistake**: PowerShell heredocs expand variables and backtick escapes — they are not raw string writers. The corruption was silent (no error on write) but caused an immediate `SyntaxError` on first `node --test` run.
- **Correction**: Use a PS-written temp `.js` script with string arrays joined by `\n`, then execute `node _write.js`. Avoids PS interpolation entirely.

### 2026-06-13: Subagent Missing CLI Wiring (Sovereign Wealth — FW3)
- **Mistake**: The FW3 subagent contract did not include `sovereign_cli.js` in its file ownership, so the new `intraday-accumulate` command was exported but unreachable via CLI.
- **Why it was a mistake**: The subagent correctly flagged this as `OPEN_RISKS: No sovereign_cli.js wiring`, but the orchestrator still had to spend a cycle reading, editing, and syntax-checking the CLI entry file before the suite could pass.
- **Correction**: Future new-command subagent contracts must explicitly include the CLI router file, or the orchestrator reconcile step must always check: *for each new exported function, grep sovereign_cli.js for its name before closing the task*.

### 2026-06-13: Merge Regression False Alarm (Sovereign Wealth)
- **Mistake**: Treated 6 post-merge test failures as merge regressions and ran a full investigation (isolated runs, branch checkout, stash/pop cycle).
- **Why it was a mistake**: The 6 tests were pre-existing environment guards that fail whenever broker creds are absent. They were not caused by the merge. The `npm test` 450/450 on `feat/ml-onnx-section` appeared green because the test runner happened to skip them in that run.
- **Correction**: When post-merge failures appear, run the same tests on the source branch *before* concluding regression. Cost here: ~10 min of unnecessary investigation.

### 2026-06-19: Extrapolating Missing Files MJS vs TSX (Sovereign Wealth)
- **Mistake**: Assumed the dashboard did not exist because `.tsx` searches failed, and proceeded to scaffold a new one in `.tsx`.
- **Why it was a mistake**: The existing dashboard was written in `.mjs` using `React.createElement` instead of JSX. Wasted time creating redundant files.
- **Correction**: Expand files search filter to include `.mjs` when hunting for Node.js-based terminal utilities.

### 2026-06-19: Unconditional TUI Hijack (Sovereign Wealth)
- **Mistake**: Wired the new Ink dashboard to boot unconditionally on no-args execution in `sovereign_cli.js`.
- **Why it was a mistake**: Caused the entire automated test suite to crash with a stdin raw mode error because tests run in a piped environment.
- **Correction**: Enforce TTY guards (`process.stdin.isTTY`) on the dashboard launcher.

---

## 📝 Session Diary

### 2026-04-15: The Global Data Hardener
- **Context**: Sovereign Wealth UI crashes (`KeyError: 'currency'`) and Log processing bottlenecks.
- **Action**: Hardened `NormalizedMovement` schema. Consolidated cross-project mistakes into the Master Retrospective.
- **Artifacts**: schema.py, main.py instrumented, Master Retrospective (SKILL.md).

### 2026-06-13: The Batch Commit + FW3 Merge Session (Session 28)
- **Context**: 8 sessions of uncommitted work from sessions 26-27; P3/P4/FW3 on the fix roadmap; `feat/ml-onnx-section` awaiting merge approval.
- **Action**: Committed 5 stale code commits (sessions 26-27 batch). Implemented P3 equity session guard, P4 ML 5m cap, FW3 native intraday. Merged `feat/ml-onnx-section` → `main`. Used `/subagent-contracts /goal` to parallelize workspace docs, MATIC/POL P2 decision, and FW3 implementation across 3 concurrent subagents.
- **Incidents**: (1) Session filter over-restriction caught by test on first run — fixed by removing the consecutive-gap rule. (2) PowerShell heredoc corruption of template literals — worked around with temp .js script. (3) FW3 subagent missing sovereign_cli.js wiring — orchestrator fixed post-report. (4) Post-merge false alarm (6 pre-existing env failures, ~10 min lost). (5) Crypto backfill ENOENT (stale path in old process, resolved by backward-compat config copy).
- **Artifacts**: `shared/lib/market/equity_session.js`, `backend/scripts/data_ops/ingest_market_data/intraday_yahoo.js`, `backend/cli/commands/data/data.js` (+`commandIntradayAccumulate`), `sovereign_cli.js` (wired), `config/data_sources.yaml` (backward-compat alias). Suite: 450/450 JS. HEAD: `51b20b6c` on `main`.

### 2026-06-19: Full Screen TUI Refinement (Session 29)
- **Context**: Refining the full-screen Ink TUI; implementing nested "Bot" menu, replacing "cancel" with "back".
- **Action**: Discovered `sovereign_dashboard.mjs`, added nested `subcmds` and `'subcmd'` focus level for the `bot` control panel, wired command strings. Configured TTY checks to prevent test suites from crashing on raw-mode stdin limitations. Cleaned up redundant `.tsx` scaffold.
- **Incidents**: (1) Automated test failure due to non-TTY dashboard execution, resolved via `process.stdin.isTTY` check. (2) Missed `.mjs` extensions during initial file search.
- **Artifacts**: `backend/cli/sovereign_dashboard.mjs`, `backend/cli/sovereign_cli.js`. Suite: 490/490 JS.

