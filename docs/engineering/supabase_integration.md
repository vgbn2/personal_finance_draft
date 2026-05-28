# Supabase Auth And Database

Sovereign now uses Supabase for first-party auth and user-owned persistence.

## Configuration

Set these in the local `.env` file or the process environment before starting the web server:

```env
SOVEREIGN_SUPABASE_URL=
SOVEREIGN_SUPABASE_PUBLISHABLE_KEY=
SOVEREIGN_SUPABASE_SECRET_KEY=
```

Use a publishable key for browser and local web API flows. Do not place a Supabase secret key or legacy `service_role` key in browser-visible code.
Use the secret key only for trusted server-side ingest jobs that need to write to your own database.

If you set `SOVEREIGN_API_TOKEN`, use it only for write or admin-style routes. Public read endpoints do not need it.

## Schema

The initial migration is `supabase/migrations/20260526121418_initial_auth_database_schema.sql`.

Tables:
- `profiles`
- `portfolios`
- `holdings`
- `watchlist_items`
- `saved_backtests`
- `audit_events`
- `macro_observations`

All public tables have Row Level Security enabled. User-owned rows are scoped with `(select auth.uid())`; no table has broad anonymous data access.

`macro_observations` stores normalized macro rows with the raw value, a unit label, and a unitless `signed_log1p` feature so CPI, PPI, rates, counts, and level series can live in one canonical table without losing the source value.

## Local Web API

Endpoints:
- `GET /api/supabase/config`
- `GET /api/auth/status`
- `GET /api/database/status`
- `GET /api/system/status`

`/api/database/status` requires a Supabase bearer token and checks table readability through the user's RLS context.
