# Environment And Remote-Mirror Boundary Plan

Status: ENV-1A, ENV-1B1, and PM-1 implemented, verified, reviewed, and closed; runtime/Compose projection and sync remain deferred

Lifecycle: `ENV-1A/ENV-1B1/PM-1 -> closed`; `ENV-1B2/ENV-1B3/SYNC-1 -> deferred`

Date: 2026-07-28

## Objective

Replace the catch-all local environment approach with explicit environment classes and make remote CodePTIT
mirrors source-only by default. A remote code mirror must receive neither secrets nor `storage/` data, while
still receiving the directory layout required for safe install/build commands.

## Diagnosis

The displayed Polymarket `pUSD` portfolio is not proof that a secret was printed or exposed publicly. With
Polymarket included in the cockpit, it is a real credentialed account read unless an explicitly identified cache
is used. Order submission remains separately blocked by runtime, live-auth, PIN, and risk gates.

The output has a confirmed boundary mismatch: the gateway documents `polymarket markets` as public/no-auth, but
the rich-terminal branch calls `authorizePolymarketLive()` before opening the browser and temporarily sets
`SOVEREIGN_EXECUTION_AUTHORIZED=true`. Public browsing and trading must be separated; authorization belongs at
the Buy/Sell action boundary, not at browser entry.

## Current Evidence

- `.gitignore` already excludes `.env`, `.env.*`, `storage/data/`, `storage/runtime/auth_sessions.json`, and
  `node_modules/`; rsync does not automatically honor Git ignores, so a dedicated sync command must specify them.
- `.env.example` mixes provider, API/service, Supabase, execution/PIN, and Polymarket private/L2 credential
  names in one template. The environment manifest already classifies public frontend configuration separately
  from server, provider, and execution-sensitive values.
- `shared/lib/runtime/env.js` currently loads an explicit `SOVEREIGN_ENV_FILE` and then may backfill unset values
  from `.env.local` and `.env`. `backend/gateway/src/index.ts` independently imports `dotenv/config`. File naming
  alone therefore cannot enforce process authority.
- Central-host isolation is already partly implemented: its generator copies only manifest-approved keys, its
  loader is tested against adjacent `.env` bleed, and preflight rejects Polymarket private/L2 credentials.
- `backend/gateway/src/index.ts` labels public Polymarket market browsing separately from portfolio and order
  actions. Direct order submission requires explicit live authorization.
- Paper-ledger state is under `storage/data/paper_trading`; application data, runtime registries, caches, and
  model artifacts are local state and must not be implicitly replicated to avoid bandwidth use or authority drift.

## Target Environment Classes

| Class | Example file | Allowed contents | Never sent to remote mirror |
|---|---|---|---|
| Public client config | `Frontend/dashboard/.env.example` / `VITE_*` build input | API base URL, Supabase URL, Supabase publishable key only | Server secret, service token, provider key, wallet key, PIN, runtime path |
| Developer local config | `.env.developer` | non-executing local settings and optional read-only provider keys | all execution keys, Supabase service key, API/MCP service token, private wallet/L2 credentials |
| Private operator config | `.env.private` | local owner credentials needed for approved manual diagnostics | entire file |
| Private host config | `.env.central` | reviewed server/auth/provider settings for the chosen host profile | entire file; never copied through the source mirror |
| Execution quarantine | `.env.execution` | future live-trade key material only, mode 600, manually loaded for an explicitly approved operation | entire file; never mounted into web/MCP/default CLI processes |

No class may be browser-bundled merely because the file is named `public`; only the two declared public Supabase
values and a non-secret API URL are eligible for that surface. Live execution stays disabled regardless of file
layout.

## Mass-Implement Preflight

