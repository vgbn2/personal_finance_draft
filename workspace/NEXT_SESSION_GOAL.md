# Next Session Goal

## Primary Objective: Fixes, Refactoring, Documentation, and Test Suite Meta-Audit

1. **Test Suite Meta-Audit (Auditing the Tests Themselves)**:
   - Execute deep audit across all test surfaces (`tests/scripts/`, `backend/core/tests/`, `tests/run_node_tests.js`).
   - Audit test integrity: verify tests assert genuine invariants rather than tautologies, mocks, or suppressed errors.
   - Check edge case coverage: financial boundary conditions, non-finite values, zero-division, leap years, timezone handling.
   - Eliminate test flakiness, race conditions, and implicit environmental coupling.

2. **Targeted Fixes & Maintainability Refactoring**:
   - Apply behavior-preserving refactoring to complex modules (`refactor-readability` / `ponytail`).
   - Prune obsolete helpers, stale comments, and redundant configuration files.
   - Uphold standard library and native first principles with zero new dependencies.

3. **Documentation & Manifest Alignment**:
   - Reconcile `docs/documentation_manifest.json` with any refactored or updated files.
   - Verify Material for MkDocs build (`npm run docs:filter -- --strict`, `npm run docs:build`).
   - Maintain GitHub Pages automated deployment health.

4. **Remote Proxmox VM (`hpdesk-1`) Operational Monitoring**:
   - Check multi-hour soak telemetry on running Docker Compose stack (9 containers).
   - Review log health across `sv-bot-alpaca-paper`, `sv-web`, and monitoring daemons.
