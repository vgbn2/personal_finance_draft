# Next Session Goal

## Primary Objective: Test Suite Audit & Documentation Syntax Verification

1. **Test Suite Inventory & Architecture Mapping**:
   - Audit all test files across `tests/`, `backend/api/tests/`, and `backend/core/tests/` (250+ test files).
   - Map every test file to its owning architectural plane (Core/Compute, Gateways & Execution, API/Auth, Data & Storage, CLI/TUI, Social Alpha, Frontend).
   - Review test suite execution paths, groupings, and runners (`tests/run_node_tests.js`, `ctest`, Jest/Mocha exclusion invariants).

2. **Test Rationalization & Sorting**:
   - Identify redundant, slow, or disorganized test scripts and sort them into clear hierarchical domain directories.
   - Align `package.json` test scripts (`test:data`, `test:api`, `test:structure`, `test:social`, `test:core`, etc.) with sorted structure.
   - Enforce test integrity rules (`npm run audit:test-integrity`) and verify zero-key local execution with 100% green pass across all suites.

3. **Documentation Syntax & Code Block Validation**:
   - Scan all Markdown documentation under `docs/` and root documentation for syntax errors, malformed tables, and broken markup.
   - Validate fenced code block syntax and language tags (JSON, YAML, C++, JS, TS, Bash) to prevent rendering bugs.
   - Run `npm run docs:filter -- --strict`, `npm run audit:documentation`, and `npm run hygiene` to ensure zero documentation drift.
