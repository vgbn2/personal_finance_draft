# Codebase Organization Notes

## Active Paths
- `scripts/data_ops/ingest_market_data.js` is the live ingestion orchestrator used by the CLI.
- `scripts/lib/backfill.js` is the shared backfill helper used by the active ingest path.
- `scripts/lib/providers/` is the provider layer for live fetchers and history helpers.

## Legacy Or Duplicate Paths
- `scripts/lib/adapters.js` mirrors some of the ingest/backfill logic and still reads like a legacy compatibility layer.
- `scripts/lib/ingestion.js` is a lightweight batch wrapper and should stay aligned with the live macro provider boundary.

## Cleanup Targets
- Keep provider routing explicit for mixed-provider backfills.
- Add focused tests for macro history helpers and provider dispatch.
- Avoid widening the live path into the legacy adapter module unless the active caller still depends on it.
