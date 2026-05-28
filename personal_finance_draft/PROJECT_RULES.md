# Project Rules

This project follows the GSD methodology and the Sovereign Institutional Engineering Standards.

## Canonical Rules

1. **Plan Before You Build** - No code without specification.
2. **State Is Sacred** - Every meaningful action updates `workspace/STATE.md`.
3. **Context Is Limited** - Use `rg` and targeted reads.
4. **Verify Empirically** - No "trust me, it works". Use the 3-Step Test: Unit Test, CLI Test, and Stress Test.
5. **No Glazing** - Be objective, provide facts.
6. **Trading Priority** - Trading logic takes precedence over legacy wealth code.
7. **Phase Gating** - Do not implement Phase N+1 features until Phase N is complete.
8. **Schema-First Transition** - Refactor brittle if/else chains and magic numbers into schema-driven manifests and YAML where practical.

Anti-bullshit mandate: never hardcode values or forge JSON just to pass tests.

## Sovereign Architecture Standards

1. **Adapters**: Pure I/O such as APIs, CSVs, and file imports.
2. **Core**: Mathematical logic, PnL accounting, and ledger management, preferably C++.
3. **Intelligence**: Neural models, forecasting, risk scores, and feature tensors.
4. **UI**: Terminal and web surfaces that mirror engine state.

## Dependency And Data Flow

- **Strict Dependency Flow**: UI -> Core -> Adapter.
- **Structural Decoupling**: Intelligence modules must be adapter-blind.
- **Minimalism**: Prefer small, isolated dependencies and remove bloat.

## Operational Protocols

## Operational Protocols

- **Deletion Protection**: ANY edit that results in a net deletion of >100 lines of code MUST trigger a request for user review and confirmation before execution. Overwriting or truncating files is strictly prohibited without explicit user authorization for the specific change.
- **Large File Version Control**: To prevent data loss, big files (>500 lines) MUST be committed to Git immediately after any significant edits or following a Blast-Through/audit session.
- **Theory-First**: Cite mathematical sources for indicators when changing formulas.
- **Local-Only Mandate**: CLI-first. Avoid web ports 80, 443, and 8000 unless explicitly secured.
- **GSD Loop**: Discover -> suggest ideals -> user approval when needed -> finalize plan -> audit/check -> execute.
- **Planning Metadata**: Major plans should include difficulty, complexity, and estimated LOC when useful.
- **Tiered AI Model Orchestration**: Use high-tier review/planning, lighter execution for bounded tasks, high-tier audit, and lower-tier reporting when the user asks for model tiering.
- **Empirical Data Visualization**: Tests must show actual data samples or counts when they claim pipeline behavior. A bare "passed" is not enough for integration trust.
- **Granular LOC Reporting**: Major session reports and audits should include LOC breakdowns for modified or reviewed sections when practical.
- **Segment Heatmapping**: Audit high-entropy files first when change history or recency is available.
- **Archive Integrity Check**: At the start of every blast-through, verify that `workspace/STATE.md`, `workspace/SESSION_MEMORY.md`, and `workspace/HANDOFF.md` are append-only and chronologically intact.
- **Data Preservation**: Ingestion and caching must append or merge records. Do not delete historical data as part of normal ingestion.
- **Documentation History Preservation**: Workspace notes must keep prior history. Add corrections at the bottom instead of rewriting old entries.
- **Bottom-Up Context Priority**: When reading logs, memory, or state files, prioritize the tail because the latest state is at the end.

## Tech Stack

- **Core:** C++20 with CMake.
- **CLI:** Node.js active; Rust remains planned unless superseded.
- **Web:** Node.js local web/API bridge active.
- **Data:** JSON cache active; SQLite remains planned for later phases.
