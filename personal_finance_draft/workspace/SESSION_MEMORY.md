## Session Memory - 2026-06-25 (session 59) Focused blast-through + mass-implement + a real bug fix + a full docs triage/rebuild; 2 commits so far (264e4ee2, 2865299f), 1 code batch still held uncommitted; suite 630/628/0fail/2skip at last full run

{
  "work": "Five phases. (1) Focused /blast-through (anchor 1c7227b7->5e60babb, Tier 1 = the 2 commits the ledger hadn't seen yet). (2) /mass-implement on that audit's own 3 findings. (3) User reported 'it still defaults to the trade in the legacy version' -- a different root cause than session 58's fix, found and fixed. (4) User: 'I'm forgetting things in this repo due to vibecoding without documentation, reverse engineer it, give me a course.' (5) 'commit this batch and put those into git ignore.'",
  "key_mechanisms": [
    "BLAST-THROUGH FOUND A REAL BUG IN THE SESSION-58 FIX ITSELF: the oversell clamp (resolveExitQty) correctly stops a broker-level oversell when two tracked positions share one symbol, but runAlpacaExitCheck's bookkeeping afterward was wrong -- realizedPnl used the pre-clamp position.qty instead of what was actually sold, and the unsold remainder was dropped from tracking entirely instead of staying open. Zero integration-test coverage on that function (only the pure helpers were tested). Also found (no active leak, verified by tracing every --pin write site repo-wide) that the cf4f7026 PIN-strip fix only covered 1 of 8 buildTradeGatewayLaunch callers.",
    "MASS-IMPLEMENT FIX: new pure buildExitOutcome(position, exitReason, currentPrice, sellQty, cycleId, isLive) helper in alpaca_bot_cycle.js, same pure-function pattern as decideExit/resolveExitQty specifically so it's testable without mocking the broker/gateway. Centralized the PIN strip into buildTradeGatewayLaunch itself (shared/lib/runtime/backend_bridge.js) instead of just the one caller -- moved stripFlagValue there too (correct dependency direction, cli already depends on shared). +7 tests.",
    "THE 'STILL DEFAULTS TO LEGACY' BUG WAS DIFFERENT FROM SESSION 58's: the alpaca dashboard entry had flags:{}, so it always launched commandTrade with args=[], which hits the args.length===0 branch -> the full multi-step interactive wizard (promptTradeDeskArgs). Fixed by giving the manifest entry real --action/--symbol/--qty/--order-type/--price/--pin/--live flags and a new pure buildTradeArgsFromActionFlag() that translates them back into the wizard's own positional shape before commandTrade's dispatch -- so args.length is never 0 from the dashboard. Removed alpaca from INTERACTIVE_CMDS. Verified end-to-end by tracing buildArgv+defaultFlagValues, not just by code review. +7 tests.",
    "DOCS DISCOVERY (the big one): before building a 'reverse-engineering course' from scratch, checked whether docs already existed -- found docs/ already has 30+ files (a canonical folder map, a 24-chapter ~5000-line 'build from scratch' book, specs, operational guides) that NEVER get read at session boot (session-orchestrator only reads workspace/*.md; CLAUDE.md never mentions docs/). That's the real diagnosis, not 'no documentation exists'. Stopped and asked the user how to handle it (AskUserQuestion) instead of building something redundant.",
    "TRIAGE FOUND REAL STALENESS, NOT JUST OLD DATES: docs/engineering/architecture_overview.md (header dated 2026-05-14) calls live broker execution '*Planned*' and claims the C++ build doesn't compile the trading modules -- both false today. docs/engineering/capability_manifest.md describes a flat backend/cli/commands/*.js layout and SQLite data/ artifacts that don't match the real domain-subfoldered layout and storage/data/ts/ binary format. docs/operational/guides/testing_surface.md describes a since-reorganized test layout. 17 of docs/README.md's OWN links are broken -- every docs/operational/*.md reference points at files that moved into guides/roadmap/local_first subfolders without the hub being updated.",
    "FIX: workspace/BOOTSTRAP.md created (session-orchestrator already tries to read this first every boot; it just never existed -- that's WHY docs/ kept falling out of context for ~50+ sessions). Points at docs/README.md with the staleness corrections baked in. docs/codebase_tour/ created (8 modules, ~750 lines): real file:line-grounded explainers + hands-on labs for the genuine gap (current-code reverse engineering -- docs/guide/ is a different genre, generic teaching content with placeholder filenames, not this repo's real code). Every claim in the highest-stakes module (04_trading_gateway_live_orders.md) was personally re-verified against current line numbers via direct grep, not just trusted from the 8 parallel research agents' summaries.",
    "RESEARCH WAVE PATTERN: dispatched 8 parallel Explore agents (research only, explicitly told not to write files) to gather file:line-grounded facts across C++ core, data pipeline, strategy/ML, trading gateway, TUI/CLI, web dashboard, testing, architecture/auth -- then personally wrote every module's actual prose and labs from their findings (never delegated the synthesis/understanding itself).",
    "GIT HYGIENE CLOSED A LONG-STANDING RECURRING NOISE PATTERN: notebooks/signal_library.json, storage/data/{features,models}/latest_*.json, and storage/data/user_settings.json had shown up as routine cron-modified noise in git status across dozens of prior sessions' notes (always 'not reviewed as code, consistent with prior sessions', never actually fixed). User explicitly asked to gitignore them this session -- extended .gitignore (which already had the identical pattern for sibling files like latest_backtest.json/strategy_grade_index.json -- this was closing a gap in an existing convention, not inventing a new one) and git rm --cached the 5 already-tracked files. Files stay on disk, just stop being tracked.",
    "COMMIT SCOPING: user said 'commit this batch' (the docs) while explicitly choosing to hold 'the still-uncommitted code from earlier' (the mass-implement + alpaca-fix code). Honored that split exactly -- two separate commits (chore: gitignore, docs: triage+BOOTSTRAP+codebase_tour), explicitly excluding backend/cli/commands/trade/trade.js, alpaca_bot_cycle.js, backend_bridge.js, utils.js, sovereign_dashboard.mjs, and their tests from both."
  ],
  "verified": [
    "Suite 630/628/0fail/2skip after the alpaca-trade-flag fix (+7 over the post-mass-implement 623/621 baseline); npm run hygiene clean throughout, including after adding all 9 new docs files.",
    "Every command cited in a codebase_tour lab was cross-checked against a real grep/read this session, not assumed from the research-agent summaries alone (e.g. confirmed auto-trade --passes 1 is gated behind ai_agent_trading before adding that as a lab caveat; confirmed the Gate.io adapter's real line numbers before citing them).",
    "End-to-end traced (not just read) that pressing Run on the dashboard's alpaca entry with untouched defaults now produces args=['balance'] after translation, never an empty array."
  ],
  "user_decisions": [
    "AskUserQuestion (course format + scope): 'Hands-on labs tied to real code' + 'Full breadth across every subsystem'.",
    "AskUserQuestion (how to handle the discovered existing docs/ library): 'Triage + wire it into boot, then build only what's missing' -- rejected both 'ignore and duplicate' and 'just show me, build nothing yet'.",
    "'commit this batch and put those into git ignore' -- interpreted 'those' as the long-flagged routine data-artifact files (high-confidence read from session history + the existing .gitignore's own sibling patterns), confirmed by checking which files actually fit before acting.",
    "Explicitly chose to hold the code batch (trade.js/alpaca_bot_cycle.js/etc.) uncommitted for now, separate from the docs commit."
  ],
  "remaining": [
    "The code batch (Alpaca trade-flag fix + mass-implement's 3 fixes) is still uncommitted on feat/ink-tui-refactor -- user's call on when to commit it.",
    "The stale docs found in the triage (architecture_overview.md, capability_manifest.md, testing_surface.md, docs/README.md's 17 broken links) were flagged, not fixed -- deliberate, out of scope for this pass.",
    "graphify-out not refreshed -- the uncommitted code diff is moderate-sized; deferred until after it's committed, consistent with prior-session precedent for this-sized diffs.",
    "Standing real-terminal confirmations (trade in-pane behavior, bt --strategy picker, backend visualize force-ingest) and the Gate.io spot market-order semantics empirical probe remain open from before this session."
  ],
  "dcs": 0.96
}

