# Phase 5: Automated Execution & Risk Hardening Specification

## 1. The "Safety Fuse" (Kill Switch)
- **Definition**: A global circuit breaker in the C++ `execution` layer.
- **Logic**: When `global_disable_` is `true`, all `submit()` calls return `OrderState::rejected` with a `BLOCKED` reason instantly (0ms latency).
- **Manual Control**: Expose `kill-switch engage` and `kill-switch disengage` in the CLI.
- **Auto-Protection**: To be implemented: trigger if single-trade drawdown > 5% or daily loss > 10%.

## 2. Durable Persistence (CNN-Ready)
- **Raw Data**: Every order record in Supabase now includes a `raw_response` (JSONB) column.
- **Purpose**: This raw data will be fed back into the CNN to learn from slippage, fill rates, and exchange-specific latency patterns.
- **Policy**: Orders are immutable until the database reaches 400MB (approx. 80% of the 512MB limit), at which point an automated pruning script will archive records older than 90 days.

## 3. Latency & Performance Targets
- **Architecture**: Hybrid (Node.js Gateway <-> C++ Core).
- **Target Range**: 150ms - 300ms total loop time (Signal -> Alpaca).
- **Constraint**: Real-time dashboard updates are restricted to `orders` and `audit_events` only (INSERT/UPDATE). No price streaming through Supabase to prevent throughput overload.

## 4. Reporting & Visibility
- **Standard**: Normalized UI rows for "Control Room" quick-glance.
- **Detailed**: "Download Report" button provides the merged Normalized + Raw JSON payload for deep audit.
- **Risk Breaches**: Logged as `severity: 'critical'` in `audit_events`.

## 5. Implementation Roadmap
- **Batch 1**: C++ Kill Switch CLI overrides and `ExecutionRunner` foundation.
- **Batch 2**: Supabase Schema update (`raw_response`) and Gateway integration.
- **Batch 3**: Real-time Dashboard "Risk Lights" and Fill notifications.
