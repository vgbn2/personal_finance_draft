# Cross-Project Learnings
_Shared intelligence between personal_finance_draft and hyperglycemia-faint-predictor._
_Updated: 2026-06-04. Append; never rewrite._

---

## Overview

| Attribute | personal_finance_draft | hyperglycemia-faint-predictor |
|---|---|---|
| Stack | Node.js, TypeScript, C++, Supabase, React/Vite | Python, PyTorch, SQLAlchemy async, MongoDB, Telegram |
| Domain | Algorithmic trading + portfolio management | Real-time physiological monitoring + faint-risk prediction |
| Phase | Phase 9 active | 4.1 complete → Phase 5 |
| Tests | 62 (organized by contract) | 5 (sparse) |
| ML | Deterministic adapters (no real training yet) | Real CNN training + safety guards |
| DCS | 1.0 under integrity policy | 0.89 (graph stale) |

---

## 1. Database

### What medical does well → finance should adopt
- **Dual-write with graceful degradation**: MongoDB primary + SQLite WAL local fallback (`audit_logger.py`). When cloud DB is down, the system keeps running on SQLite. Finance has no local fallback for Supabase outages — add a local SQLite cache for critical state.
- **SQLite WAL mode + async lock**: `PRAGMA journal_mode=WAL` + `asyncio.Lock()` prevents write contention in a single-process async app. Finance's Supabase calls have no concurrency guard.
- **Retention policy enforcement**: `run_retention_cleanup(days=180)` with a hard cutoff date, using native BSON Date comparison (not string). Finance accumulates stale cache indefinitely — add a TTL sweep that respects the `96h` freshness policy rather than leaving orphaned entries.
- **MongoDB singleton pattern** (`utils/db.py`): one shared `AsyncIOMotorClient` across all consumers to prevent Atlas connection pool exhaustion. Finance opens new connections per request in some paths — consolidate behind a singleton.
- **Date serialization clarity**: pass `datetime` objects directly to Motor/PyMongo (BSON Date), never `.isoformat()` strings. String comparison fails on non-zero-padded dates. Finance stores ISO strings in Supabase — use typed timestamp columns.

### What finance does well → medical should adopt
- **Integrity check command**: `backend integrity --json` returns `ok`, `cached`, `missing`, `stale` counts as machine-readable JSON. Medical has no equivalent — a `system_health()` async function would surface MongoDB staleness, ML weight age, and snapshot buffer fullness.
- **Cache quarantine command**: `data quarantine` isolates suspect cache entries without deleting them. Medical has no equivalent for flagging corrupt Nightscout readings.
- **TS-index writes after backfill**: finance writes a timestamp index entry immediately after backfill completes so freshness checks are accurate. Medical relies on collection counts which can be slow.
- **96h freshness threshold**: the explicit `1d` policy with a `96h` window is a pragmatic production choice. Medical's `STALE_DATA_TIMEOUT_SECS = 3600` (1h) is aggressive for a 5-min CGM cadence — consider a longer tolerance for non-critical analytics paths.

---

## 2. User Auth

### What medical does well → finance should adopt
- **Secret scrubbing at construction**: `NightscoutClient.__init__` computes `sha1(raw)` immediately and drops the plaintext from scope. `self._token` stored only when the secret is an opaque access token. Exception handlers log only `e.__class__.__name__` — no token strings ever appear in logs.
  - **Apply to**: `backend/gateway/src/index.ts` — audit all exception blocks for token/key leakage before expanding the Polymarket surface.
- **Token mode auto-detection**: `len(raw) > 24 or '-' in raw or raw.startswith("subject-")` picks the right auth path (Bearer vs query-param vs hashed secret). Finance's gateway has separate code paths for each provider that could unify on the same heuristic.
- **Auth fallback on 401**: automatically retries with the alternate auth method, updating internal state so subsequent calls use the correct method. Finance's Polymarket client retries once but doesn't update the auth mode for future calls.
- **Decorator-based per-command auth**: `authorized_only` checks the SQL registry per Telegram handler. Finance's `requireAuth` helper in `auth.js` follows the same pattern — good.

