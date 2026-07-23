# Active Developer Comments

## 2026-07-23 session 92

- `scripts/setup_mcp.js` duplicates binary discovery with Windows-only `.exe` paths and emits a nonexistent
  Linux backend path. Reuse the canonical runtime resolver and contract generated paths.
- `scripts/mcp_stdio_probe.js` cannot distinguish a server timeout from this sandbox's suppressed nested-child
  stdio. Add a host transport self-test and stage-specific diagnostics before using it as runtime evidence.
- `Frontend/dashboard/.env.example` documents AI Studio variables but omits the Supabase variables consumed by
  the login path and listed in the dashboard README.
- `backend/api/package.json` omits its direct `@supabase/supabase-js` import while its Dockerfile describes the
  API as a standalone dependency root.
- `docs/engineering/stack_manifest.md` and `rust_mirror_status.md` still promote the Rust mirror even though the
  durable reviewer decision is retire/archive and every Rust command remains `mirrored-contract-only`.
- Current data trust is freshness-gated: 92/92 cached but 87 required windows stale; DCS is 0.716.

## 2026-07-23 session 93

- Closed the session-92 MCP config/probe, dashboard env, API dependency, Rust-doc, automation placeholder,
  and TradingView screener findings in current source.
- A real host must still return `ok:true` from `node scripts/mcp_stdio_probe.js`; this sandbox reports
  `host_child_stdio_unavailable` before MCP initialization.
- Qualify the spare Ubuntu machine before buying RAM. Require compatible DIMM/SO-DIMM, DDR generation,
  ECC/buffering, and capacity; target 16 GB total, with 8 GB the fail-closed floor.
- Current source is fully verified but uncommitted. Do not present it as committed `HEAD`.
- Freshness remains the critical operational gap: 87 stale required windows and DCS 0.716.
