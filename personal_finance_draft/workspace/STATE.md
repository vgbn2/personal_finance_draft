# Project State - Sovereign Trading Platform

## Current Phase
Phase 9: Strategic Intelligence & TUI Integration - ACTIVE

## Direction Note - 2026-06-13 session 25 — 5m deep data complete for all families; daily-history regression fixed; Polymarket archive built
- **Data layer is now broad + deep.** Native 5m: crypto (BTC/ETH to 2017, most alts 5y), US equities
  (to 2016 via Alpaca SIP), indices/commodities/fx (Yahoo rolling ~84-day window via the repeatable
  `five-min-accumulate` — re-run weekly to grow forward), + commodity ETF proxies on the Alpaca path.
  Daily (1d) history is deep again across all families (1998-2017 by symbol) after fixing a real
  regression where `writeTsIndex` REPLACE-semantics truncated deep daily bins to 1 bar on every ingest
  (now merge-protected for all timeframes). Polymarket historical archive went from a 20-market sample
  to ~2,045 volume-ordered resolved markets / 82,616 price points.
- **No direction change** — this is data-completeness + correctness work within Phase 9, not a pivot.
  ML/backtests still read daily from the cache; the deep daily restore unblocks honest daily training.
- **Free-provider depth is now maxed** for the chosen symbols; true 20y/1M-bar 5m would need a paid
  vendor (Polygon/FirstRate/Databento) — a future budget decision, not started.
- **Known operational constraint:** deep crypto 5m backfills are inherently multi-hour (paginated
  Binance + delays); `writeTsIndex` is not safe for two concurrent backfill PROCESSES (shared temp
  filename → EPERM). Serialize backfills until FW1 (per-pid temp) lands. Full trail + follow-ups:
  `workspace/handoff/2026-06-13.md` session 25 and `~/.claude/plans/hidden-exploring-river.md`.

## Direction Note - 2026-06-08 session 5 — TUI sub-menus fixed + first real-ONNX-driven order submissions proven

- **Direction unchanged** (Phase 9 continues; ML buildout milestone advances within the established plan —
  not a pivot). Two pieces of work:
  1. **TUI correction applied**: Strategy/Prop Firm/Persistent Runners now use genuine `promptSelect`
     sub-menus (mirroring `commandMt5`), per the user's explicit rejection of an earlier flat-merge approach.
  2. **First proof that REAL trained ONNX models can drive REAL order submission**, closing a gap the ML
     buildout had left open (models existed + were proven accurate in Phase 3, but nothing actually used
     them to place an order). New `scripts/strategies/ml_signal.js` solves the "how do you get a single
     live prediction out of a batch-only `ml predict`" problem via the `--limit 1` single-row trick — this
     is now the reusable bridge for ANY future strategy that wants a real-time ONNX read.
- **New capability unlocked**: `scripts/strategies/ml_smoke_{alpaca,polymarket}.js` are runnable, real,
  end-to-end smoke tests — Polymarket leg fully verified live (real ledger writes); Alpaca leg verified up
  to the user's own login/PIN gate (untested leg pending `sovereign login`).
- **Scope guardrail reaffirmed by the user**: MT5 multi-account design and live (non-paper) Polymarket
  order submission are explicitly future work ("still have to see") — do not start either without the user
  re-raising it. Full detail: HANDOFF + SESSION_MEMORY (session 5).

## Direction Note - 2026-06-07 session 4 — DOCKER DEPLOY SUCCEEDED (C3 closed, first time)

- **C3 closed**: `docker compose build && up -d` now produces a stable, healthy 2-service stack (`web`+`bot`).
  `curl /health` -> `{"ok":true,"service":"sovereign-web"}`; both `RestartCount=0`. First successful deploy
  in project history. Found+fixed 3 NEW blockers beyond session 3's portability pass (these only surface in
  the full build+run path, not a source-only compile check):
  1. GCC 12 `-Wrestrict` false positive in `macro_features.cpp:32` (scoped pragma suppression).
  2. Missing `npm ci` layers for standalone sub-packages `backend/api`/`backend/gateway` (web crashed on
     `Cannot find module 'socket.io'`).
  3. **Architectural fix**: removed the `gateway` compose service — it was crash-looping because
     `gateway.main()` is a one-shot CLI dispatcher, not a daemon (`SOVEREIGN_GATEWAY_MODE=managed` was dead
     config). Topology is now 2 services, not 3 — **user should review this change before committing**.
  Also disabled `bot`'s inherited HEALTHCHECK (cosmetic `unhealthy` status; it runs no HTTP server).
  4 files changed, none committed: `macro_features.cpp`, `Dockerfile`, `docker-compose.yml`, `DEPLOY.md`.
  Full detail: HANDOFF + SESSION_MEMORY (session 4).

## Direction Note - 2026-06-07 session 3 (Docker build attempted — code now Linux-portable)
- **Docker build status**: code-ready. Surfaced + fixed 8 Windows/MSVC-only-green portability bugs (GCC
  `-Werror` + GCC10 from_chars); full `make -k all` in gcc:12 = 0 errors, `npm run build` green. Image build
  BLOCKED only on Docker Desktop registry connectivity (WSAEACCES; node:22-bookworm not cached). Resume after
  user restarts Docker Desktop. Full detail: HANDOFF + SESSION_MEMORY (session 3).
