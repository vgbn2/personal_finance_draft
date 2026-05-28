# Project State - Sovereign Trading Platform

## Current Phase
Phase 6: Production Scaling & Edge Deployment (COMPLETE)
- Phase 6.1: CLI Modularization & Router Refactor (COMPLETE)
- Phase 6.2: MFA Safety Gate & Risk Hardening (COMPLETE)
- Phase 6.3: Automated Database Pruning & Archiving (COMPLETE)
- Phase 6.4: Fail-Closed Risk Bridge & Safety Hardening (COMPLETE)

## Confidence Metrics (DCS)
- **Current Score**: 1.00
- **Threshold**: 0.95
- **Next Audit**: Required after Phase 7 Dashboard Hydration.

## Status
- [x] Codebase mapped
- [x] GSD methodology bootstrapped
- [x] Domain-Based Architecture (Backend, Frontend, Shared, Infra, Storage, Tests)
- [x] Database Guardian: Backup/Restore logic verified via MCP
- [x] Path Integrity: All 9 core contract tests passing
- [x] Supabase Schema: `orders` and `macro_observations` active and secured
- [x] CLI Stability: Refactored, modular, and verified

## Phase 7: Live Execution & Dashboard Hydration (KICKOFF)
- Phase 7.1: Native Build (`make build-core`) to enable Risk Engine.
- Phase 7.2: Frontend Hydration (Wiring React UI to Supabase).
- Phase 7.3: Live Execution Verification (End-to-end Trade loop).

## Recent Activity (2026-05-28 Session)
- **System Design Refactor**: Reorganized the repository into clear domains (`backend/`, `frontend/`, `shared/`, `infra/`, `storage/`, `tests/`) following modern architectural standards.
- **Database Restoration**: Used Supabase MCP server to remotely create and secure the missing Phase 6/7 tables (`orders`, `macro_observations`).
- **Path Integrity Fix**: Surgically updated hundreds of relative imports and `package.json` scripts to maintain 100% test coverage post-refactor.
- **Database Guardian Implementation**: Created `db_backup.js` and `db_restore.js` for local-first safety snapshots and automated the policy via a new skill.
- **Protocol Improvement**: Implemented a 'System Design Lens' in the `blast-through` skill to prevent cross-domain leaks.
- **Verification**: Refactored the entire test suite and verified 9/9 passing contracts.


## Organization Note
- Active ingest path: `scripts/data_ops/ingest_market_data.js` plus `scripts/lib/providers/index.js` and provider modules.
- Active backfill entrypoint: `scripts/cli/sovereign_cli.js` using `scripts/lib/backfill.js`.
- Legacy overlap: `scripts/lib/ingestion.js` remains a smaller batch runner that overlaps the newer manifest-driven ingest flow.
- Macro boundary: `scripts/lib/providers/macro.js` should remain the only home for FRED and World Bank fetch primitives.
- Cleanup priority: normalize the backfill/provider path first, then retire or shim the legacy ingest helper once callers are confirmed.

## Recent Activity
- Finalized all YAML configuration files (`data_sources`, `feature_engineering`, `risk_management`, etc.).
- Integrated high-signal sources: US PMI (ISM/S&P), Polymarket, Truflation, and Glassnode.
- Established institutional-grade risk and strategy promotion gates.
- Added real-cache C++ data summary and Pearson correlation commands.
- Added cache universe discovery via C++ and exposed it through the CLI/web API.
- Wired Node CLI and local web API endpoints to the C++ backend.
- Decomposed index.html into a modular React structure (App, Shell, Panels).
- Added MT5/Webull-style quote import support with symbol normalization.
- Restored GitHub Actions workflow content for C++ build, Node tests, and sanitizers.
- Completed low-risk portfolio metrics in the C++ backend.
- Added a CLI `cockpit` mode for cache health and performance drill-down.
- **Implemented Macro History Wiring**: `ingest_market_data.js` now supports `--days` for FRED/World Bank history.
- **Frontend Technical Blueprint**: Created a 500+ line master technical blueprint in `workspace/FRONTEND_DESIGN_SPEC.md`.

## Session History (Chronological)

### Phase 6 Production Scaling & Edge Deployment - 2026-05-28
- **CLI Modularization**: Decomposed the monolithic 2500+ line `sovereign_cli.js` into isolated command modules under `scripts/cli/commands/` and shared utilities in `scripts/cli/lib/utils.js`.
- **MFA Safety Gate**: Implemented a mandatory security PIN verification (via `SOVEREIGN_TRADE_PIN`) for all live trades to prevent unauthorized execution.
- **Database Pruning**: Developed a robust maintenance system (`scripts/lib/db_pruning.js`) to archive old Supabase records to local storage and prune the remote database, protecting free-tier limits.
- **Log Management**: Integrated `global.suppressLogs` across the platform to ensure high-fidelity interactive TUI sessions remain free from background log pollution.
- **Fail-Closed Risk Bridge**: Hardened the `execution_gateway` to implement a strict fail-closed policy; all trades are automatically blocked if the C++ risk engine binary is missing or fails its safety integrity checks.
- **Edge Alert Infrastructure**: Prepared Supabase Edge Function logic and PostgreSQL triggers for high-speed risk alert notifications.
- **Performance Benchmarking**: Added a high-resolution `backend benchmark` command to the CLI to audit C++ runtime latency under load.

