# BATCH-1 Edge Cases Analysis

**Finding:** Current working tree already has the OPPOSITE problem - someone manually changed git+https:// to git+ssh://

## Evidence

**Committed state (b86160d3):**
```json
"resolved": "git+https://github.com/Mathieu2301/TradingView-API.git#574a9948"
```

**Working tree (modified):**
```json
"resolved": "git+ssh://git@github.com/Mathieu2301/TradingView-API.git#574a9948"
```

**Test failure:** Expects git+https://, currently sees git+ssh:// in working tree

## Edge Cases Identified

### EC-1: Working Tree Contamination
**Risk:** HIGH - Working tree has manual uncommitted edit  
**Impact:** Current package-lock.json is NOT the committed state  
**Mitigation:** Discard working tree changes first with `git restore package-lock.json`  
**Verification:** `git diff package-lock.json` should show no changes after restore

### EC-2: Only One Git Protocol Dependency
**Risk:** LOW  
**Finding:** Only 1 of 2 git-protocol dependencies uses SSH (TradingView-API)  
**Impact:** Narrow scope - single dependency affected  
**Mitigation:** None needed - validates focused fix

### EC-3: Direct Dependency (Not Transitive)
**Risk:** LOW  
**Finding:** `@mathieuc/tradingview` is direct dependency in package.json  
**Impact:** We control the version specification  
**Mitigation:** Package.json already correct with git+https://

### EC-4: Pinned Commit Hash
**Risk:** LOW  
**Finding:** Dependency locked to specific commit `#574a9948b2adb3396b934c612f58d2ab103a6915`  
**Impact:** Version stability - npm install won't fetch different code  
**Mitigation:** None needed - good practice

### EC-5: npm v11.16.0 / Node v24.18.0
**Risk:** LOW  
**Finding:** Modern npm version with stable lockfile v3 format  
**Impact:** Consistent lock file generation  
**Mitigation:** None needed - versions are current

### EC-6: No .npmrc Configuration
**Risk:** LOW  
**Finding:** No custom npm configuration that might affect git protocol resolution  
**Impact:** Default npm behavior applies  
**Mitigation:** None needed

### EC-7: Test Currently Failing Due to Working Tree
**Risk:** MEDIUM  
**Finding:** Test expects git+https://, working tree has git+ssh://  
**Impact:** Test will fail on current working tree, pass after restore  
**Mitigation:** Restore working tree first, verify test passes on clean state

## Revised Implementation Plan

### Phase 1: Verify Clean State
1. ✓ Confirmed working tree has manual uncommitted change (https→ssh)
2. **ACTION:** `git restore package-lock.json` to return to committed state
3. **VERIFY:** Run failing test - should now PASS (committed state is correct)
4. **OUTCOME:** If test passes, NO FURTHER ACTION NEEDED - finding is false positive from dirty tree

### Phase 2: Conditional Implementation
**IF test still fails after restore:**
1. Backup package-lock.json
2. Delete package-lock.json
3. Run `npm install`
4. Verify git+https:// transport
5. Run test verification

**IF test passes after restore:**
1. Close BATCH-1 as NO-OP (committed state already correct)
2. Document false positive source (working tree contamination)
3. Move to BATCH-2

## Safety Check Results

- ✅ Single dependency affected (narrow scope)
- ✅ Direct dependency (we control specification)
- ✅ Pinned commit (version stable)
- ✅ Modern npm (lockfile v3)
- ✅ No custom registry config
- ⚠️ **Working tree dirty** - must restore first
- ✅ Reversible (git restore available)

## GO/NO-GO Decision

**STATUS:** GO WITH FIXES

**Required Fix:** Restore working tree before test verification

**Rationale:** The audit finding may be a false positive caused by examining working tree instead of committed state. Must verify clean committed state first before attempting regeneration.

## Expected Outcomes

**Scenario A (Most Likely):** Committed state is correct
- Restore working tree → Test passes → BATCH-1 closes as NO-OP
- Data Integrity grade already at A for this criterion
- Document finding was working-tree contamination

**Scenario B (Unlikely):** Committed state also has git+ssh://
- Restore doesn't fix test → Proceed with npm install regeneration
- Follow original BATCH-1 plan
- Test passes after regeneration

**Next Action:** Execute Phase 1 verification
