# Google AI Studio Frontend Prompt - Sovereign Control Room

Build a polished single-page web dashboard for a local-first trading research prototype named `Sovereign Control Room`.

Visual direction:
- Use a warm neutral research-lab background, not a generic dark dashboard.
- Pair ivory paper surfaces with high-contrast ink panels.
- Accent colors should be cyan, lime, amber, muted blue, and controlled red.
- Typography should feel like a serious quant terminal plus a premium product dashboard: expressive geometric headings and a compact monospace for route labels, metrics, and API details.
- Avoid generic card-grid clutter. Use one strong sidebar, one large first-viewport hero/control panel, and deliberate data sections.
- No decorative hero eyebrow badges. No fake production claims. No purple-on-white default styling.

Required layout:
- Left sticky sidebar with brand mark, navigation, and local system status.
- Main hero titled `Sovereign Control Room`.
- Hero copy: local-first trading research dashboard for validated market data, model comparison, candidate signals, and backtest evidence.
- A dark telemetry panel with animated vertical market bars and three small telemetry counters.
- Market snapshot section with AAPL bars, MSFT bars, universe count, and correlation status.
- Candidate signal queue with table columns: Asset, Model, Direction, Confidence.
- Quote health panel showing provider freshness/status.
- Backtest ledger with source mode, model, net return, drawdown, win rate.
- Local API contract section listing the active endpoints.

Functional constraints:
- Keep all visible UI text code-native.
- Preserve these API endpoints exactly:
  - `/api/signal`
  - `/api/data/summary?symbol=AAPL&timeframe=1d&max_bars=252`
  - `/api/data/summary?symbol=MSFT&timeframe=1d&max_bars=252`
  - `/api/correlation?symbols=AAPL,MSFT,SPX&timeframe=1d&max_bars=252`
  - `/api/universe?max_entries=8`
  - `/api/quotes/status`
  - `/api/cache/list`
- Do not reference `/api/hybrid/signals`.
- Do not claim promoted ONNX runtime inference. Use `deterministic CNN baseline boundary`.
- Signals are candidates, not orders.
- The design must be responsive on desktop and mobile.

Implementation notes:
- A single static HTML file with embedded CSS and vanilla JavaScript is acceptable.
- Use local API hydration with `fetch(..., { cache: 'no-store' })`.
- Include reduced-motion support.
- Use smooth reveal motion and chart bar animation only where it clarifies hierarchy.
