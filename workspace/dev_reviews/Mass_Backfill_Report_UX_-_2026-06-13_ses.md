## Mass Backfill Report UX - 2026-06-13 session 26f

Trigger: live mass-backfill output interleaved provider logs, progress fragments, skipped counts,
and raw `EPERM rename` failures, while the user wanted the ingest/backfill output to read like
`backend integrity`.

Resolution: `backend/cli/commands/data/data.js` now builds a structured `mass_backfill_report`
payload and renders non-JSON completion as `[MASS BACKFILL REPORT]` with coverage totals, policy,
family/timeframe sections, skipped preview, failure table, and next-step guidance. `EPERM rename`
is classified as `filesystem_rename_eperm` so Windows atomic-rename failures point to the correct
serialization/write-lock follow-up.

Evidence:
- Added renderer/classifier coverage in `tests/scripts/backend_cli_human_surfaces.test.js`.
- Gates: `node --check backend/cli/commands/data/data.js`; `node --check tests/scripts/backend_cli_human_surfaces.test.js`; backend human surfaces `6/6`; focused backfill/deep-data slice `33/33`; `npm.cmd run test:data` `5/5`.

Remaining: provider fetch logs still write directly during the run. If the live stream must match
the report style too, route provider logs through a quiet/progress collector instead of raw
`console.log`.
