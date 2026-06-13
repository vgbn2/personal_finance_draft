# ML Section Plan — Real ONNX Models Wired to the C++ Backend

> Created 2026-06-07. Multi-session anchor. Source of truth for the ML buildout.
> Supersedes the `deterministic_adapter` heuristics in `shared/lib/models.js` and
> `backend/core/src/ml/model_registry.cpp` (kept as labeled baselines, not deleted).

## Context — why this exists

Audit finding (2026-06-07 blast-through): the "ML" in this repo is not machine learning.
Every model in `shared/lib/models.js` and `backend/core/src/ml/model_registry.cpp` is a
hand-coded heuristic tagged `status: 'deterministic_adapter'`. The C++ ONNX loader
(`onnx_model.cpp`) is real but gated OFF (`SOVEREIGN_ENABLE_ONNX_RUNTIME=OFF`) with no
`.onnx` files and no `main.cpp` command reaching it. `storage/models/metadata.json`
references `cnn_v3.onnx` + `regime_classifier.onnx` that do not exist (`promoted: false`).

Goal: a real, honest ML section — train models offline in Python, export to ONNX, run
inference in C++, compare all model families head-to-head, and feed a **cross-family
regime classifier** into the per-asset signal generators.

Decisions locked with the user:
- **Real trained ML via ONNX** (not relabeled heuristics).
- **All model families**, trained + compared for relative performance.
- **Cross-family entry = separate regime classifier** (cross-family logic in ONE place),
  feeding per-asset models.
- **Label = 3-class N-bar forward direction {down, flat, up}** (aligns with the existing
  C++ 3-class inference output; cleanest cross-model comparison). Triple-barrier = Phase 2 label.
- Python local for training; FRED_API_KEY present → macro anchors in scope.

## Key architectural rule — no train/serve skew

Cross-family + per-asset features are computed **once in C++** and emitted to a feature
frame that BOTH training (Python reads it) and live inference (C++ reads it) consume.
Never recompute features in Python for training and in C++ for serving — that silently
diverges the live model from the backtest. All correlations are **rolling, point-in-time
(data ≤ t only)** — no lookahead. Cross-family series are forward-filled to a common
daily grid (reuse the existing synthetic-daily-bar layer used for AAPL↔CPI).

## Cross-family regime classifier — feature spec

Inputs (all rolling returns / changes, mcap- or volume-weighted for reliability):
- **Crypto aggregates**: total crypto mcap return, stablecoin mcap return, BTC dominance (+Δ).
- **Metals**: GOLD (XAUUSD), SILVER (XAGUSD), COPPER (XCUUSD) returns.
- **Energy**: oil (USOIL/UKOIL), natgas (NG) returns. (Coal: skip — no free feed.)
- **FX majors**: USD(DXY-proxy), EUR, JPY, GBP, AUD, CAD, NZD, CHF returns.
- **Macro (FRED)**: PMIs (US_COMPOSITE/MANUFACTURING/SERVICES), CPI/PCE.
- Reliability weight: crypto per-coin mcap (CoinGecko); FX/commodities use volume/liquidity proxy.

Output: regime label/embedding (risk-on / risk-off / decoupling, or a small continuous
vector) → appended as input features to every per-asset, per-family model. We feed the
series and let the model learn linkages (energy→AUD/CAD/NZD, oil→USD demand, etc.) — no
hardcoded macro rules.

## Data availability (verified against config/markets/data_sources.yaml)

| Anchor | Status | Source |
|---|---|---|
| Metals gold/silver/copper | have | XAUUSD, XAGUSD, XCUUSD |
| Energy oil/gas | have | USOIL, UKOIL, NG |
| FX majors | have | full major pair set |
| PMIs / CPI / PCE | have (needs FRED_API_KEY ✅) | FRED series already configured |
| Total crypto mcap / BTC dominance | ADD (easy) | CoinGecko `/global` (keyless) |
| Stablecoin mcap | ADD (medium) | CoinGecko category / sum of top stables |
| Equity market cap (reliability) | gap | needs fundamentals feed — defer, use volume proxy |
| GDP-by-sector | defer (Phase 3) | FRED partial; sector mapping is real work |

