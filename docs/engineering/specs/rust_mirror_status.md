# Rust Mirror Status

Updated: 2026-07-23

## Decision

The Rust CLI mirror is retired from the forward implementation plan. The active operational CLI remains
`backend/cli/sovereign_cli.js`; performance-sensitive work belongs in narrow, benchmark-backed C++ kernels.

## Evidence

- The Rust tree under `backend/cli/src/` is an inactive scaffold.
- Its command surface reports `mirrored-contract-only`; it does not provide an independent operational path.
- Maintaining a third control-plane implementation adds dependency, build, and parity cost without measured
  runtime benefit.

## Maintenance boundary

- Do not add new Rust command mirrors or port Node orchestration into Rust.
- Do not describe the Rust tree as active, production, or a required build dependency.
- Keep Node JSON contracts as the canonical CLI/MCP/API behavior.
- Archive or delete the scaffold only in a separately reviewed broad-deletion change. Until then, treat it as
  non-production reference code.

## Reconsideration gate

Reopen the language decision only when profiling identifies a bottleneck that cannot be addressed cleanly in
the existing C++ core and a benchmarked Rust proof shows a material advantage over both Node orchestration and
a narrow C++ kernel.
