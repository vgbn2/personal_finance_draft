## Session Memory - 2026-06-07 Real ML buildout â€” Phase 0 (ONNX in C++) + Phase 1 (JS feature layer)

{
  "work": "Audit found the 'ML' was fake (deterministic_adapter heuristics). User approved a real ONNX-in-C++ ML buildout. Completed Phase 0 (enable + prove ONNX inference in C++) and Phase 1 (JS feature pipeline + `ml dump` training-CSV command).",
  "architecture_decision": "Design B: JS builds the feature frame (single source for train-dump AND serve, no skew); C++ is INFERENCE-ONLY (receives a feature vector, runs ONNX). Chosen because all data ingestion already lives in JS and the C++ feature pipeline isn't CLI-wired / macro is Supabase-only. Supersedes the original 'C++ builds features' plan. See workspace/ML_SECTION_PLAN.md ARCHITECTURE UPDATE.",
  "phase0_onnx_cpp": [
    "Enabled SOVEREIGN_ENABLE_ONNX_RUNTIME=ON (local build; CMake default kept OFF for portability). onnxruntime 1.17.1 win-x64 FetchContent download+link works on Win32 MSVC.",
    "onnx_model.cpp: fixed Windows wide-path bug (Ort::Session needs ORTCHAR_T/wchar_t, not char*); load failure now logs (was silent).",
    "CMakeLists: added reusable sovereign_copy_onnx_runtime(target) post-build DLL copy; sovereign_wealth now links onnxruntime (static core links it PRIVATE, final exe must satisfy Ort symbols).",
    "onnx_model_test.cpp: flag-aware â€” loads real storage/models/smoke.onnx, asserts backend()=='onnx_runtime'. PROVEN: [[1,2,3],[4,5,6]]->[2,5], 228us, exit 0."
  ],
  "phase1_js_features": [
    "coingecko.js: fetchCoinGeckoMcapSeries() + stablecoin id overrides. Fixed real bug: baseSymbol() stripped bare stablecoins to '' (USDT now -> tether).",
    "crypto_aggregates.js (NEW): buildCryptoAggregateSeries() reconstructs historical total mcap / BTC dominance / stablecoin mcap from per-coin market_caps (free /global is snapshot-only).",
    "feature_builder.js (NEW): buildMLFeatureFrame() composes indicators.js (technical + rollingCorrelation + correlation divergence + crypto-stable sentiment) with cross-family corr/regime columns + 3-class N-bar forward label. Point-in-time (label-only lookahead; tail rows dropped).",
    "ml_dataset.js (NEW): cache bar loader (per-symbol bar cap for the O(n^2) build), cacheCloseSeriesAnchor, frameToCsv.",
    "ml.js (NEW) + sovereign_cli `ml` handler: `sovereign ml dump` writes the training CSV (cache anchors + crypto_aggregates file + FRED macro)."
  ],
  "verification": [
    "npm test -> 237/237 pass (8 new ML tests: 2 coingecko-agg, 2 feature_builder, 3 ml_dataset, +1).",
    "LIVE: ml dump --symbols AAPL,MSFT,SPY --days 365 -> 1017 rows x 26 cols CSV at storage/data/ml/feature_frame.csv (technical + xf_corr_/regime_ FX anchors + label). MSFT down row fwd=-0.0746.",
    "LIVE: fetchCoinGeckoMcapSeries('USDT') -> 365 pts, 186.9B (matches /global).",
    "onnx_model_test real onnx_runtime inference; cnn_inference_test, model_registry_test PASS."
  ],
  "cautions": [
    "ONNX export: onnxruntime 1.17.1 caps model IR version at 9 -> Python exports MUST set model.ir_version = 9 (opset can be 13-20). Discovered: venv onnx wrote IR 13 -> C++ load failed.",
    "Python: base Windows-Store python's onnx is corrupted (onnx.defs missing). Use the gitignored .venv_ml/ (onnx/onnxruntime/numpy; torch+xgboost already in base). Phase 2 adds skl2onnx/onnxmltools.",
    "BIGGEST GAP: ml dump reads storage/data/cache/<family>/backtest_history.json, but the core crypto universe (BTC/ETH/SOL) + metals/energy anchors live in the BINARY storage/data/ts/ index (48-byte Float64), NOT that file. So ml dump currently covers equities + FX + the 3 backfilled crypto only. Need a JS binary-ts reader (or repopulate backtest_history.json, or shell to C++) before full-universe training.",
    "buildCryptoAggregateSeries has no production caller yet (only its test) â€” awaits a rate-limit-aware `ml aggregates refresh` job to write crypto_aggregates.json. CoinGecko free tier rate-limits the full ~17-coin burst.",
    "feature build is O(n^2) (expanding-window calculateRollingFeatureFrame) â€” ml dump caps bars via --days (1d => N bars). Don't run unbounded on 7000-bar equities.",
    "Windows MSVC: an uncaught C++ exception aborts with 0xC0000409 (looks scary, it's just terminate). In Git Bash a missing-DLL launch shows exit 127."
  ],
  "next_steps": [
    "Phase 1 finish: JS binary-ts-index reader for full universe; `ml aggregates refresh` job (throttle/backoff) -> crypto_aggregates.json.",
    "Phase 2 (Python in .venv_ml): train trees(XGBoost/LightGBM)/linear/CNN + regime classifier on the feature CSV, 3-class label; export ONNX with ir_version=9 -> storage/models/*.onnx; update metadata.json.",
    "Phase 3 (C++): `ml predict`/`ml compare` command (feature vector in -> ONNX -> prediction), batched.",
    "Phase 4: backend_bridge.js + TUI 'Machine Learning' section (model comparison; add `ml` to manifest).",
    "Phase 5: route backtest model.predict through C++ ONNX; relabel JS heuristics heuristic_baseline."
  ],
  "dcs": 0.96
}