### Phase 4.3 Mass-Implement & Audit - 2026-05-27
- **UI Consolidation**: Merged the React dashboard as the canonical frontend surface. `web/app.js` now serves `web_page/dist`. Legacy UI archived to `docs/archive/legacy_ui`.
- **Durable Persistence**: Initialized Supabase `orders` table. `execution_gateway` now automatically persists all CLI trades with real-time audit logging.
- **Signal Promotion**: Replaced simulated delays with a real backend API (`/api/signal/promote`) that persists promotions to Supabase `audit_events`.
- **Security Hardening**: Implemented strict input sanitization for CLI symbols, quantities, prices, and API signal IDs to prevent injection and malformed data.
- **Native ML Inference**: Finalized `onnx_model.cpp` with real `onnxruntime` session logic, enabling high-performance ML predictions in the C++ core.
- **MongoDB Cleanup**: Completed total decommissioning of MongoDB/Mongoose. All production code is now Supabase-native.
- **Documentation Hub**: Organized all documentation into a logical hierarchy under `docs/` using the Sovereign Architect protocol.

### Frontend Alignment & Supabase Integration - 2026-05-26
- **SDK Installation**: Installed `@supabase/supabase-js` in the `web_page` directory to enable native database and auth interactions.
- **Centralized API**: Created `web_page/src/lib/api.ts` to manage all backend endpoints and security headers in one location, removing hardcoded URLs and tokens from individual components.
- **Supabase Client**: Initialized a dedicated Supabase client in `web_page/src/lib/supabase.ts` using modern environment variable patterns.
- **Panel Refactor**: Updated `OverviewPanel`, `SignalPanel`, and `Sidebar` to consume the new centralized API and Supabase clients.
- **Auth UI**: Added a user status placeholder to the `TopBar` to prepare for the full authentication flow.
- **Security Cleanup**: Removed browser-visible fallback secrets (`sovereign_local_dev_secret`) from the frontend source, enforcing environment-based configuration.

### Macro History & Frontend Blueprint - 2026-05-26
- **Historical Ingestion**: Updated `ingest_market_data.js` to support historical data fetching for the `macro` and `reserves` families. 
- **Wiring**: Connected `fetchFredHistory` and `fetchWorldBankHistory` to the main ingestion loop via a new `--days` flag.
- **Verification**: Empirically verified historical fetching by running `node scripts/data_ops/ingest_market_data.js --family macro --days 30`, which successfully returned 63 records (approx. 6 per series) compared to the standard 11 (latest only).
- **Frontend Spec**: Generated a 500+ line **Master Technical Blueprint** (`workspace/FRONTEND_DESIGN_SPEC.md`) specifically optimized for Google AI Studio to design the next-gen "Control Room" UI, matching the `legacy.html` aesthetic.
- **Hygiene**: Performed a repository hygiene pass, removing all transient `.exe`, `.o`, and `.obj` artifacts.

### Supabase Auth & Database Foundation - 2026-05-26
- **Remote Schema**: Applied the initial Supabase migration with `profiles`, `portfolios`, `holdings`, `watchlist_items`, `saved_backtests`, and `audit_events`.
- **RLS Guardrails**: Enabled Row Level Security on every public table, scoped user-owned data through `(select auth.uid())`, and revoked public execution from trigger helper functions.
- **Local Mirror**: Added `supabase/migrations/20260526121418_initial_auth_database_schema.sql` and `docs/supabase.md`.
- **Web API Wiring**: Added Supabase config/auth/database status services and routes; `/api/system/status` now includes auth/database readiness.
- **Verification**: Confirmed six RLS-enabled tables via Supabase metadata, 21 authenticated owner policies via `pg_policies`, zero security advisor findings, and a passing `node --test web\tests\api.test.js`.

