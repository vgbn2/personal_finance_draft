# Dependency Remediation Mass-Implementation Plan

Status: DEP-1A and DEP-1B closed; DEP-1C and DEP-1D deferred NO-GO; overall dependency release gate open.

## Scope and order

The release dependency backlog is split into isolated compatibility batches:

1. **DEP-1 network boundary:** `ws`, Engine.IO/Socket.IO, Axios, Alpaca, and viem.
2. **DEP-2 MCP HTTP:** MCP SDK, Hono, body-parser, and fast-uri.
3. **DEP-3 runtime/build:** ONNX Runtime and dashboard Vite/PostCSS.
4. **DEP-4 web3 compatibility:** ethers, Polymarket CLOB, and elliptic.
5. **DEP-5 deprecated toolchain:** ESLint, glob/inflight, NATS/nuid, and rimraf.

Do not begin a later batch until the active batch is verified, reviewed, and closed or explicitly deferred.
Macro point-in-time work, Compose projection, host qualification, and credential rotation are separate scopes.

## DEP-1 intake

- **Identifier and objective:** DEP-1; remove high-severity network-boundary findings without changing provider,
  trading, authentication, data, or public-exposure behavior.
- **Current evidence and severity:** the structured five-root advisory reports 61 vulnerable package nodes,
  including 24 high. High findings occur in the root, API, gateway, MCP, and dashboard graphs. DEP-1 owns the
  `ws`, Engine.IO/Socket.IO, Axios, Alpaca, and viem subset.
- **Intended owners:** root, `backend/api`, `backend/gateway`, and `Frontend/dashboard` package manifests and
  lockfiles. Production changes are permitted only when a verified dependency API change requires a focused
  compatibility repair.
- **Safety boundary:** no provider poll, API exposure change, service/container start, canonical-data write,
  credential read, bot cycle, order, live enablement, public binding, migration, or destructive cleanup.
- **Rollback:** preserve the pre-batch manifest/lockfile diff; revert only DEP-1 hunks if a compatibility gate
  fails. Never overwrite the broader dirty working tree.

## DEP-1 preflight evidence

- Root manifest is already dirty only in TEST-1 script entries; dependency blocks do not overlap that edit.
- No package lockfile is currently modified.
- Current direct owners include Alpaca `^3.1.3` and viem `^2.52.2` in root/gateway, gateway Axios `^1.18.1`,
  API Socket.IO `^4.5.0`, and dashboard Socket.IO client `^4.5.0`.
- Current locks contain duplicated vulnerable network lines, including `ws` 7.5.11 and several 8.x copies,
  Alpaca's nested Axios 0.21.4, Socket.IO/Engine.IO graphs, and root/gateway viem graphs.
- Production callers are the API Socket.IO server, two dashboard Socket.IO panels, gateway Alpaca import, and
  gateway Axios request paths. viem is dynamically consumed through provider/web3 paths and requires type/build
  parity even when no literal import appears in the first-pass search.

## Required restricted dependency input

Before editing, a user-authorized restricted dependency worker must write structured JSON containing:

- current registry release and advisory metadata for every DEP-1 direct owner;
- exact patched target version or explicit `no_fix_available`;
- direct/transitive ownership and required major-version transitions;
- install-script, engine, peer-dependency, and deprecation changes;
- advisory identifiers addressed and residual advisory identifiers;
- source URLs or registry identifiers kept inside the structured report, with no raw third-party text promoted
  into the main-agent context.

The main agent must not guess target versions. An offline audit that has no advisory cache is not evidence.

## Acceptance criteria

1. Regenerate only intended locks deterministically and show manifest/lockfile before/after versions.
2. `npm ls` succeeds for every changed package root with no invalid or unmet DEP-1 owner.
3. API WebSocket/auth contracts pass and Socket.IO server/client protocol compatibility is explicit.
4. Dashboard TypeScript and production build pass; Telemetry and Market Intel socket behavior remains bounded.
5. Gateway TypeScript passes; Alpaca, Axios, viem, credential-free reads, and paper-only integration contracts
   pass without provider access.
6. A structured five-root advisory rerun shows no unresolved DEP-1 high finding, or the batch is NO-GO with an
   explicit upstream `no_fix_available` owner.
7. Secret scan, hygiene, `git diff --check`, and the bounded worktree source-evidence verifier pass.
8. Independent review confirms no auth, credential, provider, execution, public-bind, install-script, or
   supply-chain boundary widened.

