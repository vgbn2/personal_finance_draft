# Sovereign Web Dashboard

This folder contains the React and Vite source for the local Sovereign dashboard.

## What This Folder Owns

- `src/` contains the active frontend source
- `dist/` contains the built artifact served by `../web/app.js`
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

## Runtime Notes

- The local bridge in `../web/app.js` serves `dist/index.html`, not `src/` directly.
- If you change frontend source files, rebuild `dist/` before treating the served bridge as updated.
- API and Supabase configuration come from Vite environment variables such as `VITE_API_URL`, `VITE_API_TOKEN`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY`.
- The dashboard build also accepts the repo-native Supabase aliases `SOVEREIGN_SUPABASE_URL` and `SOVEREIGN_SUPABASE_PUBLISHABLE_KEY` for local `.env` files.
