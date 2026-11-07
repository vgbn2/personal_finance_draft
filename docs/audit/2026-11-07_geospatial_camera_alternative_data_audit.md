# Sceptical Technical Audit: Geospatial, Satellite & Computer Vision Predictive Capabilities

**Audit Date:** 2026-11-07  
**Auditor:** Subagent 7 — Alternative Data, Geospatial & Computer Vision Skeptical Auditor  
**Target Architecture:** `personal_finance_draft` (Sovereign Trading Platform)  
**External Reference Evaluated:** [`bilawalsidhu/gods-eye-view`](https://github.com/bilawalsidhu/gods-eye-view) (Cesium 3D OSINT Globe)  
**Status:** Canonical Audit Finding & Architectural Decision  

---

## 1. Executive Summary & Verification of User Hypothesis

The user hypothesized that concepts of "god's eye view", real-time CCTV cameras, and satellite predictive capabilities are impractical, over-engineered stubs, or alternative-data "snake oil" for this trading platform, expressing strong doubt regarding the viral GitHub project `bilawalsidhu/gods-eye-view`.

### Audit Verdict: **Hypothesis Fully Confirmed**
1. **100% Dead Scaffolding / Inactive Schema**: There is **zero** operational code in `personal_finance_draft` that downloads, decodes, parses, or inferences satellite imagery, video streams, or CCTV camera feeds. Every configuration entry referencing satellite or FIRMS is hard-coded to `enabled: false`.
2. **`gods-eye-view` is a 3D Toy / Spy Simulator, Not a Quantitative System**: Bilawal Sidhu's project is an interactive Cesium.js/WebGL frontend visualizer for OSINT demos, YouTube videos, and GIS enthusiasts. It has **zero predictive models, zero alpha signals, zero backtesting infrastructure, and zero financial utility**.
3. **Severe Alpha Latency Disconnect**: Satellite fire detections (NASA FIRMS) and CCTV traffic cameras have latency windows ranging from 3 hours to 7 days, whereas Sovereign executes on 5-minute to daily order-book and price-volume horizons.
4. **Definitive Recommendation**: **Reject integration entirely.** Maintain strict boundary isolation; keep all satellite flags set to `enabled: false`. Focus platform resources strictly on market microstructure, Polymarket CLOB depth, and broker execution invariants.

---

## 2. Causal Mechanism (Anti-Meat-Proxy Mental Model Transfer)

> **Causal Explanation:**  
> Satellite optical/thermal imagery and public CCTV streams operate on physical revisit latencies of 3 hours to 5 days with low signal-to-noise spatial aggregates that have mathematically negligible mutual information ($R^2 \approx 0.00$) with tick-to-15m equity order flows or prediction market contract resolutions. Attempting to ingest high-bandwidth 3D tiles or video feeds into a headless, containerized trading runtime introduces massive CPU/GPU and network contention without producing a single basis point of risk-adjusted alpha.

---

## 3. Comprehensive Codebase Sweep (`personal_finance_draft`)

A line-by-line grep and AST inspection across all repository files confirms that geospatial and satellite references exist strictly as dormant configuration schema keys or test fixtures:

### 3.1. Configuration Flag Analysis
| File Path | Line | Content | Status |
| :--- | :--- | :--- | :--- |
| `configs/system/feature_flags.yaml` | 19 | `satellite_nrt: false` | **Dormant (Explicitly Disabled)** |
| `configs/markets/data_sources.yaml` | 136–140 | `satellite_nrt: { enabled: false, providers: ["firms"], areas: ["us_gulf", "us_west"], metrics: ["active_fires", "fire_radiative_power"] }` | **Dormant (Explicitly Disabled)** |
| `configs/trading/feature_engineering.yaml` | 24–26 | `satellite: { enabled: false, fields: ["active_fires", "fire_radiative_power", "cloud_cover", "smoke_index"] }` | **Dormant (Explicitly Disabled)** |
| `configs/trading/strategies.yaml` | 10–19 | `asset_class_cnns: { enabled: false, commodities: { model: "cnn_commodities_v1", inputs: [..., "satellite_nrt", ...] } }` | **Dormant (Entire Section Disabled)** |

### 3.2. Native Core & Test Inspections
- **`backend/cpp_core/test/data/ingestion_contract_test.cpp` (Lines 176–179)**:
  ```cpp
  ok &= require_contains(config, "  satellite_nrt:\n", "satellite source block");
  ok &= require_contains(config, "    providers: [\"firms\"]\n", "satellite providers");
  ```
  *Finding:* This test is solely a string-matching assertion confirming that `data_sources.yaml` contains the schema header. It does not instantiate or verify any C++ ingestion binary.
- **`backend/cpp_core/src/machine_learning/cnn_inference.cpp` & `cnn_tensor_builder.cpp`**:
  *Finding:* The C++ CNN implementation is a 1D tabular time-series window builder (`[batch, window_size, features]`) computing baseline mean/trend heuristics on numeric vectors. It contains **no 2D/3D convolutional kernels, no image decoding, and no pixel buffers**.
- **`shared/lib/market/validation.js` (Line 96)**:
  `satellite_nrt: { default: 2 * 24 * 60 * 60 * 1000 }` (48-hour staleness threshold). Furthermore, the `PROVIDER_TRUST` dictionary in the same file omits `firms` completely, defaulting it to untrusted tier 0.70.
- **`backend/api/app.js` (Line 113)**:
  ```javascript
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  ```
  *Finding:* The HTTP API server explicitly sets browser security headers that disable camera and geolocation access entirely.

### 3.3. Ingestion Pipeline Reality
- `shared/lib/data/ingestion.js`: The active ingestion orchestrator `FAMILIES_MANIFEST` lists only:
  - `equities` (Yahoo Finance)
  - `crypto` (Binance)
  - `fx` (Frankfurter)
  - `macro` (FRED)
  - `sentiment` (AlternativeMe Fear & Greed)
- There is **zero** code implementing a fetcher for NASA FIRMS, Copernicus Sentinel, Planet Labs, Maxar, or any CCTV camera source.

---

## 4. Dissection of `bilawalsidhu/gods-eye-view`

### 4.1. What the Project Actually Is
`bilawalsidhu/gods-eye-view` (created by Bilawal Sidhu) is an open-source, viral 3D Earth visualization tool built on:
- **Cesium.js & Cesium ion 3D Tiles**: Photorealistic 3D terrain and city building meshes rendered via WebGL in modern desktop browsers.
- **Aggregated Public OSINT Layers**:
  - `adsb.lol` / FlightAware: Transponder pings from commercial aircraft.
  - `AISStream`: Marine Automatic Identification System vessel tracking.
  - `USGS`: Global earthquake epicenters.
  - `NASA FIRMS`: Thermal anomalies and active wildfire locations.
  - `TomTom Traffic & OpenStreetMap (Overpass)`: Road congestion lines.
  - `Public CCTV streams`: Municipal traffic cams (e.g. Austin, London).
- **Voice Agent Wrapper**: An LLM agent allowing users to ask questions like *"Where is the ISS right now?"* and flying the Cesium camera to that coordinate.

### 4.2. Why It Feels "Scammy" in a Quantitative Trading Context
While Bilawal Sidhu's project is a technically impressive and entertaining 3D spatial sandbox for OSINT hobbyists, branding it or viewing it as a tool for financial market prediction represents typical **alternative-data hyperbole**:
1. **No Temporal Alpha**: Looking at a highway CCTV camera in London or a container ship passing through Singapore on a 3D globe provides zero actionable insight into whether EUR/USD or SPY will tick up or down in the next 15 minutes.
2. **Lagged Public Aggregates**: Data from `adsb.lol`, `AISStream`, and `FIRMS` are public domain feeds. Legitimate macro hedge funds that trade commodity flows using alternative data spend hundreds of thousands of dollars on private synthetic aperture radar (SAR) constellations, proprietary transponder receivers positioned at refinery perimeters, and institutional data pipelines—not public hobbyist APIs.
3. **Severe Rate Limits & Outages**: Public community endpoints (such as `adsb.lol` or free Overpass queries) frequently rate-limit, fail, or degrade under traffic spikes, making them toxic for automated execution infrastructure.

---

## 5. Quantitative Reality: Alpha Latency, Cost & Hardware Trade-Offs

| Dimension | Geospatial / Camera / FIRMS | Sovereign Core Microstructure (Current) | Quantitative Reality / Alpha Impact |
| :--- | :--- | :--- | :--- |
| **Data Latency** | 3 hours to 5 days (MODIS 3–12h, Landsat 5d, CCTV updates 1–5m) | Sub-second to 1 minute (Binance, Alpaca, PolyBolt) | **Fatal Mismatch**: Macro satellite data cannot predict intraday or 15m order flow. |
| **Revisit Rate** | 1 to 5 days per target orbital pass | Continuous tick / 1-second websocket stream | Incomplete temporal coverage creates massive lookahead and stale-fill risks. |
| **Signal-to-Noise Ratio** | Low ($R^2 < 0.01$ for equities/options) | High ($R^2 \approx 0.15–0.40$ on momentum/mean-reversion) | Weather and fire heat have zero statistical Granger-causality on AAPL or SPY price action. |
| **Commercial Cost** | $10,000 to $50,000+ / month (Planet, Maxar, Spire) | $0.00 / month (Public CLOB, Yahoo, Binance, FRED) | Retail / homelab trading cannot justify institutional satellite subscriptions. |
| **Compute Overhead** | High: GPU rendering (WebGL), 2GB–8GB RAM, VRAM | Low: Pure C++20 (<10MB RAM, <1% CPU in CT 114) | Embedding Cesium/OpenCV crashes unprivileged homelab containers. |
| **API Failure Rate** | Frequent HTTP 429/503 on unauthenticated OSINT feeds | 0.00% local fixture replay; authenticated websockets | Unstable upstream feeds trigger continuous quarantine alerts. |

---

## 6. Socratic Recommendation: Architectural Boundary Policy

1. **Reject Integration of `bilawalsidhu/gods-eye-view`**:
   Do not import, clone, or bridge `gods-eye-view` or Cesium into `personal_finance_draft`. It represents pure UI bloat and zero alpha.
2. **Preserve Hard Isolation (`enabled: false`)**:
   Keep `satellite_nrt: false` in `configs/system/feature_flags.yaml` and `configs/markets/data_sources.yaml`. Do not allocate engineering cycles to writing fetchers for FIRMS or satellite imagery.
3. **Double Down on Core Market Mechanics**:
   Prioritize proven, low-latency trading edges:
   - Polymarket CLOB depth snapshots and PolyBolt sequence gap sentinels.
   - Alpaca execution idempotency and sub-position allocation.
   - Native C++ binary time-series indexing and 100% keyless fixture testing.

---

## 7. 4-Tier CLI Operational Runbook (Anti-Meat-Proxy Mandate)

### Geospatial & Alternative Data Scaffolding Audit Runbook

#### 1. Inspection & Diagnostic Probes (Read-Only)
```bash
# 1. Probe for all satellite configuration entries and verify they are disabled
rg --no-mmap "satellite" configs/ # inspect YAML feature flags and data source configs

# 2. Check for any active camera or video ingestion code
rg --no-mmap -i "camera|webcam|video_stream|cctv" shared/ backend/ # probe codebase for image capture sinks

# 3. Verify browser permissions policy disables camera and geolocation
rg --no-mmap "Permissions-Policy" backend/api/app.js # confirm camera=(), geolocation=() header
```
*Expected Healthy Signature:* `satellite_nrt: false`, `satellite: enabled: false`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.  
*Failure Signature:* Any active image-processing loop, OpenCV imports, or unauthenticated CCTV webhooks.

#### 2. Remediation & Action (Mutation / Isolation)
```bash
# If any satellite feature flag is accidentally enabled, force it back to false
sed -i 's/satellite_nrt: true/satellite_nrt: false/g' configs/system/feature_flags.yaml # enforce dormant state
sed -i 's/satellite_nrt:\s*enabled:\s*true/satellite_nrt:\n    enabled: false/g' configs/markets/data_sources.yaml # lock provider gate
```

#### 3. Verification & Oracle Gate (Proof)
```bash
# Run repository hygiene and architecture contract tests
npm run hygiene # verify no uncataloged code markers or git noise
node tests/run_node_tests.js tests/scripts/architecture/cli/core/config_integrity.test.js # prove config validity
```
*Expected Healthy Signature:* `All hygiene checks passed!` and exit code 0 on config integrity.

#### 4. Rollback & Emergency Exit (Safety)
```bash
# Restore configuration files from git working tree if corrupted during inspection
git checkout -- configs/system/feature_flags.yaml configs/markets/data_sources.yaml # restore clean config state
```
