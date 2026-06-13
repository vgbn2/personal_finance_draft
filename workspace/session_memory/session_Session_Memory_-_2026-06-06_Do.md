## Session Memory - 2026-06-06 Docs and Polymarket mapping refinement

{
  "work": "Added the missing operational docs pages and centralized the Polymarket deposit-wallet mapping to signature type 2",
  "implemented": [
    "Created `docs/operational/local_first_setup.md`, `broker_setup.md`, `cloud_compute_vs_local_execution.md`, and `local_first_migration.md`.",
    "Centralized Polymarket env resolution in `shared/lib/brokers/polymarket_env.js`.",
    "Updated `backend/gateway/src/polymarket_account.js` and tests so the canonical deposit-wallet mapping is signature type 2, with 3 retained only for legacy compatibility."
  ],
  "verification": [
    "`node --test tests/scripts/tests/polymarket_account.test.js tests/scripts/tests/live_guard.test.js tests/scripts/tests/setup_doctor.test.js tests/scripts/tests/broker_env.test.js` -> pass"
  ],
  "remaining": [
    "Broker adapter rewiring beyond Polymarket is still pending",
    "Proposed-order schema/validation and secret-leak CI coverage are still pending"
  ],
  "dcs": 0.97
}

