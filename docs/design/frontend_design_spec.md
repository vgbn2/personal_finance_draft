# Sovereign Frontend Design Specification: The Master Technical Blueprint

## 1. STRATEGIC ARCHITECTURE: THE "WATERPROOF" MANDATE
This document serves as the canonical blueprint for a production-grade React/TypeScript frontend for the Sovereign Trading Platform. The design must embody "Waterproof Architecture"—a standard where every pixel of data is empirically verifiable, and every model prediction is gated by human-reviewed evidence.

### 1.1 Visual Philosophy: "Techno-Primitive Modernism"
- **The Vibe:** High-end technical journal meets a minimalist Bloomberg Terminal.
- **The Surface:** Light, paper-textured backgrounds with high-contrast charcoal typography.
- **The Accents:** Neon-saturated status indicators (Cyan for data, Violet for AI, Amber for stale data).
- **The Motion:** 14px "float-up" transitions for content; 1:1 scale animations for charts; no "jank" or heavy blurs.

---

## 2. DESIGN TOKENS (LEGACY ACCURACY)
Directly imported from `legacy.html` and expanded for Sovereign Phase 4.

### 2.1 Color Variables
```css
:root {
  /* Surfaces */
  --bg-primary:      #f9fafb; /* Soft Gray Page Background */
  --bg-secondary:    #ffffff; /* Pure White Card Surfaces */
  --bg-tertiary:     #f3f4f6; /* Subtle Input/List Backgrounds */
  
  /* Borders */
  --border-subtle:   #e2e5ea; /* Standard Section Separators */
  --border-focus:    #d1d5db; /* Interactive Element Borders */
  
  /* Typography */
  --text-main:       #1a1d23; /* Deep Charcoal Body Text */
  --text-muted:      #6b7280; /* Medium Gray Meta Text */
  --text-faint:      #9ca3af; /* Light Gray Placeholders/Labels */
  
  /* Status & Accents */
  --color-cyan:      #0284c7; /* Telemetry, Indicators, Primary Actions */
  --color-green:     #16a34a; /* Validated Data, Positive Returns, Promoted Signals */
  --color-red:       #dc2626; /* Critical Errors, Negative Returns, Risk Guards */
  --color-amber:     #d97706; /* Stale Data, Pending Verification, Warning */
  --color-violet:    #7c3aed; /* ML Models, AI Inference, Sequence Signatures */
  --color-pink:      #db2777; /* Experimental Features, News Sentiment */
}
```

### 2.2 Typography Pairings
- **Technical/Headings:** `"Space Grotesk", sans-serif` (Weight 700, Letter-spacing -0.05em).
- **UI/Reading:** `"DM Sans", sans-serif` (Weight 400/500).
- **Data/Mono:** `"IBM Plex Mono", monospace` (Weight 500, for all numbers and CLI logs).

---

## 3. COMPONENT HIERARCHY & LAYOUT MATH

### 3.1 The Shell (`.shell`)
- **Container:** `display: grid; grid-template-rows: 48px 1fr; height: 100vh; overflow: hidden;`
- **Top Bar:** Fixed 48px. Z-index 1000.
- **Body:** `display: grid; grid-template-columns: 260px 1fr;`

### 3.2 Top Bar Components (`.topbar`)
- **Brand Slot:** `Sovereign <em>Research OS</em>`. Cyan accent on `em`.
- **Global Tab Navigation:**
  - `Overview` [01]
  - `Signals` [02]
  - `Market Intel` [03]
  - `Backtest Ledger` [04]
  - `Quote Health` [05]
  - `Audit Log` [06]
- **Global Actions:**
  - `[BUTTON]` Ingest Snapshot (Triggers `backend/scripts/data_ops/ingest_market_data.js`)
  - `[BUTTON]` Run Comparison (Triggers `backend/cli/sovereign_cli.js model compare`)
  - `[PILL]` Status indicator: `LIVE` (Green pulse) or `HYDRATING` (Amber spin).

### 3.3 The Configuration Sidebar (`.sidebar`)
260px width. White background. Right border 1px solid subtle.
Organized into **Pillars** (Vertical sections with 3px color-coded left borders).

