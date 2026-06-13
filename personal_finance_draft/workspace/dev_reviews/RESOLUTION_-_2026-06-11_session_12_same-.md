## RESOLUTION - 2026-06-11 session 12 (same-day fix pass, all P0/P1 items above cleared)

All findings from the "Focused Audit - 2026-06-11" were fixed the same day (implementation
delegated to Sonnet subagents per user preference; Fable reviewed diffs, re-ran gates, committed):

- **runGatewayCommand P0** -> FIXED `358476f6`. Dead require.resolve deleted; buildTradeGatewayLaunch
  moved into the bridge as the canonical launcher (trade.js re-exports); 30s default timeout removed
  (opt-in only); JSON extraction respects exit status + payload.ok, reports exit_code. BONUS root
  cause found during verification: `bot_state.ts:5` imported `brokers/supabase_env.js` (reorg
  fallout; canonical is `auth/supabase_env.js`) -- the gateway could not boot under ts-node at all.
- **Indicator manifest P0** -> FIXED `7d99af0f`. Inline flow-maps (unsupported by parseYamlRecursive)
  rewritten to block style; non-object params guard + once-per-indicator warnings replace the silent
  catch; new serving-contract guard test (indicators.manifest_parity.test.js).
- **Tracked->untracked dependency drift** -> CLOSED `7d99af0f`/`e6716777`: config/system/ (6 files),
  symbol_resolver.js, ecb.js, config/markets asset_mapping/options_data all tracked.
- **Contract reconciliations** -> `b3b0fec5` (redaction: poly_address stays visible by design, new
  keys covered) + `2bf1e482` (ALL 6 pre-existing baseline failures cleared too: 3 stale reorg
  require-paths, 2 cli_ui sub-menu shape drifts, 1 notebooks verdict-cell position).
- **P1/P2 ledger items** -> folded into `e6716777`: quote_router priorities reverted + inline
  dev-review comments removed, research.js readmits point/untagged macro records, 1wk:30d fidelity
  typo fixed, FRESHNESS_RULES 1w/1mo added, mass-backfill 7300d/c10 kept (user decision).
- **ONNX fresh-clone gap** -> CLOSED `8e8b4adf`: trained .onnx binaries + serving manifest committed
  (user decision); .gitignore hygiene (backend/cli/target/ carryover closed, *.jsonl blanket dropped).

**Verification: full `npm test` = 263/263 pass, 0 failures — first fully green suite on record
(previous best 226/232).** Dockerfile ONNX edit remains deliberately uncommitted (Docker-blocked).

Still open from the backlog: migrate trade.js's 5 remaining direct buildTradeGatewayLaunch call
sites + tools/backend.js's local runBackendCommand onto the bridge (M); ingest derive-before-fetch
ordering (1-cycle lag); notebooks/ directory itself is still untracked (the notebooks_contract test
would fail on a fresh clone -- scope decision for the user).