| ID | Requirement | Severity | Owner / surface | Decision |
|---|---|---:|---|---|
| ENV-1A | Define a per-entrypoint capability matrix and manifest rules before changing loaders. | P1 security contract | `config/system/environment_manifest.json`, examples, manifest tests and docs | **CLOSED** |
| ENV-1B1 | Make explicit environment selection exclusive and add fail-closed projection primitives. | P1 credential boundary | runtime env loader and environment-manifest owner | **CLOSED** |
| ENV-1B2 | Wire the matrix through every CLI, web, MCP, gateway, writer, operator, and execution entrypoint. | P1 credential boundary | runtime bootstraps and child launchers | **DEFERRED / NO-GO until command-to-surface ownership is exhaustive** |
| ENV-1B3 | Replace shared Compose `env_file` injection with verified service projections. | P1 credential boundary | Compose and central-host preparation | **DEFERRED / NO-GO until per-service required-key fixtures pass** |
| SYNC-1 | Transfer source without environment, storage, runtime, dependency, build, or Git metadata. | P1 secret/data preservation | external `codeptit/bash` toolkit plus fixture tests | **GO WITH FIXES after ENV-1B and external-path approval** |
| PM-1 | Split public market browsing from authenticated trading actions and label portfolio reads truthfully. | P1 user-visible security truth | Polymarket CLI/TUI and focused tests | **CLOSED** |

Overall result: **implemented and closed only the independently verifiable source-contract batches; deferred
runtime/Compose/sync work at its unresolved trust boundaries.**

Resolved decisions:

1. The inventory remained filename/name-only; no environment value was read or emitted.
2. The conservative source matrix permits provider-read credentials only on default CLI, writer, operator, and
   execution surfaces; order-capable Polymarket names are execution-class and local-only.
3. `.env.central` remains host-local and execution credentials remain outside the central/client profiles.

Open authority and identity decisions:

1. Approve the exhaustive command-to-surface and service-to-key maps before ENV-1B2/ENV-1B3.
2. Confirm the SSH alias, fixed remote root/sentinel, and selected nested repositories before SYNC-1.
3. Approve edits in the external `/home/vgbn1/Documents/codeptit/bash` toolkit for the later sync batch.

## Loader And Process Invariants

- When `SOVEREIGN_ENV_FILE` is selected, load that file only. Do not fall back to `.env.local` or `.env`.
- Web, MCP, default CLI, gateway, writer, and manual execution each receive a manifest-declared allowlist.
- Remove independent `dotenv/config` loading from the gateway; launch it with an explicitly scrubbed child env.
- Never inherit execution-only values into web, MCP, default research CLI, or public market browsing.
- Compose may use one host-local source file only if each service receives a restricted environment projection;
  a shared catch-all `env_file` is not an authority boundary.
- Execution configuration is opt-in for one approved command and does not persist by mutating the parent process.

## Remote Mirror Contract

The future `bash/tools/` sync command will:

1. Copy source/configuration files one way from local to remote after SSH identity and target-path checks.
2. Include only sanitized tracked examples such as `*.env.example`; exclude every non-example `.env*`, `*.key`,
   `*.pem`, `.mcp.json`, `storage/***`, `node_modules/***`, `.git/***`, build outputs, caches, logs, runtime
   state, workspace session state, and local agent state.
3. Create only an empty remote layout with `install -d` after target validation, including `storage/data`,
   `storage/runtime`, `storage/backups`, `storage/logs`, and manifest-declared subdirectories; it must not copy
   their contents or remove pre-existing remote content.
4. Require `--apply` for writes; default to itemized rsync dry-run. Exact mirroring/deletion remains a separate,
   explicitly named operation and must never target excluded secret/storage paths.
5. Leave remote dependency installation and approved host-local `.env.central` provisioning as separate actions.

## Ranked Batches

### Batch 1A — capability matrix and classification contract (`closed`)

- Extend the existing environment manifest rather than creating a second source of truth.
- Define allowed/forbidden groups for default CLI, web, MCP, gateway-read, writer, central host, and execution.
- Require every manifest entry to declare exactly one sensitivity class plus explicit allowed profiles and
  allowed surfaces.
