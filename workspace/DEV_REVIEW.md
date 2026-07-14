### Mass-Implement Closeout - 2026-07-09 (live-test fixes)

DCS 0.86->0.91. Closed or downgraded the strongest 2026-07-08 live-test findings:

- **Closed:** API `/api/indicators` false-503. The route now returns HTTP 200 for
  `symbol=BTCUSDT&timeframe=1d` with `feature_count: 120`.
- **Closed:** `ingest --dry-run` side effects. Dry-run now returns a read-only plan before provider
  fetch, macro-store write, cache write, partition write, or ts-index write.
- **Closed:** Market Intel quality-card mismatch. The panel now reads global `/api/status`, and
  websocket market-data updates emit `status` alongside universe/data-summary payloads.
- **Closed:** candlestick total-width overflow and scorecard non-TTY progress noise. `backend chart
  --width 40 --style candle --sma 20 --volume` measured max visible width 40; captured scorecard
  output has no carriage returns and max width 103 matching the header.
- **Closed:** fixed `<target>.tmp` JSON write race. `writeJson()` now uses unique atomic temp paths.
- **Closed:** Polymarket helper v2 constructor drift. Helper scripts use the same object-shaped
  `ClobClient` constructor as the gateway factory.
- **Still open:** frontend Supabase chunk split warning and tracked `storage/models/*` CRLF/trailing
  whitespace remain; the latter still makes full `git diff --check` fail.

**Verification:** focused Node tests for API indicators, ingest dry-run/stubs, candlestick rendering,
and writeJson temp paths passed; `backend/api/tests/api.test.js` passed with localhost bind approval;
live `/api/indicators` probe returned 200; frontend build passed with known warnings; `npm run
hygiene` passed; diff-check on this pass's touched files passed.

### Live Feature Test - 2026-07-08 session 67 (CLI/API/dashboard surfaces)

DCS 0.91->0.86. Scope: live CLI commands, localhost API probes, dashboard API wiring, terminal UI
rendering, provider-stub behavior, and build warnings. Code was not changed in this pass.

| Priority | Area | File:line | Live evidence | Finding | Fix / gate |
|---|---|---|---|---|---|
| **High** | API/dashboard indicators | `backend/api/server/services/cli_executor.js:799-820`; `backend/cli/commands/research/research.js:338-358` | `curl /api/indicators?symbol=BTCUSDT&timeframe=1d` returned HTTP 503 with `indicators_command_failed`; direct `node backend/cli/sovereign_cli.js indicators BTCUSDT --json` returned exit 0 with `feature_count: 120`. | The API wrapper treats parsed CLI output as success only when `nodeCli.ok` is truthy, but `commandIndicators()` prints successful JSON without an `ok` field. A working CLI feature is therefore exposed as a broken API endpoint. | Treat `exit_code === 0` as success or make indicators output include `ok: true`; gate with a route test proving `/api/indicators?symbol=BTCUSDT&timeframe=1d` returns 200 and feature counts. |
| **High** | Ingest dry-run safety | `backend/cli/commands/data/data.js:342-380`; `backend/scripts/data_ops/ingest_market_data/index.js:889-902`, `:1150-1162`, `:1176-1189` | `node backend/cli/sovereign_cli.js ingest --family pmi --dry-run` printed `Refreshing market cache`, emitted Supabase write failure text, saved local filesystem cache, and reported `mode: live`; same pattern for `breadth`. | `ingest --dry-run` is accepted but ignored by the active ingest path. It still executes live fetch/write/persistence behavior, unlike other data commands with explicit dry-run guards. | Add `dryRun` to `ingestOptionsFromArgs()` and make `ingestMarketData()` skip external writes/cache persistence when set; gate by asserting no cache/ts-index/macro-store writes and output includes `dry_run: true`. |
| **Medium** | Dashboard market-intel data | `Frontend/dashboard/src/components/panels/MarketIntelPanel.tsx:29-38`, `:87-105`; `backend/api/server/services/cli_executor.js:301-335` | Live `GET /api/data/summary` returned 200 but defaulted to `symbol: AAPL`, `timeframe: 1d`, `bars: 0`, `usable_records: 0`; the panel calls this endpoint with no query params and displays "Usable Records" and freshness from that payload. | The dashboard can show "Verified Integrity" as zero/nominal even though CLI status reports 2525 usable records. The panel is reading a default AAPL slice, not global data quality. | Either call a global quality/status endpoint for these cards or pass the selected symbol/timeframe intentionally; gate by checking the Market Intel cards agree with `status --json` or explicitly label the slice. |
| **Medium** | Terminal UI scaling | `backend/cli/commands/research/scorecard.js:146-165`, `:198-213`, `:231-247`; `backend/cli/tui/visualizations.js:293-298`, `:374-417` | `scorecard --family crypto --top 8 --no-backfill` renders a 103-column header against `W = 98`; captured progress lines collapse to 124 columns because `\r` progress is emitted. `backend chart --width 60` produced max visible width 72; `--width 40` still hit 65 due axis/footer overhead. | Width flags and separators do not match actual visible output. In non-TTY/captured panes the candlestick chart does not clamp against requested width, and scorecard progress output is clunky in logs. | Compute table width from columns, suppress/properly newline progress in non-TTY, and treat `--width` as total output width or document it as plot-area width; gate with ANSI-stripped width tests. |
| **Medium** | Backtest CLI UX and concurrency | `backend/cli/commands/research/research.js:301-321`, `:481-490`; `shared/lib/market/validation.js:622-631` | `bt --strategy cnn_window_v0 --json`, `bt --strategy logistic_v1 --json`, and `bt --strategy xgboost_v1 --json` all failed with `Strategy file is invalid ... (missing_file)`. Parallel backtest runs also hit `ENOENT ... rename ... data_quality_report.json.tmp -> data_quality_report.json` once. | The CLI accepts model-looking values under `--strategy` but resolves them as file paths, conflicting with stale handoff/doc examples. Concurrent research commands also share a fixed `data_quality_report.json.tmp` path for JSON writes. | Update docs/help to use `--model` or YAML strategy files; make `writeJson()` temp paths unique like `atomicTempPath()`; gate with parallel `bt` smoke and model-vs-strategy argument tests. |
| **Medium** | Provider stubs still user-visible | `backend/scripts/data_ops/ingest_market_data/manifests.js:48-63`, `:142`, `:154-173`; `backend/cli/tui/manifest.js:155-158` | Direct probes return structured `not_implemented` for `pmi/spglobal`, `breadth/yahoo`, `flight/opensky`, `crypto_tx/blockchair`, `holdings/sec`, and `onchain/blockchair`; `ingest --family pmi --dry-run` still spends a live run on those lanes. | The stubs no longer silently return `{}`, which is good, but they remain reachable through CLI/config and create noisy failed live tests. | Disable unimplemented families from user-facing ingest selection or add "coming soon/not implemented" copy before execution; gate with `ingest --family <stub>` returning a fast, non-mutating not-implemented result. |
| **Low** | Frontend bundle split | `Frontend/dashboard/src/lib/api.ts:33-41`; `Frontend/dashboard/src/App.tsx:8`; `Frontend/dashboard/src/components/layout/TopBar.tsx:6`; `Frontend/dashboard/src/components/panels/AuditLogPanel.tsx:4`; `Frontend/dashboard/src/components/panels/OverviewPanel.tsx:6`; `Frontend/dashboard/src/pages/LoginPage.tsx:2` | `npm --prefix Frontend/dashboard run build` passed, but Vite warned that `src/lib/supabase.ts` is dynamically imported while also statically imported elsewhere, and the main JS chunk is about 945 kB uncompressed. | The intended Supabase dynamic split is ineffective, and the dashboard bundle is already large enough to trigger Vite's warning. | Move Supabase auth/realtime consumers behind a consistent async boundary or accept it as eagerly loaded; gate by build output with no mixed dynamic/static import warning and smaller route chunks. |
| **Low** | Stale API scaffold | `backend/api/server/services/data_formatter.js:1-18`; `backend/api/server/services/job_queue.js:1-23`; `backend/api/app.js:39-51` | `data_formatter.js` and `job_queue.js` are only referenced by `backend/api/tests/charts.test.js`; active `app.js` implements HTTP/rate-limit behavior inline. | Test-only service scaffolds sit beside the active API and can mislead future route work. | Delete or wire into production intentionally; gate with `rg` showing no production-dead service modules. |

**Verified-good / environmental:** the API server bound successfully on escalated localhost and `/api/supabase/config`, `/api/status`, `/api/data/summary`, and `/api/backend/stats` responded. `/api/status` reported `backend: unavailable` but usable cache quality from the latest snapshot. Direct browser rendering was not performed; sandbox blocks localhost sockets without escalation, so probes were done via `curl`.

### Blast-Through Triage - 2026-07-08 session 67 (dirty-worktree regression check)

DCS 0.95->0.91. Scope: quick triage of the current uncommitted migration/connective-tissue diff, with
focus on executable helper surfaces, env/auth/provider wiring, and commit-blocking hygiene.

| Priority | Area | File:line | Finding | Fix | Gate |
|---|---|---|---|---|---|
| **High** | `scripts/polymarket` helper surface | `scripts/polymarket/polymarket_positions.mjs:22`, `scripts/polymarket/polymarket_check_balance.mjs:34`, `scripts/polymarket/polymarket_diag.mjs:57`; compare `backend/gateway/src/clob_factory.ts:33,43` | The previous helper repair is only partial: the scripts import `@polymarket/clob-client-v2`, but still instantiate it with the legacy positional constructor. The installed v2 client constructor expects a single object argument, so `polymarket_positions.mjs` and `polymarket_check_balance.mjs` crash before any network call with `TypeError: Cannot read properties of undefined (reading 'endsWith')`; `polymarket_diag.mjs` catches and reports the same constructor error in its CLOB section. | Use the same object-shaped v2 constructor as the gateway factory, or route these scripts through the gateway's `createClobClient`/account helper so the SDK signature cannot drift twice. Include credentials as `creds: { key, secret, passphrase }`. | `node scripts/polymarket/polymarket_positions.mjs` should reach either a live-network response/error or an authenticated CLOB response, not a local constructor `TypeError`; same for `polymarket_check_balance.mjs` and the CLOB section of `polymarket_diag.mjs`. |
| **Medium** | `storage/models` generated model contracts | `storage/models/feature_config.yaml:1`, `storage/models/metadata.json:1`, `storage/models/parity_python.json:1`, `storage/models/serving_manifest.txt:1` | Tracked generated model-contract files were rewritten with CRLF/no-final-newline churn. `git diff --check` fails with trailing-whitespace reports across these files, while `npm run hygiene` still says the workspace is pristine. These files are not pure throwaway noise: `backend/core/src/main.cpp` and strategy code read `storage/models/serving_manifest.txt`/`metadata.json`, so their generated state needs a normalized, reviewable commit boundary. | Normalize generated text outputs to LF + final newline, or make the generator write normalized text. If these are not intended to be reviewed in commits, decide that explicitly and untrack/ignore the non-load-bearing outputs instead of leaving them as dirty tracked artifacts. | `git diff --check` must pass; rerun the ML-serving smoke/parity path if semantic model metadata changed, not just line endings. |

**Verified-good / dismissed:** targeted Supabase/API regression tests passed; `SOVEREIGN_ENV_FILE` works for the API path; Alpaca `ALPACA_SECRET_KEY` alias regression passed; ingest placeholder lanes now fail with structured `not_implemented`; frontend Vite build passed; gateway TypeScript and root/gateway `npm ls` passed. `graphify-out/` is absent, so no graph-based map was available for this triage.

**Next cleanup move:** fix the Polymarket helper constructor drift first because it contradicts the previous closeout and blocks local account diagnostics; then normalize or exclude the generated model artifacts so `git diff --check` can be used as a reliable pre-commit gate.

### Mass-Implement — 2026-07-05 session 65 (API env + Polymarket helper repair)

Closed the two migration regressions from the session 65 audit. DCS 0.93->0.95.

- **[x] API Supabase env loading now honors the migrated env-file path.** `backend/api/server/services/supabase_client.js` now uses the shared `shared/lib/runtime/env` loader instead of a local `.env` reader, so `SOVEREIGN_ENV_FILE` works again in the API stack. Added a regression to `tests/scripts/architecture/data_storage/supabase_route_contract.test.js` that writes a temp env file and proves `/api/supabase/config` reports the migrated URL as configured.
- **[x] Polymarket helper scripts now resolve from the real repo root, honor the shared env loader, and use the installed v2 CLOB package.** `scripts/polymarket/polymarket_check_balance.mjs`, `polymarket_positions.mjs`, `polymarket_onchain.mjs`, `polymarket_find_key.mjs`, and `polymarket_diag.mjs` now anchor at `../../`, load env through `shared/lib/runtime/env`, and use `@polymarket/clob-client-v2` from the gateway install path. Added a missing-`POLYMARKET_PRIVATE_KEY` guard to `polymarket_positions.mjs` so it exits cleanly instead of throwing a `TypeError`.

**Verification:** `node --test tests/scripts/architecture/data_storage/supabase_route_contract.test.js` passed;
`SOVEREIGN_ENV_FILE=/home/vgbn1/Documents/codeptit/personal_finance/.env node -e "const s=require('./backend/api/server/services/supabase_client'); console.log(JSON.stringify({configured:s.isConfigured()}));"` returned `{"configured":true}`;
`node scripts/polymarket/polymarket_check_balance.mjs` now exits on missing L2 credentials instead of module resolution;
`node scripts/polymarket/polymarket_diag.mjs` now exits on missing private key;
`node scripts/polymarket/polymarket_find_key.mjs` now exits with its usage message;
`node scripts/polymarket/polymarket_positions.mjs` now exits on missing private key instead of throwing.

**Grade movement:** `backend/api` C -> B; `scripts` C -> B-.

### Blast-Through Connective-Tissue Sweep — 2026-07-05 session 65 (migration/API fragility)

DCS 0.95->0.93. Scope: diagnose the post-migration API fragility the user reported, with emphasis on
config resolution and runnable helper surfaces. I verified the live behavior directly instead of
trusting the migration assumptions.

| Priority | Area | File:line | Finding | Fix | Gate |
|---|---|---|---|---|---|
| High | `backend/api` Supabase config | `backend/api/server/services/supabase_client.js:7-23`, `backend/api/server/routes/account/supabase_config.js:6-20` | The API stack still loads only the repo-root `.env` from the current checkout and never consults the migrated env-file path that the CLI now honors. In this checkout `isConfigured()` stays `false`, and `/api/supabase/config` returns `configured: false` even when `SOVEREIGN_ENV_FILE` points at the sibling migrated repo env. That is a concrete migration break: the API reports "Supabase not configured" while the credentials do exist in the migrated environment. | Route API config through the shared/migrated env loader, or add the sibling `personal_finance` env-file fallback used by the CLI auth path, so the API and CLI agree on what "configured" means. | OPEN |
| Medium | `scripts/polymarket` helper surface | `scripts/polymarket/polymarket_check_balance.mjs:7-27`, `scripts/polymarket/polymarket_positions.mjs:6-14`, `scripts/polymarket/polymarket_onchain.mjs:6-14`, `scripts/polymarket/polymarket_find_key.mjs:7-10`, `scripts/polymarket/polymarket_diag.mjs:10-14` | The Polymarket helper scripts compute `repoRoot = path.resolve(__dirname, '..')`, which points at `scripts/` instead of the repo root. They then require gateway dependencies from `scripts/backend/...`, so they fail immediately with module-not-found errors when launched from the repository as documented. `polymarket_diag.mjs` adds a second brittle path bug by using a relative `./backend/...` require from the script file itself. | Anchor `repoRoot` at the actual project root (`path.resolve(__dirname, '..', '..')`) or derive it from a shared helper, and stop hardcoding nested gateway `node_modules` paths if the script is meant to be runnable after migration. | OPEN |

#### Section grades

| Section | Grade | Reason |
|---|---|---|
| `backend/api` | C | The active HTTP server still works structurally, but Supabase config resolution is migration-fragile and currently reports "not configured" in the migrated env layout. |
| `scripts` | C | Polymarket helper scripts are documented as runnable, but the current path anchoring breaks them immediately from the repo root. |

**Verification:** direct `isConfigured()` probe returned `false`; `/api/supabase/config` returned
`configured: false`; the CLI auth path accepted the migrated env-file override while API did not;
`scripts/polymarket_check_balance.mjs` and `scripts/polymarket_diag.mjs` both fail on broken module
resolution from the current layout.

**Next cleanup move:** unify env resolution across API/CLI first, then repair the Polymarket script
root anchoring so the documented helper commands work again after migration.

### Mass-Implement — 2026-07-05 session 64 (connective-tissue fixes)

Closed the high/medium connective-tissue findings from the sweep above. DCS 0.95->0.97.

- **[x] Alpaca env alias drift fixed.** `shared/lib/providers/alpaca.js` now resolves credentials
  through the existing broker alias resolver, so the documented `ALPACA_SECRET_KEY` and the legacy
  `ALPACA_API_SECRET` both satisfy market-data fetch preflight. Added a regression to
  `tests/scripts/data/backfill/equity_5m_backfill.test.js` using only `ALPACA_API_KEY` +
  `ALPACA_SECRET_KEY`; the stubbed request emitted one record and used the expected Alpaca headers.
- **[x] Enabled provider stubs no longer return empty objects.** `manifests.js` now converts the
  still-unimplemented provider lanes (`pmi`, `flight`, `crypto_tx`, `holdings`, `onchain`,
  `breadth`, plus the `fxapi` fallback) into structured `not_implemented` errors with
  `code`, `provider`, and `family`. This preserves honesty in `ingest --family all`: no synthetic
  data and no ambiguous `{}` return shape. Added `tests/scripts/data/ingest/ingest_manifest_contract.test.js`.
- **[x] Gateway direct dependency declared.** `backend/gateway/package.json` and lockfile now include
  direct `axios@^1.18.1`, matching the two production `require('axios')` call sites in
  `clob_factory.ts` and `index.ts`.

**Verification:** `node --test tests/scripts/data/backfill/equity_5m_backfill.test.js` passed;
`node --test tests/scripts/data/ingest/ingest_manifest_contract.test.js` passed; direct
`ALPACA_SECRET_KEY` probe returned `{"records":1,"close":2}`; direct PMI probe returned
`{"code":"not_implemented","provider":"spglobal","family":"pmi",...}`; `npm ls --prefix
backend/gateway --depth=0` passed with `axios@1.18.1`; `npx tsc -p backend/gateway/tsconfig.json
--noEmit` passed; `npm run hygiene` passed.

**Grade movement:** `shared/lib/providers` B- -> B+; `backend/gateway` B -> B+; ingest provider-stub
surface C -> B- because the stubs are still unimplemented, but now fail explicitly instead of
pretending to be enabled data lanes. Remaining low-priority gap: stale API scaffold cleanup.

### Blast-Through Connective Tissue Sweep — 2026-07-05 session 64 (stub/string/dependency matrix)

DCS 0.96->0.95. Scope: full-repo connectivity sweep across active production roots after the
Ubuntu migration repair. `graphify-out/` is absent, so this pass used live `rg`/package/env/import
checks plus direct file reads. Total scanned file surface: 1080 repo files excluding `node_modules`
and large storage caches. Hygiene passed after the audit (`npm run hygiene`).

#### Connective-tissue / orphan matrix

| Priority | Classification | Area | File:line | Finding | Required decision / fix | Gate |
|---|---|---|---|---|---|---|
| High | Incomplete | ingest/provider stubs | `backend/scripts/data_ops/ingest_market_data/manifests.js:49-55`, `:134`, `:146-149`, `:164-165`; `config/markets/data_sources.yaml:102-123`, `:148-157` | Enabled ingest families still point at no-op provider functions. `flight`, `crypto_tx`, `holdings`, `onchain`, and `breadth` are enabled in config and routed through fetchers that return `{}`; `pmi` is enabled earlier in the same config and routes through `fetchSpGlobalFlashPmi() { return {}; }`. Direct probe: `FAMILIES_MANIFEST.find(f=>f.id==='pmi').fetcher(...)` returns `{}`. The ingest loop converts empty records into `No <family> provider resolved successfully`, so this is not silent data corruption, but `ingest --family all` still spends time on families that cannot produce real data. | Either implement the real provider adapters, or mark these config families disabled until implemented, or expose them as explicit `not_implemented` provider checks instead of pretending they are enabled live data lanes. | OPEN |
| Medium | Incomplete | env/string wiring | `.env.example:10-13`; `shared/lib/providers/alpaca.js:48-53`; `shared/lib/brokers/alpaca_env.js:28-30` | `.env.example` and setup/doctor use `ALPACA_SECRET_KEY`, and the gateway alias resolver accepts `ALPACA_SECRET_KEY`/`ALPACA_API_SECRET`, but the Alpaca market-data provider reads only `process.env.ALPACA_API_SECRET`. Direct probe with `ALPACA_API_KEY=test ALPACA_SECRET_KEY=test` fails before any network call: `Alpaca API credentials (ALPACA_API_KEY, ALPACA_API_SECRET) missing`. This can make trading setup look healthy while Alpaca data backfill fails. | Make `shared/lib/providers/alpaca.js` use `resolveAlpacaSettings()` or read both secret aliases; add a regression test that documented `.env.example` keys satisfy `fetchAlpacaBaseCandles` credential preflight. | OPEN |
| Medium | Incomplete | dependency parity | `backend/gateway/src/clob_factory.ts:115-117`, `backend/gateway/src/index.ts:1119`; `backend/gateway/package.json:2-8` | Gateway source directly calls `require('axios')` in two production paths, but `backend/gateway/package.json` does not declare `axios`. It resolves today only because transitive dependencies hoist/install axios (`@alpacahq/alpaca-trade-api` and `@polymarket/clob-client-v2` both depend on it). Direct imports should be declared by the package that imports them; otherwise a package manager layout change can break Polymarket collateral/Gamma calls. | Add `axios` as a direct `backend/gateway` dependency, or replace direct axios usage with `fetchWithRetry`/native `fetch` so the gateway no longer imports it. | OPEN |
| Low | Stale | API scaffold | `backend/api/server/middleware/error_handler.js:1`, `logger.js:1`, `rate_limiter.js:1`; `backend/api/server/services/cache.js:1`; `data_formatter.js:1`; `job_queue.js:1` | `backend/api/app.js` is a custom `http` server and implements its own security/rate-limit stack inline. These Express-style middleware modules are not imported by the active server. `data_formatter.js` and `job_queue.js` are only exercised by `backend/api/tests/charts.test.js`, not by production routes. This is stale scaffold/test-only code, not a runtime bug. | Either delete the dead scaffold and synthetic helper test, or wire the modules into the active server if they are intended to be canonical. | cleanup |

#### Verified-good connective tissue

- **Command strings:** current TUI command ids with spaces are intentional. `backend/cli/tui/dashboard_exec.js`
  splits command ids with `splitWords()`, so `auto-trade status`, `settings favorites`, and
  `trade favorites` map to real CLI subcommands rather than literal unknown commands.
- **Settings surface:** prior ledger notes saying Settings & Preferences had no handler are stale.
  `backend/cli/sovereign_cli.js` routes `settings` to `commandSettings()`, and
  `backend/cli/tui/manifest.js` maps all settings entries through `prefix: ['settings']`.
- **Dependency install state:** all package roots checked clean with `npm ls --depth=0`,
  `npm ls --prefix backend/api --depth=0`, `npm ls --prefix backend/gateway --depth=0`,
  `npm ls --prefix backend/mcp_server --depth=0`, and `npm ls --prefix Frontend/dashboard --depth=0`.
  The remaining dependency issue is declaration hygiene (`axios` direct import), not missing installed
  packages on this machine.
- **Polymarket shim lesson:** `shared/lib/polymarket_history.js` is a legacy shim with test consumers;
  this pass did not classify it dead. Use `<name>(\.js)?['"]` when checking these shims.

#### Section grades

| Section | Grade | Reason |
|---|---|---|
| `backend/scripts/data_ops/ingest_market_data` | C | Active ingest loop is real, but several enabled config families still terminate at provider no-op stubs. |
| `shared/lib/providers` | B- | Core providers are real, but Alpaca env alias drift can break the documented setup path for data fetches. |
| `backend/gateway` | B | Runtime dependency install is clean and TypeScript passed earlier, but direct `axios` import is undeclared in the gateway package. |
| `backend/api` | B | Active routes are coherent, but unused Express-style scaffold remains beside the custom HTTP server. |
| `backend/cli` / TUI | B+ | Command routing and Settings parity checked clean; no new command-string orphan found. |
| repo bootstrap / dependencies | A- | Ubuntu dependency install path is now documented and installed; declaration hygiene still has the gateway `axios` caveat. |

**Verification:** `npm run hygiene` passed; direct PMI stub probe returned `{}`; direct Alpaca
credential preflight with documented `ALPACA_SECRET_KEY` failed as described; all package-root `npm ls`
checks passed.

**Next cleanup move:** fix the Alpaca alias drift first because it is a small, high-confidence wiring
bug that can break a documented setup path. Then either implement/disable the enabled provider stubs
as a deliberate data-roadmap batch.

### Mass-Implement — 2026-07-05 session 64 (Ubuntu dependency repair)

Closed the concrete dependency/install findings from the Ubuntu migration audit. DCS 0.95->0.97.

- **[x] `start_local.sh` no longer depends on `npx tsx`.** The Linux launcher now starts the gateway
  through `node backend/cli/lib/run_trade_gateway.js --demo`, reusing the existing `ts-node`
  registration path already used by CLI gateway launches. This removes the hidden `tsx` dependency
  from the default local suite.
- **[x] Root runtime dependencies declared and installed.** Added `@alpacahq/alpaca-trade-api` and
  `ethers` to the root install path because live Alpaca and Polymarket wallet paths import them at
  runtime. `require.resolve('ethers')` and `require.resolve('@alpacahq/alpaca-trade-api')` now both
  resolve from root.
- **[x] Nested service dependencies installed.** `npm ls --prefix backend/gateway --depth=0`,
  `npm ls --prefix backend/mcp_server --depth=0`, and `npm ls --prefix Frontend/dashboard --depth=0`
  are now clean, removing the noisy `UNMET DEPENDENCY` errors seen after migration.
- **[x] README dependency section added.** `README.md` now documents all package roots:
  root, `backend/api`, `backend/gateway`, `backend/mcp_server`, and `Frontend/dashboard`, plus Ubuntu
  native packages for the optional C++ path.