### What finance does well → medical should adopt
- **Auth command with connectivity test**: `backend/cli/commands/auth.js` has a `connectivity` subcommand that tests Supabase connection and reports cleanly. Medical should add `python -m diabetic.main health` for equivalent connectivity tests.
- **Non-TTY fallthrough**: `auth.js:94` returns 1 after the while loop when stdin is not a TTY. Medical's Telegram auth has no headless/CI fallback.
- **`requireAuth` helper**: the `requireAuth` function in `lib/auth.js` wired to `trade --live` is a clean pattern. Medical uses a `@authorized_only` decorator which is the Python equivalent — good alignment.

### Future (for both — website)
- Follow medical's pattern: never store raw secrets; use short-lived JWTs signed at the API layer.
- **Supabase RLS** (already in finance): Row-Level Security ensures per-user data isolation. Medical should adopt RLS when adding multi-user web access.
- **Session token rotation**: neither project currently rotates tokens on activity. Add `refreshed_at` with a 24h sliding window.

---

## 3. Config

### What medical does well → finance should adopt
- **Centralized constants with provenance**: `medical_constants.py` has source citations (Battelino 2019, WHO PM2.5), layer annotations, and explanatory comments per constant. Finance's `models.js` and `backtest.js` have unexplained magic numbers — add citation comments for `confidenceScale`, `RATE_LIMITS` interval, walk-forward split ratios.
- **Fail-fast boot validation**: `validate_config()` checks timezone, required env vars, and physiological plausibility at startup. Finance discovers missing config at runtime mid-request — add a boot-time validation that checks all required keys before accepting any traffic.
- **Absolute path resolution for ML artifacts**: `Path(__file__).resolve().parent.parent / "weights/..."` prevents CWD-dependent failures in cron/scheduler contexts. Finance's `findBackendBinary()` and `BACKEND_CANDIDATES` already do this for the C++ binary — apply the same pattern to model weights when real training is added.
- **Pydantic Settings with validation aliases**: maps env var names to code names at a single point (`TELEGRAM_BOT_TOKEN` → `TELEGRAM_TOKEN`). Finance uses `process.env` reads scattered across modules — consolidate into a single `config.js` or `settings.ts` with schema validation.

### What finance does well → medical should adopt
- **Config externalization to YAML**: strategy files carry `signal_threshold`, `engine`, `features`, `indicators`, `risk_weight`. Medical's Alpha Gate thresholds (`ALPHA_GATE_DIVERGENCE_LIMIT = 2.5`, `ALPHA_GATE_CONFIDENCE_THRESHOLD = 0.7`) are hardcoded constants — externalize them as `.env` variables.
- **`DEFAULT_USER_SETTINGS` in paths.js**: a canonical default shape for user JSON settings. Medical has no equivalent; patient preferences are scattered across config fields.
- **Settings command**: 7 subcommands (show, timezone, layout, params, flags, alerts, reset) persisting to JSON. Medical should add `/settings` Telegram command for patient parameters.

### Future (for both — website)
- **Environment tiers**: add `NODE_ENV`/`BIO_ENV` (development, staging, production) to separate configs.
- **Vault for secrets**: move to Doppler or HashiCorp Vault for production; `.env` is dev-only.

---

## 4. CLI / TUI

### What finance does well → medical should adopt
- **Organized command subfolders** with `index.js` re-exports: `commands/research/`, `settings/`, `strategy/`. Medical's `main.py` is a monolithic `sys.argv` switch — restructure as `commands/live.py`, `commands/admin.py`, `commands/health.py`.
- **Contract test suite**: one test file per command contract. Medical has zero CLI tests.
- **TUI manifest pattern**: declares every TUI surface centrally. Medical's Telegram bot has no manifest — commands are registered individually.
- **`--json` flag for automation**: every command supports machine-readable output. Medical's CLI emits only log lines.
- **Sectioned terminal reports**: boxed, columnar output with color coding. Medical's CLI is unstructured.
- **`rerun last` category menu**: TUI remembers last args. Medical could use this for `/meal` repeat suggestions.

