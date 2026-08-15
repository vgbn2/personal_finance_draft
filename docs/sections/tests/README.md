# Tests Domain Structure Map

Canonical structural map for the `tests/` subsystem of the Sovereign Trading Platform.

## Overview And Subsystems

The `tests/` directory contains Node.js contract/integration test suites, architecture invariant verifiers, C++ CTest native executables, and test fixtures.

```text
tests/
├── architecture/       # Static structure, documentation, and setting contract tests
├── benchmarks/         # Performance benchmarking & system load test suites
├── fixtures/           # Fixed test inputs, candle samples, and market JSON snapshots
├── integration/        # Inter-subsystem integration & API route contract tests
├── safety/             # Degraded mode, auth permission, and execution safety tests
├── scripts/            # Node test runner entrypoint (tests/run_node_tests.js)
└── support/            # Shared test environment isolation & assertion helpers
```

## Active Verification Entrypoints

1. **Canonical Node Runner (`tests/run_node_tests.js`):**
   - Executed via `npm test` or `node tests/run_node_tests.js`.
   - Discovers and executes all JS contract and integration test suites using native `node:test`.

2. **Architecture & Contract Verifiers (`tests/scripts/architecture/`):**
   - Documentation Auditor: `tests/scripts/architecture/cli/core/documentation_contract.test.js`
   - Repository Structure: `tests/scripts/architecture/cli/core/structure_contract.test.js`
   - Settings & Runtime Contract: `tests/scripts/architecture/settings/settings_runtime_contract.test.js`

3. **C++ Native CTest Suite (`backend/core/test/`):**
   - Executed via `ctest --test-dir backend/core/build`.
   - 33 compiled native C++ executables verifying Float64 readers, grid optimizers, and matrix correlation engines.

4. **Static Analysis & Anti-Cheating Scanners:**
   - Test Integrity Anti-Cheating Audit: `scripts/dev/audit_test_integrity.js`
   - Repository Hygiene Audit: `scripts/dev/check_hygiene.js`

## Code Atlas Cross-References

- Testing Surface Runbook — [`docs/operational/guides/testing_surface.md`](../../operational/guides/testing_surface.md)
- Testing Methodology Overview — [`docs/codebase_tour/07_testing_methodology.md`](../../codebase_tour/07_testing_methodology.md)