## Session Memory - 2026-06-23 (session 58, cont.) Fixed all 4 review findings + trade-section UX; 3 commits (cf4f7026, 13bc91f0, 5e60babb); suite 616/614/0fail/2skip


{
  "work": "After the review (block below), the user ran /mass-implement twice and reported a trade-section bug. Three commits landed.",
  "key_mechanisms": [
    "REVIEW FIXES (cf4f7026): pure helpers canOpenPosition/resolveEntryQty/resolveExitQty in alpaca_bot_cycle.js + per-symbol availableBySymbol exit counter; strategy.js loads post-exit count and gates live entries on maxPositions; trade.js strips --pin before buildTradeGatewayLaunch (stripFlagValue, new export in utils.js); manifest.js legacy 'Positions' got a --live toggle. +11 tests (22 in the two runtime test files). shared/lib/runtime B->A, backend/cli B->B+.",
    "TRADE SECTION 'GOES TO LEGACY' (13bc91f0) -- NOT a crash: strategy/prop-firms/run/'trade favorites' were in sovereign_dashboard.mjs's INTERACTIVE_CMDS, which unmounts the Ink dashboard and spawns the command with stdio:inherit -- those commands are old prompt-menus, so the user saw the 'legacy' UI. Removed them from INTERACTIVE_CMDS -> they run IN-PANE. commandStrategyMenu non-interactive auto-resolved promptSelect to the first option 'new' -> 'strategy new requires a name'; added `if (!isRichTerminal()) return commandStrategy(['list'])`. prop-firms/run/favorites already defaulted to a safe list.",
    "STRUCTURAL GOTCHA: the Ink dashboard (sovereign_dashboard.mjs) uses its OWN inline `M` menu model with flag shape {t,opts,lbl,def} -- NOT tui/manifest.js (which is the LEGACY runInteractiveMenu engine, shape {type,options,label,default}). Editing manifest.js does NOT affect the dashboard. This is why my earlier 'tracker is in the dashboard' answer was WRONG and why the session-57 'one dashboard manifest entry' claim was false.",
    "POSITIONS ENTRY (5e60babb): added {id:'auto-trade status', label:'positions', --live yn} to the dashboard M Trade section AFTER auto-trade (index 5; index 4 stays auto-trade so sovereign_dashboard.test.js's pinned initialCmdI:4 holds). Moved the read-only `status` branch AHEAD of the ai_agent_trading featureGate in commandAutoTrade so viewing positions never needs the live-trading flag.",
    "CRASH CAPTURE: added a launch-guarded (process.argv[1]===this file) global uncaughtException/unhandledRejection handler writing argv+stack to workspace/dashboard_crash.log -- the long-standing //crashes reports never left a trace. Guarded so test imports of the module don't install it."
  ],
  "verified": [
    "Suite 616/614/0fail/2skip at each commit (full runs; one run done by the user in their shell during a classifier outage). Dashboard + in-pane hang-safety sweep 19/19. Hygiene clean. C++ 28/29 ctest.",
    "auto-trade status exits 0 with the feature flag OFF (read-only ungated). strategy in-pane shows the 14-strategy registry list (was erroring). Dashboard Trade entries: 4:auto-trade 5:auto-trade status."
  ],
  "user_decisions": [
    "AskUserQuestion: trade-section behavior -> 'Run in-pane (stay in dashboard)'. Earlier mass-implement scopes -> implement all 4 findings + the TUI --live fix. Three explicit 'commit's / 'mass-implement's / 'fix that'.",
    "INFRA: a sustained Anthropic safety-classifier outage repeatedly refused Edit/Bash mid-session ('temporarily unavailable, auto mode cannot determine safety'); retried until it recovered; user ran the full suite in their own PowerShell when my Bash was blocked."
  ],
  "remaining": [
    "Real-terminal confirmation (user's, no conhost in CI): trade commands now stay in-dashboard (in-pane); plus standing bt --strategy / backend visualize checks.",
    "Highest-impact open gap (DEV_REVIEW s58): Gate.io spot market-order semantics empirical paper probe (index.ts:309-319) -- amount=base-vs-quote + market TIF, reviewed at gateway level only.",
    "graphify-out (repo root) stale since 2026-06-09; deferred (localized 7-file diff).",
    "Lower: realized-P&L pre-sell snapshot price (logging only); C++ kronos_integration_test needs >=4 seeded data points."
  ],
  "dcs": 0.97
}