### What medical does well → finance should adopt
- **Emergency fallback**: if the alert engine throws, `coordinator.py:397–405` still fires a bare critical alert. Finance CLI has no backstop — add a try/catch at the `sovereign_cli.js` dispatch level that logs and emits a degraded result rather than an uncaught stack trace.
- **Graceful shutdown sequence**: `coordinator.shutdown()` cancels background tasks in order. Finance's `process.exit()` is abrupt — add `beforeExit`/`SIGTERM` handler that flushes in-flight requests and closes DB connections.
- **Interactive feedback loop**: Telegram `/meal` + callback buttons for alert confirmation (RLHF). Finance is CLI-only — a future chat interface could follow the same pattern.

### Future (for both — website)
- **Shared command registry**: emit the same command objects to CLI, TUI, and web. Finance's manifest.js is the best existing pattern to extend.
- **Breadcrumb navigation**: finance's TUI category → command structure maps cleanly to a web sidebar nav. Reuse the manifest hierarchy for the web router.
- **Keyboard shortcuts**: finance already has keybindings. Medical's future web layer should adopt the same shortcut registration pattern.

---

## 5. MCP Tools

### What finance has (and medical should mirror)
- **MCP server exposing 14 tools** (`backend/mcp_server/index.ts`): portfolio state, backtest results, system status accessible to Claude without file reads.
- **HTTP MCP-gated API**: sensitive routes require MCP header; public health routes don't.
- **stdio probe script** (`scripts/mcp_stdio_probe.js`): verifies server starts and lists tools without a full client.
- **Tool naming by domain**: `portfolio.*`, `backtest.*`, `strategy.*` — namespaced to prevent collision.

### What medical needs to build (informed by finance)
- `bio.system_health` — returns JSON snapshot of DB, ML, network status
- `bio.run_simulation` — triggers a simulation scenario and returns result JSON
- `bio.get_snapshots` — returns recent metabolic snapshots for Claude to analyze
- `bio.get_alert_log` — returns recent alert history

### Finance-specific improvements (informed by medical)
- **Simulated data mode for tools**: `SimulationReader` in medical replays deterministic data without live APIs. Finance's MCP tools always hit live providers — add `SOVEREIGN_MOCK_MODE=true` to replay cached responses for tool testing.
- **Tool authorization**: MCP tools that mutate state (place order) must require a PIN. `SOVEREIGN_TRADE_PIN` already exists — enforce it at the MCP tool layer, not just the CLI layer.
- **Streaming tool responses**: long-running tools (backtest, training, backfill) should stream progress. Both projects return synchronous responses today.

---

## 6. ML / Model Pipeline

### What medical does well → finance should adopt NOW
- **Loss floor before deployment**: `train.py` rejects weights if `best_val > 2.0` MSE. When finance adds real ML training, enforce: reject weights if OOS return is below a floor or if all backtests return 0 trades.
- **Domain range clamp on outputs**: predictions outside physiological range `[2.0, 25.0]` trigger weight purge. Finance equivalent: if confidence scores are outside `[0, 1]` or equity curves dip below -100%, reject weights.
- **Hot-reload without service interruption**: `reload_weights()` swaps CNN weights on a running runner. Finance trains manually and restarts — add hot-reload to the training pipeline.
- **Alpha Gating** (the most directly applicable pattern):
  - Medical: when CNN prediction diverges from kinematic baseline by > `ALPHA_GATE_DIVERGENCE_LIMIT` AND confidence < `ALPHA_GATE_CONFIDENCE_THRESHOLD`, fall back to the simpler baseline.
  - **Finance equivalent**: when C++ native signal and JS model signal diverge by > `N%` AND data confidence is low (stale data, thin orderbook), route to C++ native (the simpler, more stable baseline) rather than blending.
  - Implement in `shared/lib/backtest.js`: check `abs(cppSignal - jsSignal) > DIVERGENCE_LIMIT && dataConfidence < CONFIDENCE_THRESHOLD` before deciding which signal to trade.
