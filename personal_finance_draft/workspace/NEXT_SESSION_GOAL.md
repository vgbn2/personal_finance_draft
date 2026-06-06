# Next Session Goal

> Phase numbering reconciled 2026-06-06: `workspace/STATE.md` is the source of truth and
> reads **Phase 9: Strategic Intelligence & TUI Integration — ACTIVE**. The objectives below
> (live execution, dashboard hydration, telemetry, auto-pruning) are the open Phase 9 work
> items, not a separate "Phase 7".

## Primary Objective
**Phase 9 open work: Live Execution & Dashboard Hydration**

## Critical Tasks
1.  **Dashboard Hydration**: Wire every panel in the React dashboard to real Supabase and local API data (currently some are stubbed).
2.  **Live Execution Promotion**: Transition the `execution_gateway` to production keys and verify end-to-end live trade flow with small lots.
3.  **Real-time Telemetry**: Implement WebSocket-based log streaming from the execution gateway to the dashboard.
4.  **Auto-Pruning Automation**: Schedule the `db-prune` script to run weekly via GitHub Actions or a local cron job.

## Context
The system is modular, secure with MFA, and has fail-closed risk management. This track focuses on turning on the 'live' engine and making the dashboard the single source of truth for operations. See `workspace/STATE.md` for the authoritative phase/status.
