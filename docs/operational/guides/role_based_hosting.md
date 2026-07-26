# Role-Based Portable Hosting

The repository separates three decisions that must not be collapsed into one:

1. **Deployment profile** — which services a machine may run.
2. **Access role** — which capabilities an authenticated user or service may use.
3. **Runtime policy** — whether execution is safe and authorized in the current mode.

A machine profile never grants user permissions, and an `owner` role never bypasses the execution runtime policy.

## Deployment profiles

| Profile | Purpose | Default services | Canonical writer |
|---|---|---|---:|
| `all-in-one` | Laptop rehearsal with every role available | `web` only | Yes, when explicitly started |
| `central-host` | Persistent private host | `web`, `backfill` | Yes |
| `developer` | Source, build, tests, local tools | None | No |
| `client` | Remote read-only workstation | Connector | No |

`all-in-one` deliberately makes `backfill`, monitoring, research, paper, and connector roles available without
starting them. Compose places `backfill` behind the `writer` profile, and the central updater refuses the
`all-in-one` profile. This permits a complete rehearsal on the laptop while keeping provider polling and
persistent loops behind an explicit operator action.

Generate a laptop rehearsal environment:

```bash
npm run host:prepare-central-env -- --profile all-in-one
docker compose --env-file .env.central -f infra/docker/docker-compose.yml config --quiet
```

The environment generator refuses to overwrite `.env.central` unless `--force` is supplied. Review and preserve
the existing file before using that option.

## Access roles

| Role | Intended access |
|---|---|
| `viewer` | Cached data, research views, and status |
| `analyst` | Viewer plus research runs, portfolio views, user configuration, and signal-review persistence |
| `operator` | Analyst plus paper operation, data-writer operation, host inspection, and safety controls |
| `owner` | Every defined capability; live execution still requires the independent runtime policy |
| `service` | No inherited permissions; each service token receives an explicit capability list |

The existing host API token maps to `owner` for compatibility. The distinct client token maps to a read-only
`service` principal and cannot operate paper, host, configuration, local-file override, or signal-promotion
paths.

Human Supabase sessions use this precedence:

1. `SOVEREIGN_USER_ROLE_MAP`, a server-owned user-ID-to-role map.
2. Trusted Supabase `app_metadata.sovereign_role`.
3. `SOVEREIGN_DEFAULT_USER_ROLE`, which defaults to `viewer`.

Example owner mapping for a private single user:

```env
SOVEREIGN_DEFAULT_USER_ROLE=viewer
SOVEREIGN_USER_ROLE_MAP='{"00000000-0000-0000-0000-000000000000":"owner"}'
```

Do not derive a privileged role from browser input or user-editable metadata. Unknown roles and service-role
assignments to human users fail closed.

## Authorization behavior

Protected operations declare capabilities through `shared/lib/auth/access_policy.js`.

- Missing or invalid authentication returns `401 authentication_required`.
- Valid authentication without the required capability returns `403 insufficient_capability`.
- Unknown or misspelled capability names fail closed as `invalid_capability_policy`.
- Local file/path overrides require `local_file_override.read`.
- Kill-switch status is readable by a viewer; changing it requires `safety.control`.
- Unknown mutation routes require `host.manage`.
- Socket.IO telemetry requires `status.read`; every handshake and reconnect resolves the browser's current
  Supabase access token.
- Every registered API route is covered by a policy-classification contract.

Public GET routes retain their current local-first behavior. Wider-than-loopback exposure remains a separate
security change and is not approved by the role model.

## IP and session records

Authenticated session tracking is enabled in the central environment template:

```env
SOVEREIGN_AUTH_SESSION_TRACKING=true
SOVEREIGN_IP_CHANGE_POLICY=audit
SOVEREIGN_TRUST_PROXY=false
```

The registry is stored at `storage/runtime/auth_sessions.json` by default with owner-only mode. It stores:

- a one-way session fingerprint, never the token;
- principal ID, identity type, and role;
- first and last source IP;
- first and last seen timestamps;
- IP-change count and the last risk reason.