- **Two-channel contract enforcement**: medical locks `inference.py` and `train.py` to the same feature spec. Finance has no enforced contract between `models.js` features and `indicators.js` production — add a schema check at model load time.

### What finance does well → medical should adopt
- **Walk-forward validation**: rolling OOS windows vs single train/test split. Medical uses fixed 80/20 — add rolling walk-forward before autonomous retraining promotes new weights.
- **Threshold calibration pass**: finance discovered `cnn_window_v0` never cleared 0.62 on real data. Medical should run a similar calibration: does the Alpha Gate CNN prediction actually improve over kinematic-only? Backtest over stored snapshots.
- **Model registry / version tracking**: finance tracks `ML_WEIGHTS_VERSION` (`v15`). Add a model card (`docs/models/v15_card.json`) with training date, dataset, validation loss, and intended use.
- **`--sample` vs `--live` flag**: finance explicitly separates sample-mode (synthetic data) from live-mode (real cache) in every backtest command. Medical's simulation scripts don't have this separation — add it.

---

## 7. Web / Frontend (Future)

### Finance's React/Vite scaffold is the template for medical
- **Vite + React** for both. Finance's `Frontend/dashboard/` is the starting point.
- Medical's `twa_api.py` already has `get_hud_data()`, `get_forecast()` REST endpoints — wire these to a React frontend.
- Medical's `StatelessPush` already pushes real-time updates — add SSE or WebSocket to the React app to consume them.

### From medical's architecture → finance web
- **Server-Sent Events for live data**: medical's `StatelessPush` pushes updates. Finance's React dashboard has no real-time feed — add an SSE endpoint to `backend/api/app.js`.
- **Confidence badge**: medical tracks `snapshot.confidence_index` as a smoothed EMA. Show a data-confidence badge on every finance dashboard panel.
- **Emergency overlay**: medical fires critical alerts even if the decision engine is broken. Finance's web dashboard should have an emergency banner that fires independently of the normal data pipeline.

### Shared patterns for future web builds
- **API-first, no business logic in React**: both medical (twa_api.py) and finance (app.js) correctly put all logic in the API layer. Keep React as a pure display layer.
- **Token-per-route, not blanket auth middleware**: per-route auth allows public health/status endpoints.
- **Dark mode + responsive by default**: finance's Glassmorphism design is dark-mode native.
- **Chart libraries**: use Recharts (React native, zero-config) for medical biometrics; use TradingView lightweight-charts for finance OHLCV.

---

## 8. Testing

### What finance does well (and medical should copy)
- **Contract tests by surface**: one test file per command/feature contract.
- **Broad gate after every session**: `62/62 pass` before any commit.
- **Structure contract test**: verifies that generated/dependency paths are not tracked in git.
- **`--json` output for test automation**: every command supports machine-readable output so tests can assert on structured data.

### Finance-specific improvement (from medical)
- **Empirical validation protocol**: medical's journal records `input → transform → output → invariant` for each hypothesis. Finance's tests assert pass/fail without recording the evidence chain — add evidence comments to test files for complex invariants.
- **Simulation harness for data-independent tests**: medical's `SimulationReader` runs tests without needing live Nightscout. Finance's test suite relies on cached provider data that can go stale — add deterministic replay fixtures.

### Finance debt still open (not from medical, own backlog)
- `tests/scripts/tests/sovereign_cli.test.js` at 1152 lines — split by responsibility (CLI contract, price-action indicators, model/backtest coverage) into 3 files.
- `tests/scripts/tests/backfill_regression.test.js` — MODULE_NOT_FOUND pre-existing, needs path fix.
- TUI automation is pipe-driven, not PTY-accurate — adequate for menu/prompt regression, not signal-level.

