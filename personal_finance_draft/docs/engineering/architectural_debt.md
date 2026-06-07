# Architectural Debt & Refactoring Roadmap

**Status:** ACTIVE Audit
**Context:** This platform has been refactored away from early generated logic that had high coupling, hardcoded values, and weak tests. We are continuing toward institutional-grade dynamic schemas.

## 1. The "Magic Number" Hit List (Hardcoding)
- [x] **Signal Weights**: Hardcoded 0.45/0.35/0.20 in `backtester.cpp`. (FIXED: Moved to `BacktestConfig`)
- [x] **FRED Mappings**: Static series dictionary in `ingest_market_data.js`. (FIXED: Moved to `data_sources.yaml`)
- [x] **Indicator Parameters**: Rigid `rsi_14`, `macd`, `volatility_20` fields in `IndicatorRow`. (FIXED: Refactored to dynamic metrics map)
- [x] **Universe Defaults**: strategy planning now scans cache instead of defaulting to `SPY/QQQ`.

## 2. Structural Entropy (Complexity Wall)
- **Problem:** "If/Else Proliferation" in `sovereign_cli.js` and `ingest_market_data.js`.
- **Status:** **REMEDIATED** - `ingest_market_data.js` now uses `FAMILIES_MANIFEST` to orchestrate ingestion.

## 3. Test Quality Mandate (Anti-Bullshit)
- **Status:** **REMEDIATED** - Established `loadFixture` pattern in `sovereign_cli.test.js` using external JSON fixtures in `scripts/test/fixtures/`.

## 6. Visibility Gaps (Black Box Risks)
- [x] **ML Pipeline Opacity**: `KronosTokenizer` and `KronosTensorBuilder` (C++) lack `[VISIBILITY]` logging. (FIXED: Added sampling logs, fingerprints, and boundary stats)
- [x] **Ingest Traceability**: Ingest snapshots now add skipped `provider_checks` for disabled families and `--family` filters, with direct contract coverage in `scripts/tests/sovereign_cli.test.js`.

## 7. Configuration Debt
- [x] **Consolidate Breadth**: Breadth ratios were defined in both `data_sources.yaml` and `options_data.yaml`. (FIXED: Centralized in `data_sources.yaml`)
- [x] **Manifest Parity**: `scripts/tui_cli/manifest.js` now tracks the active strategy labels and family options added to the CLI surface.

## 4. Developer Feedback (Consolidated from .txt files)
- **Features Zone**: "still empty, have a lot to do" (Referencing `label_builder.cpp`, `lookahead_guard.cpp`, etc.)
- **ML/Feeds/Parser Zone**: Earlier review flagged rigid generated logic in this area.
- **Ingestion Zone**: "i dont understand this section, is this done or not" (Referencing complex adapter flow)
- **Test Zone**: Earlier review flagged hardcoded tests, pass-only fixtures, and excessive branch complexity.

## 9. Code-Level Developer Feedback (via 'dev review' / 'dev suggest')
- [x] `cpp_core/src/stats/stats_engine.cpp`: "confidence score= weighted of the above dev suggest" (RESOLVED)
- [x] `cpp_core/src/stats/stats_engine.hpp`: "from 1-100 dev suggest" (RESOLVED)

## 5. Granular Open Item List (C++ Core)
- [x] **Real Sentiment Scoring**: Sentiment scoring lives in `features/sentiment_features.cpp` and is covered by `cpp_core/test/feature_pipeline_test.cpp`; `ml/sentiment_ingestion.cpp` remains a thin ingestion adapter.
- [ ] **Feature Engineering**: Implement `label_builder.cpp`, `lookahead_guard.cpp`, and `sentiment_features.cpp`.
- [x] **Macro Features**: `macro_features.cpp` implemented with Rate Momentum and Liquidity Index.
- [x] **Technical Features**: `technical_features.cpp` and `path_signature.cpp` active.
- [ ] **Position Sizing**: Implement Kelly Criterion in `portfolio/kelly_sizing.cpp` (Phase 5).
- [ ] **Exposure Management**: Implement multi-asset exposure in `portfolio/multi_asset.cpp` (Phase 5).
- [ ] **ONNX Real Linkage**: Promote the deterministic baseline adapter into physical `onnxruntime` linkage when the dependency/toolchain gate is available.