`audit` records a meaningful IP change without blocking the user. `reauth` returns
`401 ip_reauthentication_required` for an authenticated non-tunnel session whose public source IP changes.
Human records are keyed to a one-way stable subject fingerprint, not the rotating Supabase access token. After
an IP-change challenge, the authenticated user can explicitly confirm the pending source IP with
`POST /api/auth/session/reauth`; the route cannot approve a different IP or another principal. If the registry
cannot be read or written, `reauth` remains fail closed across repeated requests.

SSH-tunnel requests normally appear as loopback. They are marked `tunnel_opaque`; the API does not pretend
`127.0.0.1` is the remote user's original IP. Forwarded headers are ignored while `SOVEREIGN_TRUST_PROXY=false`.
The central preflight currently rejects enabling proxy trust because no reverse proxy has been qualified.

IP addresses are operational and personal data. Protect the registry with the same backup, retention, and access
controls as other private host state.

## Laptop rehearsal order

Run these boundaries separately:

1. Generate or review the `all-in-one` environment.
2. Render Compose and run authorization/deployment contracts.
3. Start only `web` after explicit runtime approval.
4. Verify an authenticated local request.
5. Verify an SSH connector from a second machine.
6. Create and restore a temporary backup.
7. Verify restart and one-writer lock behavior.
8. Start `backfill` only after provider polling and canonical-data mutation are explicitly approved.
9. Start paper or research loops only through their explicit Compose profiles.

Static validation:

```bash
npm run test:api
npm run test:contracts
npm run test:deploy
npm run test:secrets
npm run hygiene
docker compose --env-file .env.central -f infra/docker/docker-compose.yml config --quiet
```

Foreground host resource monitor:

```bash
npm run host:monitor
npm run host:monitor -- --interval 5 --containers
npm run host:monitor -- --once --no-clear
```

It reports CPU/load/frequency, RAM and swap, temperatures, NVIDIA and available integrated-GPU activity,
disk usage, busiest processes, and matching hosting/development applications. `--containers` adds bounded
Docker statistics. It neither installs a service nor writes a report; stop the live view with `Ctrl+C`.

Backfill polling is globally paced in addition to the provider-lane concurrency caps. The foreground daemon
accepts `--poll-gap-ms`, `--warmup-jobs`, `--warmup-gap-ms`, and `--poll-jitter-ms`; it also increases the
spacing when observed host load or process memory pressure is high. These controls smooth poll starts but do
not replace provider rate limits or a host soak test.

The paper bot uses one centralized interval policy. Its default is one minute. A personal request or
`settings params --bot-interval N` may choose a slower cadence, while `SOVEREIGN_ADMIN_BOT_INTERVAL_MIN`
imposes a host-wide minimum. The effective cadence is the maximum of the global minimum, personal interval,
and administrator minimum, so a personal setting cannot bypass the machine safety policy.

For a disposable, controlled storage-parity rehearsal, set `SOVEREIGN_TS_STORAGE=segments`. This writes
immutable SOVT segments under `storage/data/ts/.segments/` and reads them as one validated view with any
existing canonical `.bin`. Active segment manifests, checksums, byte lengths, timestamps, and provider
precedence are verified; a missing or corrupt active segment fails closed instead of reporting partial coverage.
Compaction retains prior files and advances its active generation under one writer lock. It remains opt-in and
must not be enabled on the active host until free-space, recovery, and compaction checks are complete.

Web-only runtime command, when approved:

```bash
docker compose --env-file .env.central -f infra/docker/docker-compose.yml up -d web
```

This command does not start `backfill` or `bot`.

Writer startup, only after that separate approval:

```bash
docker compose --env-file .env.central -f infra/docker/docker-compose.yml \
  --profile writer up -d web backfill
```

When `SOVEREIGN_DEPLOYMENT_PROFILE` is set, the backfill daemon independently refuses a profile without a
canonical writer. Compose profile selection is therefore not the only writer boundary.

## Mini-PC migration

The future mini PC should use `SOVEREIGN_DEPLOYMENT_PROFILE=central-host`.

Migration inputs are separate:

- a clean Git checkout for source;
- an owner-only `.env.central`, transferred outside Git;
- verified backups of canonical market data, paper ledger, and required projections;
- SSH host/client keys and separately provisioned client tokens.

After restore, require preflight, Compose render, focused contracts, ledger replay, integrity, backup/restore,
restart, and one-writer checks before enabling continuous services. Matching the laptop's directory layout is not
required; configuration and tracked paths must remain portable.