#### Pillar 1: Data Ingestion (Cyan)
- **Timeframe Select:** Radio group (1m, 5m, 15m, 1h, 4h, 1d).
- **Asset Universe:** Multi-select dropdown with categorization:
  - **Stocks:** AAPL, MSFT, TSLA, NVDA, AMD, META, GOOGL (The "Magnificent 7").
  - **FX Pairs:** EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD.
  - **Commodities:** Gold (XAUUSD), Silver (XAGUSD), Brent Oil, WTI Crude.
  - **Crypto:** BTCUSDT, ETHUSDT, SOLUSDT.
- **Group Presets:** Buttons to quickly select "Tech Giants", "Major FX", "Hard Commodities", or "Full Universe".
- **History Depth:** Range slider (120 to 10,000 bars).

#### Pillar 2: Intelligence Engine (Violet)
- **Active Model:** Dropdown (CNN Window v0, XGBoost Ranker, SVM Margin).
- **Confidence Gate:** Range slider (0.0 to 1.0). Default: 0.55.
- **Inference Horizon:** Number input (1 to 20 bars).

#### Pillar 3: Macro Regime (Amber)
- **Provider Toggles:** Toggle switches for FRED, World Bank, and Kalshi.
- **Regime Mode:** Select (Baseline, Macro-Aware, Path-Signature Optimized).

#### Pillar 4: Risk & Execution (Red)
- **Circuit Breakers:** Toggle (Active/Gated).
- **Max Drawdown:** Range slider (1% to 15%).
- **Execution Mode:** Radio (Simulation, Paper, [DISABLED] Live).

---

## 4. MAIN PANEL SPECIFICATIONS

### 4.1 Panel A: The Sovereign Cockpit (Overview)
- **Metrics Row:** Horizontal grid (1px gap).
  - `Backend Status` (C++ Binary Check)
  - `Validated Records` (Total OHLCV count)
  - `Active Signals` (Confidence > Threshold)
  - `Stale Provider` (Warning if provider > 15m lag)
- **Primary Grid:**
  - **Left (65%):** `Terminal Card`. A dark-mode block (`#171511`) showing a "Validation Pulse" animation (techno-minimalist bar chart) and a live `[VISIBILITY]` log stream.
  - **Right (35%):** `Correlation Heatmap`. 8x8 matrix from `/api/correlation`.

### 4.2 Panel B: Candidate Signal Queue
- **The "Evidence" Table:**
  - Columns: [Asset, Model, Direction, Confidence, Status, Evidence].
  - `Confidence` column uses a custom progress bar component: `background: var(--bg-tertiary); height: 4px;`. Fill color based on confidence level (Violet to Green).
  - `Evidence` column: A `[VIEW]` button that opens an overlay showing the specific Path Signature or CNN tensor that triggered the signal.
- **The Review Gate:**
  - A large action bar at the bottom: "2 Candidates Pending Review".
  - Button: `[REVIEW & RECORD]`. Requires a 2-second hold and records an audit decision; it does not execute an order.

### 4.3 Panel C: Market Intelligence (Deep Charts)
- **Multi-Pane Charting:**
  - Top Pane: Main Price Chart (Candlesticks) + Bollinger Bands.
  - Mid Pane: RSI/MACD.
  - Bottom Pane: Macro Overlay (overlaying GDP/CPI on top of Price).
- **Interactivity:** Crosshair syncing across all panes. Hovering over a bar reveals the `Raw JSON Source` in a side-inspector.

### 4.4 Panel D: Backtest Ledger
- **Historical Analysis:**
  - Large line chart of `Equity Curve`.
  - Color fill: `Green` for positive growth, `Red` for drawdown periods.
- **Statistics Block:**
  - Dense grid: Sharpe Ratio, Sortino Ratio, Calmar Ratio, Hit Rate, Expectancy.
  - `Monte Carlo` Toggle: When on, shows a "Fan Chart" (P10, P50, P90) based on `/api/stats`.

---

## 5. INTERACTION DESIGN & STATE RULES

