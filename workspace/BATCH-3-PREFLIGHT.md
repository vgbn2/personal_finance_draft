# BATCH-3 Preflight Report

**Status:** GO  
**Date:** 2026-08-01T06:16:35Z  
**Objective:** Document 7 undocumented environment variables  
**Finding ID:** CT-3 (P3)

---

## Variable Usage Analysis

### Undocumented Variables (7)

#### 1. PMXT_API_KEY
**Purpose:** API key for PMXT (Polymarket historical data archive)  
**Usage:**
- `shared/lib/market/polymarket_history.js:401` - Default empty string
- `backend/gateway/src/index.ts:2642` - CLI option fallback
- `backend/cli/commands/trade/trade_polymarket.js:711,741,798` - Historical data fetching
**Default:** Empty string (optional service)

#### 2. PMXT_BASE_URL
**Purpose:** Base URL for PMXT API endpoint  
**Usage:**
- `shared/lib/market/polymarket_history.js:402` - Default https://api.pmxt.dev
- `backend/gateway/src/index.ts:2643` - CLI option fallback
- `backend/cli/commands/trade/trade_polymarket.js:712,742,799` - API endpoint configuration
**Default:** `https://api.pmxt.dev`

#### 3. PROXY_ADDRESS
**Purpose:** Polymarket proxy wallet address for signature type 1 (legacy)  
**Usage:**
- `backend/gateway/src/polymarket_account.js:25,35,70` - Proxy wallet detection
- `backend/gateway/src/index.ts:1064,1068` - Balance checking with proxy
**Default:** undefined (optional for newer signature types)

#### 4. ORDERS_FILE
**Purpose:** Path to proposed orders JSON file for gateway batch execution  
**Usage:**
- `backend/gateway/src/index.ts:2825` - CLI fallback for orders file path
**Default:** `proposed_orders.json`

#### 5. POLYMARKET_TRADE_PAGE_CAP
**Purpose:** Maximum pages to fetch when paginating Polymarket trade history  
**Usage:**
- `backend/gateway/src/index.ts:1125` - Pagination limit
**Default:** `10`

#### 6. SOVEREIGN_USER_SETTINGS_PATH
**Purpose:** Override path for user settings JSON file  
**Usage:**
- `shared/lib/settings/user_settings.js:60` - Settings path resolution
- `backend/mcp_server/lib/agent_gate.ts:6` - MCP server settings
**Default:** `~/.sovereign/user_settings.json`

#### 7. SOVEREIGN_ENVIRONMENT_SURFACE
**Purpose:** Target environment surface for projection (browser/server/cli)  
**Usage:**
- `backend/gateway/src/index.ts:2043` - Environment surface detection
- `shared/lib/runtime/environment_manifest.js:346` - Surface projection
**Default:** Auto-detected from runtime context

---

## "Unused" Variables Re-Assessment

### CORRECTION: All 3 variables ARE USED

The audit finding that these were "documented but unused" was **incorrect**. All three are actively used:

#### 1. SOVEREIGN_RUNTIME_MODE ✓ USED
**Usage:**
- `backend/scripts/ops/central_host_preflight.js:110` - Runtime mode validation
- `shared/lib/runtime/environment_manifest.js:47` - Default value `cloud-compute`
**Status:** Keep - used for host deployment classification

#### 2. SOVEREIGN_EXECUTION_AUTHORIZED ✓ USED
**Usage:**
- `backend/scripts/ops/central_host_preflight.js:112` - Execution authorization check
- `shared/lib/runtime/environment_manifest.js:46` - Default value `false`
**Status:** Keep - critical safety gate for live trading

#### 3. SOVEREIGN_DEPLOYMENT_PROFILE ✓ USED
**Usage:**
- `backend/scripts/ops/prepare_central_env.js:44` - Profile assignment
- `backend/scripts/ops/central_host_preflight.js:121` - Profile validation
- `shared/lib/runtime/environment_manifest.js:45,296,322` - Profile resolution
- `shared/lib/settings/deployment_profile.js:64` - Profile-based configuration
**Status:** Keep - used for deployment-specific behavior

---

## Duplicate/Stub Preflight

### Classification
- All 10 variables (7 undocumented + 3 "unused") are **canonical environment configuration**
- No duplicates, stubs, or dead code
- No compatibility shims involved

---

## Implementation Plan

### Changes to .env.example

Add 7 undocumented variables with descriptions and defaults:

```bash
# Polymarket Historical Data (PMXT Archive - optional)
PMXT_API_KEY=
PMXT_BASE_URL=https://api.pmxt.dev

# Polymarket Proxy Wallet (legacy signature type 1 - optional)
PROXY_ADDRESS=

# Gateway batch execution orders file path
ORDERS_FILE=proposed_orders.json

# Polymarket trade history pagination limit
POLYMARKET_TRADE_PAGE_CAP=10

# User settings override path (defaults to ~/.sovereign/user_settings.json)
SOVEREIGN_USER_SETTINGS_PATH=

# Environment surface for projection (browser/server/cli - auto-detected)
SOVEREIGN_ENVIRONMENT_SURFACE=
```

### No Removals
The 3 "unused" variables are actually used and already documented. No action needed.

---

## Safety Boundaries

- ✅ Documentation only - zero code changes
- ✅ No credential exposure (example values only)
- ✅ No behavior changes
- ✅ Reversible via git

---

## Verification Gate

**Focused:** Manual review of .env.example completeness  
**Broader:** Hygiene audit still passes 6/6

---

## GO/NO-GO Decision

**STATUS: GO**

**Rationale:**
- All 7 undocumented variables confirmed as actively used
- All 3 "unused" variables proven to be used (audit finding incorrect)
- Documentation-only change with zero risk
- Improves developer onboarding

**Next Action:** Add variables to .env.example with appropriate comments