Repurpose the orphan `fetchCoinGeckoHistory` (`shared/lib/providers/coingecko.js:70`) —
it already returns `market_cap` + `volume_24h`, the exact shape for mcap reliability data.

## ARCHITECTURE UPDATE 2026-06-07 (supersedes "C++ builds features")

Decision: **JS builds the feature frame; C++ is inference-only.** Discovery: all data ingestion
(market cache, crypto aggregates, FRED macro) lives in JS/Node, the C++ feature pipeline isn't
CLI-wired, and macro is Supabase-sourced — so building features in C++ would mean re-implementing
all data access there. Instead:
- **Feature assembly = JS** (`shared/lib/feature_builder.js`, new) — one builder used for BOTH the
  training dump and live serving (no train/serve skew). Rolling cross-family correlations computed
  in JS (simple Pearson over returns; no per-window C++ spawn). C++ `CorrelationEngine` stays for
  the heatmap/matrix use; bridge call optional later if perf needs it.
- **Training = Python** reads the JS feature dump.
- **Inference = C++** receives a feature vector + model name, runs ONNX, returns prediction
  (pure tensor-in/prediction-out; no data loading in C++).
- Phase 1.3/1.4 below are now JS (feature builder + `features dump` CLI). Phase 3 C++ `predict`
  takes a feature vector, not a data path.

## Phased build (each phase independently shippable + verified)

### Phase 0 — Build/infra enablement ✅ DONE (2026-06-07)
Verified end-to-end: C++ onnxruntime downloads → builds → links → loads DLL → runs a real model.
`onnx_model_test` → `backend()=="onnx_runtime"`, smoke model `[[1,2,3],[4,5,6]]`→`[2,5]`, 228us inference, exit 0.

Integration issues found + fixed (this is what the gate was for):
1. **Windows wide-path bug** — `onnx_model.cpp:38` passed `model_path.c_str()` (`char*`) to
   `Ort::Session`; Windows needs `ORTCHAR_T`=`wchar_t`. Fixed with `_WIN32` wstring conversion.
   (Never caught before because the file had never compiled with ONNX on.)
2. **DLL not beside exe** → STATUS_DLL_NOT_FOUND at runtime. Added reusable CMake
   `sovereign_copy_onnx_runtime(target)` post-build copy; applied to `sovereign_wealth`,
   `onnx_model_test`, `kronos_integration_test`.
3. **`sovereign_wealth` didn't link onnxruntime** — static `sovereign_core` links it PRIVATE,
   so the final exe must satisfy Ort symbols itself. Added the link + define to the main exe.
4. **IR-version ceiling** — onnxruntime 1.17.1 supports model **IR version ≤ 9**. The venv's
   `onnx` writes IR 13 by default → load fails. **Phase 2 export MUST set `model.ir_version = 9`**
   (opset can stay 13–20). Alternative: bump the C++ onnxruntime version.
5. **Python ONNX tooling**: base Windows-Store Python's `onnx` is corrupted (`onnx.defs` missing,
   pip-unmanaged). Created dedicated **`.venv_ml/`** (gitignored) with `onnx onnxruntime numpy`.
   Phase 2 adds `torch`(have, CPU) `xgboost`(have) + `skl2onnx`/`onnxmltools` here.

Decision (0.4): keep CMake default `OFF` for portability/CI (network-less builds); the local
build cache is configured `-DSOVEREIGN_ENABLE_ONNX_RUNTIME=ON`. ML/production builds pass the flag.

Pre-existing failure (NOT Phase 0, logged in DEV_REVIEW): `kronos_integration_test` reads the
deprecated monolithic `storage/data/cache/backtest_history.json` (migrated to family-partitioned
`cache/<family>/` in Phase 8) → "need at least 4 data points". Stale data-path, separate debt.

