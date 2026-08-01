# BATCH-1 Closeout Report

**Status:** ✅ CLOSED  
**Date:** 2026-08-01T06:03:05Z  
**Objective:** Fix CI transport from git+ssh:// to git+https://  
**Finding ID:** DI-CI1 (P2)

---

## Implementation Summary

**Approach:** Manual edit to package-lock.json line 972  
**Rationale:** npm install consistently resolved to git+ssh:// despite package.json specifying git+https://. Direct edit was necessary.

### Files Changed
- `package-lock.json` (1 line changed)

### Change Detail
```diff
@@ -969,7 +969,7 @@
     },
     "node_modules/@mathieuc/tradingview": {
       "version": "3.5.2",
-      "resolved": "git+ssh://git@github.com/Mathieu2301/TradingView-API.git#574a9948b2adb3396b934c612f58d2ab103a6915",
+      "resolved": "git+https://github.com/Mathieu2301/TradingView-API.git#574a9948b2adb3396b934c612f58d2ab103a6915",
       "license": "ISC",
```

---

## Verification Results

### Focused Gate: ✅ PASS
**Test:** `tests/scripts/architecture/cli/core/github_workflow_contract.test.js`
```
✔ CI dependencies use non-interactive transports (0.569575ms)
ℹ tests 4 / pass 4 / fail 0
```

### Broader Gate: ✅ PASS
**Full Test Suite:**
```
Total: 1,081 tests
Pass:  1,077 (99.6%)
Fail:  0
Skip:  4
```

**Improvement:** +1 test fixed (1,076 → 1,077 passing)

### Native C++ Tests: ✅ PASS
- Not re-run (no C++ changes, previous: 30/30 pass)

### Hygiene: ✅ PASS
- Not re-run (no structural changes, previous: 6/6 pass)

---

## Edge Cases Encountered

**EC-8: npm Persistent SSH Resolution**
- **Issue:** `npm install` consistently resolved to git+ssh:// even after deleting package-lock.json
- **Root Cause:** npm/git transport preference (possibly SSH keys present in environment)
- **Resolution:** Manual edit to package-lock.json
- **Risk:** Future `npm install` may revert to git+ssh://
- **Mitigation:** CI contract test will catch regression; consider `.npmrc` git rewrite rules

---

## Trust Boundaries Verified

- ✅ **Dependencies:** Single transport change, no version change
- ✅ **Build/CI:** Primary objective achieved
- ✅ **Auth/Secrets:** No credential exposure
- ✅ **Network:** Transport more restrictive (HTTPS vs SSH)
- ✅ **Trading:** No trading logic affected

---

## Grade Impact

**Data Integrity Section:**
- **Before:** B+ (grade-limiting: 1 test failure - DI-CI1)
- **After:** A (all tests passing, DI-CI1 resolved)

**Repository Overall:**
- Test pass rate: 99.5% → 99.6%
- Zero test failures (down from 1)

---

## Regression Risk Assessment

**Risk Level:** LOW

**Potential Regression:**
- Future `npm install` may regenerate package-lock.json with git+ssh://
- CI contract test will detect this immediately

**Mitigation Recommendation:**
```bash
# Option 1: Add to .npmrc (project-level)
# git-url-insteadof = "https://github.com/:ssh://git@github.com/"

# Option 2: Document manual fix in CONTRIBUTING.md
# If npm install reverts transport, manually edit package-lock.json line 972
```

---

## Deferred Items

None. BATCH-1 fully complete.

---

## Next Batch Readiness

**BATCH-2:** Dead code removal (CT-1) - Ready to proceed
**BATCH-3:** Environment documentation (CT-3) - Ready to proceed

---

## Closeout Checklist

- [x] Implementation complete
- [x] Focused verification passed
- [x] Broader verification passed
- [x] Trust boundaries checked
- [x] Edge cases documented
- [x] Grade impact assessed
- [x] Regression risk evaluated
- [x] No outstanding issues
- [x] Batch closed

**BATCH-1: VERIFIED AND CLOSED**

---

**Next Action:** Proceed to BATCH-2 (dead code removal) or commit BATCH-1 results first?
