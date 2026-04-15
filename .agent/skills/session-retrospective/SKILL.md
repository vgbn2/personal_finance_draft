# Sovereign Engineering Master Retrospective

## Core Principle
> **The Agentic Memory Skill**: Every session must conclude with an architectural 'truth' extraction. These lessons inform future planning and prevent regressions in high-performance agentic systems.

---

## 🏗️ Architectural Truths (Cross-Project)

### 1. Terminal UI Performance (The Drift Truth)
- **Problem**: High-frequency terminal loops (20Hz+) are extremely sensitive to I/O and algorithmic complexity.
- **Learning**: Synchronous calls to `predictor.forecast()` or database scans during a render cycle *will* cause `Errno 22` on Windows.
- **Solution**: Decouple Render from Logic. Use throttled internal caches and incremental state (O(1) caching).

### 2. High-Fidelity Data Extraction (The Vision Truth)
- **Problem**: OCR and vector extractors (pdfplumber) fail on dense grids or custom icons (e.g., insulin markers).
- **Learning**: High-resolution rasterization (576+ DPI) combined with HSV color-space masking is superior to OCR for physiological marker detection.
- **Solution**: Isolation of color ranges (Purple/Orange) before centroid detection.

### 3. API Signature Integrity (The Keyword Truth)
- **Problem**: Positional arguments are fragile in evolveable agentic systems.
- **Learning**: Passing objects where lists are expected (or vice versa) without explicit keyword guards leads to silent logic drift or runtime `TypeError`.
- **Solution**: Enforce keyword-only signatures for critical trajectory/prediction methods.

### 4. Logic Priority (The Verdict Truth)
- **Problem**: Generic alerts can mask high-risk physiologic states.
- **Learning**: Critical safety checks (e.g., Faint Risk vs Hyperglycemia) must be ordered by physiological severity, not numerical value.
- **Solution**: Reorder decision matrices to capture trend-based risks before threshold-based alerts.

### 5. Large File Bottleneck (The Log Truth)
- **Problem**: Attempting to read or search extremely large files (85MB+ logs) using standard tools causes timeouts and encoding crashes.
- **Learning**: Use "Early Instrumentation" (proactive logging) rather than "Late Searching". Use targeted range-reads for forensics.
- **Solution**: Instrument `main.py` entry points for full traceback capture.

### 6. ESM/TypeScript Resolution (The Resolution Truth)
- **Problem**: TypeScript `TS2307` errors when using explicit `.js` extensions in source files for ESM compatibility.
- **Learning**: Explicit `.js` extensions in imports are required for Node.js ESM at runtime but require `moduleResolution: "nodenext"` or `"bundler"` in `tsconfig.json` to resolve correctly to `.ts` source files.
- **Solution**: Standardize `tsconfig.json` across frontend and backend to avoid "Invisible Module" errors.

### 7. Native Module Sync (The Binding Truth)
- **Problem**: Systems relying on C++ native bridges (e.g., `terminus_core`) fail if bindings are out of sync with the TypeScript interfaces.
- **Learning**: Native module interfaces should be treated as "Hard Contracts". Any change in the C++ layer must be mirrored by an immediate version-bump in the TS type definitions.
- **Solution**: Use an Automated Binding Generator or a shared `definitions.h` to minimize divergence.

### 8. The Re-Initialization Paradox (The State Paradox)
- **Problem**: Re-initializing stateful filters (Kalman, DSP) on every data point causes performance degradation and mathematical noise.
- **Learning**: DSP filters must maintain persistent state buffers even across "stale data" gaps to ensure convergence.
- **Solution**: Implement "Warm-Start" logic for filters that stores the last valid state in a persistence layer.

---

## ⚠️ The Mistakes Log (Documentation of Error)

### 2026-04-15: Log Hunt Failure (Sovereign Wealth)
- **Mistake**: Attempted broad `open().read()` and `grep` on an 85MB log file.
- **Why it was a mistake**: Triggered `UnicodeEncodeError` and wasted 15+ minutes on tool timeouts. Inefficient "needle-in-haystack" approach.
- **Correction**: Abandoned log search for proactive data hardening in `schema.py`.

### 2026-04-15: ESM Extension Mismatch (Terminus)
- **Mistake**: Using explicit `.js` extensions in `import` statements without configuring `nodenext` resolution.
- **Why it was a mistake**: Caused project-wide `TS2307` errors where sibling files existed but were "unresolvable" to the compiler.
- **Correction**: Aligned `tsconfig.json` module resolution settings.

### 2026-04-13: Cardiac Import Regression (Bio-Quant)
- **Mistake**: Forgot to export `CARDIAC_` constants in `medical_constants.py` secondary refactor.
- **Why it was a mistake**: Caused a total system `ImportError` on boot, blocking the ingestion pipeline.
- **Correction**: Implemented "Import Guarding" with safe defaults for optional modules.

### 2026-04-12: Uninitialized HR Constants (Hyperglycemia)
- **Mistake**: Referencing `HEART_RATE_MAX` before its definition in the global settings loop.
- **Why it was a mistake**: Crashed the metabolic coordinator on first run after a config change.
- **Correction**: Moved all biological constants to a top-level `Registry` that initializes *before* any logic modules.

### 2026-04-11: Unit Detection Ambiguity (Nightscout)
- **Mistake**: Assumed `mmol/L` units from Nightscout without verifying the raw JSON header value.
- **Why it was a mistake**: Caused 18x scaling errors in the forecast engine (mg/dL to mmol/L mismatch).
- **Correction**: Implemented automated unit heuristic detection at the `IngestionLayer`.

---

## 📝 Session Diary

### 2026-04-15: The Global Data Hardener
- **Context**: Sovereign Wealth UI crashes (`KeyError: 'currency'`) and Log processing bottlenecks.
- **Action**: Hardened `NormalizedMovement` schema. Consolidated cross-project mistakes into the Master Retrospective.
- **Artifacts**: schema.py, main.py instrumented, Master Retrospective (SKILL.md).
