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

---
*Roadmap generated under Sovereign Institutional Standards.*
