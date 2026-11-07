# CLI Core

The operational CLI is `backend/cli/sovereign_cli.js`, with command owners under
`backend/cli/commands/` and the terminal UI under `backend/cli/tui/`.

The Rust crate under `src/` is retired, non-production reference code. It reports
`mirrored-contract-only`, is not a required build dependency, and must not receive
new command ports. See `docs/engineering/rust_mirror_status.md` for the decision and
the benchmark gate required to reconsider it.

Archive or delete the Rust scaffold only in a separately reviewed broad-deletion
change.