**Verification:** root `npm ls --depth=0` clean; gateway `npm ls --prefix backend/gateway --depth=0`
clean; MCP `npm ls --prefix backend/mcp_server --depth=0` clean; frontend `npm ls --prefix
Frontend/dashboard --depth=0` clean; `npx tsc -p backend/gateway/tsconfig.json --noEmit` passed;
`npm --prefix backend/mcp_server run build` passed; `node backend/cli/lib/run_trade_gateway.js --demo`
ran successfully; `bash -n start_local.sh` passed; `timeout 8s ./start_local.sh` launched the local
suite and cleaned up on SIGTERM.

**Grade movement:** repo bootstrap B- -> A-. Remaining caveat: the API service can still fail to bind
`127.0.0.1:8787` inside restricted sandboxes; that is environment-specific and not counted as a repo
dependency issue.

### Blast-Through Deep Review — 2026-07-05 session 64 (Ubuntu migration check)

DCS 0.95→0.95. Scope: repo bootstrap / Linux launch path. I checked the active Ubuntu entrypoints
and launch scripts after the Windows→Linux migration, with a focus on `sv`, `start_local.sh`, and
the services they boot. `bash -n start_local.sh` passed. `./sv status` and `node
backend/cli/sovereign_cli.js status` both reached the same system status output, so the CLI wrapper
itself is fine. `timeout 10s ./start_local.sh` launched the three services and cleaned them up on
SIGTERM; the dashboard log hit `listen EPERM` in this sandbox, which is an environment restriction
here, not a repo bug.

| Priority | Area | File:line | Finding | Fix | Gate |
|---|---|---|---|---|---|
| Medium | repo bootstrap | `start_local.sh:19` | Linux bootstrap depends on `npx tsx`, but the repo does not declare `tsx` in the root `package.json` and does not ship a local `node_modules/.bin/tsx` (`npm ls tsx --depth=0` is empty; `node_modules/.bin/tsx` is absent). On a clean Ubuntu machine this script is therefore coupled to an external `npx` fetch/cache/global install instead of the repo’s own dependencies. That is brittle for a migrated local setup and can fail offline or on a fresh machine. | Add `tsx` to the repo’s install path the script actually uses, or switch the script to a locally declared binary path that exists after the documented install step. | OPEN |

**Verified-good:** `sv` is POSIX-safe (`#!/usr/bin/env bash`, `node --no-deprecation "$(dirname "$0")/backend/cli/sovereign_cli.js"`). `start_local.sh` has a valid shell syntax check and graceful shutdown trap. The `backend/api` service still uses the repo-local `dotenv` dependency from its own package manifest.

**Section grades:** `repo bootstrap` B- (one hidden bootstrap dependency), `backend/api` B+ (no new code-path issue found in this pass), `backend/cli` B+ (wrapper path fine; no additional Linux regression found).

**Next cleanup move:** remove the hidden `npx tsx` dependency from `start_local.sh` so the Linux bootstrap is reproducible from the repo install alone.

### Focused Blast-Through — 2026-06-26 session 62 (anchor `5e60babb`→`4ac77e8a`, review-only)

DCS 0.96→0.96. Scope: Tier 1 = 9 commits since the last anchor (sessions 60–61). No gated sections
(all ≥ B+). Tier 2 hotspot check on `sovereign_dashboard.mjs`, `manifest.js`, `data.js`, `trade.js`.
Suite **652/650/0fail/2skip** (confirmed live run this session).

| Priority | Area | File:line | Finding | Fix | Gate |
|---|---|---|---|---|---|
| Low | `shared/lib/ml/models.js` | `models.js:386-389` | `resolveModel()` falls back **silently** to `modelCandidates[0]` (cnn_window_v0) for any unknown model name. A typo in a strategy YAML `model:` field silently produces results labeled with the wrong model. | Add a `console.warn` on unknown-name fallback, or throw. | OPEN |
| Low | `backend/cli/commands/research/bias.js` | `bias.js:201` | `stdio: isJson ? 'ignore' : 'ignore'` — dead ternary, always `'ignore'`. Intent was presumably `'inherit'` or `'pipe'` when not JSON, so the backfill spinner line above it has context but the daemon output is always suppressed. | Change non-JSON branch to `'inherit'` or remove the ternary. | OPEN |
| Low | `backend/cli/commands/research/bias.js` | `bias.js:158–186` | ANSI padding arithmetic uses `+9` (5 bytes for GREEN/RED/YELLOW + 4 for RESET). DIM is `\x1b[90m` = **6 bytes**, not 5. The `n/a` cells (rendered with DIM) get `padEnd` one char wider than the colored cells, making those columns 1 visible char too narrow. Cosmetic misalignment in Regime, Entropy, and vs-SMA20 columns when data is missing. | Change `const DIM_OVERHEAD = 10; const COLOR_OVERHEAD = 9;` and pass the appropriate one per value. | OPEN |
| Info | `backend/cli/commands/data/backfill_daemon.js` | `backfill_daemon.js:392-393` + `417-418` | Two separate `process.once('SIGINT')` handlers registered: the first calls `process.exit(130)` before the second (`liveFeed.stop()`) can run. WebSocket is left open at OS level until process terminates. Functionally harmless (OS cleans up), but `liveFeed.stop()` is dead code on the shutdown path. | Call `if (liveFeed) liveFeed.stop()` inside `clearStatusOnExit()` before `process.exit()` — then the second `once` handlers can be removed. | OPEN |
| Info | `shared/lib/ml/onnx_runner.js` | `onnx_runner.js:62-74` + `88-95` | `onnxruntime-node` is `require()`'d inside both `predict()` and `getSession()`. After `predict` passes its own early-exit check, `getSession` calls `require` again (cached, no overhead). The `try/catch` in `getSession` for missing-module is dead once `predict`'s check passed. | Pull `ort` as a module-level lazy singleton; avoids the double-require pattern. | OPEN (cosmetic) |

**No gating findings. All sections OPEN.**

#### Hygiene Sweep

- **`shared/lib/models.js`** — 1-line shim (`module.exports = require('./ml/models')`). Zero production callers use this path; all 6 call sites use `shared/lib/ml/models.js` directly. Migration is complete — shim can be deleted. Keeping it is harmless, deleting removes noise from the duplicate-basename list.
- **Duplicate basenames** — `models.js` is the only new pair introduced since s59. Audit confirmed it's shim-only (no divergent fork). All other named pairs from prior sessions unchanged.
- **`[DEBUG]` console.log calls in `research_sources.js:223,231,236,242`** — all gated behind `hasFlag(args, '--debug')`. Not leaked debug logs.
- **Test suite confirmed green**: 652/650/0fail/2skip (live run this session). Baseline matches s61 handoff.

#### Centralization Backlog

No new patterns found. The duplicate `models.js` pair (shim + canonical) remains the single migration-complete entry from prior sessions.

#### Grade Trend Report

| Directory | Last Grade | This Grade | Trend |
|---|---|---|---|
| `shared/lib/ml/` | (new s60-61) | **B** | — first formal stamp |
| `backend/cli/commands/research/` | (new s60-61) | **B** | — first formal stamp |
| `shared/lib/providers/` | (unchecked) | **B** | — first formal stamp |
| `backend/cli` (other) | B+ (s59 cached) | B+ | = stable |
| `shared/lib/market` | A (s55 cached) | A | = stable |
| `shared/lib/runtime` | A (s59 cached) | A | = stable |
| `backend/api` | B+ (s53 cached) | B+ | = stable |
| `backend/gateway` | B+ (s58 cached) | B+ | = stable |
| `backend/core` (C++) | B (s58 cached) | B | = stable |

No section has been D or F for 2+ audits. No stale-debt escalations.

---

### Mass-Implement — 2026-06-25 session 59 (3 batches, all findings from the audit below FIXED)

Suite **623/621/0fail/2skip** (was 616/614 — +7 new tests: 4 on `buildExitOutcome`, 3 on
`backend_bridge`), zero regressions; `npm run hygiene` clean. Nothing committed yet — pending
user go-ahead.

- **[x] Batch 1 (Medium) — exit-clamp bookkeeping fix.** `shared/lib/runtime/alpaca_bot_cycle.js`:
  new pure `buildExitOutcome(position, exitReason, currentPrice, sellQty, cycleId, isLive)` helper
  (same pattern as `decideExit`/`resolveExitQty` — "trivially unit-testable" by design). Computes
  `realizedPnl` from the actually-sold qty instead of the pre-clamp `position.qty`, and returns the
  unsold remainder as a still-open position (`{...position, qty: remainingQty}`) instead of silently
  dropping it. Also hoisted the `sellQty<=0` "drop stale tracking" check out of the `isLive`-only
  branch so dry-run gets the same correctness (a paper-account 0-balance is just as stale as a live
  one). 4 new tests in `tests/scripts/lib/alpaca_bot_cycle.test.js`: full-exit regression (P&L
  unchanged from before), the partial-clamp fix (P&L on sold qty only, remainder qty=4 stays tracked),
  `dryRun` flag mirrors `isLive`, defensive over-clamp. **verification + completeness lenses, shared/lib/runtime B→A.**
- **[x] Batch 2 (Low, defense-in-depth) — PIN strip centralized.** Moved `stripFlagValue` from
  `backend/cli/lib/utils.js` into `shared/lib/runtime/backend_bridge.js` (correct dependency
  direction — cli already depends on shared, not the reverse) and made `buildTradeGatewayLaunch`
  strip `--pin` unconditionally at its single chokepoint, covering all 8 current callers instead of
  just `commandTrade`. `utils.js` now re-exports the canonical implementation (its one existing
  caller and the existing `strip_flag_value.test.js` import path are unchanged). New
  `tests/scripts/lib/backend_bridge.test.js` (3 tests): `--pin`+value never reach the spawned argv,
  no-pin args pass through untouched, `utils.js`'s export is the same reference (not a duplicate).
  **duplication/drift lens, backend/cli stays B+.**
- **[x] Batch 3 (Low, doc alignment) — 5 stale dev-review comments deleted/corrected.**
  `sovereign_dashboard.mjs` lines 89 (`cockpit`), 259 (`polymarket markets`), 276
  (`polymarket derive-creds`) — removed stale "crashes" markers (the session-54 SIGINT fix is
  confirmed still in place). Line 177 (`backend chart`) — corrected the "STILL TODO: volume/SMA"
  claim; both shipped session 55 and are visibly wired two lines below. Line 342 (`login`) — kept
  the still-legitimate "session persistence" feature request, dropped only the stale "crashes"
  clause. Comment-only changes, no behavior change. **doc-alignment lens.**