- Keep browser configuration in `Frontend/dashboard/.env.example` and enforce a `VITE_*` public allowlist.
- Add name-only classification and example-parity tests; never read or emit values.
- Preserve existing `.env` files untouched until a redacted inventory and rollback plan are approved.

### Batch 1B1 — exclusive loader and projection primitives (`closed`)

- Explicit `SOVEREIGN_ENV_FILE` selection loads only that file and cannot fall through to adjacent catch-all
  files.
- The manifest owner projects a supplied environment by profile and surface, strips known forbidden names, and
  never maps server aliases into public browser inputs.
- Projection is not yet automatically applied to every process.

### Batch 1B2/1B3 — entrypoint and Compose enforcement (`deferred`)

- Change explicit file selection to exclusive loading with no adjacent catch-all fallback.
- Replace gateway `dotenv/config` with the canonical loader or a scrubbed inherited environment.
- Project only the allowed keys into gateway child processes and Compose services.
- Add forbidden-key fail-closed checks for web/MCP/default CLI and preserve central-host tests.

### Batch 2 — source-only remote sync

- Extend the planned `bash` sync command with explicit exclusions and empty-layout creation.
- Add fixture tests that place sentinel secret and storage files in a disposable source tree and prove they are
  absent from the remote fixture while required directories exist.
- Report pre-existing destination storage separately; exclusion means “do not transfer or delete,” not “empty.”
- Verify dry-run and apply reports never print file contents or credential values.

### Batch 3 — UI boundary clarity (`closed`)

- Make public market browsing credential-free and remove entry-time live authorization and parent-process
  authorization mutation.
- Require live authorization immediately before Buy/Sell preview/submission, retaining PIN/runtime/risk gates.
- Label cockpit portfolio as a `credentialed account read`, make refresh/polling explicit, and avoid hidden
  periodic Polymarket account polling.

## Acceptance Criteria

- A static scan proves no browser build input contains private/operator/central/execution names.
- The chosen frontend input set is exactly `VITE_API_URL`, `VITE_SUPABASE_URL`, and the selected Supabase
  publishable-key alias; examples contain names and placeholders only.
- Every discovered `process.env` and example-file name is classified by the manifest.
- Selecting one explicit environment file loads zero keys from adjacent `.env.local` or `.env`.
- Missing or forbidden keys fail with names only; errors and reports never contain values.
- Each entrypoint rejects or strips every manifest-forbidden key; gateway child tests prove execution values are
  absent without printing them.
- Web, MCP, default CLI, and gateway child environments are explicitly tested without Polymarket private key,
  L2 secret/passphrase, trade PIN, or execution authorization.
- Central Compose services do not share an execution-capable environment projection.
- Starting the private web/MCP/default CLI process without `.env.execution` remains functional for allowed
  read-only paths and cannot submit a live order.
- A clean disposable rsync rehearsal transfers zero non-example `.env*`, key, token, `storage/` content,
  dependency, build, or `.git` files; it creates the documented empty storage layout only.
- A destination containing pre-existing storage retains it byte-for-byte and reports it as untouched.
- A remote mirror cannot acquire operational authority merely because it received source files.
- The Polymarket dashboard labels portfolio evidence accurately; public market browsing invokes no live auth,
  and Buy/Sell still cannot proceed without the existing live gates.
- Interactive `polymarket markets` reaches a mocked browser without auth/PIN or setting
  `SOVEREIGN_EXECUTION_AUTHORIZED`; selecting Buy invokes authorization at the last responsible point.
- JSON market browsing remains public, cockpit distinguishes cached paper from credentialed live results, and
  every test uses mocked network behavior with no implicit repeat polling.
- Focused environment, secret-scan, CLI/gateway, sync-fixture, and full applicable regression gates pass.

## Implemented Evidence - 2026-07-28

