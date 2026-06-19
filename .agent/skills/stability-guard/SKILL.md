---
name: stability-guard
description: Stability and safety standards for maintaining clinical-grade system integrity in the diabetic-main suite.
---

# Skill: Stability Guard

Architectural standards and patterns for maintaining clinical-grade system integrity in the "diabetic-main" suite.

## Core Patterns

### 1. Safe Optional Imports
Always guard imports for non-core or external modules (e.g., `mempalace`) to prevent module-level crashes during the boot phase.

**Pattern**:
```python
try:
    from optional_package.module import Feature
    FEATURE_ENABLED = True
except (ImportError, ModuleNotFoundError):
    FEATURE_ENABLED = False
    # Log warning, do not raise
```

### 2. Strict API Context Alignment
When calling ML models or DSP engines (Twin, Predictor, Kalman), always use **keyword arguments**. This ensures that parameter renaming or re-ordering bug (like `insulin` vs `insulin_doses`) are caught during development or explicitly handled.

**Pattern**:
```python
# Avoid
engine.predict(data, 0.5)

# Mandatory
engine.predict(input_data=data, sensitivity=0.5)
```

### 3. Forensic Traceability
- **Metadata**: Every constant added to `medical_constants.py` must include a comment or docstring citing its clinical source (e.g., "Kovatchev 2019" or "Ottai Factory Defaults").
- **Unique IDs**: All interactive elements (UI and Telegram) must use unique tracking IDs for forensic event reconstruction.

## Dependency Hygiene
Ensure `requirements.txt` is updated after any new module is added to `src/` or `diabetic/`. Never assume a package is present if it's not documented in the root configuration.

## Checkpoint: Clinical Logic Order
When implementing risk decision matrices, always check for **CATASTROPHIC** risks (e.g., Faint Risk > 17.0 mmol/L) before **CRITICAL** or **HIGH** risks to prevent logical shadowing.
