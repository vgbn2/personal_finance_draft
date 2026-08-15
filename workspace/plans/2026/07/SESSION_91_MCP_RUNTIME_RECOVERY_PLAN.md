# Session 91 MCP Runtime Recovery Plan

Date: 2026-07-23
Scope: planning only; no live trading, provider polling, or host mutation

## Problem statement

The repository-local MCP server builds and its compiled entrypoint starts directly, but the current
sandbox cannot prove an end-to-end stdio handshake. Separately, `npm run setup:mcp` generates a Linux-invalid
native-backend path:

- `dist/mcp_server/index.js` exists and direct execution prints `Sovereign MCP Server running on stdio`.
- `node scripts/mcp_stdio_probe.js` times out waiting for initialization response `id=1`.
- A minimal nested Node child exits `0` in this sandbox while its stdout/stderr are not delivered to the
  parent. The MCP timeout is therefore host-inconclusive, not proof that the server is broken.
- `.mcp.json` currently points `SOVEREIGN_BACKEND_BIN` at nonexistent
  `build/backend/core/Debug/sovereign_wealth.exe`.
- The real Linux native binary is `backend/core/build/sovereign_wealth`, and the canonical
  `shared/lib/runtime/paths.js` resolver finds it.

## Safety boundary

- MCP verification is read-only: initialize, list tools, call `get_system_status`, `get_market_bias`, or
  another cached research tool.
- Do not call `trade`, `backfill_family`, or `backfill_all`.
- Do not bypass `confirm_live`, `ai_agent_trading`, authorization, PIN, or native risk gates.
- A direct CLI success is not a substitute for a successful MCP host-side stdio exchange.

## Batch 1 - Correct and contract the generated MCP configuration

1. Make `scripts/setup_mcp.js` platform-aware and reuse the canonical backend discovery policy rather than
   duplicating Windows-only paths.
2. Emit an absolute compiled-server path so the configuration does not depend on the client's launch cwd.
3. Set `SOVEREIGN_BACKEND_BIN` only when the selected native binary exists; otherwise omit it and report the
   native limitation explicitly.
4. Fail before writing when the compiled MCP entrypoint is absent.
5. Add a focused contract that simulates Linux and Windows names, rejects nonexistent emitted paths, and
   proves an existing `.mcp.json` is not partially overwritten after validation failure.

Acceptance:

- Every generated executable/file path either exists or is intentionally omitted.
- Linux output never contains `.exe`; Windows output never selects a Unix binary name.
- The current Linux checkout selects `backend/core/build/sovereign_wealth`.
- Setup tests make no network call and expose no secret value.

## Batch 2 - Make the probe diagnose the host before diagnosing MCP

1. Add a bounded child-stdio self-test before the MCP exchange.
2. Track child spawn errors, exit code/signal, stderr tail, entrypoint existence, and response stage.
3. Return a distinct `host_child_stdio_unavailable` result when a known-good child cannot deliver output.
4. Use the pinned MCP SDK client/stdio transport for the primary handshake; retain manual framing only as a
   protocol diagnostic if it still adds evidence.
5. Add deterministic fixtures for successful initialize/list/call, child exit before initialize, malformed
   response, and host stdio suppression.

Acceptance:

- A sandbox transport limitation no longer appears as a generic MCP server timeout.
- A real server regression identifies the exact failed stage.
- The probe always terminates its child and leaves no process behind.

## Batch 3 - Obtain real host-side runtime proof

Run outside the restricted child-stdio sandbox on the intended developer or central host:

1. Build `backend/mcp_server`.
2. Generate and inspect `.mcp.json`.
3. Run the probe and require successful `initialize`, `tools/list`, and read-only tool call.
4. Confirm required cached research tools are present: `get_market_bias`, `get_scorecard`,
   `get_market_signal`.
5. Compare the MCP status result with direct CLI `status --json`; record differences rather than hiding them.

Acceptance:

- The host returns server identity and a nonzero tool list through stdio.
- One cached research tool returns parseable output.
- No cache write, provider fetch, or order attempt occurs.
- The exact host, Node version, MCP SDK version, generated paths, and result are recorded.

## Batch 4 - Close documentation and continuity

- Update `backend/mcp_server/README.md` with setup, build, host-stdio diagnostic, and read-only proof commands.
- Record sandbox-only versus host-proven evidence in the current handoff and review ledger.
- Do not call the MCP runtime operational until Batch 3 passes on a real host.

