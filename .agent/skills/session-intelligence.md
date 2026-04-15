# Session Intelligence Skill

> Generated at 2026-04-15 19:30

## Sovereign Wealth Console Context

### 1. Terminal Visualization Hardware (Phase 14)
- **Arch Pattern**: Unicode Braille (U+2800) bitmasking is used for high-fidelity curve rendering.
- **Implementation**: Located in `sovereign/ui/plots.py`.
- **Constraint**: Designed for 20 FPS non-blocking execution; avoid using heavy external plotting libs for HUD.

### 2. "Sentinel" Predictor (CNN) Logic
- **Data Layers**:
    - **L1**: Macro Bias (FRED)
    - **L2**: Stablecoin Flow (Dominance)
    - **L3**: Sentiment (Mock/placeholder for local scraping)
    - **L4**: Options Skew (Deribit L4)
- **Requirement**: Needs a rolling window of 24 snapshots for full signal generation.
- **Inspectability**: Accessible via HUD Mode 5 (CNN Logic Inspector).

### 3. Data Integrity & Mapping
- **Deep-Key Extraction**: Use the established functional mapping pattern in `export.py` for nested snapshots.
- **Persistence**: Snapshot data and PnL metrics are cached in `test.db` (SQLite).

### 4. Integration Workflow
- **Gemini CLI**: `/sovereign:*` commands are powered by `sovereign/cli/export.py`.
- **Startup**: `start_all.bat` orchestrates the multi-console suite.

---

## Session History (Learned Items)
- **2026-04-15**: Institutionalized the Braille-native plotting layer. Hardened the snapshot mapping logic to prevent schema-drift errors.