---

## 9. Session / Workspace Hygiene

### Finance's mature session hygiene (keep using)
- `workspace/HANDOFF.md` — current objectives
- `workspace/BLAST_THROUGH_REPORT.md` — rolling audit findings
- `workspace/DEV_REVIEW.md` — active reviewer decisions
- `workspace/NEXT_SESSION_GOAL.md` — next session's one-liner
- `workspace/FEATURE_TEST_MATRIX_*.md` — per-feature test evidence
- `docs/engineering/blast_through_checklist.md` — audit runbook
- `docs/engineering/architectural_debt.md` — long-lived structural debt

### Improvements finance can take from medical's fresh workspace design
- Medical's `workspace/SESSION_MEMORY.md` accumulates verified facts and cautions across sessions without duplicating per-session notes. Finance currently spreads cautions across individual HANDOFF entries — add a dedicated `SESSION_MEMORY.md` to this workspace.
- Medical's `workspace/BOOTSTRAP.md` captures the directory map, hard constraints, and boot rules in one place for session cold-start. Finance's equivalent is scattered across CLAUDE.md and docs/ — consolidate.

---

## 10. Infrastructure / DevOps

### What medical has → finance should note
- **Docker Compose** (`docker-compose.yml`): `mongodb`, `core`, `twa` services. Finance has no container orchestration — add `docker-compose.yml` for `backend`, `frontend`, `supabase-local`.
- **PID lock singleton** (`main.py`): `.bot.lock` with `psutil.pid_exists()` check prevents split-brain. Finance has no equivalent for preventing duplicate daemon processes.
- **`atexit` cleanup**: all cleanup paths registered with `atexit`. Finance should add `process.on('SIGTERM', ...)` and `process.on('beforeExit', ...)` for gateway shutdown.

### What finance has → medical should note
- **Heroku `heroku.yml`**: ready for Heroku container deployment. Medical should add a `render.yaml` or `Dockerfile` for Render.com deployment (the `RENDER_EXTERNAL_URL` config key already implies this target).
- **CMakeLists.txt + Release build**: finance has a proper C++ build system. If medical ever adds native extensions (e.g., Kalman filter in C++), use the same CMake + `backend/core/` pattern.
- **`Makefile`**: finance has a Makefile for build targets. Medical's build process is just `pip install -r requirements.txt` — add a Makefile for `make test`, `make train`, `make health`.
---

## 11. Local-First Trading Retrospective

### Architectural truths learned
- **Single env resolver wins**: broker and service config drift disappeared only after all adapters and doctor/setup flows read from shared env modules instead of each file parsing `process.env` independently.
- **Local secrets need explicit escape hatches**: a `--env-path` override and a clean-room `SOVEREIGN_SKIP_DOTENV=1` mode made it possible to prove secrets stay local without touching the repo `.env`.
- **Doctor must separate missing fields from reachability**: missing credentials, endpoint reachability, and secret redaction are different failure classes and should stay distinct in output and tests.
- **Cloud/live boundaries must fail closed early**: blocking live execution before auth or PIN prompts prevented the wrong runtime from ever reaching the signer path.
- **Secret hygiene needs automation, not memory**: a repo-wide secret-pattern scan in CI is more durable than relying on code review to catch obvious leaks.

### Process truths learned
- **Write the plan from the runtime, not the other way around**: the operational checklist became truthful only after the actual CLI commands, temp-file writes, and test coverage existed.
- **Verification needs a no-secrets path**: the most useful regression tests were the ones that proved setup/doctor behavior with empty env state, not just happy-path credentialed runs.
- **Persist the cleanup in workspace notes immediately**: once the plan was fully checked off, the durable repo memory needed an explicit completion note so future sessions do not reopen closed items.