## Session Memory - 2026-06-23 (session 58) Deep order-placement review (the session-57 flag); full blast-through across all 3 execution surfaces + new shared/lib/runtime + lightweight C++ pass; review-only, 0 commits; DCS 0.96→0.97; no gating findings, 4 OPEN findings

{
  "work": "Boot via session-orchestrator. The standing flag (set sessions 57) was: session 58 is a deep review of every API-bot connection that places real orders. User chose 'Full ledger sweep' + 'I drive it inline' at boot (AskUserQuestion). Ran it as a real blast-through (anchor 0903df6b->HEAD 1c7227b7).",
  "key_mechanisms": [
    "GATEWAY EXIT-CODE PROPAGATION IS THE LOAD-BEARING SAFETY PROPERTY: the new Alpaca bot (entry in strategy.js, exit in alpaca_bot_cycle.js) keys ALL its position-tracking decisions off commandTrade's return code. Confirmed the gateway single-order CLI path sets process.exitCode=1 on FAILED/RISK_REJECTED (index.ts:2054-2057) -> spawnSync result.status=1 -> a failed live buy is never recorded as a phantom position, and a failed live exit sell keeps the position tracked (remaining.push at alpaca_bot_cycle.js:107-116). This was my initial worry; already handled.",
    "BOTH live paths run the full PIN/auth gate because they call commandTrade IN-PROCESS (require), not via a CLI spawn that would bypass it. canLiveExecute + requireAuth + verifyPin all execute. PIN gate fails closed: unattended LIVE without SOVEREIGN_TRADE_PIN returns 1 (trade.js:317-320). Risk engine (RiskEngineBridge.checkRisk) also fails closed: missing binary or engaged kill-switch rejects in LIVE; dry-run bypass guarded by LIVE_TRADING!=='true' && !--live.",
    "FINDING maxPositions UNENFORCED (Med-High): config.maxPositions (default 10) is DISPLAYED by auto-trade status as positions.length/maxPositions, implying a cap, but neither runAutomationPass nor recordAlpacaEntry checks state.positions.length before opening a new live position. Unattended loop can exceed its own concurrency limit.",
    "FINDING PIN LEAK (Med): commandTrade appends --pin <SECRET> to args (so the JS gate can read it) then passes the SAME args to buildTradeGatewayLaunch(args) which spawns the gateway (win32: powershell -Command string) WITH --pin SECRET in the command line -> visible in tasklist/ps. Gateway never even consumes --pin. Pure leak. Fix: strip --pin+value before spawn (one point covers entry/exit/manual).",
    "FINDING qty NOT RECONCILED (Med): recordAlpacaEntry re-queries the broker for fillPrice (correct) but records qty: Number(qty) from the REQUEST, not brokerPos.quantity (already in scope). Partial fill -> tracked qty > real holding -> later exit sells position.qty -> oversell rejection. Plus same-symbol stacking (each new bar = new signalId = new tracked position) lets the exit loop sell multiple positions for one symbol against one snapshot -> oversell.",
    "C++ LIGHTWEIGHT PASS: ctest -C Debug in backend/core/build = 28/29 green; only fail is kronos_integration_test ('Not enough empirical data points... need at least 4') = data-availability, not a code regression. Order-relevant tests (kill_switch, execution, portfolio_risk) all green. Stamped the ledger row (first-ever) so it stops being carried-forward-unreviewed.",
    "TESTING GOTCHA RE-CONFIRMED: npx jest FALSELY reports the runtime tests as failing because it mis-parses node:test files. The real runner is `node --test` (or npm test = node tests/run_node_tests.js). alpaca_bot_cycle.test.js + alpaca_bot_state.test.js = 11/11 under node --test."
  ],
  "verified": [
    "C++ 28/29 ctest (1 data-availability fail). New runtime tests 11/11 via node --test.",
    "Gateway exit-code propagation, fail-closed risk engine + PIN gate, Alpaca 422 fix — all confirmed by direct code trace.",
    "Section 3 stub/dup sweep: the 1-line shared/lib/<name>.js entries (backend_bridge/paths/env/execution_memory/config_loader/persistence_bridge/run_loop/polymarket_history) are thin re-export shims over shared/lib/runtime|market — NOT dead (same class as the s55 polymarket_history false-positive). No reachable stubs on order paths."
  ],
  "user_decisions": [
    "AskUserQuestion at boot: 'Full ledger sweep' (scope) + 'I drive it inline' (execution, no sub-agents)."
  ],
  "remaining": [
    "4 OPEN findings, review-only, awaiting user go-ahead for a fix pass: (1) maxPositions cap, (2) PIN-strip-before-spawn, (3) qty reconciliation on entry, (4) exit oversell / same-symbol dedup. Suggested: one focused commit for 1/3/4 (alpaca_bot_cycle.js+strategy.js) + one-line trade.js fix for 2.",
    "kronos_integration_test needs >=4 seeded Kronos data points (or mark data-required).",
    "Pre-existing real-terminal carryovers untouched (legacy<->dashboard switch, bt --strategy picker, backend visualize force-ingest)."
  ],
  "dcs": 0.97
}