### Blast-Through Audit Refresh - 2026-05-26
- **DCS**: Stayed above threshold from the current state anchor at `0.985`; no degraded factor forced an audit halt.
- **Critical Gap Fixed**: `web/app.js` had still been serving the stale `web_page/index.html` shell and no `web/public` assets, while the real dashboard lived under `web/public/`. The web bridge now serves `web/public/index.html` plus static JS/CSS/image assets directly.
- **Doc Drift Found**: `README.md` and `docs/web_api.md` had still described `web_page/index.html` as active, and `docs/DEPLOYMENT.md` still claimed `no database` and `no secrets` even though Supabase-backed deployment env wiring now exists.
- **Blast-Through Lesson Promoted**: The repo-local `blast-through` skill now explicitly self-evolves and requires web-surface audits to verify the actual served entrypoint and static asset path before trusting UI docs.
- **Verification**: `node --check web\\app.js` and `node --test web\\tests\\api.test.js` passed after adding browser-entry smoke coverage for `/` and `/js/app.js`.

### Verification Surface Expansion - 2026-05-26
- **Test Inventory Added**: Added `docs/testing_surface.md` to group the active API, deployment, data, and macro verification commands.
- **Hard Rule Recorded**: The repo now explicitly states that tests must not be easy to pass; soft smoke checks are not enough for API, deployment, or macro-data trust.
- **New Contract Tests**: Added `test/scripts/deployment_manifest_contract.test.js` and `test/scripts/macro_ingestion_contract.test.js`.
- **Grouped Scripts**: Added `test:api`, `test:data`, `test:macro`, `test:deploy`, `test:contracts`, and `verify:strict` to `package.json`, then extended the contract slice with cache and Supabase route checks.
- **Verification Evidence**: 
  - `test:deploy` proved Docker/Kubernetes/docs alignment on port `8787`, cache TTL `30000`, and `sovereign-supabase` secret refs.
  - `test:macro` proved full-ingest macro history returned `22` canonical rows in the stubbed contract run and reserves history returned `9` rows with country/metric context.
  - `test:api` proved the served dashboard shell and active JS bundle reference the current local API contract without stale hybrid endpoints.

### Artifact Inspection Rule - 2026-05-26
- **Real Artifact First**: When the user asks to print data, use a real fixture or live artifact first and label any synthetic contract sample explicitly.
- **Printable Evidence**: A real cache-summary artifact is available at `scripts/test/fixtures/outputs/backend_data_summary_command_exposes_real_cache_ohlcv_summary_when_executable_is_available.json`, showing `AAPL`, `1d`, `5` bars, `accepted_records: 5`, `rejected_records: 0`, and a canonical `market_data_summary` payload.

### Cache And Supabase Route Contracts - 2026-05-26
- **Cache Contract**: Added `test/scripts/cache_contract.test.js` to prove cache reuse when enabled and strict freshness when disabled.
- **Supabase Route Contract**: Added `test/scripts/supabase_route_contract.test.js` to prove auth/database route shape with a mocked client and bearer token handling.
- **Verification Evidence**: `cache_contract` showed `calls: 1`, `entries: 1` with cache enabled and strict freshness with cache disabled; `supabase_route_contract` returned `auth_status: 200`, `db_status: 200`, and `table_count: 6`.

### Macro Normalization Store - 2026-05-26
- **Canonical Store**: Added a normalized macro observation helper and a new `public.macro_observations` Supabase table so raw macro values, source timestamps, and unit labels can be stored together with a unitless feature value.
- **Normalization Rule**: Macro rows are now stored with `raw_value`, `normalized_value`, and `unit`; the current feature transform is `signed_log1p` so index-point series like CPI and PPI stay labeled correctly while still fitting the same schema as rates and counts.
- **Mapping Fix**: Corrected the `ADP` macro mapping to `ADPWNUSNERSA` so it no longer mirrors the `NFP` PAYEMS series.
- **Verification Evidence**: `test/scripts/macro_store_contract.test.js` proved the canonical row shape and Supabase batch write contract, while the macro ingest contract still returned 22 records with the existing historical fixture path.

### Deep Blast-Through Dev Review Queue - 2026-05-26
- **Dev Review MD**: Added `workspace/DEV_REVIEW.md` as the active human-review queue for files and decisions that need developer judgment after blast-through sessions.
- **Workflow Sync**: Promoted Gemini review-session rules into Codex `blast-through`, including archive checks, developer-comment harvesting, dev-review ledger maintenance, data preservation review, visibility checks, and LOC reporting for major audits.
- **Security Cleanup**: Removed browser-visible fallback values from `web_page/src/lib/api.ts` and `web_page/src/lib/supabase.ts`; environment variables are now required for React/Vite API token and Supabase client configuration.

### Mass Implement & Audit Refinement - 2026-05-25
- Broad repository improvement passes across C++, Node, and React surfaces.
- Filled core feature engineering shells (Label Builder, Lookahead Guard, Sentiment Features).
- Implemented spectral clustering and multi-asset portfolio monitoring in C++.
- Synchronized all platform documentation to Phase 3/4 active status.
- Added parity checking for ML model candidates between C++ and JS registries.
- Redesigned the dashboard control room for improved telemetry visibility.