- **Durable gotcha**: `shared/lib/paths.js` BACKEND_CANDIDATES doesn't include the Make single-config path
  `backend/core/build/sovereign_wealth`; native Linux builds need SOVEREIGN_BACKEND_BIN set (Dockerfile does).
- **Test quality**: core test mains assert-only → no-ops under Release NDEBUG; should run in Debug. Pre-existing.

## Direction Note - 2026-06-07 (re-anchor to core platform) + Docker config readiness
- **Direction**: ML buildout reached a real, verified honest core (Phases 0-3). User flagged drift; ML is
  now PARKED — Phases 4-5 (TUI section, backtest swap) deemed low-leverage polish on weak models. Priority:
  test-gate fix → Docker/bot deploy → data freshness. See `feedback-stay-on-core-goal` memory.
- **Git hygiene**: untracked node_modules/backend/gateway/node_modules/storage/data/cache (8870 files,
  index-only). `.mcp.json` still tracked — harness blocks the agent; USER must run `git rm --cached .mcp.json`
  to make structure_contract pass (suite 240→241).
- **Docker deploy-ready** (config only; daemon was down so no build ran): compose `env_file` now reads `.env`
  (required) + `.env.production` (optional override) — one config file for CLI and Docker; fixed DEPLOY.md
  onboarding (it referenced a nonexistent `.env.production.example`); `.dockerignore` now excludes `.env*`
  (was baking secrets into image) + `backend/core/build`. `docker compose config -q` clean.
- **Known gap — fix in flight, blocked (2026-06-08 session 8)**: `infra/docker/Dockerfile:46` edited
  to add `-DSOVEREIGN_ENABLE_ONNX_RUNTIME=ON`, but left **uncommitted** — verification blocked by a
  wedged Docker Desktop daemon (zombie `com.docker.build` process, idle ~22h, predates the session;
  user deferred the restart needed to clear it). Resume steps + full trace in
  `workspace/handoff/2026-06-08.md` session 8 and `workspace/DEV_REVIEW.md`. Also surfaced: trained
  `.onnx` files are gitignored (`.gitignore:64`), so a genuine remote-node deploy would silently fall
  back to baseline — a separate latent gap flagged for a future user decision.

## Correction Log - 2026-06-07 (ML Phase 3 — C++ ONNX inference + train/serve parity PROVEN)
- **C++ now runs the real trained models.** New `ml predict` / `ml compare` command in
  `backend/core/src/main.cpp`: reads `storage/models/serving_manifest.txt` (column order + train
  medians + model list, emitted by train.py — C++ has no JSON/YAML parser, so a whitespace manifest),
  reads the JS feature CSV, median-fills + orders columns identically to training, runs each `.onnx`
  batched, outputs per-model accuracy + class counts as JSON.
- **New `OnnxModel::predictBatch`** (`backend/core/src/ml/onnx_model.{hpp,cpp}`): float `[batch,n]` input,
  converter-agnostic output handling (queries output names/types; int64 label tensor and/or float prob
  tensor) — works for both skl2onnx and onnxmltools-xgboost outputs. Existing `predict()` (int64 token
  smoke path) left untouched; onnx_model_test/cnn_inference_test/model_registry_test still 3/3.
- **NO-SKEW PROOF (the anti-cheat gate)**: `scripts/ml/verify_parity.py` replicates the C++ logic in
  Python via onnxruntime. C++ `ml compare` and Python are **bit-identical** on the full 19,480-row frame:
  - xgboost_v1 acc 0.666376, counts {0:7061,1:1275,2:11144}
  - logistic_v1 acc 0.468378, counts {0:7208,1:223,2:12049}
  - regime_classifier acc 0.456982, counts {0:6802,1:162,2:12516}
  C++ == Python to 6 decimals AND every class count → C++ inference is real and skew-free.
  (Full-frame accuracy > Phase-2 holdout accuracy because it includes training rows; xgboost overfits
  the train portion — expected.)
- **Build**: `cmake --build backend/core/build --config Release --target sovereign_wealth` clean
  (ONNX ON). `backend()=="onnx_runtime"` confirmed on all 3 models.
- **Next**: Phase 4 — JS `backend_bridge` call to `ml compare` + TUI "Machine Learning" section
  (model comparison table). Phase 5 — route backtest `model.predict` through the C++ ONNX path; relabel
  JS heuristics `heuristic_baseline`.

## Correction Log - 2026-06-07 (ML Phase 2 — real trained models exported to ONNX)
- **First real trained ML in the repo.** `scripts/ml/train.py` (new, runs in `.venv_ml`) reads the JS
  feature CSV and trains the starter set, all predicting the 3-class N-bar forward label {down,flat,up}:
  - `xgboost_v1` (all 32 feats) — holdout acc **0.4233** vs majority baseline 0.3894 (**+3.4%**)
  - `logistic_v1` (StandardScaler→logreg, all feats) — **0.4199** (+3.1%)
  - `regime_classifier` (cross-family feats only: regime_*_mom + xf_corr_*) — **0.3976** (+0.8%)
  - All 3 exported to `storage/models/*.onnx` at **ir_version=9** (C++ onnxruntime 1.17.1 ceiling),
    opsets `ai.onnx.ml:1` + `ai.onnx:15` (both within 1.17.1) → ready to load in the C++ path (Phase 3).
  - Modest lifts are honest for daily directional prediction; the point is real models that beat baseline,
    not alpha.