## Session Memory - 2026-06-23 (session 56) "/" chat suggestion dropdown + generalized cursor-position math + legacy-TUI engine switch made symmetric; 0 commits (all uncommitted, pending user go-ahead); suite ended 594/592/0fail/2skip, hygiene clean

{
  "work": "Picked up directly from session 55's typing-lag/cursor fix. User asked whether anything shaped like a command-suggestion dropdown would break the hardcoded H-3 cursor math, then asked for that feature plus a way back to the old TUI. Three rounds, two of them corrected mid-flight by the user.",
  "key_mechanisms": [
    "CURSOR MATH GENERALIZED: the existing H-3 cursor-Y math (session 55) assumed the chat bar was always exactly 4 fixed lines. Added a '/'-triggered command-suggestion dropdown (suggestCommands/allCommands exported from chat_parser.js) rendered INSIDE the same bordered box, and generalized the math to H-3-suggestionRowCount, with suggestionRowCount shared between the render and the cursor effect so they can't independently drift -- the exact failure mode the user was worried about.",
    "SEPARATE LATENT BUG FOUND AND FIXED: while auditing the cursor math, found the chat input row had no height cap -- a long typed command could trigger Ink's default text-wrap and grow the row to 2+ lines, breaking the cursor regardless of the new suggestion feature. Fixed with height:1 + overflowY:'hidden' on that row (clips instead of growing); suggestion rows get wrap:'truncate-end' for the same reason.",
    "NO DOUBLE-KEYSTROKE-HANDLING: verified from ink-text-input's source before wiring suggestion-list navigation that TextInput's own internal useInput hook explicitly ignores up/down arrow and Tab -- so the parent component's new handling of those keys for the dropdown never races with TextInput's own handling of the same keystroke.",
    "FIRST 'LEGACY MODE' ATTEMPT WAS WRONG (direct user correction): built a legacy_tui feature-flag (later moved to layout='legacy') that just hid the chat bar inside the SAME Ink dashboard. User: 'NO DIFFERENCE, shouldn't it just log out of this and point to the manifest' -- there's a genuinely separate, older engine (tui/engine.js's runInteractiveMenu, prompt-based, already toggled today via LEGACY_TUI=1 env var) that the user meant. Fully reverted the dashboard-internal hiding logic (initial focus, cursor-effect guard, Tab guard, footer hint, render gating) rather than leaving it as dead weight alongside the real fix.",
    "REAL FIX: Settings > Layout > legacy now makes the dashboard call exit() immediately after the settings command persists (sovereign_dashboard.mjs's handleRun), and sovereign_cli.js's boot loop re-reads the setting and launches the real runInteractiveMenu next.",
    "SYMMETRY FOLLOW-UP (user's own next question): 'shouldn't the legacy have an option to switch to the newer one also?' -- added 'legacy' as a 4th --preset option to tui/manifest.js's OWN separate Settings entry (the legacy menu has its own independent manifest from the dashboard's), and made engine.js's runInteractiveMenu return (instead of looping back to its own menu) when the user picks any preset other than 'legacy' from inside it.",
    "CAUGHT A SELF-INFLICTED REGRESSION BEFORE SHIPPING IT: restructuring sovereign_cli.js's main() into a naive 'relaunch the other engine after every exit' loop would have trapped a normal q-quit in an infinite relaunch -- neither engine's exit path distinguishes 'user quit' from 'switched layout' (both just end the child process the same way, no explicit signal). Fixed by tracking loadSettings().layout before and after each run and only looping when it actually changed; otherwise the loop returns, ending the whole CLI exactly as before this change existed."
  ],
  "verified": [
    "Full suite 594/592/0fail/2skip across every edit round (multiple full reruns, not just once); npm run hygiene clean throughout.",
    "Dashboard-self-exit direction proven end-to-end via the Ink fake-TTY harness: typed '/cha' and '/back' in chat and confirmed the dropdown renders inside the box with correct highlight/Tab-fill behavior (throwaway diag scripts, deleted after each); typed 'settings layout --preset legacy' via chat and confirmed the Ink instance actually exits (waitUntilExit resolves) and the setting persists to disk as 'legacy'; confirmed Settings>Layout>legacy boots the dashboard straight into the grid sidebar with no chat bar when set before launch.",
    "Legacy->dashboard direction (the symmetry follow-up) verified by code trace + exact argv-shape matching only -- no existing test harness drives runInteractiveMenu's promptSelect flow, so this one still needs a live-terminal check.",
    "Isolated a flaky test failure (sovereign_cli_human_surfaces.test.js) to a pre-existing environmental flake unrelated to this session's changes -- that test's code path (spawnSync with explicit args) is untouched by any edit here, and reran clean 3/3 times in isolation."
  ],
  "user_decisions": [
    "'shouldnt it just be in the layout' -- redirected the legacy toggle from a new standalone feature_flag to the existing (previously-unused-stub) settings.layout field instead, alongside compact/research.",
    "'NO DIFFERENCE, shouldnt it just logout of this and points to the manifest' -- rejected the in-dashboard chat-bar-hiding approach entirely, redirected to the real separate legacy engine (tui/engine.js).",
    "'shoudlnt the legacy has an option to switch to the newer one also?' -- asked for and got the symmetric switch-back direction.",
    "'seems done for now, those interactive things are hard to debugg, maybe if you can see the screen and work with me ut would be easier, laev this for the future' -- closing the session; floated screen-sharing as a future collaboration mode for interactive TUI work, explicitly deferred, no action taken."
  ],
  "remaining": [
    "Live-terminal confirmation of the legacy->dashboard switch direction (pick default/compact/research from inside the real prompt-based menu, confirm it drops back into the dashboard) -- joins the existing pile of real-terminal-only carryovers (bt --strategy picker, backend visualize force-ingest, the typing-lag fix itself).",
    "Nothing committed yet this session -- 6 files touched (sovereign_dashboard.mjs, sovereign_cli.js, tui/chat_parser.js, tui/engine/engine.js, tui/manifest.js, shared/lib/settings/user_settings.js), pending user go-ahead.",
    "compact/research layout presets remain otherwise-unused stubs (set/persisted/displayed, no behavior) -- legacy is the first value in that field to actually do something; out of scope, just noted."
  ],
  "dcs": 0.93
}

