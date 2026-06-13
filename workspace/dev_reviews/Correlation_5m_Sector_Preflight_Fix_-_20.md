## Correlation 5m Sector Preflight Fix - 2026-06-13 session 26c

Trigger: interactive `backend correlation --timeframe 5m --max-bars 5000000 --method auto`
with Crypto -> Layer1 selected. The UI-expanded sector included `MATICUSDT` and `POLUSDT`, whose
5m coverage does not overlap (`MATICUSDT` last date `2024-09-10`; `POLUSDT` first date
`2024-09-13`). The focused ts-index preflight returned null, then the wrapper fell back to
`storage/data/cache`, where several Layer1 symbols have no 5m JSON rows. That made the final C++
error blame `AVAXUSDT`, `DOTUSDT`, `MATICUSDT`, etc. as `no_matching_bars`, even though the real
problem was zero common overlap in the selected set.

Resolution: `backend/cli/commands/tools/backend.js` now returns a CLI preflight payload with
`code:"no_common_correlation_dates"`, per-symbol coverage ranges, and blocker hints instead of
falling back to stale cache JSON when multi-symbol focused correlation alignment fails.

Evidence:
- Reproduced Layer1 expansion command now fails clearly with blockers `MATICUSDT` and `POLUSDT`.
- Overlapping crypto subset (`ADAUSDT,AVAXUSDT,BTCUSDT,DOTUSDT,ETHUSDT,MATICUSDT,NEARUSDT`) still
  succeeds through `sovereign_cpp_core` using a temp focused snapshot.
- Gates: `node --check backend/cli/commands/tools/backend.js`; `node --test tests/scripts/tests/sovereign_cli_human_surfaces.test.js` = `12/12`; `node --test tests/scripts/tui_terminal_automation.test.js` = `6/6`; `node --test tests/scripts/tui_search_contract.test.js` = `8/8`.

Follow-up checklist: `workspace/CORRELATION_INPUT_CHECKLIST.md` tracks the remaining work for the
`ok:false input: storage/data/cache` failure class: regression tests, selector-side warnings,
optional blocker dropping, and the MATIC/POL data-overlap decision.