- **No train/serve skew**: missing cells filled with TRAIN-split medians; medians + per-model feature-column
  order written to `storage/models/feature_config.yaml` (new v2 schema). Linear-model scaling is baked INTO
  the ONNX graph, so the only external serving contract is the median fill. `metadata.json` rewritten to the
  real models (schema `sovereign.ml.metadata/v2`, real metrics, `promoted` = beats-baseline).
- **Deps**: installed scikit-learn 1.9, xgboost 3.2, skl2onnx 1.20, onnxmltools 1.16, pandas 3.0 into `.venv_ml`.
- **Dataset**: re-dumped 20-symbol liquid universe, `--days 1000 --deadzone 0.01` → 19,480 rows, true 3-class
  balance {down 7456 / flat 3495 / up 8529}.
- **Safe overwrite**: nothing at runtime reads `metadata.json`/`feature_config.yaml` yet (`cnn_v3` in
  `models.js` is only a JS-heuristic alias). Phase 3 C++ will be the first consumer. `smoke.onnx` preserved.
- **Gate**: `npm test` → **240/241** (unchanged; the 1 fail is the pre-existing structure_contract git-drift).
- **Next**: Phase 3 — C++ `ml predict`/`ml compare` command reading `feature_config.yaml` + the .onnx files
  (feature vector in → ONNX → 3-class prediction, batched). Then Phase 4 TUI section, Phase 5 backtest swap.
  CNN/LightGBM deferred (needs torch + windowing tensor builder).

## Correction Log - 2026-06-07 (ML Phase 1 FINISH — full-universe data + aggregates job)
- **Phase 1 closed**: `ml dump` now covers the FULL backfilled universe, not just the 3 JSON-cached
  crypto coins. Root gap was that `shared/lib/ml_dataset.js` only read `cache/<family>/backtest_history.json`
  (PEPE/POL/SUI only) while the core universe (BTC/ETH/SOL, XAU/XAG/XCU, USOIL/NG, SPY, equities) lives in
  the binary `storage/data/ts/*.bin` index (633 .bin files).
  - **Fix (JS binary-ts reader, Design B)**: `ml_dataset.js` now unions JSON-cache records with
    `readTsIndex()` (already in `market_validation.js`) per symbol, deduped by symbol+timestamp (JSON wins).
    Added `readTsSources`/`tsSymbolsForTimeframe`. `cacheCloseSeriesAnchor` also merges ts closes.
    New `STORAGE_TS_DIR` constant in `shared/lib/paths.js`. `opts.tsDir` overridable for tests.
  - **`ml aggregates refresh` (first production caller for `buildCryptoAggregateSeries`)**: new
    `backend/cli/commands/ml.js` subcommand + testable `refreshCryptoAggregates()` writes
    `storage/data/cache/crypto_aggregates.json` in the exact shape `loadCryptoAggregateAnchors` reads
    (throttle/backoff via `--throttle-ms`, `--days`, `--universe`). CoinGecko free-tier; run is optional.
  - **LIVE verified**: `ml dump --symbols BTCUSDT,ETHUSDT,SOLUSDT,XAUUSD,USOIL,SPY --days 365 --no-fred`
    → 6/6 assets, **2034 rows × 36 cols** (these all returned `no_asset_sources` before this session).
    Anchors now resolve from ts (GOLD 5566d, OIL 5998d, etc.).
  - **Gate**: `npm test` → **240/241 pass** (was 237; +4 new ML tests, all green). The 1 fail is the
    PRE-EXISTING `structure_contract.test.js` (see below), unrelated to this work.
- **[FOUND — needs user decision] artifact-hygiene regression**: `.mcp.json` + `backend/gateway/node_modules/`
  (~6847 files) are git-TRACKED and no longer matched by `.gitignore` (`git check-ignore` returns empty).
  This is what fails `structure_contract.test.js:84`. Session 75 had `git rm --cached`'d these; they drifted
  back. Fix = restore `.gitignore` coverage + `git rm --cached` (index-only, no disk delete), but staging
  6847 deletions is a large op left for explicit approval — NOT bundled with the ML change.

## Correction Log - 2026-06-07 (ML reality + ONNX Phase 0)
- **Grade-relevant correction**: the "ML" was not machine learning. All models in
  `shared/lib/models.js` + `backend/core/src/ml/model_registry.cpp` are heuristics tagged
  `deterministic_adapter`; `onnx_model.cpp` was real but OFF/unreachable; no `.onnx` files existed.
  Treat prior "CNN/XGBoost/transformer" claims as heuristic baselines, not trained models.
- **Phase 0 DONE**: real ONNX inference now runs in C++ (onnxruntime 1.17.1 enabled on local build,
  `onnx_model_test` proves `backend()=="onnx_runtime"`). Buildout tracked in `workspace/ML_SECTION_PLAN.md`.
- onnxruntime 1.17.1 constraint: model **IR version ≤ 9** for exports. Training env = gitignored `.venv_ml/`.

