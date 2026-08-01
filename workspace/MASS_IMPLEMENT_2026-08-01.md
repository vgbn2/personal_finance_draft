# Mass Implementation Plan - 2026-08-01

**Source:** Full blast-through audit (2026-07-31)  
**Status:** Batch planning in progress  
**Working Tree:** Modified package-lock.json (unrelated to batches), clean audit report staged

---

## Batch Ranking

### BATCH-1: P2 CI Transport Fix (DI-CI1)
**Severity:** P2 (blocks Data Integrity A grade)  
**Objective:** Fix npm dependency transport from git+ssh:// to git+https://  
**Owner:** package-lock.json  
**Safety:** Low risk - regenerate lock file, verify test passes  
**Verification:** `npm test` CI workflow contract test passes

### BATCH-2: P3 Dead Code Removal (CT-1)
**Severity:** P3 (code quality)  
**Objective:** Remove empty catch block  
**Owner:** backend/gateway/src/index.ts:2847-2848  
**Safety:** Low risk - no-op removal  
**Verification:** Gateway builds, existing tests pass

### BATCH-3: P3 Environment Documentation (CT-3)
**Severity:** P3 (documentation)  
**Objective:** Document 7 undocumented env vars, audit 3 unused vars  
**Owner:** .env.example, environment manifest  
**Safety:** Documentation only - zero behavior change  
**Verification:** Manual review of .env.example completeness

---

## BATCH-1 Detailed Plan: CI Transport Fix (DI-CI1)

### Current Evidence
- **Test Failure:** `tests/scripts/architecture/cli/core/github_workflow_contract.test.js:72`
- **Root Cause:** Line 972 in package-lock.json uses `git+ssh://git@github.com/Mathieu2301/TradingView-API.git#574a9948`
- **Expected:** `git+https://github.com/Mathieu2301/TradingView-API.git#574a9948`
- **Package.json:** Already correctly specifies git+https:// transport

### Acceptance Criteria
1. package-lock.json line 972 uses git+https:// transport
2. Test `github_workflow_contract.test.js` passes
3. Full test suite remains at 1,076+ passing
4. No other dependencies regress to git+ssh://

### Duplicate/Stub Preflight
- **Scope:** Single dependency resolution change
- **No duplicates:** TradingView-API is sole chart provider
- **No stubs affected:** Real dependency, not test fixture
- **Impact:** Lock file only - no source changes

### Implementation Steps
1. Check current package-lock.json state
2. Backup current lock file
3. Delete package-lock.json
4. Run `npm install` (regenerates from package.json)
5. Verify git+https:// transport in new lock file
6. Run focused test: `node --test tests/scripts/architecture/cli/core/github_workflow_contract.test.js`
7. Run full test suite: `npm test`
8. Check for any dependency version changes

### Safety Boundaries
- ✓ No credential exposure
- ✓ No behavior changes (lock regeneration)
- ✓ No live/provider changes
- ✓ Reversible (can restore backup)

### Trust Boundaries Checked
- [x] Dependencies: Single transport change
- [x] Build/CI: Primary objective
- [x] No auth/secrets impact
- [x] No network exposure change
- [x] No trading capability change

### Verification Gate
**Focused:** CI workflow contract test passes  
**Broader:** Full npm test suite maintains 1,076+ pass rate

### Expected Outcome
- Test suite: 1,077 pass (current +1), 0 fail, 4 skip
- Data Integrity section: Upgrades from B+ to A grade
- Zero regression risk

---

## BATCH-2 Detailed Plan: Dead Code Removal (CT-1)

### Current Evidence
- **Location:** backend/gateway/src/index.ts:2847-2848
- **Code:** Empty catch block with comment "No-op cleanup"
- **Audit Finding:** Dead code with no operational purpose

### Acceptance Criteria
1. Lines 2847-2848 removed from index.ts
2. Gateway TypeScript compiles without errors
3. Gateway tests pass
4. No regression in broader test suite

### Duplicate/Stub Preflight
**Deferred:** Will execute after reading full context around the empty catch block to ensure it's truly dead code and not part of an intentional pattern.

### Implementation Steps
1. Read backend/gateway/src/index.ts:2840-2855 (context)
2. Verify no side effects or cleanup dependencies
3. Remove empty catch block
4. Compile gateway: `npm run typecheck_gateway` or similar
5. Run gateway-related tests
6. Run full test suite

### Safety Boundaries
- ✓ No credential exposure
- ✓ Code removal only (no new paths)
- ✓ No live/provider changes
- ✓ Reversible via git

### Verification Gate
**Focused:** Gateway builds clean  
**Broader:** Full test suite maintains pass rate

---

## BATCH-3 Detailed Plan: Environment Documentation (CT-3)

### Current Evidence
**Undocumented but used (7 vars):**
1. PMXT_API_KEY
2. PMXT_BASE_URL
3. PROXY_ADDRESS
4. ORDERS_FILE
5. POLYMARKET_TRADE_PAGE_CAP
6. SOVEREIGN_USER_SETTINGS_PATH
7. SOVEREIGN_ENVIRONMENT_SURFACE

**Documented but unused (3 vars):**
1. SOVEREIGN_RUNTIME_MODE
2. SOVEREIGN_EXECUTION_AUTHORIZED
3. SOVEREIGN_DEPLOYMENT_PROFILE

### Acceptance Criteria
1. All 7 undocumented vars added to .env.example with descriptions
2. Audit determination for 3 unused vars: keep (reserved) or remove (dead)
3. Environment manifest updated if needed
4. Zero behavior change (documentation only)

### Duplicate/Stub Preflight
- **Scope:** Documentation and manifest updates only
- **No code changes**
- **Verification:** Manual review

### Implementation Steps
1. Read .env.example current state
2. Search codebase for usage of each undocumented var
3. Add descriptions based on actual usage
4. For unused vars: grep for any usage, check if reserved
5. Update .env.example
6. Update environment manifest if schema changed
7. Verify hygiene still passes

### Safety Boundaries
- ✓ Documentation only - zero runtime risk
- ✓ No credential exposure (example values only)
- ✓ No behavior changes
- ✓ Reversible via git

### Verification Gate
**Focused:** Manual .env.example completeness review  
**Broader:** Hygiene audit still passes 6/6

---

## Deferred Items (Not in Current Batches)

**P3 - Maintainability:**
- ALP-M1: strategy.js refactoring (1,276 lines) - requires architectural review
- PM-ORG1: Polymarket runtime organization - requires design decision
- OPS-V1: Full operational runbook drill - requires host execution

**P3 - Observability:**
- CT-2: Silent error handling telemetry (7 locations) - requires observability strategy

**Rationale:** These items require broader architectural decisions or extended verification that exceeds the scope of immediate batch fixes. They should be addressed in dedicated sessions with proper planning.

---

## Batch Lifecycle Status

- [x] BATCH-1: Proposed
- [x] BATCH-2: Proposed  
- [x] BATCH-3: Proposed
- [ ] BATCH-1: Preflight
- [ ] BATCH-1: GO/NO-GO
- [ ] BATCH-1: Implemented
- [ ] BATCH-1: Verified
- [ ] BATCH-1: Reviewed
- [ ] BATCH-1: Closed

**Next Action:** Execute BATCH-1 preflight and seek approval to proceed with implementation.
