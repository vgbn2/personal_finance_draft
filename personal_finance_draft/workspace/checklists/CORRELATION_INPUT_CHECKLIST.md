# Correlation Input Checklist

Date: 2026-06-13

Purpose: close the class of failures where `backend correlation` returns `ok:false` with
`input: .../storage/data/cache` even though deep data exists in `storage/data/ts`.

## Symptom

- Command surface: `backend correlation --timeframe 5m --max-bars 5000000 --method auto`.
- Bad output pattern: `ok:false`, `input: C:/.../storage/data/cache`, and C++ reasons such as
  `SYMBOL:5m:no_matching_bars`.
- Why this matters: for deep 5m data, `storage/data/ts/*.bin` is the durable source of truth. The
  JSON cache is often a shallow/latest compatibility snapshot, so falling back to it can produce
  false "missing bars" errors.

## Checklist

- [x] Reproduce the TUI Layer1 failure with explicit symbols.
  - Evidence: full Layer1 expansion fails because `MATICUSDT` and `POLUSDT` have no common 5m date.

- [x] Stop misleading fallback on multi-symbol no-overlap.
  - Expected: no-overlap now returns `engine:"sovereign_cli_preflight"`,
    `code:"no_common_correlation_dates"`, `input: storage/data/ts`, and blocker hints.

- [x] Add a regression test for no-overlap preflight.
  - Fixture: small ts-index set where `AAA_5m` ends before `BBB_5m` starts.
  - Assert: command returns preflight `ok:false`, `code:"no_common_correlation_dates"`, and does
    not call/fall back to `storage/data/cache`.

- [x] Add a regression test for overlapping 5m symbols.
  - Fixture: at least two symbols with shared 5m dates.
  - Assert: focused temp snapshot is used and C++ returns a valid matrix.

- [x] Add selector-side warning for expanded sectors.
  - Before running C++, show coverage blockers when a sector/header expansion includes stale or
    non-overlapping symbols.
  - User choice: continue with all, drop blockers, or go back to selection.
  - Implemented as a pre-C++ CLI/TUI report with per-symbol coverage and blocker hints.

- [x] Add an optional `--drop-non-overlap` / TUI equivalent.
  - Behavior: automatically remove symbols that prevent a valid common-date intersection.
  - Must print the dropped symbols and coverage ranges.
  - Implemented in CLI and exposed in the Backend Correlation TUI manifest.

- [x] P2 MATIC/POL gap — Option C decision (2026-06-13)
  - **Gap**: `MATICUSDT` 5m ends `2024-09-10`; `POLUSDT` 5m starts `2024-09-13` (3-day gap).
  - **Root cause**: POL rebranded from MATIC on 2024-09-13. The gap is intentional — it marks the
    token rebrand boundary, not a data ingestion error. No re-ingest is needed.
  - **Decision**: **Option C** — accept the gap; document `--drop-non-overlap` as the standard
    flag for Layer1 crypto 5m correlations.
  - **Standard usage**:
    ```
    node backend/cli/sovereign_cli.js backend correlation \
      --family crypto --timeframe 5m --drop-non-overlap
    ```
  - **Expected outcome**: 9-symbol matrix produced; `MATICUSDT` and `POLUSDT` are dropped and
    reported in the coverage table as non-overlapping with the rest of the Layer1 universe.
  - **Verification gate**:
    ```
    node backend/cli/sovereign_cli.js backend correlation \
      --family crypto --timeframe 5m --drop-non-overlap --json
    ```
    Assert: `ok:true`, `dropped_symbols` includes `MATICUSDT` and/or `POLUSDT`,
    `matrix_size` == 9 (Layer1 count minus the two rebranded tokens).

- [x] Define an input contract.
  - `5m`, `15m`, `30m`, `1h`, `4h`: prefer `storage/data/ts`.
  - `1d`, `1w`, `1mo`: allow cache JSON if ts-index is missing, but report the source explicitly.
  - Multi-symbol focused correlation: never silently fall back from ts-index no-overlap to cache.
  - Implemented for multi-symbol focused correlation; no-overlap now reports `input: storage/data/ts`.

- [x] Improve final human output.
  - Replace raw C++ `no_matching_bars` in this path with:
    `No common 5m overlap across selected assets. Try removing MATICUSDT, POLUSDT.`
  - Include compact coverage table: symbol, first date, last date, date count.

## Verification Gates

- `node --check backend/cli/commands/tools/backend.js`
- `node --test tests/scripts/tests/sovereign_cli_human_surfaces.test.js`
- `node --test tests/scripts/tui_terminal_automation.test.js`
- `node --test tests/scripts/tui_search_contract.test.js`
- Reproduce bad command and confirm `input` is `storage/data/ts`, not `storage/data/cache`.
- Run an overlapping crypto subset and confirm `ok:true`.
- **Option C gate**: `node backend/cli/sovereign_cli.js backend correlation --family crypto --timeframe 5m --drop-non-overlap --json`
  → assert `ok:true`, `dropped_symbols` contains `MATICUSDT` and/or `POLUSDT`, `matrix_size` == 9.

## Open Items

- **Backfill running** (2026-06-13): `crypto-deep-backfill --days 3300` started — will replenish
  POLUSDT (and all other crypto 5m symbols) to ~3300 days of depth.
- After backfill completes, re-run the Option C gate above to confirm the 9-symbol matrix and
  that `dropped_symbols` is stable.
- If POLUSDT post-rebrand data accumulates enough overlap with other Layer1 alts, reconsider
  whether to promote it back into the full correlation universe (future decision).