## Key Accomplishments (User-Driven Innovation)
- **100% Core Integrity**: All 29/29 C++ core tests passing on Win32 MSVC 2026.
- **Waterproof Data Plane**: 69/69 symbols cached with full daily historical depth (DCS: 1.0 at daily timeframe).
- **Execution Gateway Hardened**: Implemented dollar-based sizing (`amount:USD`) and verified across Alpaca, Gate.io, and Polymarket.
- **Historical FX Sync**: Multi-decade FX data enabled via Frankfurter/ECB endpoints. All 9 currency pairs fully cached.
- **MCP Tool Mastery**: 13 tools registered and verified for LLM-driven platform orchestration.
- **Stress-Tested Analytics**: C++ correlation engine verified for large-scale matrix computations (47x47 matrix in 95s).
- **Macro-Market Correlation Breakthrough**: Enabled cross-asset correlation (e.g., AAPL vs CPI) by implementing a synthetic daily bar generation layer and populating a 2000-day historical macro cache.
- **Multi-Agent Verification**: Implemented a 5-agent parallel testing sweep to ensure system-wide reliability.
- **TUI Strategy Wizard**: Implemented interactive creation and registration of strategies.
- **Backtest Intelligence**: Enabled YAML-driven parameter overrides and registry-driven strategy selection for backtesting and optimization.

## Phase 8 Engineering History (Consolidated & Filtered)

### Data Plane & Ingestion
- **Architecture**: Migrated monolithic `backtest_history.json` to family-partitioned directory structure (`storage/data/cache/<family>/*.json`). (Waterproof)
- **Performance**: Implemented binary `ts_index` (`storage/data/ts/`) with 48-byte packed Float64 records. AAPL 1d read: 9ms (66x speedup).
- **FX & Macro**: Enabled multi-decade FX ingestion via Frankfurter API; resolved 9 missing currency pairs. Fixed FRED/Macro fetcher symbol resolution.
- **Integrity**: Rebuilt `backend integrity` as a JS-native report for per-family availability and freshness tracking.

### C++ Core & Analytics
- **Reliability**: Refactored JSON parsing to zero-copy `std::string_view` scanning; eliminated `std::regex` recursion to resolve stack overflow crashes.
- **Correlation Engine**: Implemented `pearson-returns` and `fx-returns` methods (log-transform close levels). Added dual-window Pearson divergence telemetry.
- **Verification**: Verified 47x47 matrix stability and identity diagonal (1.0) for a 70-symbol universe.

### Execution Gateway
- **Order Sizing**: Implemented `amount:USD` parsing for dollar-based quantity calculation across all adapters.
- **Broker Integration**: Hardened Alpaca (SDK), Gate.io, and Polymarket adapters; fixed Alpaca quote fetcher argument type mismatch.
- **Persistence**: Migrated `EXECUTION_MEMORY` to persistent JSON-backed utility (`shared/lib/execution_memory.js`) to survive restarts. (Waterproof)

### TUI & User Experience
- **Navigation**: Redesigned search bar with ANSI save/restore, multi-select search (ampersand-delimited), and sector cascade toggling.
- **Visualization**: Implemented `backend visualize` with Student-t density charts and sigma-band positioning (+1.41σ indicators).
- **Heatmap Polish**: Centered compact cells (9-char symbols), vertical column separators, and simplified color semantics (Green=Pos, Red=Neg).
- **Workflow**: Added post-command footer actions (Enter=Menu, R=Rerun, B=Back).

## Remaining Gaps
- [ ] Automated trading & cloud hosting: Actually deploy the Docker container to a remote Linux node.
- [ ] Indicator Innovations: Implement "Crypto-Stable Inverse Correlation" logic from `DEV_COMMENTS.md`.
- [ ] Advanced Correlation: Implement hierarchical volume-based sorting for the heatmap.
- [ ] Production Scaling: Further optimize storage I/O for 100+ symbol universes.
- [ ] Storage Optimization: Implement NDJSON streaming for large partitions to further reduce memory floor.

## Technical Details
- **Backend**: C++ Core (MSVC), Node.js API, Socket.io Telemetry/Streaming.
- **Frontend**: React (Vite), Tailwind CSS, Lucide Icons, Socket.io-client.
- **Persistence**: Supabase (PostgreSQL + Realtime).
- **Broker**: Alpaca (SDK Integrated, Production Ready), Gate.io, Polymarket (Stubbed).

# dev suggest:*do not delete
- [x] switchin strategies use config files for automating purpose
- [x] anti crash methods
- [x] better user experience, more TUI like, suggestion when choosing sth...
- [x] better UI, more visualy attractive, std deviation visualization
- [x] incorparate quantitative measure from previous project (Kalman filter)
- [x] options trading intergration (G/T/V)
- [x] prediction market trading using keys, tracks the portfolio of it
- [x] automated tradin, sever hosting via linux, cloud etc
- [x] for portfolio tracking:,use every live broker's portfolio and then sum it
- [x] backtesting optimization: overfit detection and OOS validation
- [x] collect major quotes data,economic data lookback to 20 years


---

_Older Correction Log / Update entries (sessions ~20-79, 2026-05-31 to 2026-06-07) archived to `workspace/STATE_ARCHIVE.md` on 2026-06-08 — read there for deep history._
## Update - 2026-06-08 Docs truth refresh

- Refreshed `docs/engineering/tui_feature_map.md` to the current audit baseline so the docs no longer carry the retired backend-integrity failure as current truth.
- Updated `workspace/FEATURE_TEST_MATRIX.md` and `workspace/FEATURE_REPAIR_PLAN.md` so the docs row now matches the refreshed map and the repair plan no longer treats the doc drift as active.
- Current repo truth now separates the two live data scopes cleanly: `backend integrity --json` remains policy-green on configured cache, while `status --json` still reports separate latest-fetch freshness degradation.