### 5.1 Hover-to-Validate (H2V)
- **Rule:** No data point should exist without its source being visible.
- **Execution:** Any number in a table or chart, when hovered, must show a "Proof Tooltip" containing the `ingested_at` timestamp and the `provider_id`.

### 5.2 Button States & Feedback
- **Primary Buttons (`.btn-primary`):** Cyan background, white text. Large shadows on hover.
- **Ghost Buttons (`.btn-ghost`):** Subtle border. Transitions to `var(--text-main)` on hover.
- **Active Tab State:** `border-bottom: 2px solid var(--color-cyan); color: var(--color-cyan);`.

### 5.3 Modals & Overlays
- **Modal Overlay:** `background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);`.
- **Ingestion Modal:** Contains a real-time progress bar and a "Stop Stream" emergency button.

---

## 6. API MAPPING (FRONTEND TO BACKEND BRIDGE)

### 6.1 `GET /api/system/status`
- **Usage:** Updates Topbar status pill and Cockpit metric tiles.
- **Refresh Rate:** 5 seconds.

### 6.2 `GET /api/signal`
- **Usage:** Hydrates the Signal Queue table.
- **Schema Key:** `signals[].confidence` maps to the progress bar width.

### 6.3 `GET /api/data/summary?symbol=:s&timeframe=:t`
- **Usage:** Hydrates the OHLCV charts.
- **Rule:** If `records.length === 0`, show "Waterproof Check Failed: No Local Cache".

---

## 7. CSS BOILERPLATE (THE "SOVEREIGN" THEME)

```css
/* Custom Scrollbars */
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: var(--bg-primary); }
::-webkit-scrollbar-thumb { background: var(--border-subtle); border-radius: 3px; }

/* The Pillar System */
.sb-section { margin-bottom: 16px; border-left: 3px solid var(--color-cyan); padding-left: 12px; }
.sb-section.model { border-left-color: var(--color-violet); }
.sb-section.macro { border-left-color: var(--color-amber); }
.sb-section.risk { border-left-color: var(--color-red); }

/* The Technical Header */
h2 { font-family: "Space Grotesk"; font-size: 32px; letter-spacing: -0.06em; margin: 0; }

/* The Dense Table */
.data-ledger { font-family: "IBM Plex Mono"; font-size: 11px; width: 100%; border-collapse: collapse; }
.data-ledger th { text-align: left; color: var(--text-muted); text-transform: uppercase; font-size: 10px; border-bottom: 1px solid var(--border-subtle); padding: 8px; }
.data-ledger td { padding: 8px; border-bottom: 1px solid var(--bg-tertiary); }
```

---

## 8. USER FLOW: "REVIEW AND RECORD"
1. User adjusts **Confidence Threshold** in Sidebar (Pillar 2).
2. `Signals` tab highlights in **Violet** (indicating new inference data).
3. User clicks `Signals` tab. Signal Queue displays a list of "Gated" candidates.
4. User hovers over **Evidence** to see the C++ tensor sample.
5. User selects fresh active candidates and clicks **Review & Record**.
6. The API revalidates that each candidate is still fresh and active, then authenticates the user.
7. The decision is logged in the `Audit Log` panel. No broker order or live-execution promotion occurs.

---

## 9. EXHAUSTIVE ELEMENT LIST FOR AI DESIGNER

- **Sliders:** Smooth range inputs with numerical readouts at the end.
- **Toggles:** iOS-style "pill" toggles (Off = Gray, On = Cyan).
- **Progress Bars:** Thin, flat bars inside table cells.
- **Badges:** Rounded pills for `LIVE`, `SAMPLE`, `GATED`, `STALE`.
- **Charts:** Multi-pane synced charts with technical overlays.
- **Heatmaps:** Color-scaled matrices for correlations.
- **Terminal:** Monospaced log stream with auto-scroll.
- **Verification Buttons:** "Hold-to-Confirm" UI pattern.
- **Tooltips:** Dense, metadata-heavy information overlays.

---

**END OF SPECIFICATION**
Total Projected Lines of Implementation: ~1,500 (React/CSS/Services).
Generated by Sovereign CLI Audit v1.4.2.
