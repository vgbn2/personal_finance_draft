# GSD State Snapshot

## Current Position
- **Phase**: Domain-Driven Reorganization & Refactor
- **Task**: 100% Complete (Transformed Monolithic Core to Subpackage Domains)
- **Status**: Active (resumed 2026-04-15 21:58)

## Last Session Summary
Successfully delivered the **Domain-Driven Reorganization**. The codebase is now split into clear specialized subpackages (`cli`, `engine`, `intelligence`, `store`, `infra`).

**Primary Achievements**:
- **Structural Separation**: Moved 18 modules from the monolithic `core` into 5 domain-specific subpackages.
- **Global Import Sync**: Updated 58+ internal absolute imports to ensure zero broken references.
- **CLI Namespace**: Relocated entry points to `sovereign.cli` and updated the `start_all.bat` launcher.
- **Verification**: 100% logic integrity confirmed through the final verification suite.

## In-Progress Work
- **Completed**: Structural pivot, Batch orchestration, and Namespace consolidation.
- **Next Up**: Milestone 6: Portfolio Intelligence (Risk-Off Automation).
- **Files modified**: `sovereign/main.py`, `sovereign/ui/hud.py`, `start_all.bat`.
- **Tests status**: **ALL PASSED** (`python -m sovereign.main --dry-run`).

## Blockers
- **None**. The platform is stable.

## Context Dump
The system now uses the `python -m sovereign.module` entry points exclusively. Do not run scripts directly from their file paths.

### Decisions Made
- **Multi-Window Launch**: Abandoned `wt.exe` pane-splitting in favor of independent CMD windows to ensure maximum compatibility for the user.
- **PowerShell SED fallback**: Used native PowerShell `-replace` for the namespace migration after `sed/xargs` failed on Windows.

### Current Hypothesis
The multi-window approach in `start_all.bat` will be more resilient for the user while still providing the "Matrix Heatmap" visual feedback they need.

### Files of Interest
- `start_all.bat`: The primary suite entry point.
- `sovereign/ui/hud.py`: The core rendering engine (now with fixed macro imports).

## Next Steps
1. **Milestone 6 Execution**: Begin developing the `PortfolioAllocator` within `sovereign/core`.
2. **Deribit L4 Hook**: Integrate Options flows into the Research Heatmap.