## Update - 2026-06-08 Skills refresh

- Refreshed the active repo-local skill inventory and trimmed the live tree to the three umbrella skills: `codex`, `claude`, and `gemini`.
- The current loaded focus now stays on those three skills only, with the older secondary skill directories removed from both `skills/` and `.agents/skills/`.
- This refresh is a state sync only, not a skill-content change.

## Update - 2026-06-08 Shared lib organization

- Started the `shared/lib` category reorganization with canonical folders for `ui/`, `ai/`, `mcp/`, and `compat/`.
- Moved the actual implementations for ANSI, local AI client, MCP gate/agent, and adapters into those folders while keeping legacy root shims in place for compatibility.
- Updated the canonical folder map and the direct ANSI/MCP consumers so the new grouped paths are now exercised by live code.
- Continued the split with `runtime/`, `market/`, `brokers/capabilities.js`, and `supabase/` buckets, plus root shims for legacy callers.
- Verified the moved modules and compatibility imports with `node --check` and direct `require()` probes.
- Extended the reorg into `strategy/`, `ml/`, `profiles/`, and `data/` buckets for backtest, dataset, model, prop-firm, macro, crypto, backfill, ingestion, execution-memory, and pruning helpers.
- Flattened `shared/lib/indicators/price_action.js` into `shared/lib/market/price_action.js` so the indicator bundle now stays inside the market bucket with a compatibility shim at the old path.
- Migrated tracked backend/script/test callers off the legacy root shim imports and onto canonical category paths under `runtime/`, `market/`, `strategy/`, `ml/`, `profiles/`, `data/`, `brokers/`, `supabase/`, and `ui/`.

## Correction - 2026-06-08 mass-implement: shared/lib reorg follow-up (shims removed, real bug fixed)