## 8. Cleanup Priority for the Next Refactor Pass
1. Normalize the ingestion boundary so `scripts/data_ops/ingest_market_data.js` stays the canonical manifest-driven orchestrator and any older helper stays a thin compatibility shim only if it is still called.
2. Consolidate backfill/provider routing so `scripts/lib/backfill.js` owns chunking and parallel pagination, while the CLI only handles command orchestration.
3. Lock the macro provider boundary so FRED and World Bank primitives stay in `scripts/lib/providers/macro.js` and are re-exported through `scripts/lib/providers/index.js` instead of being duplicated elsewhere.
4. Add one path note in the workspace docs after the split is cleaned up so future passes can tell active code from legacy glue at a glance.
5. Keep strategy catalogs honest about capability level: research-only signals, backtest-only models, and executable order flow should be labeled differently so UI and CLI surfaces do not overclaim broker support.

## 8b. Adapter Boundary Update - 2026-06-02
- `shared/lib/adapters.js` has been reduced to a compatibility shim that re-exports the canonical provider and backfill modules.
- The live ingest and backfill code now owns the behavior; the adapter module no longer carries its own duplicate fetch implementation.
- Future cleanup should prefer removing compatibility imports entirely rather than widening the shim again.

## 9. Structural Health Debt - 2026-05-31
- [ ] **Canonical Layout Decision**
  - Deferred: whether to keep the current domain layout (`backend/`, `Frontend/`, `shared/`) or migrate to the Sovereign Architect target (`apps/`, `packages/`, `native/`).
  - Why: current build/runtime files actively depend on the domain layout, so a blind folder move would break CMake, Docker, npm scripts, test paths, and MCP entrypoints.
  - Where: root folder layout, `docs/ARCHITECTURE.md`, `package.json`, `Dockerfile`, `CMakeLists.txt`.
  - Risk if ignored: future agents keep mixing standards and adding new code to stale paths.
  - Retires when: one canonical layout is recorded and a structural contract test guards the chosen entrypoints.
  - Owner: repo architecture maintainer.
- [x] **Tracked Generated Artifacts**
  - Fixed: root `node_modules`, `backend/gateway/node_modules`, `storage/data/cache`, and local `.mcp.json` were removed from the Git index with `git rm --cached` while staying on disk.
  - Guard: `tests/scripts/structure_contract.test.js` asserts generated/local-only paths are ignored and not tracked.
  - Residual: future passes should still scan for other generated roots before release.
- [ ] **Path Drift In Docs And Tests**
  - Deferred: full docs/test rewrite from legacy `cpp_core`, `web_page`, `web`, `scripts/lib`, and `scripts/cli` paths to active `backend/core`, `Frontend/dashboard`, `backend/api`, `shared/lib`, and `backend/cli` paths.
  - Progress: README, Quickstart, web/API docs, engineering standards, lower-traffic docs, the legacy CLI artifact, and the path resolver now point at the active domain layout.
  - Why remaining: a few fixtures, legacy tests, and archival docs still need a final docs-sync/test-repair pass or an explicit archival label.
  - Where: docs/operational, docs/engineering, docs/research, tests/scripts/tests, C++ test defaults.
  - Risk if ignored: stale commands, failing legacy tests, and incorrect automation handoffs.
  - Retires when: README/quickstart commands run against active paths and legacy path references are either updated or explicitly marked archival.
  - Owner: repo architecture maintainer.

---
*Roadmap generated under Sovereign Institutional Standards.*