Smoke fixture: `storage/models/smoke.onnx` (175B, IR9) — keep as the C++ ONNX-runtime gate fixture.

### Phase 1 — Feature layer (C++ emits the single feature frame)
- New crypto-aggregate ingestion (CoinGecko `/global`): total mcap, BTC dominance,
  stablecoin mcap → new "series" entries in `config/markets/data_sources.yaml`.
- FRED macro anchors confirmed flowing via `shared/lib/providers/macro.js`.
- C++ cross-family feature builder using `CorrelationEngine` (`pairwisePearson`,
  `computeDivergence`) over forward-filled daily grid → extend `features/feature_frame.hpp`.
- New `features dump` command in `main.cpp` → writes the labeled feature frame (JSON/CSV)
  for Python to read.
- **Verify**: dump a frame for a few symbols; manual sanity on cross-family columns +
  point-in-time correctness (no future rows leak into row t).

### Phase 2 — Training (Python, offline)
- `scripts/ml/train.py` (+ requirements): read the C++ feature frame, build the
  3-class N-bar direction label, train ALL families:
  trees (XGBoost, LightGBM, random forest), linear (logistic, SVM), CNN (PyTorch over
  `cnn_tensor_builder` window), and the **regime classifier** (cross-family inputs).
- Export each to ONNX (`skl2onnx` / `onnxmltools` / `torch.onnx`) → `storage/models/*.onnx`.
- Update `storage/models/metadata.json` (real files, `promoted` flags) + `feature_config.yaml`.
- **Verify**: each `.onnx` loads in `onnxruntime` (Python) and on a holdout slice beats the
  matching deterministic baseline on accuracy/AUC. Check in one small sample model so the
  C++/JS path can be built+tested without re-running training.

### Phase 3 — C++ inference
- Feature assembly in C++ matching the training feature order (shared `feature_config.yaml`).
- Regime classifier runs first → its output feeds per-asset model inference.
- New `predict` / `ml compare` command in `main.cpp` → **batched over the whole frame**
  in one call (no per-row spawn). Returns per-model predictions + metrics as JSON.
- **Verify**: C++ `predict` on the same holdout matches Python inference within float tol
  (proves no train/serve skew).

### Phase 4 — JS + TUI section
- `shared/lib/backend_bridge.js` → call the C++ `ml`/`predict` command.
- New "Machine Learning" CLI/TUI section (manifest entry): model list, train-status,
  **model-vs-model comparison table** (reuse the `compareModels` surface in `models.js`).
- **Verify**: TUI section renders real comparison from C++ output; contract test on the
  bridge shape.

### Phase 5 — Backtest swap
- Route `model.predict` in `shared/lib/backtest.js` (lines ~756/773/1005) through the C++
  ONNX path when a promoted model exists; keep JS `deterministic_adapter` as a LABELED
  baseline (rename status honestly, e.g. `heuristic_baseline`).
- Trust gate compares real-model vs heuristic-baseline vs buy-hold benchmark.
- **Verify**: a backtest with `model: cnn_v3` shows `engine: onnx_runtime` provenance and
  trade behavior distinct from the heuristic baseline.

## Risks / watch-items
- **Train/serve skew** → single C++ feature source + shared `feature_config.yaml` (the rule above).
- **Leakage** → rolling/point-in-time features; label uses future bars only for the y, never X.
- **Calendar alignment** across 24/7 crypto vs weekday equities vs monthly macro → forward-fill grid.
- **onnxruntime on Win32 MSVC** → Phase 0 de-risks the build before any model work.
- **Spawn overhead** → batch inference per frame, never per row.

## Open design items to revisit
- Regime output: discrete label vs continuous embedding (decide after Phase 1 data look).
- Equity market-cap reliability weighting (needs a fundamentals feed) — deferred.
- GDP-by-sector commodity-FX linkage — Phase 3+.
- Triple-barrier label as the Phase-2 realistic-trading target.
