## Git Hygiene — uncommitted folder restructure — RESOLVED 2026-06-08 (commit `4d3fb4d`)
- `backend/cli/commands/*` and `backend/api/server/routes/*` (flat → subdirectory restructure from `648ab69e`, 2026-05-29) is now committed with full rename tracking (`{ => account}/auth.js`, `{ => market}/analytics.js`, etc. — verified via `git show --stat HEAD`). `git status --porcelain` for both trees is clean; `dev.review.txt` deletion landed in the same commit.
- Note: the user landed this via a broader self-driven commit (`4d3fb4d "changes"`) that also swept in unrelated monorepo-root WIP beyond the originally scoped 52-file batch — the restructure itself is intact and correctly tracked, so no follow-up needed on this entry.

### Git Hygiene — `node_modules`/`.mcp.json` re-drift — RESOLVED 2026-06-08 session 8
- The `4d3fb4d "changes"` commit above (broader-than-scoped) also re-introduced 4,533 files into tracking: `node_modules/` (1,116), `backend/gateway/node_modules/` (3,374), `storage/data/cache/` (42), `.mcp.json` (1) — the same drift class originally fixed in session 2. `structure_contract.test.js` regressed to 3/4.
- Fixed with index-only `git rm -r --cached node_modules backend/gateway/node_modules storage/data/cache .mcp.json` (zero risk to working-tree files). `structure_contract.test.js` → 4/4; full suite unchanged at 226/232 before/after (6 pre-existing unrelated failures — the old "241/241" figure in session memory is stale, corrected here).
- User approved the commit explicitly given the size (~4,533 deletions in the index).

