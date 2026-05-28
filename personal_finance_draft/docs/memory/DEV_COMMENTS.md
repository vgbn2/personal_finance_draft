# Developer Intent & known Issues Index

This file tracks developer comments, `TODO` markers, and architectural notes harvested during blast-through audits.

## High-Signal Intent (Comments)

### `cpp_core` (Backend)
- `correlation_engine.cpp:11`: "//really questioning the logic of this" - Indicates doubt about the Pearson/Spearman implementation.
- `onnx_model.cpp:10`: "External ONNX Runtime linkage is an explicit CMake opt-in so CI does not imply promoted inference" - Clear policy on external dependencies.
- `backtester.cpp:15`: "//max drawdown=peak(max)-deep(min)of equity points ,dev reviewed okay" - Verification marker.
- `quote_feed.hpp:22`: "//is quote bar and quote tick the same?" - Unresolved domain model question.

### `scripts` (Operational Layer)
- `sovereign_cli.js:1000`: "//line 950-1104 can be optimize" - Large block of redundant provider logic in `loadHistoricalSources`.
- `ingest_market_data.js:128`: "//adopt alpaca api as well" - Roadmap item for multi-provider support.
- `sovereign_cli.js:2038`: "//formating errors" - Reference to ANSI spinner characters.
- `sovereign_cli.js:2083`: "//bunch of ifs again" - Acknowledgment of brittle input handling in TUI.

### `web` (Frontend Bridge)
- `cli_executor.js:25`: "5 seconds cache for dashboard snappiness" - Performance trade-off documentation.

### `web_page` (React Frontend)
- `Sidebar.tsx:10`, `OverviewPanel.tsx:19`, `SignalPanel.tsx:14`: "const API_URL = 'http://localhost:8787'" - Hardcoded API endpoint duplicated across components. Refactor into `lib/api.ts` requested.
- `SignalPanel.tsx:56`: "// Simulation of a verification API call to the backend" - Confirmation that promotion logic is currenty a UI-only bridge; persistence required in Phase 5.
- `OverviewPanel.tsx:78`: "const assets = 'AAPL,MSFT,TSLA,NVDA,BTCUSDT,ETHUSDT,XAUUSD,BRENT,EURUSD'" - Static asset list for correlation; should fetch from `/api/universe`.

## Architectural Seams (System Risk)

### 4. Frontend Security Bridge (`web/app.js`)
- **Status:** SECURED.
- **Features:** CORS (Port 3000/8787), Rate Limiting (120 req/min), X-Sovereign-Token validation.
- **Risk:** Browser fallback tokens were removed on 2026-05-26. Reviewer still needs to confirm the intended local auth mode and whether React/Vite should call Supabase directly or only through `web/app.js`.

### 5. Macro Data Provenance (`scripts/api_data_verify/`)
- **Finding:** Robust toolset for verifying FRED/MT5/Binance data. `headway_mt5_check.js` is the canonical tool for resolving the FX freshness warning.

## Strongest Gap Candidates

1. **ONNX Real Linkage:** `onnx_model.cpp` is a mock. Promoting this to physical linkage is the top priority for Phase 4.
2. **Macro Backfill Optimization:** `loadHistoricalSources` in `sovereign_cli.js` is repetitive and manual. It should be refactored to use the manifest-driven logic in `ingest_market_data.js`.
3. **Rust CLI Parity:** The Rust CLI in `cli/` is mostly stubs. Deciding whether to promote Rust or stick with the mature Node CLI is a strategic decision.

## Dev Review Queue

- See `workspace/DEV_REVIEW.md` for active human-review decisions. This keeps high-signal review work separate from broad comment harvesting.