## Session Memory - 2026-06-22/23 (session 55) Blast-through audit + 2 mass-implement passes (renameWithRetry+Atomics, 3 dead-shim deletions, gateway fetch-retry & processProposedOrders, full candlestick/SMA/volume chart upgrade, graphify AST refresh) THEN a long Windows-conhost typing-lag/cursor fix; ~14 commits; suite ended 594/592/0fail/2skip, hygiene clean

{
  "work": "Three phases. (1) Blast-through focused audit (anchor 03b3c8d5->0903df6b): session-54 chat/TUI surface clean; verified the new LLM command resolver is shell-safe by code-trace (argv-array spawn, no shell:true). (2) Mass-implement pass 1: renameWithRetry busy-wait->Atomics.wait + first tests; deleted 3 dead root shims (backfill/ingestion/market_validation) -- a 4th, polymarket_history, was WRONGLY flagged dead (grep blind spot: missed the .js-extension require form) and KEPT after a test broke; gateway 3 raw fetch->fetchWithRetry. (3) Mass-implement pass 2 (all 4 carryovers + last debt): gateway processProposedOrders failure reporting; full chart upgrade (renderCandlestickChart: candles + yellow SMA(N) overlay + volume subplot; --style/--sma/--volume flags); graphify-out AST-only refresh (11015->11542 nodes); typing-lag attempt. (4) Extended typing-lag/cursor debugging saga on sovereign_dashboard.mjs (Windows conhost), ultimately RESOLVED.",
  "key_mechanisms": [
    "DEAD-SHIM GREP BLIND SPOT: the 4-layer dead-check grep anchor `<name>['\"]` silently misses `require('.../<name>.js')` (the .js extension sits before the quote). Flagged polymarket_history.js as dead; deleting it broke polymarket_backtest.test.js. Restored via recovery rule; re-verified the other 3 with a `.js`-aware grep; FIXED the recipe in the blast-through SKILL.md so it can't recur (same false-negative class as session 29).",
    "CHART UPGRADE non-breaking: renderCandlestickChart is a sibling of renderPriceChart reusing the same scaffold; --style defaults to 'line', --sma defaults '' and --volume is yn-false, so default buildArgv output is unchanged EXCEPT --style line. Each manifest flag added shifts the dashboard nav test's Run-row down-count (had to bump it) and the chat-parser positional fill / contract argv assertions (had to update 2).",
    "TYPING-LAG ROOT CAUSE (the big one): chars ghosted/misplaced on Windows conhost. A standalone raw-mode probe (scripts/dev/diag_rawmode.mjs) proved raw mode works + NO terminal echo -> it was Ink MIS-POSITIONING, not echo. Cause: forced alt-screen buffer (\\x1b[?1049h) + fullscreen height made Ink's win32 per-keystroke FULL-frame redraw (ink/build/ink.js, gated on height>=viewport) place the cursor wrong on conhost. The hardware blinking cursor also sat at the frame bottom, never positioned into the input box.",
    "TYPING-LAG WHAT FAILED: rows-1 height hack to dodge the fullscreen branch -- in the alt-screen it freed the bottom row and conhost raw-echoed there (worse ghost). Reverted.",
    "TYPING-LAG WHAT WORKED (combination): render in NORMAL flow (drop \\x1b[?1049h; non-fullscreen rows-2 height, undefined when headless) + clear-on-mount + ink-text-input <TextInput> + (user-authored final piece) ink useCursor() relocating the REAL hardware cursor into the input cell with showCursor:false and explicit \\x1b[?25l/h. gemini-cli (_resources/gemini-cli) was the reference: it renders normal-flow by default (alt-screen opt-in) with a custom keypress parser.",
    "TEST-HARNESS GOTCHA: any setCursorPosition / cursor-only Ink write emits a cursor-only frame that clobbers fake-TTY snapshot assertions (broke 2 dashboard tests). Guard all real-cursor logic + clear-on-mount + ?25l writes with `if (!process.stdout.isTTY) return;` (harness process.stdout.isTTY is false).",
    "VIDEO REVIEW: no ffmpeg, but OpenCV (cv2) was available -- extracted evenly-spaced cropped frames from the user's .mp4 screen recording to Windows-temp PNGs (Read tool needs Windows paths, not /tmp) and read them as images to confirm typing behavior frame-by-frame."
  ],
  "verified": [
    "Suite green at each commit; final 594 tests / 592 pass / 0 fail / 2 skip; npm run hygiene clean throughout; gateway tsc --noEmit exit 0.",
    "Typing-lag fix user-confirmed via a screen recording (frames showed clean in-box typing) + their own live test ('problem resolved').",
    "useCursor IS a real ink export (verified before trusting the user's change)."
  ],
  "user_decisions": [
    "AskUserQuestion scopes: ran both mass-implement passes; 'all fours plus debt batches' for carryovers.",
    "Drove the typing-lag fix direction (TextInput-first, then normal-flow); ultimately wrote the useCursor relocation fix themselves.",
    "'problem resolved, end session' -- I made their uncommitted fix test-green (isTTY guard), committed it, and closed out."
  ],
  "remaining": [
    "Carryover #3 (user's): live real-terminal confirmation of `bt --strategy` picker + `backend visualize` force-ingest fallback (no conhost in CI); dev-review comments left in place.",
    "graphify-out stale again for the dashboard rewrite (deferred; consider tightening .graphifyignore before any full semantic rebuild -- doc-change set was mostly noise).",
    "Gemini's paste-aware custom keypress parser NOT ported -- input still arrives in bursts; only matters if burst/paste mangling resurfaces."
  ],
  "dcs": 0.97
}

