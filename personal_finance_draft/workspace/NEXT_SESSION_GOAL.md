# Next Session Goal

## Primary Objective
**Phase 7: Live Execution & Dashboard Hydration**

## Critical Tasks
1.  **Dashboard Hydration**: Wire every panel in the React dashboard to real Supabase and local API data (currently some are stubbed).
2.  **Live Execution Promotion**: Transition the `execution_gateway` to production keys and verify end-to-end live trade flow with small lots.
3.  **Real-time Telemetry**: Implement WebSocket-based log streaming from the execution gateway to the dashboard.
4.  **Auto-Pruning Automation**: Schedule the `db-prune` script to run weekly via GitHub Actions or a local cron job.

## Context
Phase 6 (Production Scaling & Edge Deployment) is complete. The system is modular, secure with MFA, and has fail-closed risk management. Phase 7 focuses on turning on the 'live' engine and making the dashboard the single source of truth for operations.
