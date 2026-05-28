# Developer Intent & Technical Debt

Generated during Blast-Through Audit 2026-05-28

## Intent
- Decompose monolithic CLI into modular command handlers (COMPLETED).
- Maintain a strictly local-first, terminal-centric architecture.
- Transition all persistence to Supabase while maintaining local JSON cache for research.

## Technical Debt
- [ ] Hardcoded Program Files paths in scripts/api_data_verify/mt5_login_launch.js and mt5_run_export.js.
- [ ] Hardcoded msys64 path in scripts/dev/native_toolchain_check.js.
- [ ] Absolute machine-specific paths in `scripts/test/fixtures/outputs/` may break cross-machine CI/CD.
- [ ] `web_page` relies on `localhost:8787` default which might need configuration for remote hosting.
- [ ] Refactor C++ `technical_features.cpp` and `indicator_engine.cpp` to remove complex `if/else` chains (legacy artifact detected).
