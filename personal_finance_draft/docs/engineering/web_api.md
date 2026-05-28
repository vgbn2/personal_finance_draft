# Web And API Bridge

The repo now has an active local web/API bridge. It is a local inspection surface for the CLI and C++ backend, not a production trading server.

## Current Status

Active local server:

```bash
node web/app.js
```

Default address:

```text
http://127.0.0.1:8787
```

Runtime shape:

```text
browser / API client
    |
    v
web/app.js
    |
    v
web/server/services/cli_executor.js
    |
    +--> scripts/cli/sovereign_cli.js
    |
    +--> C++ backend executable when available
```

The server currently serves the built React dashboard from `web_page/dist`, with `web_page/src` as the source tree and `web/app.js` as the runtime bridge. Browser work should treat the built `web_page/dist` bundle plus the bridge endpoints as the source of truth.

## Active Endpoints

```text
GET /health
GET /api/system/status
GET /api/status
GET /api/data/summary?symbol=AAPL&timeframe=1d&max_bars=5
GET /api/correlation?symbols=AAPL,MSFT,SPX&timeframe=1d&max_bars=30
GET /api/signal
GET /api/backtest
GET /api/backend/stats
GET /api/backend/portfolio
GET /api/universe
GET /api/quotes/status
GET /api/cache/list
```

`/api/system/status` summarizes CLI, backend, quote, and cache health. It may return `ok: true` with `degraded: true` when the core path is usable but a component such as quote freshness is unhealthy.

`/api/quotes/status` returns inspectable quote-source JSON even when quote providers are stale or not configured, so the dashboard can show the degraded state instead of hiding it behind a generic failure.

`/api/signal` reads the latest local model-comparison and backtest artifacts, returns candidate signal rows, and keeps `promoted: false` until a separate promotion gate approves a model. The served dashboard uses this endpoint for the signal queue, model winner, threshold, and latest backtest summary.

`/api/backtest` exposes the latest backtest summary plus backend stats when the native executable is available. When the native stats executable is unavailable locally, the web bridge can return a local `backend_stats` fallback from the recorded equity curve and label that fallback in the payload.

## Responsibilities

The web surface should:

- display system status and degraded components
- display data-quality reports
- display backend summaries, correlations, universe, portfolio, and stats
- display candidate signals, latest backtest summaries, and research outputs
- manage non-dangerous local settings later
- submit dry-run jobs later

The web surface should not:

- own core calculations
- bypass CLI or core validation
- store raw secrets in browser code
- trigger live execution without explicit server-side gates

## Known Gaps

- The served entrypoint is the built artifact in `web_page/dist`, so source changes in `web_page/src` need a rebuild before the bridge reflects them.
- Some dashboard panels still need real data wiring beyond the hydrated market, quote, signal, and backtest surfaces.
- Quote imports can be stale or unconfigured while the rest of the system is healthy.
- Production deployment, authentication, and external exposure are not active.
- Supabase-backed private data is now scaffolded, but the public dashboard remains read-only unless an authenticated user flow is added.

## Promotion Criteria

Before treating the web/API layer as production-ready:

- consolidate the served UI entrypoint
- hydrate dashboard panels from the active endpoints
- add browser-level UI tests
- document local-only versus deployable mode
- add authentication and execution gates before any live-trading action
