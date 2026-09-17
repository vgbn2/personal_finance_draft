# Deprecation and Versioning Policy

> **Diátaxis Type**: Reference | **Status**: Canonical | **Owner**: Standards & Core Engineering | **Review**: Bi-Annual

This policy establishes the formal lifecycle rules for deprecating interfaces, evolving data storage schemas, and versioning platform releases across the Sovereign Trading Platform.

---

## 1. Semantic Versioning (SemVer 2.0.0)

Sovereign strictly follows [Semantic Versioning 2.0.0](https://semver.org/):

$$\text{Version} = \text{MAJOR}.\text{MINOR}.\text{PATCH}$$

| Version Component | Increment Trigger | Compatibility Guarantee |
|---|---|---|
| **MAJOR** | Incompatible API breaks, binary storage format changes (`SOVT v1` $\to$ `SOV2`), or structural risk invariant changes | Breaking changes allowed; migration path and tooling required |
| **MINOR** | New indicators, new REST/WebSocket endpoints, broker gateway adapters, or non-breaking CLI flags | 100% backward-compatible with preceding minor releases |
| **PATCH** | Bug fixes, CTest numerical corrections, performance optimizations, and documentation fixes | 100% backward-compatible; zero schema or behavior alterations |

---

## 2. Deprecation Lifecycle & Two-Minor-Version Rule

To avoid sudden breaking changes for automated bot runners and external contributors:

1. **Stage 1 — Deprecation Announcement (Version $X.Y.0$)**:
   - The interface is marked deprecated in documentation and code.
   - Calling the interface emits a standard non-fatal warning to `stderr` with a registered `SOV_DEP_xxx` code.
2. **Stage 2 — Deprecation Grace Period (Version $X.(Y+1).0$)**:
   - The interface remains fully functional.
   - Diagnostic warnings continue; CI pipelines configured with strict warnings may flag usage.
3. **Stage 3 — Interface Removal (Version $X.(Y+2).0$ or $(X+1).0.0$)**:
   - The deprecated interface is deleted. Calling it throws a fatal error directing the operator to the replacement.

---

## 3. Deprecation Diagnostic Code Taxonomy (`SOV_DEP_xxx`)

All runtime deprecation warnings emit structured log frames containing an official identifier:

| Diagnostic Code | Domain | Description & Migration Directive |
|---|---|---|
| `SOV_DEP_001` | Wealth Legacy | Legacy wealth simulator models or endpoints (`/api/wealth/*`); migrate to `/api/portfolio` |
| `SOV_DEP_002` | Environment Config | Unscoped credentials (`ALPACA_API_KEY`); migrate to scoped `ALPACA_PAPER_*` or `ALPACA_LIVE_*` |
| `SOV_DEP_003` | Storage Concurrency | Unlocked direct file writes; migrate to `withFileLockSync` with POSIX `O_EXCL` locks |
| `SOV_DEP_004` | Indicators | Legacy indicator positional parameters; migrate to standard `{ symbol, timeframe, period }` options |
| `SOV_DEP_005` | CLI Commands | Deprecated legacy CLI command aliases; migrate to canonical command keys in `tui/manifest.js` |

---

## 4. Binary Time-Series Evolution Policy (`SOVT v1` $\to$ `SOV2`)

High-density binary time-series files (`storage/data/ts/*.bin`) represent immutable historical data. Schema migrations must follow strict protocol:

1. **Magic Header Negotiation**:
   - Readers inspect the first 4 bytes of disk storage.
   - ASCII `SOVT` (`0x53 0x4F 0x56 0x54`) designates Version 1 (48-byte packed IEEE-754 bars).
   - Any future layout (e.g. adding tick flags or L2 depth) will introduce a distinct 4-byte ASCII magic identifier (e.g. `SOV2`).
2. **Backward-Compatible Readers**:
   - The C++ reader (`BinaryTsReader`) and JS storage adapter (`ts_index_storage.js`) must preserve read support for older format versions for at least one major release.
3. **Migration Utilities**:
   - Any schema revision must ship an in-place migration utility (`scripts/tools/migrate_ts_format.js`) that validates file checksums before replacing legacy binary archives.
