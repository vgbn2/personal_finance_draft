# Current Workspace State

## Current Phase
Fast-Path Live Signal Derivation & Inference Pipeline - ACTIVE

- **Sub-Positions Ledger**: Implemented `shared/lib/runtime/sub_positions_ledger.js` for deterministic signatures, atomic sub-position JSON ledger, and auto-attribution of residual broker shares as `[MANUAL]`.
- **Gateway & Adapter Plumbing**: Extended `backend/gateway/src/` types, execution gateway, and Alpaca adapter with client order ID tagging and order history fill timestamp enrichment.
- **Bot Safety & Exit Clamping**: Ensured automated bot exit check in `alpaca_bot_cycle.js` cannot liquidate manual shares.
- **Dead Stub Tracker**: Added 120-bar silence detection per strategy timeframe and `--verify-gateway` probe mode in `strategy.js`.
- **Host Sync & Clean-Up**: Removed orphaned 5.4 GB snapshot and recursive directory slippages on `hpdesk`, verified clean rsync, and verified 100% test pass on host.
- **Closeout State**: All hygiene (`check_hygiene.js`), structure (`npm run test:structure`), and safety (`npm run test:safety`) tests pass. Ready for ongoing monitoring.