- **Deliberately NOT touched (out of this batch's named scope):** `sovereign_dashboard.mjs:171`
  ("is this redundant? dev question" on `backend universe`) and lines 260/267 ("doesn't work, dev
  review" on `polymarket history`/`polymarket backtest`) — plausibly also stale (the backtest
  null-path crash was fixed sessions 54/55) but weren't in the audited 5-item list and weren't
  re-verified this pass; left for a future cleanup pass that actually checks them.

---

### Focused Blast-Through — 2026-06-25 session 59 (anchor `1c7227b7`→`5e60babb`, review-only)

DCS 0.97→0.96. Scope per the Recency-Ranked Audit Queue: Tier 1 = the 3 commits made since the last
audit anchor (`cf4f7026`, `13bc91f0`, `5e60babb` — the session-58 review-fix pass + trade-section UX
fix), none of which had been audited yet (the ledger's "done (session 58)" stamp predates 2 of the 3).
No section is currently gated (C or below), so no Tier-3 carryover was mandatory. Nothing fixed this
pass — review-only, per the skill's default mode.

| Priority | Area | File:line | Finding | Fix | Gate |
|---|---|---|---|---|---|
| Medium | `shared/lib/runtime` | `alpaca_bot_cycle.js:144-184` (`runAlpacaExitCheck`, commit `cf4f7026`, 2026-06-23) | The Finding-4 oversell clamp (`resolveExitQty`) correctly stops a broker-level oversell when two tracked positions share one symbol and the broker holding is undersized, **but the bookkeeping after a clamped sell is wrong**: `realizedPnl` is computed from the full `position.qty` (line 172) instead of the actually-sold `sellQty`, and the position is unconditionally dropped from `state.positions` (never re-pushed to `remaining`) even when only part of it was sold — the unsold remainder becomes permanently untracked (no further stop/target/age protection, invisible to `auto-trade status`). `runAlpacaExitCheck` has **zero test coverage**; `alpaca_bot_cycle.test.js`'s 11 new tests only exercise the pure `resolveExitQty`/`canOpenPosition`/`resolveEntryQty` math in isolation, never this integration path. Verified empirically: traced every `--pin`-adjacent write/read in the file and confirmed the clamp branch (`sellQty < position.qty`, available > 0) is reachable and untested. | Track the unsold remainder: `if (sellQty < position.qty) remaining.push({...position, qty: position.qty - sellQty})` before/instead of dropping it, and compute `realizedPnl` from `sellQty`, not `position.qty`. Add an integration test that mocks a broker holding smaller than the combined tracked qty across two positions on one symbol. | OPEN |
| Low (informational, **no active leak found**) | `backend/cli`, `shared/lib/runtime` | `backend_bridge.js:68` (`buildTradeGatewayLaunch`) has 8 call sites; only `trade.js:329` (`commandTrade`) strips `--pin` before spawn (the `cf4f7026` fix). Exhaustively traced all 3 places `--pin` is ever written into an args array (`strategy.js:905`, `alpaca_bot_cycle.js:157`, both Alpaca bot paths) and confirmed both terminate at the now-fixed `commandTrade` call — **today, nothing leaks.** But `commandBot` (`trade.js:509`) and `commandPolymarket`'s generic passthrough (`trade_polymarket.js:741-744`) build `gatewayArgs` from raw `args.slice(1)` with no strip; either would silently reopen the exact session-58 PIN-argv-leak finding the moment any future caller forwards `--pin` to them. The fix lives at one caller instead of the shared chokepoint every caller already goes through. | Move `stripFlagValue(args, '--pin')` inside `buildTradeGatewayLaunch` itself so all 8 current (and any future) callers get it for free, instead of relying on each call site to remember. | OPEN (defense-in-depth, not gating) |
| Low | `backend/cli` (doc alignment) | `sovereign_dashboard.mjs:177` | Inline manifest comment on the `backend chart` entry claims SMA overlay + volume subplot are "STILL TODO (deferred)" — both shipped in session 55 (`79d2129f`/`2d17aa26`); the `--sma`/`--volume` flags are present and wired two lines below the comment that says they aren't. | Delete or correct the stale clause; the candlestick/SMA/volume upgrade is fully done. | trivial cleanup |
| Low | `backend/cli` (doc alignment) | `sovereign_dashboard.mjs:89,259,276,342` | Inline "crashes / dev review" comments on `cockpit`, `polymarket markets`, `polymarket derive-creds`, `login` predate the session-54 shared-root-cause SIGINT fix (verified still in place: `runExternal`'s `sigintGuard`, lines 1342-1394) — all four were fixed but the comments were never updated, so they still read as open bugs. `login`'s comment also bundles a still-legitimate, separate feature request ("session persistence") that genuinely is still open — only the "crashes" clause is stale. | Trim the stale "crashes" clauses; keep the still-open feature-request text (e.g. login session persistence). | trivial cleanup |

**Verified-good (no findings):** `canOpenPosition`'s wiring in `strategy.js:890,911` (sequential single-pass
loop, `openPositionCount++` only after a confirmed `tradeExitCode===0` buy — no race, no double-count);
`commandStrategyMenu`'s non-interactive `list` fallback (`strategy.js:1222-1229`); the dashboard's new
`positions` entry (index 5, `auto-trade` stays index 4 — nav test's pinned index holds) and its `--live`
flag wiring (`sovereign_dashboard.mjs:240-244`); `isInteractiveCmd`'s prefix match against
`INTERACTIVE_CMDS` has no accidental over-match (checked every dashboard command id sharing a prefix with
`alpaca`/`mt5`/`login`/`register`/`cockpit` — each set entry maps to exactly one menu command). Hygiene
sweep: duplicate-basename pass run; the only Tier-1-relevant duplicate (`utils.js`) resolves to
`backend/cli/lib/utils.js` (canonical, the one touched) vs `docs/archive/legacy_ui/js/utils.js` (archived,
different domain) — not a real duplication.

**Next debt-clearing move:** the `runAlpacaExitCheck` partial-clamp accounting fix (Medium finding above)
is the highest-value next move — it's a live-money bookkeeping gap on the exact function the last two
sessions were hardening for oversell safety, with no test coverage to catch a regression. The PIN
centralization and the two stale-comment cleanups are cheap (<30 min combined) and can ride along.

---

### Mass-Implement (pass 2) — 2026-06-22 session 55 (carryovers + remaining debt)

Second mass-implement pass same session — cleared the remaining debt item AND all four open
carryovers. Suite **594/592/0fail/2skip**; hygiene clean; gateway tsc exit 0. Commits `4f65c7aa`
(gateway), `79d2129f` + `2d17aa26` (chart), `77cd31a7` (typing lag).

- **[x] Gateway `processProposedOrders` failure reporting** (`backend/gateway/src/index.ts:757-801`):
  the batch loop now inspects `order.status` after each `execute()`, logs each failure, sets
  `process.exitCode = 1`, and prints a success/failure summary — mirroring the buy/sell CLI path's
  post-execute check. Closes the dormant "per-order failure silently swallowed" debt. error-handling lens.
- **[x] Chart upgrade — ALL 3 parts (carryover #1)**: new `renderCandlestickChart()`
  (`backend/cli/tui/visualizations.js`) draws OHLC body+wick (green/red by close-vs-open), an optional
  yellow **SMA(N) overlay**, and an optional **volume histogram subplot** — same width-clamp/axis/summary
  scaffold as `renderPriceChart`. Flags `--style candle`, `--sma <N>`, `--volume` wired through
  `backend_chart.js` + the dashboard manifest (`--style` default `line` = non-breaking; `--sma`/`--volume`
  default off so they don't perturb default `buildArgv`). 11 render tests + 2 contract-assertion updates +
  dashboard nav-row count bump.
- **[x] Typing-lag fix (carryover #2)**: root-caused to Ink 7's writer
  (`node_modules/ink/build/ink.js:100`) doing a **full terminal clear+redraw every frame** when
  `win32 && fullscreen` (rendered height ≥ viewport rows). The root Box forced `height:
  process.stdout.rows` (exactly fullscreen). Fixed by capping to `rows-1` so Ink uses its incremental
  line-diff `log-update` path; height stays `undefined` when rows is unknown (test harness unchanged).
  **Verified by Ink-source analysis + fake-TTY harness; real-conhost confirmation is the user's (no
  conhost in CI) — folded into the real-terminal carryover below.**
- **[x] graphify-out refresh (carryover #4)**: AST-only structural refresh (no LLM cost) merged into
  the existing graph — 11,015→11,542 nodes, 958 communities, `GRAPH_REPORT.md`+`graph.json` regenerated
  (gitignored, not committed). Did NOT run full semantic extraction: the 297 "doc" changes were dominated
  by noise (`.graphify_*` temp, `.venv_ml/`, `.antigravitycli/`, `settings.json`) — recommend tightening
  `.graphifyignore` before any full semantic rebuild.
- **[ ] Real-terminal confirmation (carryover #3) — STILL THE USER'S**: `bt --strategy` picker,
  `backend visualize` force-ingest fallback, AND now the typing-lag fix all need a live conhost/terminal
  check that can't run in CI. Their dev-review comments remain in place pending that.
- **DOC CORRECTION — two backlog rows below are STALE (already fixed in prior sessions, not by me):**
  (1) the **P1 "research/ingest C" Kalshi** row — `manifests.js:59-60` already return `{records:[]}`/`[]`
  (correct shapes, no crash); (2) the **P2 "ingest/TUI C" unconfigured families** row —
  `manifest.js:155-157` already removed pmi/breadth/onchain/flight/crypto_tx/holdings from the
  `--family` dropdown. Neither section is actually C anymore; treat those two rows as resolved.

---

### Mass-Implement — 2026-06-22 session 55 (closeout, anchor 0903df6b)

Cleared three backlog debts from the audit below. Suite **583/581/0fail/2skip** (= 580 baseline + 3
new tests); `npm run hygiene` clean; gateway `tsc --noEmit` exit 0.

- **[x] Batch A — `renameWithRetry` busy-wait → real sleep + first-ever tests** (`shared/lib/market/validation.js:611`).
  Swapped the `while (Date.now()-start < delayMs) {}` CPU spin for
  `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs)` (true OS-level sleep, no
  event-loop block, no dependency). Exported the function; added `tests/scripts/lib/rename_with_retry.test.js`
  (3 tests: transient-EPERM-then-success, real-sleep lower-bound proving it's not a no-op, rethrow
  after exhausting retries). **verification lens B→A on shared/lib/market.**
- **[x] Batch B — deleted 3 of 4 dead root shims.** `shared/lib/{backfill,ingestion,market_validation}.js`
  removed (re-verified 0 consumers with a `.js`-aware grep + import/alias sweep). `polymarket_history.js`
  was **wrongly flagged dead in the audit below and is KEPT** — see the corrected P3 row. **artifact-hygiene lens.**
- **[x] Batch C — gateway raw `fetch` → `fetchWithRetry`** (`backend/gateway/src/cycle.ts:69,123`,
  `backend/gateway/src/market.ts:17` + new import). Completes the 2026-06-12 fetch-retry rollout the
  gateway was ~90% through. `tsc --noEmit -p backend/gateway/tsconfig.json` exit 0. **duplication/drift lens.**

**Process lesson (durable):** the Hygiene Sweep's dead-module grep anchor must be `<name>(\.js)?['\"]`,
not `<name>['\"]` — the bare form silently misses every `require('.../<name>.js')` with an explicit
extension and produces a false "0 consumers" (this exact class caused the session-29 false negative too).

---

### Focused Audit — 2026-06-22 session 55 (anchor 03b3c8d5 → 0903df6b, session-54 TUI/chat surface)

DCS start ≈0.95 (carried from session 54) → end ≈0.99. No crash/data-loss/security findings. The
two new files and four modified production files from session 54's two code commits all traced clean
on full-diff review; the headline risk (an LLM-assisted command resolver) is sound by construction.

**Scope:** Focused. Tier 1 = `95a9c547` + `a0a5cda5` production files (8). Tier 3 (gated carryover) =
none (`backend/api/*` ungated session 53). In-scope sections: `backend/cli/tui`, `backend/cli/commands/{data,tools}`, `shared/lib/market`.

**Security — chat LLM fallback verified safe by code-trace, not assertion.** The new
`chat_llm_fallback.js` resolves free text into a runnable command via the local Ollama client. Traced
the full execution chain: `resolveWithLLM` → manifest validation (`command_id` must exist; every flag
key must be a real flag, unknown keys dropped) → `flagValues` → `buildArgv` (`dashboard_exec.js:73`,
`argv.push(key, str)` — array elements, never a concatenated string) → `spawn(process.execPath,
[sovereign_cli.js, ...argv])` (`sovereign_dashboard.mjs:410/455/1222` — **no `shell:true` anywhere**).
A malicious LLM-produced value therefore lands as a single inert argv element; there is no shell
interpolation seam. Plus the caller enforces a mandatory confirm gate before any chat-resolved run.
**No injection. No eval/dynamic-require.** Security lens: A.

| Priority | Area | File:line | Finding | Fix | Gate |
|---|---|---|---|---|---|
| P3 | shared/lib | `shared/lib/polymarket_history.js` (1-line root shim) | ~~4-layer dead-check all return 0 consumers~~ **CORRECTED (session 55 mass-implement): NOT dead.** The dead-check grep anchor `polymarket_history['\"]` missed `require('.../shared/lib/polymarket_history.js')` — the **`.js` extension** sits between the basename and the closing quote, so the regex never matched. `tests/scripts/strategy/polymarket_backtest.test.js` requires this shim with the extension. Deleting it broke that test; restored via recovery rule. The 3 session-52 shims (`backfill/ingestion/market_validation`) re-verified with a `.js`-aware grep + import/alias sweep = genuinely 0 consumers, and were deleted. | KEEP `polymarket_history.js` (load-bearing). Lesson: dead-check grep must use `<name>(\.js)?['\"]`. | shared/lib B (unchanged) |

**Verified (live evidence, not reading alone):** `node --test chat_parser.test.js chat_ui.test.js`
→ **22/22 pass** (incl. the mid-word false-positive guard, the mandatory LLM-confirm gate, the
`--live` PIN gate from a chat-resolved command, and safe-degrade when Ollama is unavailable). Full
suite unchanged from session-54 HEAD (580/578/0fail/2skip — no code changed since). Diffs of all 4
modified files match their handoff claims exactly: `data.js` TTY-guards + chart mode, `backend_visualize.js`
bounded single-retry force-ingest, `visualizations.js` width clamp (`terminalCols - 12`), `polymarket_history.js`
`root = root || CACHE_DIR` null-guard mirroring the existing `loadArchivedMarketIndex` pattern.

**Carryover debts (unchanged, none gating):** `renameWithRetry` busy-wait + zero coverage
(`shared/lib/market/validation.js:601`, P2); 3 (now 4, incl. above) dead root shims; gateway's 3
raw-`fetch` sites lacking the imported retry helper. None block new work.

---

### Blast-Through Deep Audit — 2026-06-21 session 52 (anchor d21e25ce → 3da6e612, recent code + data pipeline)

DCS start ≈0.96 (carried from session 50/51 close) → end ≈0.96 (no crash/data-loss findings; two
contained, non-blocking debts surfaced below — neither moves the mechanical formula, which stays
clean: `backend integrity --json` reports `total_missing:0`, `total_stale:0`, `total_exceptions:0`
across all 92 configured cache entries).

**Tier 1 — commits since the last anchor (`git log d21e25ce..HEAD`), data-pipeline-relevant ones
reviewed line-by-line (diff read in full, not just the commit message):**

| Priority | Area | File:line | Finding | Fix | Gate |
|---|---|---|---|---|---|
| — | runtime | `3da6e612` (this session) `shared/lib/runtime/backend_bridge.js:53` | `merged.ok` now unconditionally derives from `(status===0) && (payload.ok!==false)` instead of trusting a payload that already had `ok:true` before a non-zero exit. Already committed this session after a passing 553/553 suite run. | done | runtime A |
| P2 | data/market | `0eda90fa` (2026-06-20) `shared/lib/market/validation.js:601` (`renameWithRetry`) | Retry delay is a **synchronous busy-wait spin loop** (`const start = Date.now(); while (Date.now()-start < delayMs) {}`) instead of `Atomics.wait`/an async backoff — pegs one CPU core and blocks the Node event loop for up to ~250ms (5 retries × 50ms default) per contended rename. Sits on the hot path for every `writeJson` and every `mergeWriteBin` call (i.e. every ts-index bin write and every JSON cache write in the whole pipeline) and has **zero test coverage** (`grep -rn renameWithRetry tests/` → no hits) despite replacing a bare `fs.renameSync` that 3 separate prior sessions (25/34/36) documented as a real cross-process EPERM crash risk. Not data-corrupting — it's strictly better than the prior hard crash — but the busy-wait is the wrong sync-sleep primitive in Node and the new retry path is unverified. | Swap the spin loop for `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs)` (true OS-level blocking sleep, no CPU spin, no new dependency); add a unit test that forces one `EPERM`/`EBUSY` rename failure (mock `fs.renameSync` to throw once) and asserts the retry succeeds and the total wall-clock matches the backoff schedule. | data/market B — contained debt, not gating |
| P4 | data/market | `0eda90fa`/historical, `shared/lib/market/coverage.js` `isGrainSuspect` guard | Live `backend integrity --json` flags 3 `grain_suspect` entries, all `CPER` (5m/15m/4h, ~7.2 bars/day over a 2150-day span vs. the calibrated floor). Directly probed via `readTsIndex` (not assumed): bar spacing inside the bin is genuinely 5-minute where present (gap=5min runs exist), interleaved with real multi-day gaps — **not** the daily-mislabeled-as-intraday corruption shape fixed in session 35 (CORN etc.), and CPER's same 2150-day span as the healthy GLD/SLV/USO/UNG peers (37-48 bars/day) rules out "thin recent Yahoo accumulate window" too. Most likely explanation: CPER is a genuinely low-liquidity ETF among the 8 commodity-ETF proxies — Alpaca's SIP feed only emits a bar when a trade occurs, so a thin name legitimately produces far fewer 5m bars than GLD/SLV. | No fix needed — the guard is doing its job (flagging a real density anomaly); just don't mistake it for corruption. If it recurs across more symbols, recalibrate `isGrainSuspect`'s per-TF floor to account for genuinely thin-liquidity names rather than raising the floor (would mask real corruption elsewhere). | informational only |
| P4 | hygiene | `824d038e` (2026-06-20) | Path-consolidation commit is correct and complete (verified: zero live `REPO_ROOT,'data'` callers remain outside `docs/archive/sovereign_cli.og.js`), but left the pre-migration files behind: untracked, gitignored `data/cache/` and `data/models/latest_indicator_optimization.json` (stale, dated 2026-06-19, superseded by the now-active `storage/data/models/latest_indicator_optimization.json` dated 2026-06-21). Dead, harmless, zero git impact. | `rm -rf data/cache data/models/latest_indicator_optimization.json` locally whenever convenient — no urgency. | hygiene — trivial |
| — | docs | `852130f8`/`85fea62f`/`d663d838`/`5ed03ced` (agy-schedule auto-doc sweep) | All 4 are pure-insertion JSDoc comment blocks on `backend_correlation.js`/`backend_visualize.js`/`backend_integrity.js`/`backend.js` — confirmed via `git show <sha> | grep -vE comment-prefixes` that every added line is a comment token, zero executable-line changes. | none needed | clean |
| — | data | `e5e21ef1` (2026-06-20) gap-aware `fetchPaginated` + per-family incremental flush in `commandMassBackfill` | Traced the full logic by hand: `effectiveStartTs` narrowing is try/catch-guarded and falls back to the full window on any coverage-probe error; the per-family flush-on-last-job-of-family is synchronous (no `await` between the decrement and the `flushFamily` call), so it can't race against another concurrently-completing job for the same family; the end-of-run catch-all only re-flushes families whose map entries were never deleted, so a double-flush is structurally impossible. No bug found. | none needed | clean, well-tested (121+170 new test lines) |
| — | data | `5d9d2e23` (2026-06-20) `commandStopBackfillDaemon` | Liveness-probes the pid (`process.kill(pid,0)`) before sending the real `SIGTERM`, handles 4 distinct failure modes explicitly (no status file / malformed status / not running / kill failed), and writes the `stopped` marker itself with a clearly-commented rationale for the documented Windows hard-kill-vs-graceful-handler gap. No bug found. | none needed | clean |

**Tier 2 — hygiene/security/stub sweep (delegated to a sub-agent, then independently re-verified by
the lead auditor for the one claim with real consequences — see below — per the skill's
empirical-claim rule):**

| Priority | Area | File:line | Finding | Fix | Gate |
|---|---|---|---|---|---|
| P3 | hygiene | `shared/lib/{backfill,ingestion,market_validation}.js` (1-line root shims) | All 3 confirmed **dead across all 4 resolution layers** — re-verified personally (not just trusting the sub-agent's grep) given this exact shim layer was the site of a real false-negative 2026-06-13 (session 29: "shim trap" — literal-grep wrongly called load-bearing shims dead and broke the build). Independently checked: (a) no literal `require()` hits outside the shims' own bodies and `docs/archive/`; (b) no sibling-relative requires anywhere under `shared/lib/`; (c) `package.json`'s `#shared/*` imports alias has zero call sites using `#shared/backfill`, `#shared/ingestion`, or `#shared/market_validation`; (d) the project's own `./dist/mcp_server/*` compiled output only contains the unrelated string `"backfill"` as an MCP tool/CLI-argument name, never a `require()` of these paths. Also: `shared/lib/compat/adapters.js`'s comment claims canonical backfill logic "lives in `shared/lib/backfill.js`" but its own `require` already bypasses that shim straight to `../data/backfill` — the comment is stale. | Safe to delete the 3 shim files; fix the stale comment in `adapters.js`. Re-run the full suite after deletion per the skill's recovery rule. | hygiene — verified safe, not gating |
| P3 | hygiene | `backend/cli/commands/data/backfill_daemon.js` (`makeRealExecutor`, `ALL_FAMILIES`, `INCREMENTAL_DAYS`, `LANE_CONCURRENCY`, `LANE_MAX_CONCURRENCY`, `FAMILY_LANE`), `data_rollup.js` (`removeDerivedBin`), `data.js` (`inspectMassBackfillJob`), `ingestion.js` (`runIngestBatch`), `validation.js` (`isValidTimestamp`) | 10 more exports came back 0-importer on a literal/sibling/alias/dist sweep, but **not independently re-verified by the lead auditor** (lower stakes than the root-shim claim, and the sub-agent itself flagged these as needing a second pass before action). | Do not delete without a dedicated follow-up pass; several of these read like deliberately-exported test seams or CLI-debug surfaces, not confirmed dead. | follow-up backlog, not gated |
| — | security/stubs | the 8 core data-pipeline files (`backfill.js`, `ingestion.js`, `validation.js`, `coverage.js`, `data.js`, `data_deep_backfill.js`, `data_rollup.js`, `backfill_daemon.js`) | No `eval`/`new Function`/non-literal `require`/`exec`/hardcoded-secret/token-logging hits; no `TODO`/`FIXME`/`not implemented` markers; the 4 bare `return null` hits found are all legitimate guard returns (provider-no-match fallthrough, JSON-parse-error swallow ×2, ineligible-symbol negative result), none are silent stubs on a reachable path. | none needed | clean |
| — | coverage gap, disclosed | `backend/scripts/data_ops/ingest_market_data/{index.js,manifests.js,snapshot_fetchers.js,providers/*}` | **Not re-scanned this pass** — no Tier 1 commit touched this directory, so per the Focused-Audit scope rule it carries forward its last graded status (B, session 41 FW2 audit) rather than being re-swept. Flagging explicitly rather than silently implying full coverage. | re-scan if/when a future commit touches this directory | ingest_market_data B (cached) |

**Section grades (lens-scored, trend vs. last recorded):**

| Section | Grade | Trend | Notes |
|---|---|---|---|
| `shared/lib/data/*` (backfill.js, ingestion.js, db_pruning.js, crypto_aggregates.js, macro_store.js) | A- | → (was clean) | gap-aware fetch well-tested; only debt is the dead-shim cosmetic note above |
| `shared/lib/market/{validation,coverage}.js` | B | ↓ slight (was A on this lens) | renameWithRetry busy-wait + zero test coverage is the one real contained debt this pass |
| `backend/cli/commands/data/*` (data.js, data_rollup.js, data_deep_backfill.js, backfill_daemon.js) | A- | → | incremental-flush + stop-daemon both clean; `data.js` (1,132 LOC) remains a size hotspot but not new debt |
| `backend/scripts/data_ops/ingest_market_data/*` | B (cached) | → | not re-scanned this pass (no Tier 1 commits touched it); residual 1,342-LOC `index.js` is the accepted post-FW2 baseline, not new debt |

**LOC breakdown, data pipeline (`wc -l`, 2026-06-21):** `ingest_market_data/index.js` 1,342 ·
`data.js` 1,132 · `validation.js` 995 · `backend_visualize`-adjacent n/a · `data_accumulate.js` 549 ·
`snapshot_fetchers.js` 519 · `backfill_daemon.js` 526 · `data_deep_backfill.js` 428 ·
`data_rollup.js` 326 · `constants.js` 271 · `coverage.js` 204 · `manifests.js` 200 ·
`backfill.js` 237 · `macro_store.js` 151 · `crypto_aggregates.js` 108 · `db_pruning.js` 99 ·
`candle_utils.js` 52 · `ingestion.js` 55 · `intraday_yahoo.js` 33 · `index.js` (shared/lib/data) 4 ·
**total 7,231 LOC** across the data pipeline's production files (test/docs excluded).

##### Centralization Backlog (additions)

| Pattern | Files (count) | Proposed unit | Effort | Grade impact |
|---|---|---|---|---|
| Root-shim retirement is further along than the architecture map assumes | `shared/lib/{backfill,ingestion,market_validation}.js` confirmed dead this pass; ~29 other root shims under `shared/lib/*.js` were never re-checked since the original migration (session 29) | A dedicated dead-shim sweep across all ~32 flat `shared/lib/*.js` files, 4-layer-verified each, not just these 3 | M | hygiene — opportunistic, not urgent |
| Synchronous-sleep-via-busy-wait | `renameWithRetry` (1 file, but called from 4 sites on the hottest write path in the data layer) | Swap to `Atomics.wait` | S | data/market B→A |

**Verification gate to clear:** none of this pass's findings are gating — Gate Table below is
all-OPEN. The two real items (busy-wait sleep, dead-shim cleanup) are debt-clearing opportunities,
not blockers.

**Gate Table (2026-06-21 session 52):**
```
Section                                          Grade   Status
────────────────────────────────────────────────  ─────   ──────────────────────────────
shared/lib/data/*                                  A-     OPEN
shared/lib/market/{validation,coverage}.js          B     OPEN (renameWithRetry debt, contained)
backend/cli/commands/data/*                         A-     OPEN
backend/scripts/data_ops/ingest_market_data/*       B     OPEN (cached, not re-scanned)
shared/lib/runtime/backend_bridge.js                A     OPEN (this session's fix verified)
dashboard/CLI interactive surface                   A     OPEN (session 50/51 fixes verified live)
```

**Verified this session:** full suite **555 tests / 553 pass / 0 fail / 2 skip** (run before
committing session 51's batch); `backend integrity --json` live run (92/92 cached, 0 missing, 0
stale, 0 exceptions, 3 grain_suspect — all explained); direct `readTsIndex` probes on CPER across
5m/15m/4h/1d; direct 4-layer re-verification of the 3 dead-shim claims; full diff read (not just
commit messages) for `e5e21ef1`, `824d038e`, `5d9d2e23`, `0eda90fa`, plus the 4 auto-doc commits.

---

### Blast-Through Deep Audit — 2026-06-21 session 52, continued (backend/api + backend/gateway)

User asked "any more bugs in other sections?" after the data-pipeline pass above. Extended the
Recency-Ranked Audit Queue to the two sections that hadn't been touched in ~10 sessions and carry
the highest blast radius if wrong (exposed web port; real broker money movement): `backend/api/`
(last real fix `37d2d6d2`, 2026-06-12) and `backend/gateway/src/` (last real fix `6875f1fa`,
2026-06-12). Delegated both to sub-agents in parallel, then personally re-verified the one finding
with real consequences (the path-traversal claim below) by reading the route file and the auth
gate myself rather than trusting the report — confirmed accurate.

| Priority | Area | File:line | Finding | Fix | Gate |
|---|---|---|---|---|---|
| P2 | api/security | `backend/api/server/routes/market/sigma_band.js:46,48` (`computeSigmaBand`/`readJsonSafe`) | `query.input` (an HTTP query string param) flows unsanitized straight into `fs.readFileSync(filePath)` — no `path.resolve`+prefix containment check like the one `app.js:193-200` already uses for static files. **Personally verified**: `/api/sigma-band` is absent from both `isPublicRoute` (app.js:115-128) and `PROTECTED_GET_ROUTES` (app.js:54-60), and `checkSecurity`'s gate (`app.js:129`) only requires a token for non-GET requests or GETs explicitly in `PROTECTED_GET_ROUTES` — so this is reachable over the network with **zero authentication**. Actual blast radius is narrower than a typical arbitrary-file-read: the file is always `JSON.parse`'d first inside a try/catch that collapses every failure (missing file, permission denied, not valid JSON) into one identical `{ok:false,error:'snapshot_not_found'}` response — so raw file contents are never echoed back, and the only data that ever surfaces is specific numeric/string fields (`close`, `timestamp`) from records that already match a `{symbol,timeframe,close,timestamp}` shape inside a `sources`/`records`/`bars`/`data` array. Still a real, unauthenticated file-existence-and-JSON-shape oracle against the server's filesystem (distinguishes "valid JSON at this path" from "missing/unreadable/non-JSON"), and a foothold for further probing. | Mirror the existing `WEB_PUBLIC_ROOT`-prefix containment check used for static files, or simplest: drop the `query.input` override entirely and always read `DEFAULT_SNAPSHOT` (no legitimate caller appears to rely on overriding it — grep `Frontend/dashboard/src` for any caller passing `input=`). | **api — Security Surface caps at C, gated until fixed** |
| P3 | api/security | `backend/api/server/services/cli_executor.js` (`backendStatus`, `backendDataSummary`, `backendCorrelation`, `backendUniverse`) | Same unvalidated `query.input` pattern, but lower severity — it's forwarded as one `spawnSync(..., {shell:false})` argv element (no shell injection), and all 4 routes (`/api/status`, `/api/data/summary`, `/api/correlation`, `/api/universe`) are already on the public allowlist by design. | Same containment fix as above, lower urgency since these were already intentionally public. | api — contained |
| P3 | api | `backend/api/server/routes/system/kill_switch.js:6` | The (already token-gated) `query.command` is forwarded verbatim to the C++ backend as the kill-switch subcommand with no allowlist (`status`/`arm`/`disarm`/etc.). | Add an explicit subcommand allowlist. | api — low risk, token already required |
| P4 | api/hygiene | `backend/api/server/middleware/{error_handler.js,logger.js,rate_limiter.js}` | Dead code — zero `require()` of any of the 3 files anywhere in `backend/api`; `app.js` uses its own inline security/rate-limit logic instead. | Delete, or wire in if an Express migration is ever intended. | api — trivial |
| P4 | api | `shared/lib/mcp/gate.js:38-42` (`isMcpAllowed`) | Fails **open** (defaults `true`) for any pathname in neither `BLOCKED_ROUTES` nor `ALLOWED_ROUTES` — `/api/bot/cycle`, `/api/bot/sell`, `/api/bot/status`, `/api/signal/promote`, `/api/strategies`, `/api/sigma-band`, `/api/run/status` are all absent from both lists today. Not exploitable today since the real boundary is `app.js`'s API-token gate, not this MCP allowlist — but if this list is ever promoted to the primary gate, trading routes should be explicit `BLOCKED_ROUTES` entries rather than relying on fail-open. | Add the bot/trading routes to `BLOCKED_ROUTES` explicitly. | informational only |
| — | api | `37d2d6d2` kill-switch token gate | Re-verified still intact and tested (`tests/api.test.js:212-224` asserts 401 without token). No regression. | none | clean |
| — | api | command-injection / path-traversal-elsewhere / stub / secrets sweep | Exhaustive `exec(`/`execSync(` grep across `backend/api/server/**`: zero hits, both real spawn sites use `spawnSync(bin,[...argv],{shell:false})`. No hardcoded secrets, no `eval`, no token values logged, no mock-data stub handlers (`localBackendFallback` is a labeled real-fixture degraded mode, not fake data). | none | clean |
| P2 | gateway | `backend/gateway/src/index.ts:728-755` (`ExecutionGateway.execute()`) returns `void`; failure is only visible by inspecting the mutated `order` object afterward | The `buy`/`sell` CLI path (`index.ts:2037-2051`) *does* check `order.status` post-call and sets `process.exitCode=1`/`ok:false` — combined with today's `backend_bridge.js` fix, that path is fully closed (exit code and payload now agree). But `processProposedOrders()` (`index.ts:757-801`, the `process` CLI command) loops `await this.execute(order)` per order and **never inspects `order.status` afterward** — no exit code, no `ok` field, a failed order in a batch silently becomes a console-only log line. Same gap at the `--demo` call site. Confirmed via grep that nothing currently wires the `process` CLI command through `backend_bridge.js`, so this is **real but dormant** — it activates the moment any future caller bridges that command. | Have `processProposedOrders` aggregate per-order failures into a summary `{ok, failed_count}` and a non-zero exit when any order failed, mirroring the buy/sell path. | gateway — dormant debt, not gating |
| — | gateway | Centralization Backlog re-check (commit `6875f1fa`, 2026-06-12) — DEV_REVIEW's existing backlog row was stale and is corrected here | (a) raw-`fetch`-without-retry: **mostly fixed** — `index.ts`/`cycle.ts` import and use `fetchWithRetry` from `shared/lib/runtime/fetch_retry.js`, but `cycle.ts:69` (`fetchAiBets`), `cycle.ts:123` (bot-health check), and `market.ts:17` (`fetchTradingInfo`) still call raw `fetch` despite the retry helper already being imported in the same file in 2 of the 3 cases. (b) `submitPolymarketOrder`/`preflightPolymarketOrder` duplication: **fixed** — both now delegate to `_polymarketOrderCore` (`index.ts:1844`). (c) hand-rolled L2 HMAC vs. the SDK's `createL2Headers`: **still open, but by design** — the commit message explicitly records this was "aborted per spec gate" (the SDK helper needs a `ClobSigner`+WebCrypto and drops headers this gateway relies on), not a silent regression. | Close the 3 remaining raw-`fetch` call sites (S effort, same pattern already proven in the same files). Leave (c) as a documented design decision, not a bug. | gateway — centralization backlog corrected, not gating |
| — | gateway | re-verified previously-fixed findings: FOK order type (`cycle.ts:251,381,483`), plaintext-secret masking (`index.ts:2267-2291`, `--reveal`-gated) | Both confirmed still intact, no regression. | none | clean |
| P3 | gateway | `AlpacaAdapter.placeBracketOrder` (`index.ts:573`) | Still orphaned, zero callers repo-wide — unchanged from the last audit. | Implement a caller or remove; not urgent. | gateway — unchanged |
| — | gateway | security/stub sweep | No `eval`/dynamic `require`/hardcoded secrets in `backend/gateway/src/*.ts`; no silent stub returns on a reachable order-submission or balance-check path (`market.ts`'s `return null` hits are benign read-only lookup-not-found, not execution). | none | clean |

**Frontend/dashboard** (`Frontend/dashboard/src/`, 24 files): confirmed **not dead** — the API
sub-agent cross-referenced every `/api/*` call against `Frontend/dashboard/src/lib/api.ts` and all
major panels, found it actively wired to Supabase auth and the backend API (just not the *primary*
interface since the TUI/dashboard CLI took over that role — it runs standalone via `npm run dev`,
not through `infra/docker/docker-compose.yml`, which only has `web`+`bot` services). Not deep-dived
beyond the cross-reference above.

**backend/core (C++)**: not re-scanned this pass — zero commits have touched `backend/core/src`
since `e0ad1ff7` (session 18b, ctest fixture fixes, ~10 sessions ago); carries forward its last
verified state (29/29 ctest, ONNX parity proven) per the Focused-Audit scope rule rather than a
fresh full re-scan.

**Updated Gate Table (2026-06-21 session 52, full):**
```
Section                                          Grade   Status
────────────────────────────────────────────────  ─────   ──────────────────────────────
shared/lib/data/*                                  A-     OPEN
shared/lib/market/{validation,coverage}.js          B     OPEN (renameWithRetry debt, contained)
backend/cli/commands/data/*                         A-     OPEN
backend/scripts/data_ops/ingest_market_data/*       B     OPEN (cached, not re-scanned)
shared/lib/runtime/backend_bridge.js                A     OPEN (this session's fix verified)
dashboard/CLI interactive surface                   A     OPEN (session 50/51 fixes verified live)
backend/api/*                                       C     GATED — unauthenticated path-traversal
                                                            oracle on /api/sigma-band (clear before
                                                            adding new routes; debt-clearing exempt)
backend/gateway/src/*                               B+    OPEN (1 dormant debt, 1 corrected backlog
                                                            doc, otherwise clean re-verification)
Frontend/dashboard/src/*                            B     OPEN (not stale, not deep-audited)
backend/core (C++)                                  — (cached, last B/A — not re-scanned)
```

---

### Blast-Through Full Audit — 2026-06-21 (dashboard interactive surface)

User-reported crashes on login/register/Polymarket-portfolio in the Ink dashboard
(`backend/cli/sovereign_dashboard.mjs`) prompted a full sweep of every `INTERACTIVE_CMDS` entry
(`cockpit`, `polymarket markets`, `polymarket derive-creds`, `login`, `register`, `add-platform`,
`alpaca`, `mt5`, `trade favorites`, `strategy`, `prop-firms`, `run` — confirmed exact set at
`sovereign_dashboard.mjs:35-48`), since all 12 route through the same `runExternal()` →
`spawnSync(stdio:'inherit')` chokepoint (line 995) — a shared-mechanism bug hits all of them, not
just the 3 reported.

| Priority | Area | File:line | Finding | Fix | Gate |
|---|---|---|---|---|---|
| P1 | dashboard/CLI, repo-wide | `backend/cli/{engine.js,lib/auth.js,commands/data/data.js,commands/tools/backend_visualize.js}` — zero `process.stdin.on('error', ...)` handlers found anywhere under `backend/cli/` (grep-confirmed across all 6 raw `stdin.on('data', ...)` call sites) | An `EventEmitter` that emits `'error'` with no listener throws synchronously and **crashes the process** — bypassing `async`/`await` promise-rejection handling entirely, so no amount of `try`/`catch` around `await promptX(...)` call sites would catch it. Windows ConPTY + inherited `stdio:'inherit'` + repeated raw-mode toggling (every masked-password prompt flips `setRawMode` true→false) is exactly the kind of environment where a transient stdin transport error (`EIO`/`EPIPE`-class) is plausible — this is the most precise match found for a hard "crash" (vs. a clean rejection, which `sovereign_cli.js:143`'s top-level `main().catch(...)` already handles fine). | One `process.stdin.on('error', ...)` guard near the top of `sovereign_cli.js`'s `main()`, logging and falling through to the normal error/exit path instead of an uncaught crash. Covers all 12 `INTERACTIVE_CMDS` entries (and any future ones) in a single file, since they're all the same spawned child process sharing one `process.stdin`. | dashboard/CLI C — FIXED + tested this session (Phase 3) |
| P1 | dashboard/CLI | `backend/cli/lib/auth.js` — `promptLine`/`makeReadlineMasked` had no `SOVEREIGN_NONINTERACTIVE` bypass (unlike `tui/engine/engine.js:55-57`'s `isNonInteractive()`, already honored by `promptSelect`/`promptText`/`promptMultiSelect`) | This is *why* login/register had zero automated coverage — a piped, never-written, never-closed child stdin (exactly what `runExternal()` gives the spawned command) makes `promptLine`'s non-TTY branch (`readNonTtyLine()`) wait forever for a line that never arrives. Confirmed via a real repro test (see below): pre-fix, a non-mocked, unauthenticated `login` spawned with piped stdio hangs past a 20s timeout; this is a genuine, reproducible hang, not a hypothetical. | Add the same `isNonInteractive()` early-return guard to `promptLine`/`makeReadlineMasked` (mirrors `engine.js` exactly). Also: `_nonTtyRl` module-level singleton had no recreate-on-close path (`ensureNonTtyReader()`'s `if (_nonTtyRl) return;` returned even when the existing interface was already closed/dead). | dashboard/CLI C — FIXED + tested this session (Phase 1) |
| P2 | account | `backend/cli/commands/account/auth.js:32-33,78,84,97` (`commandLogin`/`commandRegister`) | `auth.promptLine`/`promptPassword`/`promptPasswordWithStrength` calls are not wrapped in try/catch (the `loginWithCredentials`/`registerWithCredentials` network calls just below them in the same functions already are — inconsistent). Once the P1 stdin-error guard lands this stops being a crash and becomes a UX-polish item: a clean rejection (e.g. Ctrl-C, which `makeReadlineMasked` already turns into `reject(new Error('interrupted'))`) would still surface as a raw stack trace instead of a friendly message. | Wrap the prompt-call sequences in try/catch, same style as the network-call try/catches just below. | account C — FIXED this session (Phase 3) |
| P2 | trade/mt5 | `backend/cli/commands/trade/trade_mt5.js` (`commandMt5`/`commandAddPlatform`/`commandMt5Profile`) | Same `lib/auth.js` `promptPassword` re-import, same missing-try/catch pattern as the row above. The P1 global stdin-error guard already covers this file's crash risk — **do not duplicate that fix here**, only the try/catch UX-polish is file-specific. Found a pre-existing developer self-flag directly above `commandAddPlatform`: `// does this actually works as intended? dev reiview` — corroborating evidence this path was already suspected, not newly discovered. | Wrap prompt-call sequences in try/catch (same pattern as account/auth.js). | trade/mt5 C — FIXED this session (Phase 3) |
| P3 | strategy/runner | `backend/cli/commands/strategy/strategy.js`, `backend/cli/commands/runner/run.js` | Both files exclusively use `tui/index.js`'s re-exported `promptSelect`/`promptText`/`promptConfirm` (`engine.js`'s implementations) — **not** `lib/auth.js`'s prompts. `engine.js` already honors `SOVEREIGN_NONINTERACTIVE`. No file-specific auth.js-class bug here; these are already covered by the P1 global stdin-error guard for the crash class, and don't need a separate try/catch pass since none of their prompt call sites are any more or less guarded than the rest of `engine.js`'s callers (a repo-wide pattern, not specific to these 2 files). | No action needed beyond the P1 global fix. | strategy/runner B |
| P3 | dashboard | Surface Parity spot-check: every `INTERACTIVE_CMDS` string vs. its manifest `id` | All 12 entries match an exact manifest `id` byte-for-byte (`cockpit`:75, `alpaca`:199, `mt5`:200, `add-platform`:201, `trade favorites`:202, `strategy`:214, `prop-firms`:215, `run`:216, `polymarket markets`:223, `polymarket derive-creds`:240, `login`:306, `register`:312) — no drift. Noted, non-blocking: `runExternal`'s match (`sovereign_dashboard.mjs:997`) is `cmdStr.startsWith(ic) || cmdStr === ic`, a prefix match rather than an id lookup — currently safe (no other manifest id starts with `"run"` followed by more characters that isn't already `"run"` itself, e.g. the unrelated `bot run` subcmd's `cmdStr` starts with `"bot"`, not `"run"`), but a future manifest id like `"run-once"` would silently and incorrectly match the `'run'` entry. | No fix needed now; flag for whoever next adds a manifest id starting with an existing `INTERACTIVE_CMDS` string. | dashboard B — clean, fragile-by-convention only |
| P3 | operational/status | `backend/cli/commands/operational/status.js:110-127` (`summarizePortfolioCard`) | Expects `{equity, exposure, drawdown, readiness, generated_at}`; the only thing that ever feeds it (`safeReadJson(DEFAULT_PORTFOLIO)`, line 330) is `storage/data/portfolio.json`, whose actual on-disk shape is `{mode, cash, positions, open_orders, last_mark_at}` — already a latent shape mismatch independent of Polymarket. Documented here, not fixed here — see Phase 4 (Polymarket-cockpit integration) for the related, in-scope fix. | Out of scope for this pass; flagging so it isn't mistaken for a Polymarket-integration regression later. | operational/status C — documented, not gated |

**Verification gate to clear:** all P1/P2 rows — DONE, see `RESOLVED 2026-06-21 (session close)` below.

**RESOLVED 2026-06-21 (mid-session):** the `lib/auth.js` P1 row only. `promptLine`/
`makeReadlineMasked` now honor `SOVEREIGN_NONINTERACTIVE` and `ensureNonTtyReader()` recreates a
dead `_nonTtyRl` instead of no-op-returning. Verified via a real repro test
(`tests/scripts/tui/dashboard/dashboard_command_safety.test.js`, `'login exits cleanly when
unauthenticated and not mocked'`) that spawns `login` with piped stdio, no `SOVEREIGN_MOCK`, and a
fresh empty `HOME`/`USERPROFILE` (so the real `~/.sovereign/session.json` is never touched).

**RESOLVED 2026-06-21 (session close):** the remaining P1 row + both P2 rows.
`backend/cli/sovereign_cli.js`'s `main()` now installs `process.stdin.on('error', ...)` before any
command dispatch; `commands/account/auth.js`'s `commandLogin`/`commandRegister` and
`commands/trade/trade_mt5.js`'s `commandAddPlatform`/`commandMt5Profile` wrap their `lib/auth.js`
prompt calls in try/catch. Verified: the underlying EventEmitter-crash mechanism reproduced directly
(`process.stdin.emit('error', ...)` with no listener throws and kills the process; with the guard
installed, it logs and the process continues) — this is the strongest available proof for a failure
mode that depends on a real transient stdin transport error, which can't be forced deterministically
in CI. Manual smoke: `SOVEREIGN_MOCK=true node backend/cli/sovereign_cli.js login` exits clean.
Full suite **555 tests / 553 pass / 0 fail / 2 skip**; `npm run hygiene` clean. Not done this
session (disclosed, not silently dropped): a literal interactive-keystroke PTY verification of
`login`/`register` in a real raw-mode terminal — this sandbox has no PTY/tmux (the same documented
constraint prior sessions hit verifying the Ink TUI), so the closest available proof is the
non-interactive repro test above plus the direct EventEmitter mechanism check.

##### Centralization Backlog

| Pattern | Files (count) | Proposed unit | Effort | Grade impact |
|---|---|---|---|---|
| `lib/auth.js` `promptPassword` re-import | 2 files (`commands/account/auth.js`, `commands/trade/trade_mt5.js`) | Both already share the single fixed implementation in `lib/auth.js` — no further consolidation needed, just don't duplicate the P1 stdin-error fix per-caller. | — | done (no action) |

---

### Blast-Through Full Audit — 2026-06-19 session 41 (anchor e0cb6aa2 → 76fbe991, first formal Gate Table)

DCS start ≈0.96 (carried from last audit close) → end 0.92 (2 confirmed-reachable bugs fully diagnosed below; not a halt condition, the "degraded paths" the formula flags are exactly the rows in this table).

| Priority | Area | File:line | Finding | Fix | Gate |
|---|---|---|---|---|---|
| P1 | ingest | `backend/scripts/data_ops/ingest_market_data/manifests.js:113` (age: pre-existing — confirmed byte-identical in commit `4e8cf240~1`, the monolith before this week's split; NOT a new regression) | `fetchEcbHistory(s, opts.historyDays)` is called but never defined or imported in `manifests.js` — throws `ReferenceError` if the FX provider chain falls through to `'ecb'` (priority 5 of 5 in `config/markets/data_sources.yaml:60`) with `--history-days` set. Real implementation exists and is exported: `shared/lib/providers/ecb.js:42`, reachable via the providers barrel (`shared/lib/providers/index.js:15,29` `...ecb`). | Add `fetchEcbHistory` (and `fetchEcbFx`) to the `require('../../../../shared/lib/providers')` destructure at the top of `manifests.js`; delete the two local 1-line stubs at lines 52 and the historyDays branch's bare call. | ingest C |
| P1 | ingest/research | `manifests.js:55-56` + `research_sources.js:240,253,257` (age: pre-existing, confirmed in `4e8cf240~1` too) | `fetchKalshiHistoricalMarkets`/`fetchKalshiHistoricalCandlesticks` always `return []`. No real Kalshi historical implementation exists anywhere in the repo. `research_sources.js`'s `loadPredictionMarketHistory` destructures `{ records }` off the `[]` result (`records` → `undefined`), then `sources.push(...records)` throws `TypeError: records is not iterable` — caught per-event by a surrounding try/catch and recorded as an opaque generic error, not "not implemented." **Confirmed live-reachable**, not dormant: `config/markets/data_sources.yaml:162` configures 4 real `prediction_market.events`. Every research/backtest command touching Kalshi prediction-market history has presumably never returned real data. | Either implement the real Kalshi historical fetchers, or make the stub return `{ records: [] }` (matching the caller's contract) and have callers report a clear `not_implemented` reason instead of crashing into a generic catch. | research/ingest C |
| P2 | ingest/TUI | `manifests.js:47-54` (8 more pre-existing `return {}` stubs: OpenSky, Blockchair×2, SEC holdings, S&P PMI, Yahoo breadth, + the `fxapi`/`ecb` FX-fallback pair) + `backend/cli/tui/manifest.js` ingest `--family` dropdown | `pmi`/`flight`/`crypto_tx`/`holdings`/`breadth` have **no config section at all** (dormant — the family loop never iterates real items); `onchain` is `enabled: false` in `config/markets/options_data.yaml` AND configured for different providers (`glassnode`/`cryptoquant`) than the Blockchair-named stub anyway. But the TUI's `ingest` command exposes all 6 directly in the user-facing `--family` select list — a user can pick "PMI" or "Onchain" expecting real data and get a silent no-op with no indication it was never implemented. `fxapi`/`ecb` are live (low-frequency) FX fallback-chain entries, see P1 row above for `ecb`. | Either remove the 6 unconfigured family ids from the TUI dropdown or label them clearly as not-yet-implemented; wire `fxapi`/`ecb` to real implementations. | ingest/TUI C |
| P3 | ingest | `index.js:1320` (`redactUrl`), `index.js:1324` (`loadExternalQuoteInputs`) | Each listed twice in the same `module.exports` literal — harmless (later key wins, no functional bug) but dead clutter from the FW2 extraction. | Remove the duplicate export lines. | ingest — trivial |
| P3 | data | `data.js:28`, `data_deep_backfill.js:9`, `data_rollup.js:8` | `DEFAULT_TS_DIR` independently defined 3× (identical expression) across the `data.js` decomposition instead of one export+import. No current behavioral risk — all 3 compute the same value — but a future edit to one copy could silently drift from the other two. | Define once in `data_rollup.js` (already exports it elsewhere); import in the other two instead of redefining. | data — minor centralization debt |
| P2 | trade / security-policy | `trade_polymarket.js:507` `submitPolymarketBuyOrder`/`commandPolymarket` (age: pre-existing — confirmed byte-identical in commit `37d54c47~1`, before this week's trade.js split; NOT a new regression) | Polymarket's live-order path is gated by `featureGate('polymarket')` + `canLiveExecute('polymarket')` — a deployment-mode/capability check (`shared/lib/brokers/capabilities.js:17`) — **not** by the `requireAuth(...)` + `SOVEREIGN_TRADE_PIN` per-session MFA challenge that gates the generic broker path (`trade.js:288,293-319`) and bot-live path (`trade.js:456`). Real inconsistency in safety-gate strength between brokers; this is a security-policy question for a human, not a bug to silently patch. | Reviewer decision: is `canLiveExecute` sufficient for Polymarket (e.g. its own client has external confirmation), or should `requireAuth`+PIN be added to `commandPolymarket` for parity? | trade — flagged for human review, not gated |

**Reviewer decision needed:** (1) ~~Kalshi historical fetchers~~ RESOLVED below; (2) ~~the 6 TUI-exposed but unconfigured ingest families~~ RESOLVED below (removed from the picker); (3) ~~Polymarket live-order MFA/PIN parity~~ RESOLVED below (gate added).
**Verification gate to clear:** all three rows below — DONE.

**RESOLVED 2026-06-19 (same session, commit `5ca738aa`):** both P1 rows above fixed. `manifests.js` now imports `fetchEcbFx`/`fetchEcbHistory` from the real `shared/lib/providers/ecb.js` (via the providers barrel) instead of the local stub; `fetchKalshiHistoricalMarkets()` now returns `{ records: [] }` instead of a bare `[]`, matching its only caller's destructuring contract. Verified via direct probe (real `fetchEcbFx` throws on an invalid pair instead of silently returning `{}`; the `ecb`+`historyDays` branch reaches the real `fetchEcbHistory` and fails for a real network/validation reason, not `ReferenceError`; Kalshi destructure+spread no longer throws) and the full suite (486/490 — the 4 new fails are `tui_terminal_automation.test.js`, confirmed unrelated: a concurrent in-progress Ink-TUI-refactor change to `sovereign_cli.js`'s entry point, not this fix).

**RESOLVED 2026-06-19 (same session, commit `91aafeef`):** the 2 P2 reviewer-decision rows. (1) Tracing `submitPolymarketBuyOrder`'s only call site confirmed it's worse than originally scoped: `commandPolymarket`'s `markets` sub-command reaches `runPolymarketMarketActionLoop` (via `promptPolymarketMarketBrowser`) **unconditionally** — not gated by `--live` at all, only by the `featureGate('polymarket')` opt-in flag — and places a real order off one `promptConfirm` y/n with zero authentication. Added the same `requireAuth()` + `SOVEREIGN_TRADE_PIN` challenge `trade.js`'s `--live` path requires for every other broker, gated once per browse session right before `promptPolymarketMarketBrowser()` is called (the sole entry point — confirmed via grep, no other caller exists). (2) Removed `pmi`/`breadth`/`onchain`/`flight`/`crypto_tx`/`holdings` from `tui/manifest.js`'s `ingest --family` dropdown (kept `macro_alt`/`sentiment`/`prediction_market`/`weather`/`reserves` — confirmed real implementations, not stubs). Verified: both modules load, `verifyPin` round-tripped (correct/wrong/null PIN), full suite 490/490 (TUI test flakiness from the concurrent Ink refactor resolved itself in the interim, unrelated to either fix).

Only remaining open items: `index.js:1320,1324` duplicate exports (P3, trivial) and `DEFAULT_TS_DIR` 3x redefinition (P3, see Centralization Backlog) — neither gating, both small enough to fold into routine cleanup whenever those files are next touched.

**Hygiene Sweep — clean.** ~36 duplicate JS basenames repo-wide, all resolved: the documented session-10/29 root-shim architecture (every `shared/lib/<X>.js` root file verified exactly 1 line, re-exporting `shared/lib/<category>/<X>.js` — `adapters/ai_client/ansi/backend_bridge/backfill/backtest/config_loader/crypto_aggregates/db_pruning/env/execution_memory/feature_builder/indicators/ingestion/macro_store/models/mt5_profiles/paths/persistence_bridge/polymarket_history/prop_firms/quote_router/rsi_backtest/run_loop`, plus a documented 2-layer chain `adapters.js → compat/adapters.js`), genuinely different domains coincidentally sharing a name (`shared/lib/brokers/common.js` = broker .env credential helpers vs `shared/lib/providers/common.js` = HTTP rate-limit/cached-fetch helpers — read both, confirmed unrelated), or frozen `docs/archive/legacy_ui/`. No new dead files, no divergent forks.

**Security Surface Scan — clean.** No `eval`/`new Function` in production code. The only non-literal `require(variable)` calls are in test harnesses (fixture stubbing), none in production. No hardcoded secrets matched by pattern scan. The one `execSync` call (`shared/lib/runtime/paths.js:91`, inside `which(cmd)`) only ever receives hardcoded system-binary names from an internal candidate list — not reachable from user/network input.

**Surface Parity (manifest↔handler) — spot-checked, no drift.** A naive id-diff between `tui/manifest.js` and `sovereign_cli.js`'s handler map produces ~30 false positives because the TUI manifest mixes pure-navigation/sub-action ids (`timezone`, `integrity`, etc., routed via `prefix:` sub-dispatch or internal `sub === '...'` branches) with top-level CLI-dispatching ids. Spot-verified 2 samples (`integrity`→`backend` prefix-dispatch, `timezone`→`commandSettings` sub-action) — both resolve correctly. Not re-flagging the rest without a smarter check.

**FW2 decomposition quality (Tier 1, this week's commits) — extraction itself is clean.** Agent-reviewed + spot-verified the highest-stakes claims directly: no stale duplicate function bodies left in any parent file, no broken/circular requires beyond the already-documented lazy-require pattern (`manifests.js`/`snapshot_fetchers.js`/`prediction.js` lazy-`require('./index.js')` to avoid load-time cycles), no NEW silent stubs introduced by the splits — every stub/bug found above pre-dates this week, confirmed via `git show <commit>~1` diffing against the pre-extraction monolith.

##### Centralization Backlog

| Pattern | Files (count) | Proposed unit | Effort | Grade impact |
|---|---|---|---|---|
| `DEFAULT_TS_DIR` redefinition | 3 files (`data.js`, `data_deep_backfill.js`, `data_rollup.js`) | export once from `data_rollup.js`, import elsewhere | S | data B→A |

---

### Blast-Through Focused Audit — 2026-06-14 session 30 (anchor 51b20b6c → d95b92a7)

| Priority | Area | File:line | Finding | Fix | Gate |
|---|---|---|---|---|---|
| P1 | data-depth | `storage/data/ts/*_{30m,4h}.bin` (introduced by rollup commit `217d21e5`, age <1d) | 30m + 4h intraday bins stale/shallow — BTCUSDT 5m=926,357 (2017→2026) & 15m=37,898, but 30m=1,440 / 4h=180 (only 2026-05-11→06-10); AAPL 30m=777 / 4h=859 (end 06-09). The session-29 catch-up rollup refreshed 15m+1h but not 30m+4h. **Code is correct** (`ROLLUP_TARGET_TFS=['15m','30m','1h','4h']`; dry-run confirms intent). | Run `intraday-rollup --family crypto` + `--family equities` (local, idempotent, ~seconds). Verify 30m/4h counts jump to match 5m depth. | data layer B (open); gap is data-state not code |
| P2 | config | `config/markets/asset_mapping.json` (dead since reorg) | Divergent dead duplicate of `config/asset_mapping.json`. Zero readers across js/cpp/hpp/ts/yaml; production reads the root copy (`backend/cli/tui/manifest.js:31`). Diverges in content + keys (`FX` vs `Forex`; `Crypto:[BTC,USDT,ETH]` vs full 21-symbol universe) → edit-wrong-file trap. | Delete `config/markets/asset_mapping.json` (or add a byte-equality contract test if the second copy is intentional). | config C — GATED until removed |

**Reviewer decision needed:** (1) confirm OK to run the catch-up `intraday-rollup` (writes 30m/4h bins);
(2) confirm the `config/markets/asset_mapping.json` stub is dead and can be deleted.
**Verification gate to clear:** post-rollup `readTsIndex` shows 30m/4h spanning the same range as 5m; full suite still green after stub deletion.

##### Centralization Backlog

| Pattern | Files (count) | Proposed unit | Effort | Grade impact |
|---|---|---|---|---|
| ~~ANSI import spelling drift~~ — RESOLVED 2026-06-08 (commit `4d3fb4d`): `auth.js` now imports `shared/lib/ansi` (matches `settings.js`, same shim target) | was 4 files, outlier fixed | — | S | done |

Noted, not flagged: `parseArgs(argv)` in `scripts/strategies/ml_smoke_alpaca.js` and `ml_smoke_polymarket.js` share a ~6-line arg-loop shape. Only 2 files, each parses different flag sets (`--qty` vs none, `--dry` shared) — below the 3-file drift threshold and a shared helper would be more code than the duplication. No action needed.

---

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

### Deep Blast-Through - 2026-06-11 live dirty-tree audit

Scope: hard-reading audit of the current `feat/ml-onnx-section` worktree after graph refresh.
The graph was rebuilt from `6eea7b77` to 9205 nodes / 14200 edges / 730 communities. Runtime
verification is strong locally, but repository reproducibility is not clean because several
tracked files depend on local-only or ignored files.

### P0 - tracked C++ build depends on untracked `frame_backtester` sources
- `backend/core/CMakeLists.txt:94` includes `src/backtest/frame_backtester.cpp`.
- `backend/core/src/main.cpp:7` includes `backtest/frame_backtester.hpp` and calls
  `FrameBacktester` at `main.cpp:700`, `main.cpp:715`, and `main.cpp:797`.
- `git ls-files backend/core/src/backtest/frame_backtester.cpp backend/core/src/backtest/frame_backtester.hpp`
  returns no tracked files. A clean clone has tracked references to files that are absent.
- Local verification is green only because the untracked files exist in this checkout.
  `cmake --build backend/core/build --config Release --target sovereign_wealth` builds after
  cleaning this shell's duplicate `Path`/`PATH` environment key. The first build attempt failed
  before compilation with MSBuild `Item has already been added. Key in dictionary: 'Path'`.
- Required fix: either track `frame_backtester.{cpp,hpp}` with the C++ work or remove the tracked
  references. Do not treat the current native build as clone-safe until this is closed.

### P0 - full test suite is green locally but relies on untracked/ignored test assets
- `tests/scripts/strategy_asset_classification.test.js:7` executes
  `scripts/classify_strategy_assets.js`, but that script is untracked.
- `workspace/FEATURE_TEST_MATRIX.md:9` and `workspace/FEATURE_REPAIR_PLAN.md:37` use
  `scripts/mcp_stdio_probe.js` as the MCP proof command, but that script is untracked.
- `workspace/FEATURE_TEST_MATRIX.md:16` and `workspace/FEATURE_REPAIR_PLAN.md:44` list
  `backend/api/tests/correlation_contract.test.js`, but that test file is untracked.
- `tests/scripts/notebooks_contract.test.js:7-27` asserts notebooks exist and are parseable.
  `.gitignore:125` ignores `notebooks/*.ipynb`, and `git ls-files notebooks/*.ipynb` returns
  nothing. The local notebooks make the suite pass; a clean clone would not have them.
- Required fix: decide which of these are source/test fixtures and track them, or rewrite the
  contracts so local-only artifacts are skipped or generated before test execution.

### P1 - repo-local skill inventory should stay trimmed to the three umbrella skills
- `GEMINI.md:11` now points at `skills/gemini/SKILL.md`, which matches the live repo-local bootstrap path.
- The repo-local skill tree has been reduced to `codex`, `claude`, and `gemini` only; the older secondary skill directories were removed from both `skills/` and `.agents/skills/`.
- Impact: bootstrap and blast-through behavior should rely on the three umbrella skills plus handoff files, not a fragmented skill set.
- Required fix: keep the docs and bootstrap paths pinned to the three umbrella skills only.

### P1 - Docker context hygiene is untracked while Dockerfile remains a blocked carryover
- `.dockerignore` is untracked. It excludes `.env*`, cache, build outputs, notebooks, workspace
  state, and generated data from Docker build context, but a clean clone would not have that
  protection.
- `infra/docker/Dockerfile` still has the deliberate uncommitted ONNX flag edit:
  `-DSOVEREIGN_ENABLE_ONNX_RUNTIME=ON`. This remains blocked on Docker Desktop verification per
  the existing handoff.
- Required fix: track `.dockerignore` if Docker build hygiene is considered part of the repo, and
  keep the Dockerfile edit uncommitted until the container rebuild plus in-container `ml compare`
  proves `onnx_runtime`.

### P2 - real provider/data gaps remain behind green no-spend tests
- `backend/scripts/data_ops/ingest_market_data/index.js:1162-1167` still returns empty objects for
  OpenSky, Blockchair, SEC holdings, SP Global PMI, and ECB FX fetchers. Their registry entries
  are wired at `index.js:1269-1299`, so the seam is active but provider extraction is incomplete.
- `shared/lib/providers/tradingview.js:78` still explicitly says the screener search is stubbed.
- These are not breaking current tests because the no-spend verification suite focuses configured
  cache health and mocked provider contracts. They are product-scope gaps, not runtime regressions.

### P2 - stale developer-review comments remain in active C++ ML code
- `backend/core/src/ml/cnn_inference.cpp:61`, `backend/core/src/ml/model_registry.cpp:52`, and
  `backend/core/src/ml/onnx_model.cpp:18` still contain `dev review` comments in active source.
- These do not break compile or tests, but they keep the ML section below an A cleanliness grade
  because the comments are unresolved design questions in production code.

### Verified good in this audit
- `graphify update .` succeeded: 9205 nodes, 14200 edges, 730 communities.
- Modified JS syntax checks passed for API executor, status, trade, asset picker, ingestion, and
  user settings.
- Focused no-spend gates passed:
  - CLI/settings/TUI/status bundle: 25/25.
  - API/correlation/dashboard bundle: 4/4.
  - Macro/reserves ingest contract: 2/2.
  - Gateway no-spend contract bundle: 30/30.
  - Strategy/prop-firm/backtest bundle: 22/22.
  - MCP stdio probe: 17 tools listed.
  - CLI/module-loading bundle: 16/16.
- Full `npm.cmd test` passed: 269/269.
- Native C++ target built locally after the duplicate environment key workaround:
  `sovereign_core.lib` and `sovereign_wealth.exe`.
- `status --json` reports `cache_mode:"recovered_live"`, 293 usable records, 0 stale records.
- `backend integrity --json` remains policy-green: 84/84 cached, 0 missing, 0 stale, only
  `RNDRUSDT` as the active exception.

### Section grades from this pass
| Section | Grade | Reason |
|---|---:|---|
| CLI/TUI/status/settings | B+ | Runtime tests green; current feature work is covered, but dirty-tree docs/tests depend on untracked artifacts. |
| API/Web contracts | B+ | API correlation fallback tests pass; new correlation contract is untracked. |
| C++ core | C | Local build passes; tracked source graph depends on untracked frame backtester files. |
| Data/ingestion | B- | Status/integrity green; scoped snapshot handling works; provider stubs remain. |
| Gateway/Polymarket | B | No-spend tests green; live spend still intentionally unverified. |
| Infra/Docker | C | ONNX flag edit still unverified; `.dockerignore` is untracked. |
| Repo workflow/skills | C- | Instructions advertise skill files that are empty or absent in the live repo. |
| Docs/workspace truth | B- | Current ledgers are useful, but some proof commands name untracked files. |

### Next cleanup move
Close clean-clone reproducibility before any broad commit: track or deliberately demote
`frame_backtester.{cpp,hpp}`, `scripts/classify_strategy_assets.js`, `scripts/mcp_stdio_probe.js`,
`backend/api/tests/correlation_contract.test.js`, and the notebook fixtures/contracts. Then rerun
`npm.cmd test` and the native C++ build from a clean clone or temporary export.

### Gap Closure Plan - 2026-06-11
- Durable plan: `workspace/DEEP_BLAST_GAP_CLOSURE_PLAN.md`.
- Recommended order: clean-clone reproducibility first, notebook/research contract second, repo
  protocol/skill truth third, then Docker ONNX verification, provider extraction, and C++ ML review
  cleanup.
- Key planning decision: do not bulk commit local research/data state. Track load-bearing source and
  proof assets, keep heavyweight `.ipynb` and generated `storage/data/*` outputs local, and replace
  tests that require ignored artifacts with tracked fixtures or manifests.

### Update - 2026-06-11 mass-implement clean-clone repair batch
- Implemented the Phase 1 and minimal Phase 2 reproducibility slice:
  - staged `.dockerignore`
  - staged `backend/core/src/backtest/frame_backtester.{cpp,hpp}`
  - staged `scripts/classify_strategy_assets.js`
  - staged `scripts/mcp_stdio_probe.js`
  - staged `backend/api/tests/correlation_contract.test.js`
  - staged `notebooks/signal_library.json`
  - added tracked notebook fixtures under `tests/fixtures/notebooks/`
  - rewired `test:api`, expanded `structure_contract.test.js`, and rewrote
    `notebooks_contract.test.js` to validate tracked fixtures instead of ignored live notebooks
- Verification:
  - `npm.cmd run test:structure` pass
  - `npm.cmd run test:api` pass
  - `node --test tests/scripts/notebooks_contract.test.js` pass
  - `node -e` RSI library probe: `35` actionable signals from tracked `notebooks/signal_library.json`
  - `cmake --build backend/core/build --config Release --target sovereign_wealth` pass
  - `npm.cmd test` pass `272/272`
- Additional blocker found during verification and fixed inline:
  - TUI boot was refreshing Supabase auth on menu startup, which made
    `tests/scripts/tui_terminal_automation.test.js` fail under network-restricted conditions.
  - Fix: `backend/cli/sovereign_cli.js` now reads auth locally only during TUI boot via
    `getAuthenticatedUser({ refreshExpired: false })`; explicit auth flows still refresh normally.
- Remaining nuance: this closes the reproducibility gap in the current staged index, but a true
  clean-clone proof still needs commit or clean-worktree/export verification.

### Findings (reviewer decisions required)

| # | Severity | File:Line | Finding | Required decision / gate |
|---|---|---|---|---|
| 1 | High | backend/api/app.js:128 + server/routes/system/kill_switch.js:6 | Unauthenticated GET /api/kill-switch?command=<engage|release|status> reaches the C++ kill switch -- state-changing safety control on the exposed web port. Route is in neither the public list nor PROTECTED_GET_ROUTES. | Add /api/kill-switch to PROTECTED_GET_ROUTES (one line) or make engage/release POST-only. Fold into roadmap item 5 (login barrier). Gate: app.js stays GATED until landed. |
| 2 | High | backend/gateway/src/index.ts:723-748 | ExecutionGateway.execute() swallows live order failures: logs to stderr, sets status FAILED, exits 0. Bridge then reports ok:true (proven live: 422 probes returned ok:true + status failed). Callers cannot distinguish success from failure. | Decide envelope: non-zero exit on failed execution vs ok:false JSON. Then update bridge consumers. |
| 3 | High (live path) | backend/gateway/src/cycle.ts:207-227, 405-437 | FOK intent silently lost: timeInForce:'FOK' is not a UserOrder field; postOrder(signed) defaults GTC. Unmatched GTC sells REST on the book while code treats them as failed and keeps the position -> dangling live orders + duplicate-sell stacking on retry. Pre-existing; relevant before any liveTrading enable. | Use postOrder(signed, OrderType.FAK) or createAndPostMarketOrder(FOK), cancel on unmatched. BLOCKS liveTrading enablement. |
| 4 | Medium | backend/gateway/src (classifyPolymarketGatewayError) | CLOB business rejections (e.g. the V2 "invalid order version") classified as invalid_token with misleading suggestion. | Add explicit categories for CLOB 400-with-error-body rejections. |
| 5 | Medium | backend/gateway/src/index.ts:2267-2269 | polymarket derive-creds prints L2 API secret/passphrase plaintext to stdout (by design for setup; lands in any captured log). | Confirm by-design or add --reveal flag + masked default. |
| 6 | Low | backend/gateway/src (bot health) | pUSD balance printed in micro-units ("9305985.00 pUSD"). | Divide by 1e6 in display. |
| 7 | Note | bot cycle engine | Top dry-run pick was a past-deadline market at 78.9% claimed edge (resolution-lag trap). | Candidate filter needs endDate/liquidity guards before liveTrading. |

### Centralization Backlog (additions)

| Pattern | Files (count) | Proposed unit | Effort | Grade impact |
|---|---|---|---|---|
| ~~Raw fetch without transport retry~~ — MOSTLY RESOLVED 2026-06-12 (`6875f1fa`), re-verified 2026-06-21 session 52: `shared/lib/runtime/fetch_retry.js` exists and is used in `index.ts`/`cycle.ts`. 3 call sites still raw: `cycle.ts:69` (`fetchAiBets`), `cycle.ts:123` (bot-health check), `market.ts:17` (`fetchTradingInfo`) | 3 remaining sites (was "3+ files", now narrowed to exactly 3 named lines) | wire the already-imported `fetchWithRetry` into the 3 named call sites | S | gateway error-handling B+ (was B, not yet A) |
| ~~submitPolymarketOrder / preflightPolymarketOrder ~80% duplicated~~ — RESOLVED 2026-06-12 (`6875f1fa`), re-verified 2026-06-21 session 52: both delegate to `_polymarketOrderCore` (`index.ts:1844`) | — | — | — | done |
| Hand-rolled L2 HMAC headers in clob_factory authedGet — re-verified 2026-06-21 session 52: still hand-rolled, but `6875f1fa`'s commit message records this was a deliberate, considered decision ("aborted per spec gate" — the SDK helper needs a `ClobSigner`+WebCrypto and drops headers this gateway relies on), not an oversight | clob_factory.ts vs clob-client-v2 createL2Headers/updateBalanceAllowance exports | keep as-is; revisit only if the SDK helper gains the missing header support | S | drift containment — accepted, not actionable |
| (carryover, user-deprioritized) trade.js 5 launcher call sites + tools/backend.js local runBackendCommand | 2 files | bridge | M | unchanged |

### Orphans / parity
- Orphan: AlpacaAdapter.placeBracketOrder (index.ts:568) -- no caller anywhere (below >3 threshold; note only).
- Parity nit: bot unknown-subcommand error lists "cycle, status, run, sell, config" but omits implemented "health".

### Resolved this pass
- app.js GET-auth question (carried since 2026-06-06): design is public-read + token-write + PROTECTED_GET_ROUTES; verified sound EXCEPT finding #1. /api/supabase/config exposes URL only (no keys) -- acceptable.
- Stub scan: no new stubs on reachable paths. Dev-marker scan: gateway src clean (0 markers).

#### C++ backend verification (roadmap item 6) - findings

Verdict: core engines REAL and healthy; test harness has fixture-path debt.

| # | Severity | Finding | Decision needed |
|---|---|---|---|
| 1 | Evidence | ml compare reproduces the Phase-3 parity numbers EXACTLY (xgboost 0.666376 {7061,1275,11144}, logistic 0.468378, regime 0.456982; backend onnx_runtime, 19,480 rows). Correlation + risk engines respond correctly. | none -- strongest possible health proof |
| 2 | Low | C++ `indicators` default --input is the pre-partition monolith path (main.cpp:522, storage/data/cache/backtest_history.json -- gone). Works with explicit --input; API route serves indicators via Node CLI anyway. | S fix: default to equities partition or require --input |
| 3 | Medium | ctest 27/29: ingestion_adapter_test fails (looks for config/data_sources.yaml relative to build dir; real file = repo-root config/markets/data_sources.yaml) and kronos_integration_test fails (needs >=4 empirical data points, fixture absent). Fixture/CWD debt, NOT logic failures. | S fix: resolve config path from repo root / ship fixture; then STATE.md 29/29 claim true again |
| 4 | Note | STATE.md "All 29/29 C++ core tests passing" is STALE (currently 27/29). Also carryover: core test mains are assert-only -> no-ops under Release NDEBUG; green Release ctest is weak evidence. Behavioral anchors (finding #1) are the real gate. | run ctest in Debug config when fixing #3 |

### Resolved in this pass

| Severity | Classification | File:Line | Finding | Resolution / evidence |
|---|---|---|---|---|
| High | production | `shared/lib/market/validation.js:620`, `shared/lib/market/validation.js:718` | `writeTsIndex` still used a fixed `<bin>.tmp` path for every process. Session 25 already proved two separate deep-backfill processes can race the shared temp name and crash with EPERM. | Replaced fixed temp paths with process-unique atomic temp paths for bin and meta writes. Added `tests/scripts/tests/backfill_regression.test.js:128` to prove an existing `BTCUSDT_1d.bin.tmp` from another writer is not overwritten. Gates: `node --check shared/lib/market/validation.js`, focused backfill test, `npm.cmd run test:data`, `npm.cmd run test:structure`, and full `npm.cmd test` all passed. |
| High | production | `backend/scripts/data_ops/ingest_market_data/index.js:2009` | Crypto native subdaily provider routing bug where Coinbase still called Binance base fetcher. | Fixed to route to `fetchCoinbaseBaseCandles` if provider is `coinbase`. Added unit test in `tests/scripts/tests/crypto_5m_backfill.test.js`. All tests passed. |
| Medium | runtime-artifact | `storage/data/backtests/latest_backtest.json`, `storage/data/strategy_grade_index.json` | Runtime report JSON was tracked in Git and caused constant git status noise. | Untracked both files via `git rm --cached` and added them to `.gitignore`. |
| Low | production | `backend/core/src/ml/cnn_inference.cpp:61`, `backend/core/src/ml/model_registry.cpp:52`, `backend/core/src/ml/onnx_model.cpp:18` | Active C++ ML source files contained legacy inline `dev review`/IDE comments. | Purged the comments from all three C++ source files and verified the release build compiles. |
| P1 | production | `backend/cli/commands/research/ml.js:66`, `shared/lib/ml/dataset.js:169` | ML dataset builder lacked caps for intraday (5m) timeframes, risking O(n^2) memory/time blowup. | Implemented `--max-bars-per-symbol` and added a default 50,000 bar cap for intraday timeframes. Verified via new unit test in `ml_dataset.test.js`. |
| P1 | production | `shared/lib/strategy/backtest.js:286`, `772`, `778` | Backtest annualization assumed 24/7 for equities and lacked session-gap checks (overnight/weekends). | Implemented active session periodsPerYear for equities (252 days * 6.5 hours) and calendar date session-gap guards. All tests passed. |
| P2 | git-config | `data/skills/` | Stale broken symbolic directory junctions caused `warning: could not open directory` in git status. | Cleaned up all broken symlinks under `data/skills/` using PowerShell, resolving the warnings completely. |

### Active findings

| Severity | Classification | File / surface | Finding | Required next move |
|---|---|---|---|---|
| High | production/runtime-data | `backend integrity --json`, `storage/data/ts` | Current configured-cache integrity is red despite `status --json` being green. Fresh run: `ok:false`, `92/92 cached`, `0 missing`, `total_stale:3`, `total_exceptions:1`; stale symbols are `GBPUSD`, `USDJPY`, and `AUDUSD` on `1d`. `status --json` still reports last-fetch snapshot quality `ok`, so the health split is working, but the Phase-9 data posture is not fully green. | Refresh or repair FX daily cache, then rerun `backend integrity --json`. If provider data remains stale, record explicit exceptions with rationale instead of leaving integrity red. |
| Medium | production | `shared/lib/providers/tradingview.js:78` | TradingView screener search remains explicitly stubbed. Tests can stay green because this is outside the mocked no-network suite, but the provider surface is not a complete live implementation. | Either implement metadata discovery or mark the command/provider as research-only/partial in the user-facing surface. |

### Verified good

- Clean-clone gap from 2026-06-11 is closed under the current structure contract: tracked `frame_backtester.{cpp,hpp}`, `scripts/classify_strategy_assets.js`, `scripts/mcp_stdio_probe.js`, `backend/api/tests/correlation_contract.test.js`, `.dockerignore`, notebook fixture set, and `notebooks/signal_library.json`.
- `graphify update .` refreshed graph context to `9635` nodes / `14796` edges / `747` communities, built from `973656a9`.
- Verification after the FW1 fix: `npm.cmd test` passed `431/431`.

### Remaining findings and fix plan

| Priority | Area | File / surface | Finding | Fix plan |
|---|---|---|---|---|
| P1 | Logic correctness | `backend/cli/commands/data/data.js:923`, `backend/cli/commands/data/data.js:1068`, `backend/cli/commands/data/data.js:1317` | Deep 5m commands mark a symbol OK when `fiveMBars.length > 0 || snapErrors.length === 0`. A silent empty provider response can report success with zero bars. Existing tests only cover zero bars with explicit errors. | Treat explicit backfill jobs as failed on zero target-timeframe bars unless the symbol is intentionally skipped/unsupported. Add crypto, equity, and five-min accumulate tests for zero bars with no errors. |
| P1 | Runtime algorithm | `shared/lib/data/backfill.js:61`, `shared/lib/data/backfill.js:71`, `shared/lib/data/backfill.js:77` | `fetchPaginated` always walks the full requested window backward from the requested end. It does not inspect existing ts-index coverage, so resume/backfill work refetches already-covered history instead of fetching only missing windows. | Add a gap planner that reads existing symbol/timeframe coverage, emits missing windows, and fetches only gaps plus a small forward-refresh window. Keep full-window mode available for forced rebuilds. |
| P1 | Runtime algorithm | `backend/cli/commands/data/data.js:453`, `backend/cli/commands/data/data.js:567` | `mass-backfill` accumulates all records across all jobs, then writes one large merged ts-index snapshot. This is memory-heavy and O(all history) at the end of every large run. | Persist per job or per symbol/timeframe incrementally, retain only counters/errors in memory, and make resumability explicit. |
| P2 | UI | `backend/cli/tui/manifest.js:164`, `backend/cli/tui/manifest.js:170`, `backend/cli/tui/manifest.js:176`, `backend/cli/tui/manifest.js:182` | TUI exposes dry-run defaults, but not estimated runtime, provider entitlement/cap warnings, current integrity state, or "serialize large backfills" guidance. FW3 15m/30m/1h/4h native-poll is not exposed because it is not implemented yet. | Add preflight summary metadata for long-running data commands, including estimated calls/windows, provider, dry-run/execute distinction, and integrity warnings. Add FW3 command once implemented. |
| P2 | Structure | `backend/scripts/data_ops/ingest_market_data/index.js` | Data ingestion remains a 1,982-line monolith spanning provider routing, derivation, quality filtering, persistence, and CLI orchestration. | Split by provider family and persistence boundary: crypto/equity-index/commodity/fx snapshot modules, `persist_snapshot`, and a thin orchestrator. Preserve current tests during extraction. |

### Verification from this pass

- `node --test tests/scripts/tests/crypto_5m_backfill.test.js tests/scripts/tests/equity_5m_backfill.test.js tests/scripts/tests/five_min_accumulate.test.js tests/scripts/tests/ml_dataset.test.js tests/scripts/strategy_backtest_contract.test.js` passed `56/56`.
- `node --test tests/scripts/tui_terminal_automation.test.js` passed `6/6`.
- The green tests cover current happy paths and explicit-error paths, but not the new silent-zero, Coinbase-routing, session-gap, intraday-cap, or gap-resume cases listed above.

---

## Blast-Through Audit — 2026-06-13 session 29 (Claude orchestrator)

Focused audit of the sessions 26-28 merge to `main` (commits `e232c4b5..51b20b6c`): FW3 intraday,
P3 equity session guard, P4 ML 5m cap, config alias. DCS 0.97. Suite baseline 438/438 (carried).

### P1 — P3 equity session guard is implemented but INERT (never called on any consumer path)
- `shared/lib/market/equity_session.js` `filterEquitySessionGaps` is correct and unit-tested (6/6),
  but `shared/lib/strategy/backtest.js` only **imports it (line 14) and re-exports it (line 1073)** —
  `runBacktest` / `filterFeatureFrame` never invoke it, and the ML dataset builder
  (`shared/lib/ml/dataset.js`) does not call it either. Grep proof: the only non-test references are
  the import + the re-export.
- **Impact:** the standing carryover "equity 5m session-gap guard BEFORE indicator/backtest
  consumption" is **NOT closed**. STATE.md / SESSION_MEMORY / handoff say "guard implemented (6 tests)"
  which overstates — the helper exists, the guard does not run. Equity intraday bars still reach
  indicators/backtests un-filtered.
- **Reviewer decision:** wire `filterEquitySessionGaps` into the equity branch of
  `filterFeatureFrame`/`runBacktest` (and/or the ml dump loader) gated on family=equities/indices +
  sub-daily timeframe, OR explicitly downgrade the docs to "helper available, integration pending."
- **Gate:** a backtest/feature-frame test that feeds pre/post-market equity bars and asserts they are
  dropped by the real consumer path (not the helper in isolation).

### P2 — `intraday_yahoo.js` fetch/records/aggregate functions are dead exports (test-only)
- `fetchYahooIntradayBars`, `candlesToRecords`, `aggregate1hTo4h` are referenced ONLY by
  `tests/scripts/tests/intraday_native_poll.test.js`. The production command `commandIntradayAccumulate`
  routes through `ingestMarketData({provider:'yahoo'})` → the pre-existing
  `selectYahooBase`→`fetchYahooBaseCandles`→`aggregateCandles` path, which already handled 15m/30m/1h/4h.
- The module's headline rationale — "Yahoo uses '60m' not '1h'" — is **empirically false**: a live probe
  of `^GSPC?interval=1h` and `?interval=60m` both return valid candles. The production path sends `1h`
  un-translated and works. So the `1h→60m` translation + the parallel fetch/aggregate logic are
  unnecessary duplication of `selectYahooBase` (4h→1h base) and `aggregateCandles`.
- The only production-consumed exports are the constants `SUPPORTED_INTRADAY_TFS` and
  `INTRADAY_MAX_DAYS` — and `INTRADAY_MAX_DAYS` **duplicates** `YAHOO_MAX_DAYS` in `constants.js`
  (both `{15m:60,30m:60,1h:730,4h:730}`; they will drift if one is edited).
- **Reviewer decision:** keep `intraday_yahoo.js` as the constants-only home (re-export
  `YAHOO_MAX_DAYS` instead of redefining) and delete the dead fetch/records/aggregate trio + their
  shape tests, OR actually route the command through this module and retire the duplicate index.js
  branch. Pick one owner for the Yahoo-intraday interval knowledge.

### P2 — `commandIntradayAccumulate` replicates the known silent-zero success pattern
- `backend/cli/commands/data/data.js:1725`: `const symbolOk = intradayBars.length > 0 || snapErrors.length === 0;`
  — identical to the P1 "silent empty provider → reported OK with zero bars" finding already filed
  above for `crypto/equity/five-min` deep commands. A symbol that returns no bars and no explicit
  error is counted as success.
- **Fix plan:** same as the existing silent-zero entry — an explicitly-requested job with zero
  target-timeframe bars and no skip reason should be a failure. Add a zero-bars-no-errors test for
  `intraday-accumulate`.

### P3 — `config/data_sources.yaml` root alias is a dead 208-line duplicate
- Commit `51b20b6c` added `config/data_sources.yaml` as a "backward-compat safety net" after a
  `crypto-deep-backfill` ENOENT. The commit message itself concludes the backend "already uses
  `config/markets/data_sources.yaml` correctly" and the ENOENT was "a stale process that had cached
  the pre-reorg path." Grep confirms **zero code reads the root path**.
- **Impact:** two full copies of `data_sources.yaml` now exist with nothing keeping them in sync —
  a future edit to canonical `config/markets/data_sources.yaml` silently leaves the root copy stale,
  and any code that later (re)acquires the root path would read drift.
- **Reviewer decision:** delete `config/data_sources.yaml` (the stale process was the real cause, and
  it is gone), OR if a safety net is genuinely wanted, replace the copy with a generated/symlinked
  artifact + a structure-contract test asserting byte-equality with canonical.

### P1 — Deep 5m depth was never generalized to coarser intraday timeframes (data-depth gap)
- The "all-the-way to inception" deep backfill is **5m-only**: `commandCryptoDeepBackfill` /
  `commandEquityDeepBackfill` hard-code `timeframe:'5m'`. Live bin evidence (`storage/data/ts/`):
  `BTCUSDT_5m.bin`=44.5MB (to 2017) but `_1h.bin`=420KB (~730d Yahoo native), `_15m.bin`=1.8MB (~1yr),
  and `_30m.bin`/`_4h.bin` are **stale from Jun 10** (untouched by sessions 25/28). Same shape for AAPL.
- The deep 5m is **not rolled up** into coarser bins, even though `aggregateCandles`
  (`ingest_market_data/index.js:394`) already does `5m→15m/30m/1h/4h`. Rollup is **lossless** (separate
  per-TF bins; 5m preserved; merge-protected write; coarser-from-finer so the synthetic-5m guard doesn't
  fire). No `intraday-rollup` command exists; `intraday-accumulate` even tells the user to "aggregate
  from 1h bars" for 4h but provides no way to do it.
- **Reviewer decision (approved):** add `intraday-rollup` to derive deep 15m/30m/1h/4h from the existing
  deep 5m for crypto + US equities; refresh the stale 30m/4h bins.

### P2 — shared/lib reorg shims are LOAD-BEARING, not dead (corrected 2026-06-13 s29)
- Initial hygiene sweep using only `require('.../shared/lib/<name>')` literal-grep reported the 8 root
  shims (`paths/ansi/indicators/backtest/backend_bridge/backfill/feature_builder/ai_client`) as dead
  or near-dead. **That was wrong.** Deleting them broke the suite via THREE resolution layers the
  literal grep missed:
  1. **Sibling-relative requires** inside `shared/lib/<subdir>/` — e.g. `shared/lib/ml/feature_builder.js`
     → `require('../indicators')`, `shared/lib/settings/user_settings.js` → `require('../paths')`,
     `shared/lib/compat/adapters.js` → `require('../backfill')`.
  2. **Subpath-import aliases** — `package.json` maps `#shared/*` → `./shared/lib/*.js`, so
     `#shared/ansi`/`#shared/ai_client`/`#shared/indicators`/`#shared/backtest` all resolve to the root
     shims (used by `trade.js`, `setup.js`, `module_loading.test.js`).
  3. **Compiled build artifacts** — gitignored `dist/mcp_server/lib/{bridge,agent_gate}.js`
     `require("../../../shared/lib/paths")` (compiled from the MCP TypeScript source).
- **Resolution:** shims restored; they are intentional compatibility re-exports, NOT dead code. Direct
  source callers WERE migrated to canonical category paths (14 literal sites + the relative + alias
  sites), so the shims now have fewer consumers, but they must stay until the `#shared/*` alias map and
  the MCP TS source are repointed and `dist/` rebuilt. **Durable lesson for the Hygiene Sweep:** a
  module is only "dead" if it has no consumer across literal requires, sibling-relative requires,
  `#shared/*`/subpath aliases, AND compiled `dist/` artifacts — grep all four before deleting.
- `config/data_sources.yaml` (the root yaml dup) WAS genuinely dead (0 readers across code + dist) and
  was deleted.

### Verified good this pass
- P4 ML 5m cap (`backend/cli/commands/research/ml.js`): clean — 100k default, `--max-rows-5m`
  override, `[VISIBILITY]` log; `ml_dataset` test updated 50k→100k. 27/27 on the touched test trio.
- `commandIntradayAccumulate` core: provider-pinned (`provider:'yahoo'`), real dry-run, `--days`
  validated against the TF cap, loud per-symbol `[VISIBILITY]` logging, dedupe via ts-index merge.
- No security findings in scope (no eval / dynamic require / secrets / exec in the changed files).
- Yahoo accepts `interval=1h` (live-verified) — production FW3 path is functionally correct.

#

## Focused Audit - 2026-06-15 session 35 (blast-through, anchor 483d45cc -> e0cb6aa2)

Tier 1 = the session-34 daemon/gate work. DCS 0.96. Hygiene sweep clean (no dup basenames, no dup
configs). Manifest↔handler parity OK (`backfill-daemon`, `clear-api-cache` both registered,
sovereign_cli.js:52/54). Priority guard verified correct; ingest freshness gate verified net-safe.

### FINDING (Medium, data integrity) — dead-symbol marker clobbers an existing bin's enriched meta
- **File:** `backend/cli/commands/data/data.js:1080-1089` (`commandCryptoDeepBackfill`, introduced
  `e0cb6aa2`, age <1d).
- **Finding:** the 0-bar "not found" marker is written with `fs.writeFileSync(<sym>_<tf>.meta.json, ...)`
  **unconditionally**, with no check for an existing `.bin`. If a crypto symbol that ALREADY has a real
  bin returns 0 bars from a deep backfill (transient Binance outage / 429 storm / temporary empty
  response, not a true delisting), the marker overwrites the real meta sidecar and strips
  `coordinate_id`, `config_market`, `config_sector`, and `derived_from`. The `.bin` (OHLCV) survives,
  but every subsequent `readTsIndex` of that symbol returns those enrichment fields as `undefined`
  until the next *successful* backfill rewrites full meta. If the symbol stays 0-bar, the loss is
  permanent for the retained historical bars.
- **Empirical proof (temp-dir probe, real writeTsIndex/readTsIndex):**
  `BEFORE -> coordinate_id: crypto:TESTUSDT | config_sector: Layer1 | count: 1`
  `AFTER  -> coordinate_id: undefined | config_sector: undefined | bin count: 1 | ohlcv intact: true`
- **Reviewer decision:** confirm the intended invariant — the not-found marker should only exist when
  there is genuinely NO bin (that is the case `readCoverage` keys on: `!existsSync(bin) && existsSync(meta)`).
- **Fix (S):** guard the marker write with the bin path — only write when the `.bin` is absent:
  `if (!fsSync.existsSync(path.join(DEFAULT_TS_DIR, \`${safe}_${baseTf}.bin\`))) { ...writeFileSync... }`.
  Semantically correct (a symbol with real bars is not "dead") and removes the clobber entirely.
- **Gate to clear:** add a regression test (existing enriched bin + 0-bar result → meta retains
  coordinate_id/config_sector; bin-absent + 0-bar → marker written) and re-run the data suite.

### Verified good this pass
- `shared/lib/market/coverage.js` (new): read-only, cheap header+tail probe, no security surface,
  8/8 tests. Minor cosmetic: the `count===0` *bin-present* return path omits the `notFoundCheckedMs`
  field that the empty/`exists:false` path includes — harmless (`isFresh` treats `undefined` as falsy).
- `writeTsIndex` PROVIDER_PRIORITY guard (`validation.js`, `74b0ec67`): correct. `rollupFromBase`
  (data.js:1914) stamps the base bin's provider, so crypto-derived coarser bins carry `provider:'binance'`
  (priority 3) and a yahoo poll (priority 1) cannot overwrite them. Equal-priority yahoo→yahoo falls to
  the new-wins-on-conflict merge (gaps still filled). `derived_from` round-trips through the meta sidecar.
- Ingest ts/bin freshness gate (`index.js`, `f405263c`): net-safe. It only fires when the snapshot check
  already set `skipItem=true`; a fresh bin `continue`s (same outcome as before), a stale bin flips
  `skipItem=false` to force a fetch — so the change can only *add* fetches or confirm an existing skip,
  never newly suppress one. On `isFresh` error it falls through to the provider (fail-open).
- `global.suppressLogs = true` in the daemon: established repo pattern (setup.js/run.js/strategy.js);
  the daemon owns its whole process, so never resetting it is correct, not a leak.

## Deep blast follow-up - 2026-06-15 session 35 (optimization + dead-code scan)

### RESOLVED — dead-symbol marker clobber (was Medium finding above)
- Fix applied at `data.js` (`commandCryptoDeepBackfill`): the not-found marker is now written
  **only when no `.bin` exists** (`if (!fsSync.existsSync(binPath))`). A 0-bar result for a symbol
  that already has bars is a transient provider failure, not a delisting — the guard stops it from
  stripping `coordinate_id`/`config_*`/`derived_from` off a real sidecar.
- Regression tests added to `coverage.test.js` (2): the not_found marker is honored for 7d then
  re-probed; a real bin always wins over a marker (count from header, marker ignored). 6/6 green.

### OPTIMIZATION — `backend integrity` 57s → 0.4s (144×), behavior-identical
- `runBackendIntegrity` (`backend/cli/commands/tools/backend.js`) looped `readTsIndex(sym, tf)` over
  every (symbol × timeframe), materializing the ENTIRE bin into record objects (a deep 1m crypto bin
  is ~525k objects + ISO-string conversions) only to read count + first/last timestamp.
- Swapped to `readCoverage` (header + two 8-byte head/tail reads, bin never loaded). Extended
  `coverage.js` with `firstBarMs` (one head read) so the coverage span (`from`/`to`) is available.
- **Verified:** live `backend integrity --json` 57,069 ms → 396 ms, same `ok:false` / 92 cached /
  4 stale. Per-bin equivalence probe over ALL 1009 real bins: `{bars, from, to}` from readCoverage ==
  readTsIndex, **0 mismatches**. Full suite 467/467. Also removed a pre-existing unused `firstTs` var.

### BACKLOG (low) — shared/lib over-exports (public-surface bloat, NOT dead logic)
- A scan of every `shared/lib/**/*.js` export vs all tracked `.js`/`.ts` found **94 exported names
  with zero external importer**. Spot-checks (isValidTimestamp, bollingerBands, executeTool,
  readTsSources, buyHoldBenchmark) all show the function is alive — called 3-4× *within its own
  module* — but the `module.exports` entry has no consumer. These are unnecessary exports, not dead
  code; the functions must NOT be deleted.
- Caveat (four-layer rule): the raw list mixes in known false-positive classes — MCP exports
  (`mcp/agent.js`, `mcp/gate.js`) can be consumed via compiled `dist/` (gitignored, not in the scan),
  and root shims re-export whole objects without naming members. Any prune must verify per-item across
  literal/sibling/alias/dist layers and re-run the suite. Recommend a dedicated debt-clearing pass
  (trim export lists only, keep all function bodies); not done this session.

#### UPDATE (same session) — bulk prune attempted, REVERTED; only the 1 genuine dead export removed
- **Removed (kept):** `market/polymarket_features.js` redundant alias `generatePolymarketFeatures:
  buildPolymarketFeatureRows` — the real fn `buildPolymarketFeatureRows` stays exported and is what
  `polymarket_history.js` + the test actually import. Safe, suite green.
- **Attempted + REVERTED:** a regex-driven prune of the 87 non-MCP over-exports broke
  `indicators.manifest_parity.test.js`. **DURABLE LESSON:** an exported name frequently ALSO appears
  in a *second internal object literal* in the same file (here `bollingerBands` is a member of the
  `IndicatorMethods` registry that drives manifest-mode feature computation, not just `module.exports`).
  A line-oriented "remove the line matching NAME" removed the FIRST match (the `IndicatorMethods`
  member), silently corrupting the internal registry while leaving the export intact → `bollinger_*`
  feature keys vanished. **Conclusion:** trimming `module.exports` members safely requires AST-scoped
  editing (only the `module.exports` object node), not text/line matching. Given these exports are
  provably harmless (zero importers) the cost/risk isn't worth a hand pass — left as backlog. All 30
  bulk-touched files reverted to HEAD; suite restored to 467/467.

#### Rigorous testing pass (same session)
- Refactored the marker write into an exported, tsDir-injectable helper `writeDeadSymbolMarker(tsDir,
  symbol, tf, family, provider)` (data.js) so the clobber guard is tested through the REAL function,
  not a copy. `commandCryptoDeepBackfill` now records `entry.marker_written`.
- New `tests/scripts/tests/dead_symbol_marker.test.js` (2): (a) no-bin → marker written, readCoverage
  sees not_found, isFresh skips 7d then re-probes; (b) bin-present → write REFUSED (returns false),
  readTsIndex still returns coordinate_id/config_sector for all bars (clobber fix proven end-to-end).
- New `tests/scripts/tests/integrity_coverage_equivalence.test.js` (1): adversarial bins the 1009 real
  bins don't cover — single-bar (firstBarMs===lastBarMs), empty-header (count 0), meta-only marker,
  truncated (header says 10, file holds 2), and absent symbol — proving the integrity readCoverage path
  derives `{bars,from,to}` byte-identical to the old readTsIndex path (or skips identically) on every branch.
- Gate: **suite 470/470** (was 467; +3). Live `backend integrity --json` re-run post-refactor: 383 ms,
  ok:false / 92 cached / 4 stale (unchanged). All shared/lib + data/daemon modules load.

## Blast-Through Deep Review — 2026-06-23 session 58 (order-placement surfaces, all 3 brokers + C++ core)

Scope: "Full ledger sweep" driven inline (user choice). Anchor `0903df6b` → HEAD `1c7227b7`. Deep-traced
every live-order path across TradFi/Alpaca, crypto/Gate.io, prediction-markets/Polymarket, plus the new
`shared/lib/runtime` Alpaca bot code (author-only reviewed until now) and a lightweight `backend/core`
(C++) build/ctest/stub pass. DCS 0.96 start → 0.97 end. **No gating findings** (no unauthenticated
exploit, no crash-on-first-use). Findings are risk-control gaps + one PIN exposure on the new live path.

### Findings (recency order, severity-ranked)

| Priority | Area | File:line | Finding | Fix | Gate |
|---|---|---|---|---|---|
| **Medium-High** | Alpaca bot | `backend/cli/commands/strategy/strategy.js:880-898` + `shared/lib/runtime/alpaca_bot_cycle.js:33-60` (commit `17f565fb`, <1 day) | **`maxPositions` is never enforced.** `state.config.maxPositions` (default 10) is displayed by `auto-trade status` as `positions.length/maxPositions`, implying a cap, but neither `runAutomationPass` nor `recordAlpacaEntry` ever checks `state.positions.length` before opening a new LIVE position. An unattended loop can open unlimited concurrent live positions, exceeding its own configured concurrency limit. | Gate entry in `runAutomationPass` before the `commandTrade` buy (or have `recordAlpacaEntry` refuse + signal) when `state.positions.length >= config.maxPositions`. | Decision: implement cap |
| **Medium** | PIN exposure | `backend/cli/commands/trade/trade.js:325` → `shared/lib/runtime/backend_bridge.js:68-101` | **Trade PIN leaks into the gateway subprocess command line.** `commandTrade` appends `--pin <SECRET>` to `args` (so the in-process gate at :293-310 can read it), then passes the *same* `args` to `buildTradeGatewayLaunch(args)`, which spawns the gateway (on win32 as a `powershell.exe -Command "& 'tsx' 'index.ts' … '--pin' 'SECRET'"` string) including the PIN. The PIN is then visible in OS process listings (`tasklist`/`Get-CimInstance Win32_Process`/`ps`). The gateway never even consumes `--pin` (the gate is JS-side), so it is a pure leak. Applies to both the auto-bot entry and exit sells. | Strip `--pin` and its value from `args` before `buildTradeGatewayLaunch(args)`. One fix point covers entry + exit + manual trades. | Decision: strip before spawn |
| **Medium** | Alpaca bot | `shared/lib/runtime/alpaca_bot_cycle.js:33-59` (commit `17f565fb`) | **Entry records requested qty, not the broker's filled qty.** `recordAlpacaEntry` deliberately re-queries the broker for `fillPrice` (`brokerPos.averagePrice`) — correct — but still records `qty: Number(qty)` from the *request*. On a partial fill the tracked qty exceeds the real holding; the later exit sells `position.qty`, which can exceed the holding → broker oversell rejection, and the position never cleanly clears via this path. `brokerPos` is already in scope. | `qty: brokerPos ? Number(brokerPos.quantity) : Number(qty)`. | Decision: reconcile qty |
| **Medium** | Alpaca bot | `shared/lib/runtime/alpaca_bot_cycle.js:85-117` + `strategy.js:826-905` (commit `17f565fb`) | **Same-symbol stacking → exit oversell.** No check against an already-tracked/already-held position before a new entry (each new bar yields a new `signalId`, so repeated buys of the same symbol create multiple tracked positions). The exit loop then sells each tracked position's `position.qty` independently against the *same* cycle-start broker snapshot, so two AAPL positions can try to sell more than the broker actually holds. Compounds the qty finding above. | Reconcile exit sell to `min(position.qty, brokerPos.quantity)` and/or dedup entries per symbol (skip entry if symbol already tracked/held). | Decision: cap exit qty |
| **Low** | Alpaca bot | `alpaca_bot_cycle.js:92,119` | Realized P&L uses the pre-sell snapshot price (`marketValue/quantity` from the start of the cycle), not the actual exit fill. Logging-only, no capital impact. | Optional: re-query fill after the sell for accurate `realizedPnl`. | Informational |
| **Low/Info** | C++ core | `backend/core` ctest | `kronos_integration_test` fails: "Not enough empirical data points for Kronos test (need at least 4)" — a data-availability failure in an integration test, not a code regression. 28/29 ctest green, including all order-relevant tests (`kill_switch`, `execution`, `portfolio_risk`). Build is current and compiles. | Seed ≥4 Kronos data points for the integration fixture, or mark it as requiring data. | Informational |

### Verified-good (no action)
- **Gateway single-order failure propagates a non-zero exit code** (`index.ts:2054-2057` sets
  `process.exitCode = 1` on `FAILED`/`RISK_REJECTED`). This is what makes the bot's reliance on
  `commandTrade`'s return code safe: a failed live buy is NOT recorded as a phantom tracked position,
  and a failed live exit sell keeps the position tracked (`alpaca_bot_cycle.js:107-116`). Good.
- **Risk-engine fails closed** (`RiskEngineBridge.checkRisk`, `index.ts:610-690`): missing/non-exec
  binary or an engaged global kill-switch rejects the order in LIVE mode; the dry-run bypass is explicit
  and guarded by `LIVE_TRADING!=='true' && !--live`. Good.
- **PIN gate fails closed** (`trade.js:292-323`): unattended LIVE without `SOVEREIGN_TRADE_PIN` returns 1.
  The gate runs on BOTH entry and exit because both call `commandTrade` in-process (not via a CLI spawn
  that would bypass it). Good.
- **Alpaca 422 fix intact** (`index.ts:497-504`): fractional equity orders forced to `time_in_force:'day'`.
- **New runtime tests green**: `alpaca_bot_cycle.test.js` + `alpaca_bot_state.test.js` = 11/11 (`node --test`).
  (Note: `npx jest` falsely "fails" these — jest mis-parses node:test files; always use `node --test`.)

### Section 3 stub/duplicate sweep
- Duplicate basenames resolved for all order-relevant modules. The `shared/lib/<name>.js` 1-line entries
  (`backend_bridge`, `paths`, `env`, `execution_memory`, `config_loader`, `persistence_bridge`,
  `run_loop`, `polymarket_history`) are **thin re-export shims** over the real impls in
  `shared/lib/runtime/` (or `market/`) — migration layer, NOT dead (same class as the `polymarket_history`
  false-positive from session 55; left intact). `docs/guide/examples/minimal_sovereign/.../config_loader.js`
  is an isolated doc-example copy. No new dead shims, no divergent forks, no reachable stubs found on the
  order-placement paths.

### Grades (this pass)
- `shared/lib/runtime` (Alpaca bot): **B** — clean, well-structured, mirrors the Polymarket `bot_state`/
  `cycle` shape, fully tested (11/11); held below A by the unenforced `maxPositions` cap + the
  requested-vs-filled qty reconciliation gaps (both real on a live-capital path).
- `backend/gateway`: **B+** — robust exit-code propagation, fail-closed risk engine, validated proposed
  orders; the PIN leak lives in the CLI wrapper, not the gateway.
- `backend/cli` (trade/strategy live paths): **B** — PIN-in-argv leak + the bot entry/exit reconciliation.
- `backend/core` (C++): **B** — lightweight pass: builds, 28/29 ctest green, 1 data-dependent test fail,
  no obvious stub/dead code on the order path. First real stamp in the ledger.

### Next debt-clearing move (not a feature)
Implement the `maxPositions` cap + the two qty-reconciliation fixes in `alpaca_bot_cycle.js`/`strategy.js`
(one focused commit, all on the brand-new code), and strip `--pin` from the gateway launch args in
`commandTrade` (one-line, covers all three live paths). These four are the highest-value, lowest-risk
fixes and all sit on code touched this/last session.

### ✅ FIX-PASS CLOSEOUT — 2026-06-23 session 58 (commit `cf4f7026`)
All four findings above are **RESOLVED**, plus the 5th TUI item found mid-pass:
- **#1 maxPositions** → pure `canOpenPosition()`; `runAutomationPass` gates live entries against the
  post-exit count + `config.maxPositions`, increments per recorded entry.
- **#2 PIN leak** → exported `stripFlagValue(args,name)` (`utils.js`); `commandTrade` sanitizes args before
  `buildTradeGatewayLaunch`. PIN no longer reaches the gateway argv.
- **#3 entry qty** → pure `resolveEntryQty(brokerPos, requestedQty)` records the broker's filled qty.
- **#4 exit oversell** → pure `resolveExitQty(positionQty, availableQty)` + per-symbol `availableBySymbol`
  counter; skips firing when ≤0.
- **#5 (TUI)** → "Positions" manifest entry gained a `--live` toggle so its P&L reads the live account.
Verified: suite **616/614/0fail/2skip** (+11 tests), manifest-sensitive tests 39/39, hygiene clean.
Grades: `shared/lib/runtime` B→**A**, `backend/cli` B→**B+**.
**Remaining (non-gating, not yet done):** Gate.io spot market-order semantics (`index.ts:309-319`) want one
empirical paper probe — covered at the gateway-execute level but not line-audited; realized-P&L pre-sell
snapshot price (logging only); C++ `kronos_integration_test` needs ≥4 seeded data points.
# Always-On Runtime Freshness Audit - 2026-07-10

## Pre-Live Decisions

- **HIGH - supervised portfolio/risk monitoring was absent from Compose.** This pass adds an opt-in
  read-only `portfolio-monitor` service, plus host-health and host-backup profiles. The live broker
  reconciliation paths are still separate and still gated; do not treat the new monitor as a trading
  stop-loss engine.
- **MEDIUM - source freshness outside the candle universe is still selective.** `backfill-daemon`
  covers crypto/equities/indices/commodities/fx, and this pass adds an opt-in bounded
  `polymarket-research` archive profile. Macro/PMI/onchain/holdings/sentiment families remain
  unscheduled unless they become operationally required.
- **MEDIUM - model/report regeneration is manual.** Fresh bars update scorecard calculations, but do not
  retrain models or regenerate every cached model/backtest signal report. Define weekly/monthly or
  drift-triggered retraining with validation and explicit promotion; do not retrain continuously.
- **MEDIUM - alerts/backups are partially addressed, but not supervised end-to-end.** `host-health` and
  `host-backup` now exist as opt-in profiles, but there is still no full alerting pipeline, broker-state
  reconciliation alert, or centralized incident feed for unattended live operation.
- **INFORMATIONAL - Polymarket order-book history is still bounded by scope.** Live orderbook lookup and
  orderbook-lite archive commands exist, and the new research scheduler only records explicitly scoped
  active tokens. Keep full-universe L2 capture off by default.

## Mass-Implement Closeout - 2026-07-11

The session-69 findings were converted into code and verified:
- `portfolio-monitor` now reads the real `{live, live_paper, paper}` aggregate and fails closed on
  malformed payloads.
- `host-backup` now uses bounded retention, provenance-scoped pruning, and a distinct retention-only
  exit code so Compose can distinguish retry-worthy prune failures from publish failures.
- The false cross-container PID liveness check is gone; host health now relies on freshness checks that
  are local to the container.
- `polymarket-research` now fails visibly when it has nothing to capture, rather than idling as a
  silent retry loop.
- Compose env ownership/docs/contracts were tightened, including the quoted backup destination in the
  host-backup loop.

Grade-factor movement:
- Runtime safety moved up: backup growth is bounded, pruning is provenance-scoped, and backup failures
  no longer masquerade as success.
- Deployment contract confidence moved up: the Compose contract now asserts the new profile behavior and
  backup loop wiring directly.
- Operational truthfulness moved up: research/profile and monitor surfaces now fail closed instead of
  looking healthy while doing nothing.

Verification:
- focused Node tests for host maintenance, host-backup CLI, portfolio monitor, Polymarket scheduler /
  history archive / orderbook / portfolio aggregate, and the deployment manifest contract
- `npm run hygiene`
- `node --check` on touched JS entrypoints
- `./node_modules/.bin/tsc -p backend/gateway/tsconfig.json --noEmit`

Residuals:
- Docker is not available here, so rendered Compose validation still needs a Docker host.
- The repository still has one unrelated dashboard TUI failure in the full suite.
- `graphify` remains unavailable in this environment.
## Mass-Implement Follow-up - 2026-07-11 - Native Backend Availability

Closed a runtime contract mismatch that made the compiled C++ backend appear unavailable. The
single-config CMake output path is now discoverable, the package/README build contract is aligned,
and completed native child results are not rejected solely because Node also supplied a post-run
spawn error. This improves contract truth, runtime availability, and verification without changing
C++ behavior.

Evidence: `npm run native:build` passed; human and JSON `backend status` both report OK; focused
binary-discovery, toolchain, and backend-bridge tests passed; hygiene and diff checks passed. Native
CTest remains 28/29 with only the existing Kronos insufficient-data failure. `graphify` unavailable.
### Blast-Through Triage - 2026-07-11 session 70 follow-up

DCS 0.91->0.91. Hard Reading Mode, triage scope. The current score remains below the 0.95
promotion threshold because verification coverage is still the weakest factor. No production data
was transformed in this audit.

| Priority | Area | Evidence | Finding | Gate |
|---|---|---|---|---|
| **Medium** | Polymarket cockpit contract | `tests/scripts/integration/polymarket/cockpit_polymarket_merge.test.js:24-31`; `backend/gateway/src/polymarket_portfolio.js:50-59` | The full suite's recorded dashboard-adjacent failure is a stale synthetic assertion, not a production valuation regression. The aggregate intentionally defines Polymarket equity as pUSD cash plus marked position value, so the fixture is worth `12.5 + 0.5 = 13`; the test still expects `12.5`. Direct run reproduces 1/7 failed. | Update the assertion to 13 and state the cash-plus-marked-position invariant; rerun the focused file and full suite. |
| **Medium** | Reserves ingestion test isolation | `tests/scripts/architecture/data_storage/macro_ingestion_contract.test.js:16-121,167-204`; `backend/scripts/data_ops/ingest_market_data/manifests.js:1-13` | The reserves contract stubs `fetchWorldBankHistory`, but the harness clears only the ingest index modules, not cached `manifests.js`, whose top-level destructuring retains the real provider function loaded during the preceding macro test. The test therefore reaches the real World Bank path, accumulated 2 provider errors, and took 171 seconds in the full suite. This is a non-hermetic test-harness defect; the transform assertions themselves were not disproved. | Include `manifests.js` in cache save/clear/restore or inject providers without module-cache mutation. Focused file must pass offline with zero provider calls and the full suite must no longer perform the 171-second reserves wait. |
| **Medium / roadmap** | User-visible ingest stubs | `backend/scripts/data_ops/ingest_market_data/manifests.js:48-68,142,154-173`; `tests/scripts/data/ingest/ingest_manifest_contract.test.js:13-39` | Six enabled families still terminate at explicit `not_implemented` adapters. This is honest and tested, not silent synthetic data, but the CLI/config surface still advertises unavailable lanes. `ingest --family pmi --dry-run --json` was read-only (`sources:0`, `errors:0`) while advertising 4 planned fetches. | Disable or label the six families in user-facing selection, or implement the adapters; verify each unavailable family fails fast before provider/persistence work. |

**Dismissed false positives:** the full suite was not hanging in the dashboard path; it continued
through live-shaped ingestion and completed at 699 tests / 695 pass / 2 fail / 2 skip. The native
Kronos failure also reproduced exactly as documented: its empirical fixture has fewer than four
bars, while the native baseline remains 28/29; this is fixture availability debt, not evidence of a
C++ runtime regression. The ingest dry-run contract passed and performed no writes.

**Verification used:** full `npm test`; focused/direct cockpit and macro-ingestion contract runs;
focused ingest manifest contract; live CLI dry-run plan; single-test Kronos CTest; direct reads of
the production aggregation, ingest manifest, test harness, and Kronos fixture loader. `graphify-out/`
is absent, so no graph map was available.

**Next cleanup move:** repair the two deterministic test contracts first so the full suite becomes a
trustworthy gate again; then decide whether the six ingest families are disabled roadmap entries or
active implementation commitments.

### Mass-Implement Closeout - 2026-07-11 session 70 follow-up

DCS 0.91->0.95. Verification coverage recovered while freshness and schema claims were left
unchanged.

- **Closed:** Polymarket cockpit synthetic equity now asserts the production invariant: pUSD cash
  plus marked position value (`12.5 + 0.5 = 13`).
- **Closed:** the macro/reserves harness now saves, clears, and restores `manifests.js` with the
  provider cache. The full-suite reserves path produced 9 rows (3 countries x 3 metrics), zero
  provider errors, and completed in milliseconds instead of reaching the real World Bank provider.
- **Closed:** the six unavailable ingest families have one canonical availability contract. Direct
  live calls fail fast with structured `not_implemented`, dry-run plans zero fetches, all-family runs
  skip them, and neither TUI offers them as runnable choices. Existing `onchain_data` feature-gate
  precedence is preserved.

Grade-factor movement: verification and contract truth improved; ingest path clarity improved from
B- to B. No synthetic provider implementation was added.

Verification: focused contracts 4/4 files green; direct live/dry-run PMI probes matched the expected
exit and payload contracts; `npm run hygiene` passed; scoped `git diff --check` passed; full suite
701 tests / 699 pass / 0 fail / 2 skip in 27 seconds.

Remaining highest-impact gap: implement real adapters for the six unavailable families only when
provider contracts, credential policy, normalization schema, and representative fixtures are defined.

## Connective-Tissue Production Readiness Audit - 2026-07-11 session 73

Mode: `connective-tissue`, Hard Reading Mode. Refined objective: determine whether the active
production paths are trustworthy enough for real trading decisions by verifying execution gates,
data provenance/freshness, user-data boundaries, UI truthfulness, and dangerous or incomplete stubs.
No production code was changed in this audit.

### Findings

| Priority | Classification | Area | Evidence | Finding | Clearance gate |
|---|---|---|---|---|---|
| **P0 / gating** | **Dangerous** | Polymarket execution | `backend/cli/sovereign_cli.js:83`; `backend/cli/commands/trade/trade_polymarket.js:584-603,770-779`; `backend/gateway/src/index.ts:1923-1926,2523-2532`; `README.md:98-102` | Top-level `polymarket buy/sell` reaches a real CLOB submit without requiring `--live`, Supabase auth, the trade PIN, runtime-mode approval, or the C++ risk engine. The Polymarket feature flag is checked at the CLI wrapper, but direct gateway invocation bypasses even that. The README claim that all live paths use PIN + `ai_agent_trading` + fail-closed risk is false for this path. | Route every order through one execution guard. A subprocess contract test must prove CLI and direct gateway buy/sell reject without explicit live authorization, PIN/auth handoff, enabled feature/runtime mode, and an approved risk result; no broker call may occur on rejection. |
| **P1 / gating** | **Dangerous** | Public API filesystem boundary | `backend/api/app.js:138-152`; `backend/api/server/routes/market/signal.js:1-7`; `backend/api/server/routes/data/data_summary.js:1-7`; `backend/api/server/routes/market/correlation.js:1-7`; `backend/api/server/services/cli_executor.js:261-274,357-396,424-479,679-731,791-810,920-957` | Public GET routes accept caller-controlled `input`, `model_report`, and `backtest_report` paths. The data-summary fallback spreads and returns complete input records, so a readable JSON file with a `sources`/`records`/`bars`/`data` array can cross the HTTP boundary. Cache keys also omit input/timeframe/limits on several routes, allowing response mixing for five seconds. | HTTP contract tests prove path parameters are ignored or restricted to canonical allowlisted artifacts, public routes cannot read arbitrary files, and cache keys include every response-shaping parameter. |
| **P1 / gating** | **Dangerous** | Browser/admin authorization | `Frontend/dashboard/src/lib/api.ts:6-43`; `Frontend/dashboard/src/components/panels/BotPanel.tsx:42-79`; `backend/api/app.js:136-159`; `backend/api/server/routes/bot/bot_cycle.js:1-9`; `backend/api/server/routes/bot/bot_sell.js:1-9` | `VITE_API_TOKEN` is compiled into browser JavaScript, while bot cycle/sell routes trust that shared token and do not verify the Supabase user. Any dashboard user who receives the bundle can recover the admin-style token and invoke protected bot mutations. | Remove browser-held server secrets. Mutating routes must authenticate the Supabase bearer token, authorize the user/action server-side, and use a server-only execution credential. Multi-user tests must prove one user cannot operate another user's bot or orders. |
| **P1 / gating** | **Incomplete, fail-closed** | Decision data | Local probes: model report generated `2026-06-21`; latest backtest `source_mode: sample`, zero trades; scorecard 36/36 crypto symbols excluded; backend integrity `ok:false`, 15 stale symbols and 9 grain suspects | The current checkout is not usable for real trading decisions. The scorecard correctly returns no rows, and signal schema v2 correctly expires all candidates, but the fallback correlation path still returns `ok:true` with an identity matrix and `sample_size:0`. Its standalone contract fails against the canonical snapshot and is not executed by `npm test`. | Freshness/integrity must be green for the requested horizon; model and out-of-sample reports must be regenerated from live data; non-empty sample/trade floors must be enforced; `npm test` or `verify:strict` must execute the API correlation contract. |
| **P1** | **Dangerous UI** | Operational-state truth | `Frontend/dashboard/src/components/layout/TopBar.tsx:14-38,93-99`; `Frontend/dashboard/src/components/layout/Sidebar.tsx:5-24,179-217` | The global green `LIVE` badge is hardcoded. Safety state only reacts to future realtime `risk_rejected` events and never hydrates the current kill switch. Circuit-breaker, max-drawdown, execution-mode, provider/model/timeframe, and ingest controls are decorative or local-only. The interface can imply a backend state that was never established. | Replace decorative controls with read-only labeled placeholders or wire them to authenticated state. Browser tests must cover disconnected, stale, paper, live, and kill-switch-engaged states. |
| **P1** | **Incomplete** | Signal review UI | `Frontend/dashboard/src/components/panels/SignalPanel.tsx:52-62`; `Frontend/dashboard/src/pages/LoginPage.tsx:23,32` | Standalone frontend type-checking fails. `SignalPanel` serializes undefined `signalIds` instead of `selectedIds`, so recording a review throws before the request. Two React namespace errors also remain in login handlers. Vite emits JavaScript because it does not type-check. | `npm run lint --prefix Frontend/dashboard` passes and an interaction test proves selected fresh signal IDs reach the authenticated review route. |
| **P1** | **Dangerous under concurrency** | Time-series persistence | `shared/lib/market/validation.js:739-788,826-911`; session-72 concurrency note in `workspace/SESSION_MEMORY.md` | Atomic temp names and flush-before-count make one writer crash-safe, but there is no per-bin writer lock. Two appenders, or an append racing an overlap rewrite, can read the same old count/state and lose or overwrite each other's data. | Add a per-bin cross-process lock or single-writer queue and adversarial overlap tests covering append/append and append/merge races. |
| **P2** | **Stale/incomplete** | UI and Rust surface bloat | `Frontend/dashboard/src/App.tsx:9-21`; dead legacy shell files under `Frontend/dashboard/src/components`; `backend/cli/src/main.rs:28-55`; `backend/cli/Cargo.toml:1-22` | Dashboard loads every panel eagerly and retains a second unused shell. Production bundle is one 945.88 kB JS chunk (270.94 kB gzip). The Rust CLI has 30 files/883 lines, 22 files under 20 lines, and explicitly returns `mirrored-contract-only`; it adds a parallel dependency-heavy surface without operational execution. | Delete/archive unused React shell files, lazy-load major panels, and set a bundle budget. Either define funded Rust parity milestones or move the mirror out of the production CLI tree and dependency story. |
| **P2** | **Incomplete safety** | Destructive maintenance | `backend/cli/commands/data/data.js:1086-1163`; `backend/cli/tui/manifest.js:178-183` | The TUI defaults cache clearing to dry-run, but direct `clear-api-cache --ts` can delete all 4.1 GB of canonical bins without an interactive confirmation, backup check, or typed scope acknowledgement. | Require explicit destructive confirmation for all-bin deletion, print exact count/bytes first, and add a restore/backup prerequisite or immutable quarantine path. |

### Orphan and stub matrix

| Surface | Classification | Evidence / decision |
|---|---|---|
| Six unavailable ingest families | **Intentional** | Canonical `not_implemented` metadata, zero dry-run fetches, all-family skip, and TUI omission are tested. Honest roadmap gap, not synthetic production data. |
| `searchTradingViewScreener` | **Stale** | Explicit stub warning/empty return in `shared/lib/providers/tradingview.js:75-85`; no non-definition consumer found. Remove the export or create a real owned caller. |
| React legacy `Shell` / `SideBar` / `TopBar` / `DashboardPanel` | **Stale** | Only the legacy shell imports its paired components; active `App.tsx` uses `components/layout/*`. Four files plus legacy CSS add dead maintenance surface. |
| Rust CLI mirror | **Incomplete** | `main.rs` labels every matched command `mirrored-contract-only`; package scripts and runtime use Node. Keep only with an explicit parity plan. |
| API `local_fixture` fallbacks | **Dangerous** | Callable production fallbacks report `ok:true`, fixed zero quality errors, and sometimes zero-sample identity data. They must not be presented as live decision data. |

### Grades

| Section | Grade | Reason |
|---|---|---|
| `backend/cli` execution | **D / gated** | Active Polymarket live-order bypass and parallel Rust mirror bloat. |
| `backend/gateway` | **D / gated** | Alpaca execution risk path is structured, but direct Polymarket submit bypasses the shared execution/risk gateway. |
| `backend/api` | **D / gated** | Public caller-controlled file paths, incomplete cache keys, and browser-shared mutation token boundary. |
| `Frontend/dashboard` | **C- / gated** | Misleading decorative safety controls, broken signal-review action, dead shell, failed type-check, and oversized single chunk. |
| `shared/lib/market` persistence | **B- / gated for concurrent writers** | Strong single-writer atomicity/equivalence tests; no cross-process serialization. |
| `supabase` local schema | **B+** | Own-user RLS exists for orders/audit/private tables; remote migration/policy state was not verified in this offline pass. |

### Verification evidence

- `npm test`: 706 tests, 704 pass, 0 fail, 2 skip.
- Standalone API contracts: 3 pass, 1 fail; weekly/monthly correlation fails at `sample_size > 0`.
- Polymarket preflight: passes outside the sandbox; sandbox-only nested spawn failure dismissed.
- Frontend build: passes, 2,413 modules, one 945.88 kB JS chunk; chunk-size warning emitted.
- Frontend `tsc --noEmit`: fails with three errors, including undefined `signalIds`.
- Gateway `tsc --noEmit`, hygiene, secret scan (829 files / 0 violations), and scoped diff check: pass.
- Data: 1,012 ts-index bins / 4.1 GB; 92/92 configured symbols cached, 15 stale, 9 grain suspects; scorecard 0/36 eligible.
- `graphify-out/` is absent, so graph refresh/connectivity evidence was unavailable.

### Next cleanup move

Close the P0 Polymarket execution bypass first, then remove caller-controlled API paths and browser-held
admin tokens. Do not promote real-money decisions while those gates or the current freshness/integrity
failures remain open.

## Connective-Tissue Follow-up - 2026-07-11 session 73 - remaining sections and language boundary

Mode remains `connective-tissue`, Fast Reading Mode. This pass reviewed native risk, ML/model naming,
MCP, Supabase alerting, deployment variants, package dependencies, and the C++/Rust/JS ownership split.
No production code or data was changed. The carried DCS remains 0.95; promotion remains halted by the
security/execution gates and live `backend integrity: ok=false`, which DCS does not override.

### Additional findings

| Priority | Classification | Area | Evidence | Finding | Clearance gate |
|---|---|---|---|---|---|
| **P0 / gating** | **Dangerous** | Native risk contract | `backend/gateway/src/index.ts:653-667`; `backend/core/src/main.cpp:599-630`; `backend/core/src/risk/pre_trade_risk.cpp:7-34` | Gateway notional is `(order.price || 0) * quantity`. Market orders deliberately omit price, so live market orders reach C++ risk with zero notional and pass concentration checks. The denominator called `volatility` is actually a static env proxy defaulting to 50,000, while drawdown defaults to zero; neither is hydrated from the broker portfolio. Direct probe confirmed `notional=0` is approved. | Preflight must resolve a bounded executable price and current portfolio equity/exposure/drawdown from broker state, reject missing/stale inputs, and test market and limit orders through the real JS-to-C++ boundary. |
| **P1 / gating** | **Dangerous decision labeling** | ML/model comparison | `shared/lib/ml/models.js:78-255,352-410`; current `storage/data/models/latest_model_comparison.json` | `cnn_window_v0`, `xgboost_ranker_v0`, random forest, SVM, LSTM, Transformer, etc. are hand-coded deterministic formulas, not trained instances of those algorithms. `compareModels()` ranks only these adapters; the real ONNX candidates are excluded. Reports and UI can therefore present architecture names and a "winner" that imply training which never occurred. Current per-symbol winners also use samples as small as one trade. | Rename adapters as heuristics/baselines, exclude them from ML promotion, add minimum OOS trade/sample floors, and make the promoted model report include only versioned trained artifacts with dataset/model hashes. |
| **P1** | **Incomplete / unsafe default** | MCP research and execution | `backend/mcp_server/tools/run_backtest.ts:5-38`; `backend/mcp_server/tools/polymarket.ts:21-94`; `backend/mcp_server/package.json:11-17` | MCP backtests default `allow_degraded=true`, reversing the CLI's fail-closed research default. MCP live Polymarket adds confirm/feature checks but forwards into the already-gated direct Polymarket path without PIN or native risk. The MCP SDK is declared as `latest`, making clean installs non-reproducible. | Default degraded research to false, pin MCP dependencies, and prove all MCP live tools terminate at the same centralized execution authorization/risk gate. |
| **P1** | **Stale / broken** | Deployment variants | `infra/deployment/kubernetes/deployment.yaml:21-46`; `infra/deployment/terraform/main.tf:76-83`; `infra/deployment/heroku/Procfile:1`; `infra/deployment/heroku/app.json:22-24` | Kubernetes, Terraform, and Heroku launch `web/app.js`, which does not exist. Kubernetes also injects a Supabase secret key into the web pod. The deployment contract checks port/secret strings but never checks the command path. Docker Compose is the only aligned runtime. | Retire the variants or generate them from the Docker contract; assert the real `backend/api/app.js` entrypoint, least-privilege secrets, health command, storage mounts, and native binary availability. |
| **P2** | **Incomplete** | Supabase risk alert | `supabase/functions/risk-alert/index.ts:5-30`; `supabase/migrations/202605280001_risk_alert_trigger.sql:5-40` | The Edge Function only logs; Slack/email/webhook delivery is commented out. The SQL trigger only raises a database notice because `net.http_post` is commented out. This is a scaffold, not an alerting system. | Choose and test one real authenticated delivery channel with retry/idempotency, or remove alerting claims and classify the files as examples. |
| **P2** | **Stale/overbuilt** | C++ execution and strategy shells | `backend/core/src/execution/live_broker_adapter.cpp:7-29`; `backend/core/src/strategies/{spot_only,spot_futures_arb,options_trading}.cpp`; nine `placeholder.hpp` files | The live broker adapter always rejects and has only a test consumer. Three compiled strategy evaluators are toy formulas consumed only by a C++ test. Nine three-line placeholder headers have zero consumers. These are compiled future architecture, not active runtime capability. | Remove placeholder aliases and move test-only/reference strategies out of the production library, unless an active CLI/API consumer and ownership plan are added. |
| **P2** | **Dependency bloat** | Node package roots | `Frontend/dashboard/package.json:13-38`; `backend/api/package.json:10-15` | Dashboard source has no use of `@google/genai`, Express, dotenv, Motion, `@types/express`, autoprefixer, or esbuild. The API is native `node:http` plus Socket.IO and does not import Express, EJS, or dotenv. These dependencies enlarge install/security surface and obscure the real stack. | Remove packages with zero source/config consumers, regenerate locks, build/type-check, and enforce a dependency-usage contract per package root. |

### Language decision

**Recommendation: TypeScript control plane + a narrow optional C++ compute kernel; retire Rust.**

| Layer | Recommended language | Reason |
|---|---|---|
| React UI, API, CLI, broker/provider adapters, orchestration, auth, config | **TypeScript** | Most of the product is already JS/TS and depends on Node broker/Supabase/MCP ecosystems. Static types catch real payload and gate errors while preserving JS runtime flexibility. |
| Pre-trade authorization and simple risk policy | **TypeScript in the gateway** | These checks require current broker/user state and are cheap. Keeping them in-process removes the error-prone subprocess/env proxy contract. C++ may independently audit the same typed snapshot. |
| Heavy scans, correlation, simulation, portfolio optimization, binary transforms | **C++ only after benchmark evidence** | Retain existing tested kernels where they materially beat Node. Expose a small versioned JSON/binary contract; do not put providers, auth, broker execution, or UI concepts in C++. |
| Rust CLI mirror | **Retire/archive** | It is 30 files of `mirrored-contract-only` behavior, has no active runtime advantage, and creates a third implementation language plus another dependency/build graph. |

Raw JavaScript is the **most dynamic** language here, but TypeScript is the best operational choice:
it compiles to the same dynamic runtime while adding contract checks. A pure TypeScript implementation
would be the least-bloated greenfield design. In this existing repo, keeping only proven C++ kernels is
less risky than rewriting them, but no new Rust or C++ surface should be added without a measured need.

### Follow-up grades

| Section | Grade | Reason |
|---|---|---|
| `backend/core` | **C / execution-gated** | Broad tested compute surface, but live market-order risk receives zero notional and compiled test-only shells remain. |
| `shared/lib/ml` | **C- / promotion-gated** | Real ONNX inference exists, but the canonical comparison/report path ranks architecture-named heuristics instead. |
| `backend/mcp_server` | **C / live-gated** | Builds and has explicit confirms, but degraded research is opt-out and live Polymarket inherits the direct execution bypass. |
| `infra/deployment` variants | **D / stale** | Three deployment starters launch a nonexistent path and are not valid alternatives to Compose. |
| `supabase/functions` | **C / scaffold** | RLS schema is useful; risk alert delivery is not implemented. |
| package dependency hygiene | **C** | Multiple clear zero-consumer dependencies across frontend/API package roots. |

### Verification evidence

- C++ risk probes: zero notional approved; 20,000 / 50,000 concentration rejected.
- CMake: 52 of 53 C++ implementation files are compiled; the sole uncompiled `.cpp` is
  `src/ingestion/sentiment_ingestion.cpp`. Nine placeholder headers have zero consumers.
- MCP TypeScript build passed. Focused MCP tests cover confirm/price/cost checks, but no test proves
  common PIN/native-risk termination.
- Active source LOC: about 40.4k JS, 7.4k TS/TSX, 11.5k C++/headers, and 1.0k Rust. LOC is not a quality
  metric, but it shows that a Rust rewrite would duplicate the dominant Node control plane.

### Revised critical path

1. Centralize all order submission and fix real market-order risk inputs.
2. Remove public/browser authorization defects from the prior audit.
3. Relabel and gate heuristic "models" before regenerating any signal report.
4. Make Docker Compose the sole supported deployment until other manifests are generated and tested.
5. Consolidate on TypeScript and prune Rust, compiled shells, placeholders, and unused dependencies.

## Focused TUI, Polymarket Lifecycle, and Maintainability Review - 2026-07-12 session 74

Mode: focused review, production code unchanged. Scope: the Ink dashboard's bottom command input,
responsive terminal density, the live Polymarket portfolio lifecycle, and maintainability of the code
behind those surfaces.

### Ranked findings

| Priority | Classification | Area | Evidence | Finding | Clearance gate |
|---|---|---|---|---|---|
| **P1 / decision-output gated** | **Incorrect lifecycle and valuation** | Polymarket portfolio | `backend/gateway/src/index.ts:123-190,1130-1233,1368-1421`; `backend/gateway/src/polymarket_portfolio.js:50-66` | Positions are reconstructed from historical buy/sell fills. A resolved token with remaining shares therefore stays positive forever unless a sell fill exists. The second Gamma pass fetches resolved markets only to recover question text; it does not retain active/closed/winner status. Failed resolved-market quotes then fall back to cost basis as `marketValue` with zero PnL, every named row is printed under **Active Positions**, and that fallback reaches aggregate equity. This can overstate resolved losers, understate winners, and flood the active list with ended positions. | Introduce explicit `active` / `ended` / `unknown` lifecycle data. Only verified-active positions belong in the active list and marked equity. Ended positions should collapse to a short redeem/history summary, with payout included only when resolution ownership/value is verified. Add buy-only resolved-winner, resolved-loser, sold-out, unknown-market, and pagination-truncation fixtures. |
| **P1** | **Responsive-layout defect** | Ink TUI density | `backend/cli/sovereign_dashboard.mjs:1244-1303`; `tests/scripts/tui/dashboard/_harness.js:41-52` | The body always reserves 20 columns for the menu and 76 for content before giving any space to output. A real 80-column PTY rendered a 100-column body; the output pane collapsed to roughly two columns and printed text vertically through the frame. Controlled renders confirmed body width 100 at an 80-column viewport; at 100 columns the `COMMAND OUTPUT` heading still cannot render; only the fixed 120-column test viewport reaches the intended three-pane shape. Borders and repeated 72/40-character rules amplify the flood, but fixed minimum width is the root defect. | Add a viewport policy and tests at 80x24, 100x30, 120x30, and 160x40. Below the three-pane threshold, hide or stack output and collapse the sidebar; use flexible widths and truncated rules rather than fixed 20+76 columns. No rendered line may exceed viewport width. |
| **P1** | **Partially broken input control** | Bottom command bar | `backend/cli/sovereign_dashboard.mjs:460-488,873-898,1185-1189`; `node_modules/ink-text-input/build/index.js:62-80` | Ordinary ASCII typing, end-of-line Backspace, Enter submission, Tab focus, and PIN routing work. Mid-line editing does not: the dashboard sets `showCursor:false`, while this `ink-text-input` version changes its internal cursor on Left/Right only when `showCursor` is true. A direct `statuus`, Left, Left, Backspace, Enter probe left `statuu` and ran nothing; `statusx`, Backspace, Enter correctly ran `status`. Hardware-cursor X also uses unbounded `chatInput.length`, so long or wide Unicode input can misplace it. | Extract a tested `CommandInput` with an explicit cursor offset, display-width-aware and viewport-clamped positioning, or wrap/fork the input component so hardware and logical cursors share one offset. Cover Left/Right, Home/End, Backspace/Delete, paste, long input, CJK/emoji width, and submit. |
| **P1** | **Resize defect** | TUI viewport/cursor | `backend/cli/sovereign_dashboard.mjs:471-488,1052,1226,1244`; local Ink `useWindowSize` support in `node_modules/ink/build/hooks/use-window-size.js:5-20` | Terminal dimensions are read from mutable `process.stdout` values during React render, but no reactive window-size hook is used. Ink recalculates Yoga width on resize without recreating the component's numeric height or rerunning the cursor effect. A controlled resize from 30 rows to 12 still emitted 28 rows. Short viewports also clip the six-row slash menu while cursor math still subtracts all six requested rows. | Drive root height, responsive mode, output page size, picker rows, and cursor placement from one reactive viewport state. Add live resize tests in both directions, including an open slash menu and long input. |
| **P2** | **Process-global error suppression** | Polymarket adapter reliability | `backend/gateway/src/index.ts:1205-1231` | `getPositions()` assigns `console.error = () => {}` around concurrent quote reads and restores it only on the success path. If client construction or any uncaught step throws, `console.error` remains muted for the rest of the process, hiding unrelated failures and becoming unsafe under concurrent work. | Remove global mutation. If SDK noise cannot be configured at source, scope interception with `try/finally` and serialize it, or capture errors at the client boundary. A forced client-construction failure test must prove `console.error` identity is restored. |
| **P2** | **Duplicated schema and monolith debt** | TUI readability/maintenance | `backend/cli/sovereign_dashboard.mjs:91-388,393-1349`; `backend/cli/tui/manifest.js`; `docs/codebase_tour/05_tui_cli_dashboard.md:16-28` | The modern dashboard has a 51-command inline manifest while the legacy TUI has a separate 49-command manifest. A direct comparison found modern-only `stop-backfill-daemon`, `backend chart`, and `trade favorites`; legacy-only `favorites`; and 11 shared commands with different flag-name sets (`watch`, `backfill-daemon`, `backend correlation`, `backend visualize`, `bt`, `optimize`, `scorecard`, `alpaca`, `settings favorites`, `login`, `register`). The 957-line `App` owns 25 state hooks, process spawning, safety gates, parsing, navigation, input, scrolling, and all rendering. Long resolved-history comments embedded in manifest rows further obscure the active contract. The codebase tour already records that this duplication caused a real missing-menu bug. | Define one canonical command schema with adapters for Ink and legacy renderers. Split process execution, viewport policy, command input, navigation reducer, panes, and PIN gate into bounded modules. Move historical incident notes out of production rows into the review ledger. Add a parity contract that rejects command/flag drift. |

### Confirmed behavior versus UX judgment

- **Confirmed good:** 19 focused dashboard/chat tests passed. Basic character entry, end Backspace,
  deterministic submission, focus switching, PIN routing, abort, picker behavior, and output scrolling work.
- **Confirmed broken:** mid-line Left/Right editing, height resize, 80-column rendering, and ended-position
  classification/valuation contracts described above.
- **UX judgment:** at 120 columns the interface is usable but still dense. Multiple nested borders,
  full-width rules, a permanent three-pane body, persistent help/status lines, and verbose labels compete
  with decision output. The proposed breakpoint behavior is a design recommendation, not a test failure.
- **Environment boundary:** no live Polymarket API was polled in this review. The ended-position finding
  follows directly from the local fill reducer, resolved-market metadata discard, quote fallback, renderer,
  and aggregate-equity code paths.

### Grades

| Section | Grade | Reason |
|---|---|---|
| Ink command input | **C / interaction-gated** | Common append/backspace/submit path works; mid-line editing and resize/cursor behavior fail. |
| Ink dashboard layout | **D at <=100 columns; C at >=120** | No responsive breakpoint; default 80-column terminals are structurally flooded. |
| Polymarket portfolio projection | **D / decision-output gated** | Ended positions are labeled active and assigned a non-authoritative value that reaches aggregate equity. |
| TUI maintainability | **C-** | Strong focused tests, but duplicated manifests and a 957-line 25-state component create recurring drift. |

### Verification evidence

- `node --test tests/scripts/tui/dashboard/chat_ui.test.js tests/scripts/tui/dashboard/sovereign_dashboard.test.js`:
  19 tests, 19 pass, 0 fail.
- Real PTY at its default 80-column size reproduced the flooded three-pane frame and unusable output pane.
- Controlled width matrix: body width was 100 at 80 columns; output heading absent at 80 and 100;
  intended three-pane heading visible from 120 upward.
- Controlled resize: 30-row initial render resized to 12 rows still emitted 28 rows.
- Input probes: end Backspace+submit passed; Left/Right mid-line correction failed exactly as the installed
  input component's `showCursor:false` branch predicts.
- No production code or live external API state changed. `graphify-out` remains unavailable.

### Recommended implementation order

1. Fix and fixture the Polymarket lifecycle projection so ended positions cannot contaminate active
   holdings or equity.
2. Extract `CommandInput` plus a pure viewport policy, then add edit/resize/80-column contracts before
   changing visual styling.
3. Apply responsive breakpoints and remove redundant border/rule rows based on viewport tests.
4. Canonicalize both manifests and split the dashboard controller/render/process concerns after behavior
   is locked by tests.

## Blast-Through Connective Tissue Sweep - 2026-07-13 session 75

Mode: connective-tissue, fast reading. Scope: the resumed TUI/Polymarket implementation batch, the
new dashboard input/layout modules, and the deployment/package wiring around the current diff.

### Connectivity matrix

| Path / symbol | Classification | Evidence | Why it matters | Gate to clear |
|---|---|---|---|---|
| `backend/api/package.json` dependencies `express`, `ejs`, `dotenv` | **Stale / dependency bloat** | `backend/api/app.js` uses `node:http` directly and `rg` found no production imports of `express`, `ejs`, or `dotenv` under `backend/api/` | The package advertises a heavier stack than the code actually uses, which obscures the real runtime surface and widens install/security area for no runtime gain. | Remove the unused dependencies or add a real consumer, then regenerate the lock and rerun the package-root dependency check. |
| `backend/mcp_server/package.json` `@modelcontextprotocol/sdk: "latest"` | **Incomplete / non-reproducible** | `backend/mcp_server/package.json` still pins the MCP SDK to `latest` | A moving dependency makes clean installs and future regressions non-reproducible, especially for a live bridge service. | Pin the SDK to a tested semver range and verify the build/test gate against that exact version. |
| `backend/cli/tui/command_input.mjs` + `backend/cli/tui/dashboard_layout.js` | **Intentional** | Focused dashboard/input tests passed 26/26, including mid-line editing, resize behavior, and viewport width checks | The new split is justified: the editor and viewport policy are isolated, tested, and imported by the dashboard. | None; keep the current module boundary. |
| `backend/gateway/src/polymarket_positions.js` | **Intentional** | Polymarket lifecycle tests covered active, ended, unknown, and truncated-history cases; gateway test confirms global error suppression is gone | The new projection module is a real runtime seam, not a dead stub, and it now fails closed for unresolved lifecycle data. | None; keep the current fail-closed behavior and fixtures. |
| `infra/deployment/{heroku,kubernetes,terraform}` | **Intentional / aligned** | Direct read shows all three variants now launch `node backend/api/app.js` instead of the stale `web/app.js` path | The previously stale entrypoint drift is resolved in the current tree. | Keep the contract tests around the real entrypoint path. |

### Section grades

| Section | Grade | Reason |
|---|---|---|
| `backend/api` | **D / dependency-bloat gated** | Runtime is the lean native HTTP server, but the package file still declares unused Express/EJS/dotenv dependencies. |
| `backend/mcp_server` | **C / reproducibility-gated** | Buildable and tested, but the MCP SDK pin to `latest` prevents stable clean installs. |
| `backend/cli` | **C- / interaction gated** | The new command input and viewport split are sound, but the dashboard remains a large interactive controller with known maintainability debt outside this batch. |
| `backend/gateway` | **B+ / fail-closed** | The Polymarket lifecycle seam is now isolated and the focused tests show fail-closed behavior for ended/unknown/truncated positions. |
| `infra/deployment` | **B** | The deployment manifests now align with the real API entrypoint and no longer point at the stale `web/app.js` path. |

### Verification evidence

- Focused test gate: 26/26 passing across dashboard input/layout, Polymarket lifecycle, risk context, and scorecard freshness.
- `rg` check under `backend/api/` found no production imports of `express`, `ejs`, or `dotenv`.
- Direct file read confirmed `backend/api/app.js` uses `node:http` and the current deployment manifests point at `node backend/api/app.js`.
- No production code was changed in this audit pass.

## Mass-Implement Resolution - 2026-07-13 session 75

The two session-75 connective-tissue blockers are resolved, and the implementation pass also repaired a
verification-contract break exposed by the cleanup.

| Surface | Resolution evidence | Grade movement |
|---|---|---|
| `backend/api` package | Removed unused Express/EJS/dotenv declarations; offline lock regeneration pruned 846 stale lockfile lines; clean package root resolves only Socket.IO. | **D dependency-bloat gated -> C trust-gated**. Dependency truth and correlation false health are fixed; broader API readiness gates remain. |
| `backend/mcp_server` | SDK package and lock now pin `1.29.0`; `npm ls` and `tsc` pass. | **C reproducibility-gated -> C+ policy-gated**. Reproducibility is fixed; degraded-backtest policy remains. |
| Root verification scripts | Repointed 15 missing test references after test-tree reorganization; added a contract over all 22 explicit `.test.js` references. | **Contract truth improved**. Advertised npm gates execute again instead of failing at path resolution. |
| Correlation fallback | Requires two aligned observations; zero-overlap payloads return `ok:false`, `available:false`, and `insufficient_aligned_observations`. | **Runtime safety improved**. Zero-sample matrices no longer report healthy. |
| API docs | README, package README, stack manifest, and codebase organization now describe native HTTP + Socket.IO and current infra paths. | **Doc alignment improved**. Active docs no longer advertise Express or a nonexistent `public/` shell. |

Verification evidence:

- `npm run test:api`: 6/6 pass.
- `npm run test:contracts`: 23/23 pass; integration evidence includes 22 macro rows and 9 reserves rows.
- `node --test tests/scripts/operational/portfolio_monitor.test.js`: 8/8 pass.
- `npm test`: full Node suite completed without failures.
- `npm run hygiene` and `git diff --check`: pass.
- Package lock probe: API has no Express/EJS/dotenv nodes; MCP lock resolves SDK `1.29.0`.

## Blast-Through + Mass-Implement - 2026-07-13 session 76

Mode: connective-tissue, Fast Reading Mode. Scope: the deferred authentication, UI-density, and
duplicate/stub baseline. DCS **0.95 -> 0.95**: no market-data transformation or model promotion changed,
so the carried data score remains promotion-gated despite improved auth and UI verification.

### Findings and resolutions

| Priority | Finding | Evidence | Resolution / gate |
|---|---|---|---|
| **P0 fixed** | Supabase auth decisions were cached for 30 seconds, so a same token could remain authorized after revocation. | `backend/api/server/services/supabase_client.js:53-94`; middleware trust at `backend/api/app.js:92-158`. | Removed auth-decision caching; protected requests now revalidate. Database status authenticates before its per-user table-result cache. Same-token valid-to-revoked contract proves two provider calls and immediate denial. |
| **P0 fixed** | Dashboard boot trusted a local persisted session; provider failure could also leave `loading=true` indefinitely. | Former `Frontend/dashboard/src/App.tsx:30-43`. | Added `Frontend/dashboard/src/lib/session.js:1-34`; restore and auth-change paths validate the candidate token with `getUser(token)`, provider/revocation failures resolve unauthenticated, and logout is locally confirmed before user state clears. |
| **P1 fixed** | The responsive TUI stayed within width but clipped `Data`, `Trade`, and `cockpit` at 80/100 columns and selected rows in wide-short terminals. | `backend/cli/tui/dashboard_layout.js:3-67`; hidden pane overflow in `backend/cli/sovereign_dashboard.mjs`. | Row capacity is height-aware at every width; short navigation windows keep first/middle/last selections visible and expose bounded more markers. |
| **P1 fixed** | Kalshi historical adapters silently returned empty success while the caller already supported provider errors. | `backend/scripts/data_ops/ingest_market_data/manifests.js:64-68,183`; caller catch at `backend/cli/commands/research/research_sources.js:301-325`. | Kalshi history now throws structured `not_implemented`; existing Polymarket history tests remain green. |
| **P1 open** | Web dashboard navigation is desktop-only: fixed 260px sidebar, nine-tab single-row header, and fixed panel grids have no mobile contract. | `Frontend/dashboard/src/App.tsx:57-82`; `components/layout/Sidebar.tsx:26-27`; `components/layout/TopBar.tsx:41-99`; no frontend browser/component test script. | Add a browser/component harness at 375/768/1440 before redesign; prove tab reachability, sidebar collapse, grid reflow, overflow, and accessible navigation. |

### UI baseline

Corrected post-fix TUI baseline, ANSI stripped, at 30 rows:

| Viewport | Lines | Occupied cells | Non-whitespace | Border/rule | Other visible | Widest |
|---|---:|---:|---:|---:|---:|---:|
| `80x30` | 29 | 2,231 | 1,493 | 1,060 | 433 | 80 |
| `100x30` | 29 | 2,771 | 1,755 | 1,320 | 435 | 100 |
| `120x30` | 29 | 3,311 | 1,657 | 1,236 | 421 | 120 |

All eight categories and all four Operational commands are present at each width. These are the valid
before-values for a later 25% chrome reduction; the earlier lower narrow-width text counts were clipping,
not simplification.

### Duplicate/stub inventory

| Candidate | Classification | Current decision |
|---|---|---|
| React `components/{Shell,TopBar,SideBar}.tsx` | Dead duplicate | Zero external consumers; defer deletion until the browser baseline/build gate is in place. |
| Inline Ink `M` vs legacy `COMMAND_MANIFEST` | Divergent implementations | 51 vs 49 routes and 11 shared flag-set drifts; existing parity permits legacy-subset drift. Consolidate behind one schema only after adapter contracts. |
| `shared/lib/{polymarket_history,run_loop}.js` and ingest root wrapper | Compatibility shims | Keep; each still has direct consumers. |
| Six unavailable ingest families | Honest unavailable | Keep structured `not_implemented`; do not replace with synthetic success. |
| `shared/lib/data/ingestion.js` and `searchTradingViewScreener` | Dead duplicate/stub | Zero consumers; deletion remains deferred by the saved baseline-first plan. |
| Duplicate test-output fixture trees | Generated/divergent fixtures | 24 exact pairs and 9 divergent pairs; choose a canonical fixture layout before deletion. |
| Rust CLI mirror | Divergent scaffold | Separate broad-deletion approval still required. |

### Grades and verification

| Section | Grade | Movement |
|---|---|---|
| `backend/api` | **B- / deployment-gated** | C -> B-: revocation freshness and protected-route coverage fixed; remote RLS and live-provider soak remain open. |
| `Frontend/dashboard` | **C / responsive-gated** | C- -> C: verified restore/logout and clean build/typecheck; mobile navigation remains unimplemented. |
| `backend/cli` | **C / duplication-gated** | C- -> C: narrow and wide-short navigation are reachable and tested; two manifest owners remain. |
| ingest manifest | **B+ / provider-roadmap** | B -> B+: silent Kalshi history success removed; unavailable providers remain honest roadmap gaps. |

Verification: contracts **28/28**; focused TUI **19/19**; auth/session **6/6**; ingest **4/4**;
full Node suite **730 total / 728 pass / 0 fail / 2 skip**; frontend typecheck/build; hygiene; secret
scan **829 files / 0 violations**; `git diff --check`. No API bind widening or code deletion occurred.

## Blast-Through + Mass-Implement - 2026-07-13 session 78

Mode: triage, Fast Reading Mode. Scope: the deferred frontend viewport contract only. Scoped responsive
DCS **0.61 -> 1.00**: freshness `1.00`, contract schema `0.70 -> 1.00`, executable coverage
`0.10 -> 1.00`. No market-data transform or model promotion changed.

### Confirmed finding and resolution

| Priority | Finding | Baseline evidence | Resolution / gate |
|---|---|---|---|
| **P1 fixed** | The dashboard had no executable mobile contract: unnamed navigation, persistent 260px controls at 375px, and four overview columns at 768px. | First production-build Chrome run: **1/6 pass, 5/6 fail** at 375/768/1440. | Added a dependency-free local Chrome/CDP harness and responsive layout. Final gate: **6/6 pass**; ten destinations activate at every viewport, no document/main overflow is exposed, controls collapse/reopen below 1024px, and overview grids reflow 1/2/4. |

Dismissed candidates: the old `src/styles/{Layout,TopBar}.css` files belong to zero-consumer duplicate
components and are not imported by the active Vite entrypoint; broad duplicate deletion and CLI manifest
consolidation remain separately gated and were not mixed into this batch.

### Grade and verification

| Section | Grade | Movement |
|---|---|---|
| `Frontend/dashboard` | **B- / live-browser-gated** | C -> B-: production-build browser coverage now proves responsive navigation, sidebar behavior, grid reflow, overflow bounds, and accessible current-page state. An authenticated live-provider browser soak remains open. |

Verification: `npm run test:responsive` **6/6** with the production build and local Chrome;
`npm run lint`; `npm run hygiene`; `git diff --check`. The Vite static/dynamic Supabase chunk warning is
unchanged. API binding stayed on loopback and no duplicate files were deleted.

## Mass-Implement - Family-Aware Analysis Batches 1-2 - 2026-07-13 session 79

Planning Mode converted the family-aware scorecard design into eight phase-gated batches in
`workspace/plans/ASSET_ANALYSIS_IMPLEMENTATION_BATCHES.md`. A `gpt-5.6-luna` worker implemented the two
bounded additive batches; the main thread retained integration, corrected delegated contract drift, and
verified live-v2 isolation.

### Implemented

| Batch | Evidence | Result |
|---|---|---|
| Canonical contract kernel | Synthetic fixtures: 9 family/subtype descriptors; 11 explicit factor domains; invalid timestamp/range/provenance/policy/applicability cases. | Runtime validators for `AssetDescriptor`, `Observation`, `FactorResult`, and `ScorecardRow v3`; weight-free family section registry; focused tests 5/5. |
| Shadow asset/evidence taxonomy | Real `config/markets/data_sources.yaml`: 116 matrix entries, 92 raw entries, 108 evidence dimensions. | 122 unique scoreable candidates, 108 non-scoreable evidence descriptors, 30 unsupported/ambiguous entries, 45 repeated declarations, 57 repeated legacy-symbol declarations, 0 identity conflicts, 0 cross-asset symbol collisions; focused tests 4/4. |

The audit rejected invented nested provenance, negative composite strength, policy/asset mismatch, and
inapplicable factor domains. It also corrected the worker's misleading duplicate-identity label: the real
45 count is repeated declarations, not contradictory identities.

### Grade and gates

`shared/contracts/analysis` + `shared/lib/analysis/assets`: **B / shadow-gated**. Contract truth and path
clarity improved, but no live score, provider, API, or UI behavior changed. Technical v2-to-v3 parity,
point-in-time macro truth, SEC normalization, and a reviewed equity policy remain required.

Verification: analysis/taxonomy **9/9**; live scorecard compatibility **2/2**; structure **1/1**; hygiene;
secret scan **829 files / 0 violations**; `git diff --check`. Full Node suite: **739 total / 736 pass /
1 fail / 2 skip** due a parallel strategy-label mismatch in `dashboard_exec.test.js`; the failing file
passes **16/16** in isolation and no analysis batch touched strategy/TUI state.

## Blast-Through + Mass-Implement - Technical v2-to-v3 Adapter - 2026-07-13 session 80

### Triage result

| Candidate | Classification | Evidence |
|---|---|---|
| Missing technical shadow adapter | Confirmed incomplete, fixed | The saved Batch 3 owned no implementation. The real v2 freshness fixture now feeds the adapter and preserves `long`, score `0.208`, and strength `0.21`. |
| Parallel TUI strategy-label mismatch | Dismissed for this pass | `dashboard_exec.test.js` passes 16/16 alone and the full Node suite passes with Batch 3 included. |

### Grade and gates

`shared/contracts/analysis` + `shared/lib/analysis`: **B+ / macro-gated**. Technical contract truth and
verification improved from B: complete fresh v2 rows adapt to valid v3 factors, while stale/incomplete
rows fail closed. Live scorecard behavior remains isolated.

Scoped fixture DCS: **1.00** at start and end (freshness 1.00, schema 1.00, coverage 1.00). Input was
60 synthetic OHLCV records across two timeframes; v2 accepted 2/2 timeframe outputs, the adapter emitted
one validated technical factor with two evidence ids, and 3/3 degraded variants were rejected.

Verification: focused analysis/freshness **12/12**; TUI strategy **16/16**; full Node suite; hygiene;
syntax; `git diff --check`. Remaining highest-impact gap: point-in-time macro observation truth.

## Mass-Implement - Point-in-Time Macro Repair - 2026-07-13 session 80

### Confirmed gap and resolution

| Priority | Finding | Resolution evidence |
|---|---|---|
| P1 / backtest trust | Macro storage treated period date as observation time, omitted release/availability/vintage, and overwrote rows on `(family,series,observed_at)`. A historical consumer could not distinguish the initial value from a later revision. | Revision-aware rows preserve period, release, availability, ingestion, and vintage. As-of selection uses only revisions available and ingested by the decision timestamp. |

Data-flow evidence: 4 synthetic revision records entered normalization; 3 had complete ordered timing and
1 period-only legacy row was retained but excluded. At 2026-05-01, one revision was visible with value
100; a value 101 record already provider-available but not locally ingested was hidden; the later value
102 revision was also hidden. At 2026-06-01, the latest visible value was 102.

### Grades and gates

| Section | Grade | Movement |
|---|---|---|
| `shared/lib/data/macro_store.js` + macro migration | **B+ / remote-migration-gated** | C -> B+: revision loss and look-ahead ambiguity are fixed at source/contract level; remote schema application remains unverified. |
| `shared/lib/analysis` shadow path | **B+ / equity-policy-gated** | Macro prerequisite cleared; no family weights, SEC composer, live scorecard, API, or UI behavior exists yet. |

Verification: focused **12/12**; contracts **29/29**; full Node **743/741/0fail/2skip**; hygiene;
syntax; migration-shape contract; `git diff --check`. Next gate: Batch 5 research-only equity policy.

## Mass-Implement - Recorded SEC Equity 3m Shadow Policy - 2026-07-13 session 81

| Priority | Finding | Resolution evidence |
|---|---|---|
| P1 / fabricated fundamentals | Batch 5 had no recorded SEC artifact or adapter. | Official Apple Company Facts HTTP 200 artifact: 503 `us-gaap` concepts; 1,392 normalized observations; 8/8 metric concepts found; provenance retained. |
| P1 / lookahead and duration mixing | Company Facts contains later restatements and quarter/YTD values sharing period ends. | Facts require filing availability by `asOf`; future filings are excluded. Revenue compares `CY2026Q1` with `CY2025Q1`, producing 16.6%, rather than comparing quarter to YTD. |
| P1 / missing-data confidence | A composer could renormalize around absent fundamentals. | Missing revenue rejects the fundamental factor; missing fundamentals exclude the row; absent weight stays absent. |

`shared/contracts/analysis` + `shared/lib/analysis`: **A- / service-parity-gated**, from B+ /
equity-policy-gated. Batch 5 is additive, research-only, and explicitly not decision-ready; no live
schema-v2, service, API, CLI, or TUI behavior changed.

Verification: focused analysis **11/11**; recorded fixture HTTP **200**, bytes **8,128,534**, `us-gaap`
facts **503**; hygiene; syntax; `git diff --check`. The first full Node run passed. A second confirmation
run encountered unrelated parallel TUI file-level failures. Next gate: Batch 6 service plus CLI/API parity.

## Mass-Implement - Analysis Batches 6-8 - 2026-07-13 session 81

| Surface | Evidence | Verdict |
|---|---|---|
| Canonical service parity | Direct service, real CLI JSON subprocess, API adapter, and authenticated HTTP route return the same named schema-v3 fixture envelope. | Pass; v2 remains default. |
| Family expansion | ECB/Treasury: 8 records; EIA: 6; DefiLlama: 10. S&P and Coin Metrics official requests returned HTTP 403/unavailable. | 7 rows: 0 eligible, 4 degraded, 3 excluded. No substitution. |
| Terminal research UI | Existing scorecard manifest owns schema/fixture/family/state/symbol selection; renderer exposes factor, reason, and evidence details within 80/100/120 columns. | Pass; no second UI registry/provider call. |
| Promotion | Readiness covers distributions, coverage, evidence composition, and missing-data sensitivity. No targets, OOS baseline, costs/turnover, or calibration exist. | `promotion_approved=false`; v2 retirement prohibited. |

Grade remains **A- / promotion-blocked**: implementation and verification are strong, but data/model
evidence intentionally prevents readiness promotion. Focused phase gates passed 4 + 4 + 4 + 24 + 3.
Serialized full Node suite passed **755 total / 753 pass / 0 fail / 2 skip**. Hygiene and diff integrity
passed; tracked secret scan 829/0 and direct new-file pattern scan were clean. `graphify-out` remains absent.

### Completion audit correction

The final requirement-by-requirement audit added explicit pre-retrieval rejection for recorded artifacts,
family-policy factor-applicability assertions, within-family state/ranking coverage, and a real Ink launch
test for the canonical `all-recorded` v3 catalog. The post-repair serialized suite passed **758 total / 756
pass / 0 fail / 2 skip**. Focused analysis, authenticated API, TUI/manifest, hygiene, syntax, diff, and
secret gates all pass. Grade remains **A- / promotion-blocked** because the correct outcome is still zero
eligible rows and `promotion_approved=false`, not because an implementation phase is unfinished.

## Full Blast-Through - Recent Work Review - 2026-07-13 session 81

DCS start/end: **0.95 -> 0.95**. Archive integrity is coherent and `graphify-out` is still absent, so this
pass used fast-reading review against the current state files, the active dirty diff, direct production-file
reads, targeted test/fixture reads, and one broad hygiene gate.

### Findings

| Priority | Area | File:line | Finding | Impact | Required fix / gate |
|---|---|---|---|---|---|
| **Medium** | Analysis recorded-provider freshness | `shared/lib/analysis/analyzers/recorded_provider_factors.js:29-33`, `:45-48`, `:67-70` | The new recorded FX, EIA, and DefiLlama factors stamp `data_as_of` and derive `valid_until` from the fixture retrieval time (`asOf` / `provenance.retrieved_at`), not from the latest observation timestamp in the payload. Direct probe shows the mismatch: FX is labeled `data_as_of=2026-07-13T01:44:44Z` while the underlying Treasury and ECB evidence is dated `2026-07-10`; EIA is labeled `2026-07-13T01:44:31Z` while the latest periods are `2026-07-03`; DefiLlama is likewise freshness-labeled by retrieval time. | The v3 shadow catalog overstates evidence freshness and extends factor validity windows from fetch time rather than observation time. That weakens the "point-in-time" and freshness semantics the recent analysis work claims to preserve, even though promotion remains blocked. | Set factor `data_as_of` from the latest underlying source observation timestamp, keep retrieval/availability in separate provenance/diagnostics fields, and add a contract that fails when retrieval time is newer than the latest evidence date but becomes the reported `data_as_of`. |
| **Medium-Low** | Authenticated signal review route | `backend/api/server/routes/market/signal_promote.js:27-45`, `:67-79` | The route "sanitizes" `signalIds` by deleting non `[A-Za-z0-9_-]` characters instead of validating exact IDs. A malformed payload like `abc!` becomes `abc` before the active-signal check and audit-event write. | An authenticated caller can submit a malformed ID that is coerced into a different live signal ID, causing the wrong review decision to be recorded and telemetered. This is not an order-execution bug, but it corrupts review audit integrity. | Reject any ID that changes under validation instead of mutating it, and add a route contract proving `['abc!']` is rejected even when `abc` is active. |

### Reviewed section grades

| Section | Grade | Movement |
|---|---|---|
| `shared/lib/analysis` recorded-provider family shadow path | **B+ / freshness-truth-gated** | A- -> B+: policy applicability, service parity, and promotion blocking are strong, but recorded-provider freshness is currently retrieval-time-labeled rather than evidence-time-labeled. |
| `backend/api` authenticated review/config surfaces | **B- / audit-integrity-gated** | no letter change: auth freshness and protected-route behavior still hold, but the signal-promotion route now needs exact-ID validation before its audit trail can be treated as fully trustworthy. |

### Verification used

- Direct fixture probe against `fx_macro_recorded.json`, `eia_energy_recorded.json`, and
  `defillama_aave_recorded.json` confirmed source observation dates older than the emitted factor
  `data_as_of` timestamps.
- Direct code-path review of the authenticated `/api/signal/promote` route confirmed lossy ID mutation
  before active-signal validation and audit-event persistence.
- `npm run hygiene` passed.

### Next cleanup move

Fix the recorded-provider factor freshness labeling first. That is the highest-signal trust gap in the
new analysis surface because it affects the semantics of every non-equity recorded family row. Then lock
down exact signal-ID validation in `/api/signal/promote` so the review audit trail stays one-to-one with
the source signal set.

## Blast-Through Triage - Execution and Config Seams - 2026-07-13 session 81

Mode: **triage**, Fast Reading Mode. Scoped DCS start/end: **0.62 -> 0.62** (freshness 0.50,
schema 0.90, coverage 0.35). This was an audit-only pass, so promotion remains halted below 0.95.

### Findings

| Priority | Area | File:line | Finding | Impact | Required fix / gate |
|---|---|---|---|---|---|
| **High** | Strategy live automation | `backend/cli/commands/strategy/strategy.js:821-829`, `:866-907`; `backend/cli/commands/research/research_render.js:329-416` | Every automation backtest is run with `--allow-degraded`, including live passes. The later trust gate treats elevated data risk as a 35-point penalty rather than a hard rejection. A direct probe produced `score=70`, `verdict=researchable` while retaining the warning `data rejects/errors present`, which meets the default live threshold. | A favorable degraded-data backtest can reach `commandTrade(... --live)` and submit a real Alpaca order. Freshness checks and OOS alpha do not restore the missing data-integrity invariant. | Remove unconditional `--allow-degraded` from automation and hard-reject `report.data_quality_ok !== true` before trust scoring for live execution. Add a contract proving an otherwise grade-B report with elevated data risk cannot reach `commandTrade`. |
| **High** | Polymarket bot live authorization | `backend/cli/commands/trade/trade.js:519-548`; `backend/cli/commands/trade/trade_polymarket.js:306-340`; `backend/gateway/src/cycle.ts:156-159`, `:242-255`, `:372-429` | The Polymarket CLOB bot checks only `bot_autopilot`, evaluates `canLiveExecute('alpaca')`, and calls only `requireAuth`; it does not apply the `polymarket` feature gate or the PIN/fail-closed authorization used by direct Polymarket orders. | An API/dashboard caller with an authenticated session can request `live=true` and enter the Polymarket bot order path while the Polymarket feature flag is disabled and without satisfying the trade-PIN boundary. The wrong broker label also makes capability decisions drift from the executor. | Route bot live authorization through the canonical Polymarket authorization helper, require both `bot_autopilot` and `polymarket`, and add negative tests for disabled Polymarket, wrong/missing PIN, and noninteractive API-triggered live cycles. |
| **Medium** | Account config persistence | `backend/api/server/routes/account/config.js:53-66`; `backend/api/server/services/supabase_client.js:161-179`; `supabase/migrations/` | `/api/config` reads and upserts `public.user_config`, but no checked-in Supabase migration creates that table, its unique key, or own-user RLS. The route also has no focused storage contract for the table. | Fresh deployments cannot use dashboard settings reproducibly; GET/POST will fail at the database seam even though the frontend exposes the page and API route. Remote ad-hoc state, if it exists, is not a deployable contract. | Add a forward migration for `user_config` with `(user_id, config_key)` uniqueness and own-user RLS, then test a POST/GET round trip against the declared schema. Validate known keys and value shapes before persistence. |

### Reviewed section grades

| Section | Grade | Movement |
|---|---|---|
| `backend/cli` strategy and bot execution shells | **C- / live-integrity-gated** | C -> C-: current feature/auth gates exist, but two live paths can cross the wrong data or broker authorization boundary. |
| `backend/gateway` Polymarket bot cycle | **B- / caller-auth-gated** | B+ -> B- for the reviewed bot seam: CLOB order mechanics are explicit, but the owning caller does not apply the canonical Polymarket live authorization contract. |
| `backend/api` + `supabase` account config | **C+ / schema-contract-gated** | API route shape is simple, but its required table is absent from the migration history and has no executable round-trip contract. |

### Verification used

- Direct trust-score probe confirmed elevated data risk can still produce grade B, score 70, and
  `researchable`, matching the default live threshold.
- Focused settings and strategy contracts passed **25/25**; their passing inventory confirms they do not
  cover degraded-data live automation, Polymarket bot PIN/feature parity, or the `user_config` schema.
- Migration inventory contains profiles, portfolios, holdings, watchlist, backtests, audit events,
  orders, macro observations, and bot state, but no `user_config` table.
- `npm run hygiene` and `git diff --check` passed.

### Next cleanup move

Hard-stop live strategy automation on failed data quality first. Then unify Polymarket bot authorization
with the direct-order path before creating the missing `user_config` migration and route contract.

## Mass-Implement Correction - 2026-07-13 session 81 - audit backlog closure

All five actionable findings from the two session-81 blast-through reports are fixed and covered by
focused contracts.

| Area | Resolution | Verification |
|---|---|---|
| Strategy live automation | Removed unconditional `--allow-degraded`; live trust decisions now reject a report unless data quality is explicitly verified. | A grade-B / score-95 report with elevated quality now fails the live gate. |
| Polymarket bot authorization | Bot cycles require both feature flags and reuse the direct Polymarket capability, session, and PIN/fail-closed helper. | Disabled Polymarket and missing noninteractive PIN each block a live cycle. |
| Account config persistence | Added a forward `user_config` migration with composite identity, own-user RLS, and update timestamp trigger; the route now rejects unknown keys and malformed shapes. | Mocked authenticated POST/GET round trip plus migration-shape assertions. |
| Signal review IDs | Replaced lossy sanitization with exact ID validation. | A malformed ID is rejected before active-signal lookup and audit persistence. |
| Recorded factor freshness | Factors now use the earliest required source observation as `data_as_of`; retrieval remains an availability/provenance diagnostic. | FX, EIA, and DefiLlama fixtures expose evidence timestamps older than their retrieval times, with validity anchored to evidence time. |

Final verification: focused execution/settings **10/10**, Supabase route **4/4**, signal/analysis
**9/9**, full `npm test` exit **0**, `npm run hygiene` exit **0**, and `git diff --check` exit **0**.

Grade recovery: `backend/cli` returns to **C / duplication-gated**; reviewed `backend/gateway` returns
to **B+ / fail-closed**; `backend/api` and `supabase` return to **B- / deployment-gated** and
**B / remote-RLS-gated** respectively; recorded analysis returns to **A- / promotion-blocked**. These
are code and contract grades only. Real-capital promotion remains blocked by live data, model validation,
remote RLS verification, and broker soak evidence.

## Scorecard Review and Mass-Implement - 2026-07-13

The focused review covered schema-2 state accounting and rendering, schema-3 catalog/workbench output,
both TUI scorecard manifests, and their executable contracts. All findings below are closed.

| Priority | Area | Finding | Resolution / evidence |
|---|---|---|---|
| Medium | Schema-2 state truth | Quorum rows were labeled degraded but still emitted `complete: true`, contradicting their missing timeframe details. | Degraded rows now emit `complete: false`; the real technical-v2 adapter rejects the generated row as `incomplete_v2_row`. |
| Medium | Filter accounting | `confidence_filtered` was calculated after direction and top-N filtering, so the summary mislabeled valid rows as low-confidence. | Confidence, direction, and truncation counts are computed at their own filter boundaries and covered independently. |
| Medium | Terminal usability | Schema 2 always printed a wide multi-column header even with zero rows; schema 3 expanded every catalog row into factors/reasons/evidence and repeated state counts. | Schema 2 is width-bounded and omits empty tables. Schema 3 is a one-line catalog with single-asset drill-down. Direct 80/100/120-column and empty-state contracts pass. |
| Low | TUI contract drift | The inline dashboard lacked `--allow-degraded`; the legacy manifest lacked `--min-conf`; parity only checked one direction. | Both scorecard flag sets are identical and the parity test now requires exact equality. The real Ink launch test traverses the new field. |

Verification: direct current-cache CLI probes for schema 2 and schema 3; focused scorecard/shadow/adapter
contracts; dashboard 13/13; full Node suite **770 total / 768 pass / 0 fail / 2 skip**; hygiene and diff
integrity pass. `backend/cli/commands/research` is **B+ / data-readiness-gated**. The remaining operational
gap is fresh provider coverage, not scorecard rendering or state disclosure.
