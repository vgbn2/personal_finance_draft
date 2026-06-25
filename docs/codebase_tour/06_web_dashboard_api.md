# Module 06 — Web Dashboard & API

`docs/engineering/web_api.md` (dated 2026-06-08) gets the runtime shape right but its endpoint list is
incomplete — it's missing at least `/api/sigma-band`, a route that's had two separate security review
passes this repo's history (a real unauthenticated path-read finding, fixed session 53). Treat that doc's
endpoint list as a starting point, not a complete inventory, until it's refreshed.

## Runtime shape (confirmed current)

```
browser / API client
    |
    v
backend/api/app.js              <- plain Node HTTP server, not Express, default port 8787
    |
    v
backend/api/server/routes/index.js   <- flat map: pathname -> handler module, grouped into
    |                                    account/ bot/ data/ market/ status/ system/ subfolders
    +--> backend/cli/sovereign_cli.js (in-process command execution)
    +--> C++ backend executable, when available
```

Each route module exports `{path, status(payload), handle(query, context)}`. Data sources are either a
cached JSON file (e.g. the sigma-band route reads `storage/data/cache/backtest_history.json`) or an
in-process call into the CLI's command layer via `cli_executor.js` — there's no separate database server
for this.

## Auth model

`app.js`: a hardcoded `isPublicRoute` list (health, status, signal, universe — no token needed) plus a
`PROTECTED_GET_ROUTES` list (portfolio, cache, config, bot status, kill-switch — these need an
`x-sovereign-token` header matching `SOVEREIGN_API_TOKEN`) for routes that are read-only but still
sensitive. An MCP-specific gate (`isMcpAllowed(pathname)`) runs *before* the token check, specifically to
block agent traffic from certain routes before it even gets a chance at token validation.

## Static asset serving

The frontend isn't served by a separate process in production — `WEB_PUBLIC_ROOT` in `app.js` points at
`Frontend/dashboard/dist` (the Vite build output), and unmatched requests fall through to a
`serveStatic()` function after route dispatch. That function does a real path-containment check
(`path.normalize()` + `filePath.startsWith(WEB_PUBLIC_ROOT)`, 403 on failure) — a genuine path-traversal
guard, not decorative. In dev, Vite's own dev server runs separately on port 3000 and is allow-listed in
the CORS config alongside the production origin.

## The frontend's side of the wire

`Frontend/dashboard/src/lib/api.ts` exports `API_BASE_URL` (defaults to `http://localhost:8787`,
overridable via `VITE_API_URL`), an `API_ENDPOINTS` object, and `DEFAULT_HEADERS` (adds
`x-sovereign-token` if `VITE_API_TOKEN` is set, merges in a Supabase session token when available).
Components import these directly rather than going through a shared fetch wrapper with retry logic — if
you're debugging a flaky frontend request, there's no central retry layer to check, just the individual
component's `fetch` call.

## Two real, code-present safety mechanisms worth knowing about

- **Rate limiting**: an IP-keyed sliding window in `app.js`, ~10 req/s, with stale entries purged every 5
  minutes specifically to avoid unbounded `Map` growth under sustained traffic.
- **CORS origin allowlist**: only the configured host/port and `localhost:3000` are accepted; anything
  else gets a 403, not a permissive wildcard.

## Labs

**Lab 1 — find the real endpoint inventory, not the stale doc's list.** Read
`backend/api/server/routes/index.js` directly and list every registered path. Compare against
`docs/engineering/web_api.md`'s "Active Endpoints" section — what's missing from the doc?

**Lab 2 — trace one route end to end.**
```bash
node backend/api/app.js
```
then in another shell:
```bash
curl http://127.0.0.1:8787/api/sigma-band
```
Open the route module this hits and trace it back to the actual JSON file or CLI function it reads from.
Is the response authenticated? Should it be, given what it returns? (This route had a real
unauthenticated-path-read finding fixed in session 53 — confirm the fix is still in place by reading the
handler, not by trusting this sentence.)

**Lab 3 — the path-traversal guard.** Read `serveStatic()` in `app.js`. Construct (on paper) a request
path that would attempt to escape `WEB_PUBLIC_ROOT`, and trace exactly which line rejects it.

**Lab 4 — frontend to backend, one full round trip.** Pick one component under
`Frontend/dashboard/src/` that calls an `API_ENDPOINTS` entry. Trace: component -> `api.ts` -> which
backend route -> which data source. Does the displayed value in the UI match what you'd get calling the
same endpoint directly with `curl`?