### Container ML — ONNX runtime flag — IN PROGRESS, blocked on Docker daemon (session 8)
- `infra/docker/Dockerfile:46` was missing `-DSOVEREIGN_ENABLE_ONNX_RUNTIME=ON` (flag exists in `backend/core/CMakeLists.txt:9`, default OFF) — container ML silently ran `deterministic_baseline` instead of the real trained models proven in Phase 3.
- Edit made (`cmake .. -DCMAKE_BUILD_TYPE=Release -DSOVEREIGN_ENABLE_ONNX_RUNTIME=ON`) but **left uncommitted** — verification blocked by a wedged Docker Desktop daemon (zombie `com.docker.build` process, idle ~22h, predates this session; every `docker` CLI call hangs). User deferred the Docker Desktop restart needed to clear it. See `workspace/handoff/2026-06-08.md` session 8 for the full trace and exact resume steps (rebuild → `ml compare --json` → confirm `onnx_runtime` backend → commit).
- Also surfaced a latent gap: `storage/models/*.onnx` are gitignored (`.gitignore:64`), so a genuine fresh-clone-to-remote-node deploy would silently fall back to baseline — flagged for a future user decision (commit the ~1MB binaries vs. add a model-sync step to `DEPLOY.md`'s flow), not silently fixed.

### `run bot live` redirect — RESOLVED 2026-06-08 (reclassified, not a stub)
- `backend/cli/commands/runner/run.js:105` hard-stops `sovereign run bot live` with "Not implemented here — use: sovereign bot run --live". Traced both paths: `run bot {paper|live}` is the *persistent unattended loop* manager (`runPaperBotLoop`/`run_loop.js`, used for `paper`/`backfill`); `bot run --live` (`commandBot` in `trade.js:1359` → gateway `runBotLoop`/`runCycle` in `cycle.ts:441`) is the real, fully-wired live path — gated by `featureGate('bot_autopilot')`, `canLiveExecute('alpaca')`, and an interactive `requireAuth` (PIN) prompt.
- Conclusion: the redirect is an intentional safety boundary, not a completeness gap. Wiring `run bot live` to start an unattended persistent *live-money* loop would bypass the per-session auth/PIN gate that `bot run --live` enforces — a real-money safety regression, not an improvement. Leaving the hard-stop in place is correct design. Removing this from the open ledger; no code change needed.

## Centralization Backlog

| Pattern | Files (count) | Proposed unit | Effort | Grade impact |
|---|---|---|---|---|
| ~~ANSI import spelling drift~~ — RESOLVED 2026-06-08 (commit `4d3fb4d`): `auth.js` now imports `shared/lib/ansi` (matches `settings.js`, same shim target) | was 4 files, outlier fixed | — | S | done |

Noted, not flagged: `parseArgs(argv)` in `scripts/strategies/ml_smoke_alpaca.js` and `ml_smoke_polymarket.js` share a ~6-line arg-loop shape. Only 2 files, each parses different flag sets (`--qty` vs none, `--dry` shared) — below the 3-file drift threshold and a shared helper would be more code than the duplication. No action needed.

---

## Focused Audit - 2026-06-11 (`/blast-through` on the unrecorded `feat/ml-onnx-section` working tree)

Scope: the ~28-file uncommitted diff (self-described in DEV_COMMENTS.md as "2026-06-10 Mass Audit
& Ingestion Repair" — that session wrote no handoff/session-memory entry) plus carried gated
sections. Full `npm test` run as the verification gate. **DCS this audit: 0.87** (Freshness 0.95
— integrity ok:true, BTCUSDT through 2026-06-10; Schema 0.85 — failing indicator data-flow
contract; Coverage 0.80 — 7 NEW failing test files vs the 226/232 baseline). Below the 0.95
promotion bar: **do not commit this tree as-is.**

### P0 — `runGatewayCommand` throws on every call (`shared/lib/runtime/backend_bridge.js:72`)
- `require.resolve('../../backend/gateway/src/index.ts')` resolves relative to
  `shared/lib/runtime/` → `shared/backend/gateway/...` which does not exist. The function throws
  before reaching the correct `path.join(REPO_ROOT, ...)` two lines below. Proven live:
  `node -e "...runGatewayCommand(['balance','--json'])"` → `Cannot find module`.
- Blast radius: `trade.js` migrated 5 functions onto it — `fetchPolymarketOrderbookSnapshot`,
  `fetchPolymarketPriceHistorySnapshot`, `submitPolymarketBuyOrder` (**live order path**),
  `fetchBalance`, `fetchAggregatePortfolio`. All dead in this tree.
- Test evidence: NEW failures in `polymarket_preflight.test.js` (buy --preflight),
  `proposed_orders_cli.test.js` (trade process preview), `polymarket_auth_health.test.js`
  (CLI exits 1, expected 0).
- **Reviewer decision**: fix = delete the dead `require.resolve` line (keep the `path.join`),
  AND decide launcher parity — old `buildTradeGatewayLaunch` had a ts-node bootstrap fallback
  (`backend/cli/lib/run_trade_gateway.js`, treated as supported infra per 2026-06-05 note);
  `findNodeCli()` must cover the same matrix or machines without tsx regress.
- **Gate**: the 3 named test files green + a live `sovereign trade balance` smoke.

### P0 — 7 NEW failing test files (suite 12✖ vs 6✖ baseline)
| Test file | Failure | Caused by |
|---|---|---|
| `polymarket_preflight.test.js` | buy --preflight | runGatewayCommand bug |
| `proposed_orders_cli.test.js` | trade process preview | runGatewayCommand bug |
| `polymarket_auth_health.test.js` | exit 1 ≠ 0 | runGatewayCommand bug |
| `lib/indicators.data_flow.test.js` | "Volatility should be positive in real market" | manifest-driven `featureFromWindow` |
| `polymarket_errors.test.js` | redactHeaderMap contract | expanded redaction set not reconciled with test |
| `sovereign_cli_human_surfaces.test.js` | integrity render contract | `tools/backend.js` tf:count format change |
| `sovereign_cli_price_action.test.js` | divergence assertions | indicators/feature change (shares root with data_flow) |
- Pre-existing (unchanged): cli_ui_contract ×2, notebooks_contract, supabase_route_contract,
  crypto_aggregates, tui_search_contract (`commands/backend` shim path).
- **Gate**: suite back to ≤6✖ (baseline) before commit; each contract either fixed in code or
  deliberately updated in the test with a note.

### P0 — tracked code depends on untracked files (drift class, 4th occurrence)
- `backend/cli/lib/utils.js:482` → `shared/lib/market/symbol_resolver.js` (untracked). A
  `git clean -fd` or fresh clone kills the whole CLI at load.
- `shared/lib/providers/index.js` → `./ecb.js` (untracked) — central provider barrel; same blast.
- `shared/lib/market/indicators.js` → `config/system/indicator_manifest.yaml` (untracked dir,
  6 files incl. `feature_flags.yaml`, `app_config.yaml`, `tools.yaml`) — silent fallback if
  absent, but then features differ between machines: train/serve skew vector for ML.
- Also untracked but load-bearing-adjacent: `storage/models/*.onnx` now UN-ignored (the
  `.gitignore` edit removed the `models/*.onnx` rule — direction matches the standing "commit
  the binaries" option) but still uncommitted; `backend/cli/commands/research/{backtest,
  optimize_indicators}.js` (wiring unverified).
- **Reviewer decision**: commit these with the feature work or the branch is self-breaking.

### P1 — `executeSovereignCommand` default 30s timeout (`backend_bridge.js:19`)
- Old `runBackendCommand` had NO timeout; new default kills any spawn >30s. Known long ops:
  frame backtests via `shared/lib/strategy/backtest.js:979,1033` (bridge callers), 47×47
  correlation historically 95s (currently safe only because `tools/backend.js:433` still uses
  its own LOCAL `runBackendCommand` copy). **Decision**: make timeout opt-in (or ≥120s default)
  before migrating any more callers onto the bridge.

### P1 — smart JSON extraction forces `ok: true` (`backend_bridge.js:48`)
- `{ ok: true, ...payload, code }`: payload without an `ok` field is reported ok even when the
  process exited non-zero; and `code: result.status` clobbers any `code` field in the payload.
  **Decision**: gate `ok` on `result.status === 0 && payload.ok !== false`; rename the exit-code
  field (`exit_code`).

### P1 — indicators manifest engine swallows all errors (`indicators.js applyManifestIndicator`)
- Every indicator failure → silent `{}`; when the manifest loads, the legacy feature set is
  entirely replaced (early return), so a bad manifest silently changes the ML feature contract.
  Failing test proves a live mismatch (volatility not positive). **Decision**: surface per-
  indicator errors (warn + count), add a key-parity contract test (manifest output keys ==
  legacy keys for the default manifest). This is the serving side of the ML skew gate.

### P1 — `research.js loadHistoricalSources` filter strictened (line ~319)
- Candle filter went from `(tf || '1d' || 'point' || untagged)` to strict `=== tf`. Backtests
  requesting a timeframe with only 1d/macro('point') records now silently get zero candles
  where they previously fell back. **Decision**: confirm intended for OHLCV, and verify macro
  ('point') consumers — correlation-with-CPI paths — still resolve.

### P2 — answers to the inline `//dev review` questions left in `quote_router.js`
- "higher=worse or higher=better?" — **higher = better.** `selectPreferredQuoteRecords` sorts by
  `rank*1e9 + count*1000 + quality*10 + volume` descending; `DEFAULT_PROVIDER_PRIORITY` rank is
  the dominant term. The edit (coinbase 80→85, polygon 86→80) therefore promotes coinbase ABOVE
  binance (82) and polygon for crypto quotes — note coinbase has documented geo-fragility (451s,
  2026-06-06 sessions). Reconsider or document.
- "per symbol or per router?" — **per symbol-timeframe group** (`groupQuoteRecords` →
  selection per key), so per-symbol fallback exists; "mostly YF in cache" just means Yahoo won
  rank for those symbols/timeframes (or was the only fetcher that succeeded).
- Hardcoded crypto list in `inferFamily` — real but pre-existing; candidate to derive from
  `data_sources.yaml` universe. Backlog, not a regression.

### P2 — smaller flags
- `polymarket_history.js:95` — `'1wk': 86400*30` is a WEEKLY key with a MONTHLY (30-day)
  fidelity, and the key style (`1wk`) mismatches the `1w` used elsewhere. Likely typo.
- `.gitignore` — blanket `*.jsonl` would prevent ever tracking paper-trading ledgers
  (`fills.jsonl`, `resolved_positions.jsonl`); duplicate lines (`repo_tree.txt`,
  `strucure_report.txt` twice); root `.graphify_*.json` artifacts remain unignored.
  `backend/cli/target/` ignore (old carryover) IS now added — good.
- `validation.js` — comment placeholder only; `FRESHNESS_RULES_MS` has no `1w`/`1mo` entries,
  so new-timeframe staleness uses fallback behavior. Add rules.
- Ingest derive-before-fetch ordering: 1w/1mo are aggregated from the PRE-refresh 1d cache in
  the same run that then refreshes 1d — derived bars lag one cycle.
- `data.js` mass-backfill defaults: 365→7300 days, concurrency 5→10 (user-annotated "dev
  suggest"). Rate-limit exposure on free tiers (Yahoo/CoinGecko); deliberate choice to confirm.
- `trade.js:400` mid-file `require` + unused `executeSovereignCommand` import.

### Verified-good in the same tree (credit where due)
- `binance.js` pagination (1000-bar cap bypass, MAX_CALLS 20, no-overlap paging) — clean logic;
  live evidence: BTCUSDT ts index now 1w=464 bars (2017-07-20→2026-06-04), 1mo=109 bars — the
  DEV_COMMENTS "4 → 464 bars" claim is REAL.
- `deriveHighTfFromLocalDaily` local aggregation — `TS_INDEX_PATH`/`aggregateCandles` both
  defined in-module; syntax-clean; works per ts-index evidence above.
- `polymarket_errors.js` expanded redaction — right direction, just reconcile its contract test.
- All 19 modified JS files pass `node --check`.

## Centralization Backlog (2026-06-11 additions)

| Pattern | Files (count) | Proposed unit | Effort | Grade impact |
|---|---|---|---|---|
| Gateway launch path (2 impls, 1 broken) | trade.js `buildTradeGatewayLaunch` (5 call sites) + bridge `runGatewayCommand` (5 migrated fns) | fix bridge, then migrate remaining 5 sites, delete local launcher | M | trade D→B |
| `runBackendCommand` duplicate | `tools/backend.js:433` local copy (8 call sites) + `backend_bridge.js:59` | migrate onto bridge AFTER timeout default fixed | M | tools C→B |
| JSON-from-stdout extraction | bridge smart-extract + `trade.js parseGatewayJsonOutput` | one `parseJsonPayload` util in bridge | S | — |

### RESOLUTION - 2026-06-11 session 12 (same-day fix pass, all P0/P1 items above cleared)

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