- Environment manifest schema 2 classifies 118 canonical entries and 138 names/aliases across explicit classes,
  profiles, and surfaces. The name-only checker reports zero unclassified names.
- Browser source, tracked browser example, and manifest expose exactly `VITE_API_URL`, `VITE_SUPABASE_URL`, and
  `VITE_SUPABASE_ANON_KEY`; the built dashboard contains none of the scanned central/execution names.
- Explicit-file loader fixtures prove no adjacent fallback. Projection fixtures prove known forbidden execution
  and server names are stripped from default CLI/public-client surfaces.
- Public interactive Polymarket browsing no longer performs entry-time live authorization or mutates the parent
  authorization flag. Buy selection authorizes before credentialed account/orderbook access; submit requires an
  unforgeable module-private authorization and scopes the child authorization to that call.
- Cockpit portfolio evidence distinguishes `credentialed_account_read` from `cached_or_local`.
- Verification: focused environment/browser contracts pass; host-capable preflight/CLI 48/48; contracts 118/118;
  aggregate 979 total / 975 pass / 0 fail / 4 intentional skips; dashboard TypeScript/build, secrets 900/0,
  hygiene, structure, and diff checks pass.

Not proven: automatic surface projection for every runtime, Compose service isolation, fresh-install,
real Supabase/RLS, remote SSH/MCP, sync behavior, backup/restore, restart/rollback, one-writer, or soak.

## Safety Constraints

- Do not print, move, inspect, commit, or copy secret values during inventory/migration work.
- Preserve existing ignored environment and storage files; no deletion or rename occurs without explicit approval
  and a rollback copy.
- Keep API loopback/private, live execution off, and no provider polling, bot cycle, order, public exposure,
  service startup, or timer activation in the planning batch.

## Verification And Rollback

| Batch | Unit gate | CLI/integration gate | Stress/edge gate | Rollback |
|---|---|---|---|---|
| ENV-1A | environment manifest and example-parity tests | `npm run check:env` | all discovered names classified; forbidden frontend names = 0 | revert manifest/examples only |
| ENV-1B | loader precedence and forbidden-key tests | API/MCP/gateway live-guard contracts | matrix over every entrypoint with sentinel forbidden names | retain old loader behind a temporary compatibility flag until all callers migrate |
| SYNC-1 | Bash fixture tests and `bash -n` | disposable SSH/rsync dry-run and apply | interruption, concurrent invocation, pre-existing storage, path/symlink attacks | destination snapshot plus source-only rerun; no deletion |
| PM-1 | Polymarket command/action tests | rich-terminal command contract | repeated browse/cancel/buy-denial flows with zero hidden polling | restore prior menu routing while keeping live gates |

Broader gates after each implemented batch: focused contracts, `npm run test:secrets`, `npm run hygiene`,
`git diff --check`, then the broadest practical aggregate relevant to touched code.

## Difficulty And Estimated Change

- ENV-1A: medium, approximately 100–180 LOC across manifest/examples/tests/docs.
- ENV-1B: high, approximately 180–320 LOC across loader, gateway/Compose ownership, and tests.
- SYNC-1: medium/high, approximately 180–300 LOC in the external Bash toolkit and fixtures.
- PM-1: medium, approximately 80–160 LOC in CLI/TUI and tests.

Estimates are planning budgets, not authorization to edit.

Dirty-tree boundary: preserve the current workspace continuity/report edits and both untracked plan files.
Functional implementation must not mix those files into an application-source commit without explicit review.

## Next Implementation Prompt

Build a name-only command-to-surface and service-to-key inventory for ENV-1B2/ENV-1B3, including direct gateway
and standalone script entrypoints. Keep runtime enforcement NO-GO until each current command and Compose service
has a fixture-proven required-key set and rollback path. SYNC-1 remains separate and still requires the SSH
alias, fixed remote root/sentinel, selected nested repositories, and external-toolkit authorization.
