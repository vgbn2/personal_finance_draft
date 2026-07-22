# Testing Surface And Verification Scripts

This file is the current list of verification scripts and test slices for the active prototype.

## Hard Rule

Tests must not be easy to pass.

That means:

- prefer real data paths or recorded fixtures over toy mocks
- verify the actual contract shape, not only `status === 200`
- fail closed when freshness, provenance, or required fields are missing
- show why a test passed with visible data flow where possible
- do not treat a smoke test as sufficient evidence for deployment or macro-data trust

## Current Grouped Scripts

`npm test`
- Runs the broad Node suite through `tests/run_node_tests.js`
- Covers `tests/scripts/**/*.test.js` and `tests/web/**/*.test.js`
- Does not cover `backend/api/tests/`; run `npm run test:api` or `npm run verify:strict` for those

`npm run test:api`
- Runs every active `backend/api/tests/*.test.js` file serially, including correlation and TTL-cache contracts
- Verifies served dashboard entrypoint, API route health, summary/correlation/universe payloads, and contract drift

`npm run test:data`
- Runs `tests/scripts/data/backfill/backfill_regression.test.js`, `tests/scripts/lib/indicators.data_flow.test.js`, and `tests/scripts/architecture/cli/core/config_integrity.test.js`
- Verifies input bars, config loading, and feature/data-flow boundaries

`npm run test:macro`
- Runs the macro history, ingestion, and store contracts under `tests/scripts/data/cache/` and `tests/scripts/architecture/data_storage/`
- Verifies macro and reserves history mapping, the canonical macro normalization layer, and the full ingest entrypoint

`npm run test:deploy`
- Runs `tests/scripts/architecture/cli/core/deployment_manifest_contract.test.js`
- Verifies Docker, Kubernetes, and deployment docs stay aligned on ports, cache settings, and Supabase secret wiring

`npm run test:contracts`
- Runs the contract-heavy slices: API, cache, Supabase routes, macro ingest, deployment, and config integrity

`npm run verify:strict`
- Runs the complete API gate, contract gate, secret scan, and broader Node suite
- Native C++, MCP TypeScript, and frontend build/responsive gates remain separate because they have distinct toolchain requirements
- Use this before claiming the Node/server surfaces are healthy after API, deployment, or ingestion changes

`node --test tests/scripts/data/cache/cache_contract.test.js`
- Verifies cache reuse and disable-mode freshness behavior

`node --test tests/scripts/architecture/data_storage/supabase_route_contract.test.js`
- Verifies Supabase auth and database route contract shape with a mocked client

## Existing Verification Helpers

These are not all unit tests, but they are important evidence surfaces:

`node backend/scripts/dev/native_toolchain_check.js`
- Verifies whether the local native C++ toolchain is actually runnable

`node backend/scripts/dev/model_registry_parity.js`
- Checks JS and native model candidate registry parity

`node backend/scripts/dev/parallel_backfill_probe.js`
- Probes backfill behavior and is useful when debugging historical fetch paths

`node backend/scripts/data_ops/ingest_market_data.js --family macro --days 30`
- Runtime macro ingest evidence check
- Should be inspected for record counts, timestamps, and family grouping

`node backend/scripts/data_ops/ingest_market_data.js --family reserves --days 3650`
- Runtime reserves/economy-history evidence check
- Useful for country/metric coverage and long-window history shape

`node backend/api/app.js`
- Starts the live local web bridge for browser and endpoint inspection

## Required Test Slices By Surface

API and web bridge:

- `/health`
- `/`
- `/js/app.js`
- `/api/system/status`
- `/api/data/summary`
- `/api/correlation`
- `/api/universe`
- `/api/quotes/status`
- `/api/signal`
- `/api/backtest`

Deployment:

- Docker compose port and cache env contract
- Kubernetes deployment port, probes, and Supabase secret refs
- Deployment docs matching the real manifest assumptions

Input data:

- config loading from `config/markets/data_sources.yaml`
- backfill integrity
- indicator data flow
- macro history mapping from FRED
- macro normalization and Supabase write batching
- reserves history mapping from World Bank
- quote-source freshness and provider-priority behavior

Integrated evidence checks:

- macro ingest through `ingest_market_data.js`
- reserves ingest through `ingest_market_data.js`
- API payloads using recorded backend fixtures
- dashboard shell references the current endpoint set

## Next Missing Tests

These are still needed and should be added in later passes:

- a remote Supabase session/RLS verification gate beyond the existing local contracts
- live deployment smoke checks against a real container runtime
- macro stale-data rejection tests through the full ingest path, not only helper-level mapping
- macro normalization tests that prove raw values, units, and unitless features stay aligned before database writes
- end-to-end quote freshness tests that combine import files, dedupe, validation, and web status output