## Session Memory - 2026-06-22 (session 54) Closed the 15-item dashboard dev-review bug backlog and built a chat-style command input (new default entry point); 2 commits; suite 580/578/0fail/2skip

{
  "work": "Boot surfaced 15 inline dev-review comments the user had left in sovereign_dashboard.mjs's manifest (crashes, broken commands, UX gripes, redundancy questions, feature requests). Planned (EnterPlanMode) and fixed the full backlog in one batch, verifying each fix by actually running the command rather than guessing. User then asked to 'mass implement' the previously-deferred chat-style redesign now instead of later; planned and built it (deterministic parser + LLM fallback + dashboard wiring). User reported it 'still crashes' (silent exit, no error) -- root-caused as a Windows console-group SIGINT broadcast, not the try/catch I'd already added. User then rejected the chat UI's first shape (a full alternate page) for being 'a whole another section', wanted a thin bar instead (showed a screenshot of Claude Code's own status bar as the reference) -- rebuilt it. User then reported a chart --width bug and a PowerShell typing-lag bug while live-testing the dashboard themselves; both diagnosed, one fixed (width clamp), one documented and deferred per user's own call given terminal-capability uncertainty.",
  "key_mechanisms": [
    "SHARED CRASH ROOT CAUSE: cockpit/polymarket markets/polymarket derive-creds/login all reported as crashing -- ran each directly via CLI first (all worked standalone), proving the bug was in the shared dashboard launch harness (runExternal), not 4 separate command bugs. Added try/catch around unmount/spawn/remount. User then reported it 'still crashes' (silent exit, no stack trace) -- that ruled out a thrown JS exception entirely (try/catch can't catch a process signal). Root cause: dashboard.unmount() restores cooked terminal mode; a Ctrl+C typed while the spawned child runs is a real console event that Windows broadcasts to the WHOLE console process group, and Node's default unhandled-SIGINT behavior is silent immediate exit. Fixed with a temporary no-op SIGINT listener bracketing the spawn window.",
    "POLYMARKET BACKTEST CRASH: real TypeError reproduced by running the command directly (not guessed) -- archivePaths(root = CACHE_DIR)'s default param only fires for undefined, but optionValue()'s own fallback-param chain collapses an omitted --archive-root flag to null first, so path.join(null,...) threw. Fixed by mirroring loadArchivedMarketIndex's existing `opts.root || CACHE_DIR` pattern in archivePaths instead of relying on the default-param syntax a second time.",
    "DASHBOARD TYPING BUG (confirmed via the existing fake-TTY Ink test harness, not assumed): flag-grid fields only entered edit mode on Enter; typing any other character while just browsing did nothing. Added type-to-edit: a printable keystroke on a focused text/pickSymbol/pickStrategy flag immediately enters edit/picker mode seeded with that character.",
    "CHAT PARSER SAFETY BUG (caught via my own ad-hoc smoke test, not by the unit tests I'd already written): a loose substring-anywhere match on the first token let garbled input like 'ate widget' silently resolve to and would have RUN the real 'strategy' command (str-ATE-gy). On a live-trading CLI a wrong silent match is worse than a safe 'didn't understand'. Fixed by requiring a prefix match (startsWith) before falling back to substring containment, and only for tokens 4+ chars.",
    "PIN GATE RENDERING BUG (found while wiring the chat input through the shared PIN-gate path, not from a user report): the PIN view's render was gated on the GRID's own selected cmd (`drilled = ... && !!cmd`), which is always null for a chat-resolved command -- the state machine correctly set focus:'pin', but the UI silently failed to render anything, falling back to whatever the grid's default view was. Fixed by making the PIN view a standalone view reading from `pendingRun` (set by the new shared `runOrGatePin` helper) instead of the grid's cmd/cmdI selection.",
    "CHAT UI REDESIGN (user-directed mid-session): built v1 as a full alternate 'SOVEREIGN CHAT' page (title, instructions, scrolling transcript) replacing the grid when active. User: 'why is there a whole another section, why can't you just add the chat section as a bar underneath?' (shared a screenshot of Claude Code's own terminal status bar). Rebuilt: grid always visible, chat reduced to a single-line bar with a top rule only (Ink Box borderTop:true/others:false), feedback routed through the existing Output panel's setOutput instead of a parallel chatHistory transcript (removed that state entirely).",
    "CHART WIDTH BUG: user reported the ASCII chart 'broke' past --width ~90 while live-testing. Root-caused: renderPriceChart()'s rendered line width is `width + 12` (8-char price label + margins + vline), not just `width` -- a requested width near the terminal's actual column count overflows and wraps every row mid-line, shearing the label column from the data. Fixed by clamping width to process.stdout.columns inside renderPriceChart() itself (one fix point covers both backend_chart.js and watch --symbol's live-chart mode).",
    "TYPING LAG ON POWERSHELL: user live-testing in the classic conhost.exe console (confirmed, not assumed) reported characters appearing in the bottom-right corner until a word boundary. Diagnosed as every keystroke triggering a full Ink re-render of the entire multi-line screen, requiring multi-line cursor-up ANSI movement that conhost.exe handles unreliably. User pushed back on 'just switch terminals' by asking why Claude Code's own CLI doesn't have this problem -- correct pushback: Claude Code's input is almost certainly a single-line \\r+clear-to-EOL redraw needing no multi-line cursor movement at all. Real fix (isolate the chat bar's redraw from the full-tree reconciliation) is a genuine architecture change; user approved deferring it, documented inline.",
    "PROCESS LEAK CAUGHT VIA TASKLIST, NOT BY THE TEST SUITE ITSELF: repeated re-runs of the PIN-gate test left 8 real `sovereign_cli.js auto-trade --interval 15 --live` child processes running -- handleRun's real spawn fires regardless of a test's mocked onRun, and the existing 'wait then maybe abort if still running' pattern isn't reliable if the ai_agent_trading feature flag is enabled. Asked the user before any taskkill (live-trading platform, irreversible-ish action) -- confirmed, killed all 8. Hardened both PIN-gate tests (existing + new) to unconditionally abort via Escape after confirming, not conditionally on a timeout.",
    "GIT HYGIENE: 2 commits, scoped to code+tests only both times -- explicitly excluded routine cron-generated data artifacts (notebooks/signal_library.json, storage/data/*.json) and workspace docs from the code commits, consistent with established session practice. One unrelated external edit appeared mid-session (manifest.js label shortening, sovereign_dashboard.mjs comment trims) flagged by the harness as user/linter-made -- did not revert it, updated 3 now-stale test assertions to match instead, verified via git stash that the failures were caused by that external edit and not my own changes before fixing."
  ],
  "verified": [
    "Every crash fix verified by running the actual command via CLI directly (not just code review) before and after.",
    "Chat parser: 15 unit tests (chat_parser.test.js) + 7 Ink-harness integration tests (chat_ui.test.js) covering deterministic resolution, the LLM confirm gate (mocked ai_client), Escape-cancel, LLM-unavailable safe degrade, the --live PIN gate from chat, and Tab round-tripping.",
    "Chart width clamp verified with a simulated 100-column terminal: line length exactly 100 (no overflow) at a requested width of 95.",
    "Process-leak fix verified: tasklist count stayed at the 6-process baseline across a full chat_ui.test.js + sovereign_dashboard.test.js run after the fix (was 8 before).",
    "Full suite 580 tests / 578 pass / 0 fail / 2 skip at both commits; npm run hygiene clean throughout."
  ],
  "user_decisions": [
    "AskUserQuestion (plan scope for the 15-item backlog): 'Everything in one plan'.",
    "AskUserQuestion (3 redundancy questions): 'Investigate then recommend' rather than guessing or asking per-item.",
    "Direct instruction: 'mass implement this now' -- referring to starting the previously-deferred chat-style redesign immediately rather than waiting for a separate session.",
    "AskUserQuestion (parsing approach for chat): 'Hybrid: deterministic first, LLM fallback'.",
    "AskUserQuestion (fallback UI): 'Keep both, chat input is the new default entry point'.",
    "Direct correction: 'why is there a whole another section... just add the chat section as a bar underneath' -- rejected the full-page chat UI, redirected to a minimal bar (saved to memory: feedback_minimal_tui_bars.md).",
    "AskUserQuestion (kill 8 orphaned auto-trade processes): 'Kill them now' -- confirmed before any taskkill.",
    "AskUserQuestion (chart upgrade scope): 'I want all [candlesticks+volume+SMA], but idk if terminal supports it, can leave to next session' -- deferred, documented inline.",
    "AskUserQuestion (isolate chat input redraw now vs defer): 'Defer to next session' -- documented inline.",
    "'commit' (both rounds) -- explicit go-ahead each time, code/test files only, scope decided by me and not second-guessed.",
    "'commit then end session' -- this close-out."
  ],
  "remaining": [
    "Chart upgrade (candlesticks + volume subplot + SMA overlay) for renderPriceChart() -- researched and ranked (candlesticks lowest effort/highest impact first), OHLCV already cached, not yet implemented.",
    "Chat bar typing-lag fix (isolate per-keystroke redraw from the full Ink re-render) -- diagnosed, not yet implemented.",
    "Strategy picker (bt --strategy) and force-ingest fallback (backend visualize) still need real-terminal confirmation -- only verified via the fake-TTY harness so far; their dev-review comments are deliberately still in place pending that, per explicit instruction not to remove them until confirmed.",
    "graphify-out still stale -- not refreshed this session despite a large diff (2 new files, big dashboard rewrite); should refresh next session if touching this code again.",
    "Routine cron-generated data artifacts and several untracked workspace archive files present at every boot this session -- not investigated, consistent with prior sessions."
  ],
  "dcs": 0.95
}