## Edge cases

- Socket.IO client/server protocol mismatch after asymmetric transitive resolution.
- Alpaca retaining vulnerable nested Axios even when the repository's direct Axios is upgraded.
- A viem major/API/type change affecting wallet or signing paths not exercised by cached-only tests.
- Lockfile deduplication silently selecting a version outside a direct owner's supported range.
- Optional/native install scripts running during verification.
- Node 22 CI versus Node 24 workstation behavior.
- A lower aggregate advisory count hiding a still-reachable network-boundary high.

## Current decision

The user authorized restricted dependency research and registry-backed resolution. Structured current evidence
is recorded in `workspace/reports/restricted_dep1_remediation_2026-07-28.json`.

### DEP-1A closure

- API lock: Socket.IO 4.8.3, Engine.IO 6.6.9, adapter 2.5.8, and ws 8.21.1.
- Dashboard lock: Socket.IO client 4.8.3, Engine.IO client 6.6.6, and ws 8.21.1.
- Both direct manifests stayed byte-identical. Deterministic `npm ci` and `npm ls` passed for both roots.
- Current targeted audits contain zero Socket.IO/Engine.IO/ws findings. The dashboard retains two unrelated
  highs for a later isolated batch.
- Host-capable API verification passed 25/25; dashboard TypeScript and production build passed.
- The existing dashboard esbuild 0.25.12 postinstall ran during `npm ci`; no tracked file was generated.

Evidence:

- `workspace/reports/restricted_dep1a_resolution_2026-07-28.json`
- `workspace/reports/restricted_dep1a_install_2026-07-28.json`

### DEP-1B closure

- Root and gateway manifests now own viem `^2.55.10`; locks and installed trees resolve viem 2.55.10 with
  viem-owned ws 8.21.0.
- Existing TEST-1 root scripts were preserved byte-for-byte, lifecycle scripts stayed disabled, and both
  dependency trees are healthy.
- Targeted audits no longer contain viem. The residual ws 8.18.0 belongs only to the separately NO-GO
  Polymarket/Ethers path.
- Gateway TypeScript passes; 51 focused Polymarket, MCP, cockpit, paper-ledger, auth, and live-safety tests pass.

Evidence: `workspace/reports/restricted_dep1b_resolution_2026-07-28.json`.

### DEP-1C decision

- Lifecycle: `proposed -> preflight -> NO-GO -> deferred`.
- The eight active Alpaca v3 seams are mapped in `backend/gateway/src/index.ts`: import, constructor,
  `createOrder`, `cancelOrder`, `getAccount`, `getPositions`, bracket order, and `getLatestQuote`.
- Node >=20 is available locally, in CI, and in the previously inspected SSH environment, but that does not
  establish package API compatibility.
- The restricted worker could not obtain and inspect the Alpaca 4.0.1 archive within the bounded attempts, so
  exports, CJS/ESM behavior, constructor shape, method signatures, and types remain unverified.
- No Alpaca/Axios manifest, lockfile, or source change was made. Resume only with a structured v3-to-v4 API
  mapping backed by the exact 4.0.1 package.

Evidence: `workspace/reports/restricted_dep1c_compatibility_2026-07-28.json`.

### DEP-1D decision

- Lifecycle: `proposed -> preflight -> NO-GO -> deferred`.
- The remaining vulnerable ws path is owned by `@polymarket/clob-client-v2 -> @ethersproject/providers`.
- The automated suggestion would downgrade the direct Polymarket client from 1.0.6 to 0.0.3. That is an
  unacceptable functional and supply-chain regression, so it was rejected.
- No DEP-1D package or lock change was made.

### Overall result

DEP-1 is partially closed, not complete. Current combined structured audit evidence records 54 vulnerable
package nodes across the five roots: 17 high, 11 moderate, 26 low, and 0 critical. DEP-1A and DEP-1B reduced
the high count from 24 to 17; DEP-1C, DEP-1D, two unrelated dashboard highs, and later owner batches keep
release/live use blocked.

Final source gates: `npm run verify:strict` passes 1,003 total / 999 pass / 0 fail / 4 intentional skips.
The clean worktree-snapshot verifier also passes five-root deterministic installs, dependency trees, builds,
native tests, environment/secrets/contracts, and aggregate tests (1,003 total / 993 pass / 0 fail /
10 environment-dependent skips).
