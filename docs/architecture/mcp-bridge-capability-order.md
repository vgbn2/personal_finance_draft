# MCP bridge capability ordering

`backend/mcp_server/lib/bridge.ts` classifies command capability before resolving the CLI executable. Account-read and execution requests retain the existing `environment_surface_denied` response even when the executable is absent. Allowed requests still require successful canonical CLI discovery and the existing restricted child environment, timeout and output limits.

Verification: initially 17 of 18 trade/API contracts passed, with local-help failing on stale CLI discovery. After the approved canonical-path and consumer-import cutover, main independently ran trade/API gates plus reverse filesystem/import contracts: **21/21 passed**. Local help works and account/execution denial remains. This is not full MCP parity or deployed-runtime proof. The denial repair did not modify failing tests or assertions; subsequent path-contract expectations reflect the explicitly approved layout.

Implementation and exact diff: `workspace/plans/2026/11/07-MASS_IMPLEMENT.md`. No live/provider execution or deployment was exercised.

Subsequent user approval makes `frontend/cli-tui/` and `configs/` canonical, with physical folder cutovers and no symlinks. Canonical discovery is now updated; current remaining startup failures must be distinguished from executable lookup failures. Final integrated results are recorded in the implementation ledger. Reverse verification must exercise both allowed local help and retained account/execution denial; CI has not been observed and is not claimed as proof.

The broad API gate also required ingestion data-source and options-manifest constants to use `configs/markets/`. A missing data-source manifest previously made the quotes CLI fail before the route could build its response. Correcting the path is not permission to fabricate provider availability: optional local-import unavailability remains visible. Native-backed API checks use the existing binary override when the build is staged outside the repository.