---
SESSION 60 — 2026-06-26
{
  "session": 60,
  "date": "2026-06-26",
  "branch": "feat/ink-tui-refactor",
  "commits": [
    "f4820708 fix(tui): type-to-search immediately in picker",
    "2bdbeafa fix(backtest): auto-load ts-index when family is known",
    "3a2051d0 fix(runtime): centralize PIN strip + exit-clamp P&L",
    "0e6ffd15 feat(data): Binance WebSocket live feed in backfill-daemon",
    "1a47da70 feat(research): sovereign bias command"
  ],
  "suite": "631/0fail/2skip",
  "verified_facts": [
    "bt now reads ts-index (1601 daily BTC bars, data_end today) when family is known — fixed loadUsableSources fallback in research_sources.js",
    "type-to-search works in all pickers without pressing / first",
    "sovereign bias BTCUSDT --json returns { bias, confidence, aligned, timeframes } across 4h/1d/1w",
    "backfill-daemon now starts a Binance WebSocket feed on boot (crypto symbols, 1m), writes closed klines to ts-index via mergeWriteBin",
    ".mcp.json written at project root — mcp__sovereign__* tools load automatically next session (file is gitignored by design)",
    "ponytail skill cloned to ~/.claude/skills/ponytail and wired into project CLAUDE.md",
    "API server started at port 8787 this session (not auto-started — must start manually or via .mcp.json next session)",
    "ML strategies (lstm_v1, cnn_window_v0) still return 0 trades — model retraining is an open gap"
  ],
  "cautions": [
    "BTC bias: SHORT across all 3 TFs as of 2026-06-26 close ($58,876). RSI 4h=27 (oversold), 1d=38, 1w=36. Below all SMAs.",
    "Crypto/ETH/SOL correlation near zero — unusual breakdown, broad sell signal",
    "mergeWriteBin is synchronous — the WebSocket onmessage handler calls it synchronously; OK for 1m cadence but would block the event loop on very high-frequency symbols",
    "backfill-daemon --once mode does NOT start the WebSocket (by design — once means one poll cycle)",
    ".mcp.json is gitignored — each machine needs its own copy; path is relative (dist/mcp_server/index.js)"
  ],
  "remaining": [
    "ML model retraining — lstm_v1/cnn_window_v0 need training on real ts-index daily data before bt generates signals",
    "sovereign bias command lacks correlation/entropy inputs (currently TA-only) — add mcp__sovereign__get_correlation feed",
    "ponytail global CLAUDE.md entry blocked by auto-mode — user must add it manually",
    "graphify-out stale — not refreshed this session"
  ],
  "dcs": 0.95
}