- Audited the "compatibility shim" layer the entry above describes and found `shared/lib/centralized_lib/ansi.js`, `shared/lib/indicators/price_action.js`, and `shared/lib/auth/ai_client.js` had **zero importers anywhere** (grepped the full tree, tracked and untracked) — they were not legacy paths anything still used, just defensive placeholders.
- Worse: `shared/lib/centralized_lib/ansi.js` was the *only* one wired up, and its sole caller — `backend/cli/lib/auth.js:11` (untracked, last touched 2026-06-03, predates the shim's creation by 5 days) — had been importing a path that **didn't exist until today's reorg session created the shim to patch the hole**, rather than fixing the caller. That's a real bug masquerading as a compatibility layer.
- Fix applied: repointed `backend/cli/lib/auth.js:11` to the canonical `shared/lib/ansi` (the same shim every other migrated caller uses → `ui/ansi`), then deleted all three zero-caller shim files plus the now-empty `centralized_lib/` and `indicators/` directories. `auth/supabase_env.js` (real module, not a shim) stays. Verified clean: `node -e "require('./backend/cli/lib/auth.js')"` loads, and a full-tree grep for the three removed paths returns nothing.
- Also added unit tests for the rsi_backtest statistical primitives (`tests/scripts/rsi_backtest_primitives.test.js`, 15/15 passing against independent closed-form references — Beta(2,2)'s polynomial CDF, the Cauchy distribution for Student-t df=1, pandas quantile interpolation) and exported `betaCdf/betaPpf/tCdf/tPpf` from `shared/lib/strategy/rsi_backtest.js` to make its existing "exposed for tests / inspection" comment true.
- Committed the previously-untracked `scripts/strategies/` directory (8 files, ~1,900 LOC incl. the new RSI reversal stack) — `c47e3f91`.

## Correction - 2026-06-09 mass-implement: shared/lib reorg + workspace doc archival landed (was at-risk uncommitted)

- Found the `shared/lib` category reorg this same STATE.md already documented as "done" was
  entirely **uncommitted** — ~30 new canonical dirs/files (`runtime/`, `market/`, `strategy/`,
  `ml/`, `ui/`, etc.) sat untracked while the old root files existed only as gutted one-line
  shims in the working tree. One `git clean -fd` away from permanently destroying a
  multi-session restructure. Same exposure for the workspace-doc archival
  (`STATE_ARCHIVE.md`, `workspace/handoff/`, `workspace/archive/` — all untracked, while
  `STATE.md`/`HANDOFF.md` looked like they'd lost ~2,800 lines that had actually moved there).
- Landed both as separate commits after smoke-testing the working tree
  (`require('./shared/lib/{paths,strategy/rsi_backtest,runtime/config_loader,market/quote_router}')`,
  `require('./backend/cli/lib/auth.js')` all load clean): `f4a97e94` (191 files, the reorg +
  ~50 caller import-path updates) and a follow-up commit (21 files, the doc archival).
  Deliberately excluded `backend/cli/target/` (2,151 untracked Rust build-artifact files that
  `git add backend/` would otherwise have swept in) and two unrelated stray files
  (`frame_backtester.{cpp,hpp}`, `polymarket-cli/`) — left untouched, out of scope.
- Also closed the gap flagged in the prior session's closeout: added
  `tests/scripts/rsi_backtest_analyze.test.js` — a seeded-fixture (mulberry32 PRNG) end-to-end
  test of `analyzeSeries`/`extractActionable` running the real rsi→atr→crossover→Bayesian-summarize
  pipeline and pinning the exact deterministic signal it produces (kelly=0.5715, hit=0.7692,
  CAUTION/MED). 6/6 passing — full `rsi_backtest` suite now 21/21 (`c5114e90`).

## Update - 2026-06-11 session 11 — blast-through audit of feat/ml-onnx-section (unrecorded 2026-06-10 work)

- Repo is on NEW branch `feat/ml-onnx-section` with ~28 uncommitted modified files from an
  unrecorded 2026-06-10 session. Audit verdict: **DCS 0.87, tree NOT safe to commit** —
  `runGatewayCommand` throws on every call (backend_bridge.js:72), 7 NEW failing test files
  (suite 12✖ vs 6✖ baseline), and tracked code depends on 3 untracked files (4th occurrence of
  the drift class). Ingestion upgrades (binance pagination, 1w/1mo local aggregation) verified
  REAL (BTCUSDT 1w 4→464 bars). Full ledger: DEV_REVIEW.md "Focused Audit - 2026-06-11";
  gate table: workspace/handoff/2026-06-11.md.
- Grade trend vs 2026-06-06 audit: trade B→D (broken migration), shared/lib market A→C (failing
  feature contract), runtime bridge new at D, providers B (binance solid), ingest B,
  tui/engine C→B (markers cleared — ungated), gateway B→C (redaction contract), api/app.js C
  (cached). No section at D/F for 2+ consecutive audits yet — no domain-level escalation; the
  D grades are first-occurrence and tied to ONE fixable root cause each.
- Carryover closed: `backend/cli/target/` now gitignored (edit in tree, uncommitted).
  Carryover direction set in-tree: `storage/models/*.onnx` un-ignored (= "commit binaries").

## Update - 2026-06-11 session 12 — audit findings fixed + landed; suite fully green (263/263)

- All session-11 audit findings fixed same-day (Sonnet-delegated implementation, Fable-verified)
  and committed in 6 batches (`358476f6`..`8e8b4adf`) on `feat/ml-onnx-section`. Bonus root cause:
  `bot_state.ts` stale reorg import meant the gateway could not boot under ts-node at all (tsx has
  been missing from node_modules since ~06-09).
- **`npm test` = 263/263, 0 failures — first fully green suite in project history** (prior best
  226/232; the 6 pre-existing baseline failures were also cleared per user decision).
- Gate table regrades vs session 11: bridge D→B, trade D→B, shared/lib market C→B, backend/cli C→B,
  gateway C→B. No gated sections remain except backend/api/app.js C (cached, GET-auth question)
  and the Docker carryover.
- Carryovers CLOSED: trained `.onnx` binaries committed (fresh-clone fallback gap),
  `backend/cli/target/` gitignored. Still open: Docker/ONNX verification (daemon restart),
  centralization backlog (gateway launcher call sites, local runBackendCommand copy),
  untracked `notebooks/`, stale graphify-out.

## Update - 2026-06-11 deep blast-through repo-hygiene audit

- Runtime/no-spend health is strong locally: `npm.cmd test` passed 269/269, MCP lists 17 tools,
  status reports `recovered_live` with 293 usable records / 0 stale, and backend integrity is
  policy-green with only `RNDRUSDT` as the active exception.
- Main active blocker is now **clean-clone reproducibility**, not runtime behavior. Tracked files
  reference untracked or ignored assets: `frame_backtester.{cpp,hpp}`,
  `scripts/classify_strategy_assets.js`, `scripts/mcp_stdio_probe.js`,
  `backend/api/tests/correlation_contract.test.js`, and ignored notebook fixtures.
- `workspace/DEV_REVIEW.md`, `workspace/BLAST_THROUGH_REPORT.md`,
  `workspace/FEATURE_TEST_MATRIX.md`, and `workspace/FEATURE_REPAIR_PLAN.md` carry the full
  evidence and grades. Close those load-bearing artifact decisions before any broad commit.

## Update - 2026-06-11 deep blast gap-closure plan

- Added `workspace/DEEP_BLAST_GAP_CLOSURE_PLAN.md` as the executable plan for the open gaps.
- Plan priority is clean-clone reproducibility: track load-bearing source/proof files, rewrite the
  notebook contract away from ignored `.ipynb` files, and add structure guards so future tests/docs
  cannot silently depend on untracked artifacts.
- Later waves are intentionally separated: repo protocol/skill truth, Docker ONNX verification,
  provider extraction stubs, and C++ ML review-comment cleanup.

## Update - 2026-06-11 repo skill restoration

- Trimmed the repo-local skill tree down to the three umbrella skills: `codex`, `claude`, and
  `gemini`.
- Kept matching `SKILL.md` files in both `skills/` and `.agents/skills/` so repo-local skill
  discovery stays consistent.
- Updated stale path references in `AGENTS.md`, `GEMINI.md`, `docs/memory/SESSION_MEMORY.md`, and
  `docs/operational/bootstrap.md` to point at the remaining tracked skill paths.

## Update - 2026-06-11 mass-implement clean-clone repair batch

- Applied the first reproducibility wave from `workspace/DEEP_BLAST_GAP_CLOSURE_PLAN.md`.
- Staged the load-bearing source/proof assets that tracked code and docs depended on:
  `.dockerignore`, `backend/core/src/backtest/frame_backtester.{cpp,hpp}`,
  `scripts/classify_strategy_assets.js`, `scripts/mcp_stdio_probe.js`,
  `backend/api/tests/correlation_contract.test.js`, and `notebooks/signal_library.json`.
- Rewired `package.json` so `test:api` includes the correlation contract, expanded
  `tests/scripts/structure_contract.test.js` to guard tracked clean-clone assets and local-only
  ignores, and rewrote `tests/scripts/notebooks_contract.test.js` to validate tracked fixture
  notebooks under `tests/fixtures/notebooks/` instead of ignored live `.ipynb` files.
- Verification is green in the current staged state:
  `test:structure`, `test:api`, notebook contract, full `npm.cmd test` (`272/272`), RSI signal
  library probe (`35` actionable signals), and native `sovereign_wealth` build all passed.
- Also fixed a verification blocker: TUI boot no longer performs a network auth refresh just to
  paint the menu header, which removed the Supabase `EACCES` noise that had broken the TUI
  automation harness in this environment.

## Update - 2026-06-12 session 17 - Polymarket CLOB V2 migration; first real matched order; Alpaca 422 fixed

- **Polymarket order placement works again** (was dead since the 2026-04-28 CLOB V2 cutover).
  Gateway migrated to `@polymarket/clob-client-v2`; funder corrected to the real proxy wallet
  (`0x1e7955...`, sig1) after on-chain triage; new `polymarket sell` subcommand. Proven with a
  real user-approved matched SELL order. Commits `ac21d19a`, `fd15e2e2`.
- **Alpaca 422 fixed** (`c385959f`): fractional equity orders now sent TIF=day, BTCUSDT-style
  symbols mapped to Alpaca slash pairs, Alpaca error bodies surfaced. Proven with two live paper
  orders (one filled).
- **Bots verified online**: docker bot cycling (daemon unwedged), edge-trader decision engine
  green end-to-end in dry mode. Live-loop enablement deliberately left as a user decision —
  candidate filtering needs deadline/liquidity guards first.
- **"DNS issues" reclassified**: host-level flapping `connect EACCES` egress blocks, not DNS.
  SDK-level retry enabled; shared fetch retry helper queued.
- User's 9-item roadmap recorded in `workspace/handoff/2026-06-12.md`; next waves: TUI revamp,
  monolith deconstruction, C++ verify, RAM optimization, deep 5-min data, login barrier.

## Correction - 2026-06-12 session 17c - C++ test claim + audit findings cleared

- The "All 29/29 C++ core tests passing" claim above is STALE: currently 27/29. Both failures are
  fixture-path debt (ingestion_adapter_test resolves config/data_sources.yaml relative to the
  build dir; kronos_integration_test missing its empirical fixture), not logic. Engines verified
  healthy behaviorally: ml compare reproduces Phase-3 ONNX parity EXACTLY; correlation/risk green.
- All 7 session-17 blast-through findings RESOLVED same-day via delegated Sonnet waves
  (37d2d6d2 kill-switch auth, 32cb5637 failure semantics + classifier + masking, cafe6eea
  FOK/deadline guard, 6875f1fa dedup + retry rollout). Suite 284/284. backend/api/app.js gate
  expected to lift C->B next audit.

## Update - 2026-06-12 Polymarket historical archive/backtest implementation

- Added the repo-local `polymarket-history-backfill` skill and implemented the first archive-first
  research slice: normalized resolved markets, CLOB price curves, generated point-in-time feature
  rows, and local archive coverage under ignored `storage/data/polymarket_history/`.
- New command surface: `polymarket research ingest` / `polymarket history ingest` writes the
  generated archive; `polymarket backtest` now prefers archive replay by default and labels archive
  coverage, fallback-only Gamma markets, gross/net PnL, execution costs, EV, drawdown, and hold time.
- Order-book history is deliberately not dense-archived. PMXT/order-book-lite remains phase 2 for
  candidate trade windows only, after price-history signals survive basic replay.

## Update - 2026-06-12 Polymarket orderbook-lite phase 2

- Added PMXT-based candidate-window snapshots behind `--capture-orderbook-lite`. The archive now
  stores derived order-book rows under `storage/data/polymarket_history/orderbooks-lite/` with
  best bid/ask, mid, spread, 1% and 5% depth, timestamp, and source.
- PMXT requests use `https://api.pmxt.dev` and require `PMXT_API_KEY`; the feature stays opt-in
  and the tests inject mock fetchers so the suite remains no-network.

## Update - 2026-06-12 session 18b - roadmap waves 2/6/7/8 progress; "29/29 C++ tests" claim TRUE again

- C++ ctest fixture debt CLEARED (`e0ad1ff7`): ctest -C Debug 29/29 (the Key Accomplishments
  "29/29" claim is accurate again). Bonus real bug fixed: regime_detector off-by-one guard
  (Release NDEBUG had masked 2 regime-test failures; honest prior baseline was 25/29).
- TUI Phase A landed (`d51bfbc1`) per workspace/TUI_REVAMP_SPEC.md: spinner + progress utilities,
  SEMANTIC color language, render-helper extraction, terminal-height-aware page sizes. Phase B
  (status/asset_picker/manifest polish) UNBLOCKED by the user checkpoint 76ef48fb committing the
  formerly-parked 2026-06-11 batch.
- ML data layer perf (`ac7b10ed`): readFamilySources 60s-TTL memoization + loop-invariant hoist;
  ml dump 21.9s -> 2.8s, anchor stage 1452MB -> 754MB, output SHA256-identical. Next RAM target
  (needs user sign-off): NDJSON streaming for the 377MB family JSONs (hotspot #2).
- Item 8 scoped (workspace/FIVE_MIN_DATA_SCOPING.md): Phase 1 = crypto 5m via Binance, sequential
  backfill mandatory (rate-weight budget), ~259MB/3y for 18 symbols; user decisions in section 7.
- Concurrent Codex polymarket archive/backtest slice reviewed + integrated (`0e90e2a0`), 28/28
  tests. Suite at close: 342/342.

## Update - 2026-06-12 session 21 - Codex slice integrated, TUI Phase B landed, 5m crypto deep data Phase 1 live

- Sessions 19/20 Codex polymarket slice (orderbook-lite backfill lane + history-backfill repoint +
  --start-offset) reviewed and committed (`1f6b5e45`); focused bundle 35/35, gateway tsc clean.
- TUI Phase B landed (`b64cf57c`) per TUI_REVAMP_SPEC.md: rich-gated cockpit glyphs (user decision:
  Unicode default-on for rich terminals), asset-picker 60s hierarchy cache, `?` keybind help overlay,
  manifest tuning. TUI surface 99/99; `--json` still 0 ANSI bytes.
- 5-minute crypto historical data Phase 1 is REAL (`c3fbc3ba`): new `crypto-deep-backfill` command
  (sequential, Binance-pinned, 5y default), native 5m routing in fetchCryptoSnapshot, 90-day JSON cap
  applied at write time only, merge-protected sub-daily ts-index bins. Full 18-symbol 5-year backfill
  launched at session close (background).
- **Durable gotcha (grade-relevant):** the crypto provider chain lists TwelveData before Binance and
  TwelveData silently caps history at exactly 5,000 bars; first-success break means any deep fetch
  through the generic chain gets 5,000 bars max. `ingestMarketData` now accepts `options.provider`
  to pin the chain. Watch for the same trap in equities/indices/commodities (twelve is first there too).
- Correction: DEV_REVIEW 2026-06-12 C++ table finding #2 (indicators default --input) was already
  fixed in `e0ad1ff7`; entry was stale. ctest -C Debug still 29/29.
- Suite: **385/385 exit 0** (new baseline; was 342).

## Update - 2026-06-12 session 23 - synthetic 5m consumer guard + backfill still running

- Implemented the session-22 user decision that synthetic/daily-aggregated 5m is experimental-only:
  future aggregate records now carry `derived_from_timeframe` / `experimental_only` metadata; validation
  rejects daily-derived lower-timeframe records as `synthetic_lower_timeframe`; `ml dump` excludes
  experimental 5m by default and exposes `--include-experimental-5m` for explicit research opt-in.
- Added regression coverage in `tests/scripts/tests/ml_dataset.test.js` and
  `tests/scripts/strategy_backtest_contract.test.js`; verification passed:
  `node --test tests/scripts/tests/ml_dataset.test.js tests/scripts/strategy_backtest_contract.test.js`,
  `node --test tests/scripts/tests/crypto_5m_backfill.test.js`, and full `npm.cmd test` = **389/389**.
- The session-22 1825d crypto backfill process is still active as of this update:
  PID 14380, command `backend/cli/sovereign_cli.js crypto-deep-backfill --days 1825 --delay-ms 250 --json`.
  Header probes show it is making progress and has rewritten bins through NEAR/AVAX/FET/POL, but INJ/RNDR
  still need final verification after the process exits.

## Update - 2026-06-12 session 23b - US equity 5m Phase 2 landed; crypto rerun verified complete

- Verified the session-22 crypto 1825d 5m rerun has exited. Ts-index header probe found 13 configured
  crypto symbols at the full 525,506 bars; newer/listing/provider-limited symbols remain shorter
  (SUI/PEPE/WIF/POL/RNDR), not a live process issue.
- Implemented native US-equity 5m Phase 2 via Alpaca:
  `fetchAlpacaBaseCandles` now maps internal timeframes to Alpaca (`5m` -> `5Min`), follows
  `next_page_token`, defaults to `feed=iex`, and requests `adjustment=split`; `fetchPaginated`
  uses 10,000-bar equity chunks and supports `chunkDelayMs`; `fetchEquityOrIndexSnapshot` routes
  Alpaca sub-daily requests through native paginated bars and refuses to synthesize missing Alpaca 5m
  from daily data.
- Added `equity-deep-backfill` CLI. Dry run over real config planned 33 Alpaca-eligible US symbols
  and 44 explicit non-US skips. Live run:
  `node backend/cli/sovereign_cli.js equity-deep-backfill --days 1825 --chunk-delay-ms 500 --json`
  succeeded for 33/33, skipped 44, reported 3,100,888 fetched bars; ts-index verification found
  3,101,322 merged `provider=alpaca` 5m rows across the 33 US symbols, no missing bins.
- Added no-network coverage in `tests/scripts/tests/equity_5m_backfill.test.js` for Alpaca pagination,
  equity chunk sizing, native ingestion, no-synthetic fallback, dry-run skips, and provider-pinned
  command execution. Affected bundle passed 47/47; full `npm.cmd test` passed **395/395**.
- Remaining 5m work: Phase 3 indices/commodities/FX provider decision or Yahoo 60-day accumulate-forward
  stop-gap, equity session-gap guard before indicators/backtests, and ML 5m cap/performance gates.
