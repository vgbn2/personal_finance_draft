# Environment Boundaries

`config/system/environment_manifest.json` is the canonical name-only classification contract. It classifies
every environment name and alias used by source or tracked examples without reading or reporting values.

Run the contract check with:

```bash
npm run check:env
```

## Classes

| Class | Intended ownership | Examples |
|---|---|---|
| `public` | Browser-safe public configuration | API URL, Supabase URL, Supabase publishable key |
| `developer` | Non-secret local configuration | runtime mode, cache bounds, local paths |
| `private` | Provider-read or operator-only material | data-provider credentials, account context |
| `central` | Private host authentication and service state | API/MCP tokens, server-side Supabase secret |
| `execution` | Local-only order-capable material and controls | wallet/L2 credentials, trade PIN, live authorization |
| `internal` | Process/runtime plumbing | `PATH`, CI and terminal flags |

An environment class is not an authorization grant. Provider accounts must still be provisioned with the
narrowest upstream permissions available, and runtime/auth/risk gates remain mandatory.

## Entrypoint Surfaces

The schema-3 manifest declares allowed surfaces for each entry: public client, default CLI, web, MCP, public
gateway, credentialed account gateway, writer, operator diagnostics, execution, process-internal plumbing, and
one contract surface for each of the seven Compose services.

The browser input set is exactly:

- `VITE_API_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Server-prefixed aliases are intentionally not browser fallbacks. Vite exposes build inputs to the client bundle,
so adding a new browser variable requires a manifest and contract-test change.

## File Ownership

- `.env.example` is the legacy name inventory while entrypoint projection is migrated.
- `.env.central.example` documents the private, non-live research host.
- `Frontend/dashboard/.env.example` contains the complete browser allowlist.
- Real `.env`, `.env.local`, `.env.private`, `.env.central`, and future `.env.execution` files are ignored,
  operator-owned, and must remain mode-restricted where supported.
- Execution material must not be copied into web, MCP, default CLI, writer, or remote source-mirror inputs.

Do not inventory environment values. A safe audit reports only filenames, variable names, classifications, and
missing/forbidden names.

## Compose Service Contract

`compose_services` is the only service-to-key policy owner. Each row records the Compose profile, command
identity, required/optional/defaulted projected names, fixed safe overrides, mounts, and forbidden environment
classes. All seven services forbid the execution class. Web, host health, host backup, and portfolio monitor
receive no provider/account key in their declared projection; backfill owns the bounded provider-read set.

`node backend/scripts/ops/prepare_central_env.js` reports a name-only projection preview. A missing required name
or any forbidden/unknown name fails its service row without printing values.

This is contract clarity, not runtime isolation. `infra/docker/docker-compose.yml` still attaches the same central
`env_file` to all seven services. Do not claim per-service isolation until the separately approved Compose
projection batch replaces that shared injection and passes rendered-environment plus rollback tests.

## Current Migration Boundary

The manifest, frontend allowlist, exclusive environment loading, and gateway/MCP child projection are enforced
as source contracts. Direct entrypoint projection and per-service Compose injection remain separate lifecycle
batches and must be verified before the classes become a complete runtime authority boundary.

Until those batches close:

- keep live execution disabled;
- keep the API private/loopback-bound;
- do not infer process isolation from filenames alone;
- do not rename, delete, merge, or copy real environment files automatically.
