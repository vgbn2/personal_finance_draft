# Sovereign Web Dashboard

This folder contains the React and Vite source for the local Sovereign dashboard.

## What This Folder Owns

- `src/` contains the active frontend source
- `dist/` contains the built artifact served by `backend/api/app.js`
- `package.json` contains the frontend-only dev, build, and typecheck scripts

## Local Development

Prerequisites:

- Node.js

Install dependencies:

```bash
npm install
```

Run the Vite development server:

```bash
npm run dev
```

Build the frontend bundle that the Node bridge serves:

```bash
npm run build
```

Run the production-build viewport contract at 360, 768, and 1440 pixels:

```bash
npm run test:responsive
```

The responsive harness uses the locally installed `/usr/bin/google-chrome`; restricted sandboxes must
allow the headless browser process to start.

## Runtime Notes

- The local bridge in `backend/api/app.js` serves `dist/index.html`, not `src/` directly.
- If you change frontend source files, rebuild `dist/` before treating the served bridge as updated.
- API and Supabase configuration come from Vite environment variables such as `VITE_API_URL`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY`.
- The dashboard build also accepts the repo-native Supabase aliases `SOVEREIGN_SUPABASE_URL` and `SOVEREIGN_SUPABASE_PUBLISHABLE_KEY` for local `.env` files.
- Vite variables are compiled into public browser assets. Never put broker secrets, a Supabase secret key, or a privileged host token in a `VITE_*` variable; protected API calls use the signed-in user's bearer token.
- The `Quote Health` view uses the protected global-monitor API for instrument truth, keeps provider-level
  status as separate context, and pauses its 10-second refresh while the browser tab is hidden.
- The signal queue records authenticated review decisions only. Order execution remains in the separately gated CLI/gateway path.
