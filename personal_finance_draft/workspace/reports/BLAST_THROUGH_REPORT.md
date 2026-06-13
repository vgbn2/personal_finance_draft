# Blast-Through Audit Report - 2026-06-10 (Post-Repair)

**Mode:** Hard Reading — Comprehensive system evaluation
**Scope:** Architecture, Security, Data Integrity, and Ingestion Pipeline
**DCS (Current):** 0.88 (Stable) -> 0.98 (Healthy) after crypto repairs.

## 1. Top Gap Candidates
| Candidate | Risk Level | Description | Recommended Move |
| :--- | :---: | :--- | :--- |
| **Indicator Scalability** | **High** | Manual threading across JS/C++ (5+ files) for every new indicator. | Implement `indicator_manifest.yaml` |
| **Alt-Data Family Stubs** | **Medium** | Stubs for SEC, SP Global, ECB in `ingest_market_data.js` limit the "Sovereign" scope. | Prioritize provider implementation |
| **Fuzzy Resolver Drift** | **Low** | Redundant fuzzy matching logic in `utils.js` and `research_config.js`. | Centralize into a shared module |

## 2. Section Grades
| Section | Grade | Reason |
| :--- | :---: | :--- |
| `backend/cli/commands` | **A** | **Upgraded**: Clean re-org, usage of resilient bridge, no more spawnSync duplication. |
| `backend/gateway` | **A** | **Upgraded**: Security sanitization complete, auth leakage risk neutralized. |
| `shared/lib/runtime` | **A** | **Excellent**: High-integrity paths and bridge node for process execution. |
| `storage/data` | **A** | **Restored**: Artifact hygiene restored via .gitignore; data depth fixed for all crypto. |
| `infra/docker` | **C** | **Gated**: ONNX runtime flag still unverified due to Docker daemon issues. |

## 3. Architecture Seam Check
- **Execution Bridge**: `backend_bridge.js` is a decoupled, high-integrity seam. Verified good.
- **Indicator Engine**: **System Risk**. Violates separation of concerns due to hardcoded keys in `featureFromWindow` (JS) and `IndicatorEngine` (C++).
- **Ingestion Provider Seam**: Well-isolated but contains multiple functional gaps (stubs).

## 4. Data Integrity & Provenance
- **ML Path**: `verify_parity.py` provides excellent empirical proof of train/serve consistency.
- **Data Freshness**: System restored to 100% coverage for 1d/1w timeframes.
- **Verification**: `backend integrity --json` now provides granular timeframe visibility.

## 5. Migration Readiness
- **Cloud Portable**: `REPO_ROOT` resolution is robust.
- **Hardcoding**: `BACKEND_CANDIDATES` remains in `paths.js` but is centralized.
- **Environment**: `.gitignore` update cleared 2,900+ noise artifacts.

## 6. Next Cleanup Move
**Refactor the indicator addition path.** Create a central schema (YAML) that generates the necessary C++ headers and JS mappings to stop the manual threading risk.

---
[Investigate Seam](file://shared/lib/market/indicators.js) | [Track Debt](file://workspace/DEV_COMMENTS.md) | [Verify Integrity](node backend/cli/sovereign_cli.js backend integrity)

---

# Deep Blast-Through Update - 2026-06-11

**Mode:** Hard reading, live dirty-tree audit after graph refresh.
**Graph:** rebuilt from `6eea7b77`; 9205 nodes / 14200 edges / 730 communities.
**DCS:** runtime 0.98 locally, repository reproducibility 0.82 until clean-clone gaps close.

## Strongest Gap Candidates

| Candidate | Risk | Evidence | Recommended Move |
| :--- | :---: | :--- | :--- |
| Clean-clone C++ break | P0 | `backend/core/CMakeLists.txt:94` and `backend/core/src/main.cpp` reference `frame_backtester`, but `frame_backtester.{cpp,hpp}` are untracked. | Track the files or remove the references before any broad commit. |
| Test/docs depend on untracked assets | P0 | Full suite passes locally, but tracked tests/docs call untracked `scripts/classify_strategy_assets.js`, `scripts/mcp_stdio_probe.js`, `backend/api/tests/correlation_contract.test.js`, and ignored `notebooks/*.ipynb`. | Track fixtures/scripts or rewrite contracts to generate/skip local-only assets. |
| Repo-local skills inventory hollow | P1 | `.agents/skills` lists many directories without `SKILL.md`; `GEMINI.md` points to absent `.codex/skills/repo-global-protocol/SKILL.md`. | Restore missing skills or update instructions to live skill paths. |
| Docker hygiene still not clone-safe | P1 | `.dockerignore` is untracked; Dockerfile ONNX flag remains unverified. | Track `.dockerignore`; verify Dockerfile after Docker Desktop restart before commit. |
| Provider stubs still active | P2 | OpenSky, Blockchair, SEC, SP Global PMI, ECB, TradingView screener remain empty/stubbed boundaries. | Prioritize providers by product value; keep green no-spend tests scoped honestly. |

## Current Section Grades

| Section | Grade | Reason |
| :--- | :---: | :--- |
| CLI/TUI/status/settings | B+ | Focused tests green; current feature work is covered. |
| API/Web contracts | B+ | API and correlation fallback pass, but new contract file is untracked. |
| C++ core | C | Local build passes only because untracked frame-backtester sources exist. |
| Data/ingestion | B- | Status/integrity green; provider extraction stubs remain. |
| Gateway/Polymarket | B | No-spend contracts pass; live spend remains deliberately unverified. |
| Infra/Docker | C | ONNX container path remains blocked; `.dockerignore` untracked. |
| Repo workflow/skills | C- | Advertised repo-local protocols are absent or empty. |
| Docs/workspace truth | B- | Ledgers are useful but over-reference untracked proof commands. |

## Verification Evidence

- `graphify update .` -> 9205 nodes / 14200 edges / 730 communities.
- Modified JS `node --check` probes passed for status, API executor, trade, TUI asset picker,
  ingestion, and user settings.
- Focused no-spend tests passed: CLI/settings/TUI 25/25; API/Web 4/4; macro/reserves 2/2;
  gateway 30/30; strategy 22/22; CLI/module loading 16/16.
- `node scripts/mcp_stdio_probe.js` -> 17 MCP tools.
- `npm.cmd test` -> 269/269 pass.
- `cmake --build backend/core/build --config Release --target sovereign_wealth` -> pass after
  cleaning duplicate `Path`/`PATH` environment variables in this shell.
- `status --json` -> `cache_mode:"recovered_live"`, 293 usable records, 0 stale.
- `backend integrity --json` -> 84/84 cached, 0 missing, 0 stale, only `RNDRUSDT` exception.

## Next Cleanup Move

Close clean-clone reproducibility first. The minimum set to decide is:
`backend/core/src/backtest/frame_backtester.{cpp,hpp}`, `scripts/classify_strategy_assets.js`,
`scripts/mcp_stdio_probe.js`, `backend/api/tests/correlation_contract.test.js`, `.dockerignore`,
and the notebook fixtures/contracts. Runtime is healthy locally; the main blocker is whether the
repository alone can reproduce that health.
