---
name: blast-through
description: Speed implementation, section grading, evidence-first audit, and data-driven confidence score calculation in personal_finance_draft. Use when doing broad codebases review, focused audits, or grading repository cleanliness.
---

# Blast Through

Use this skill for broad codebase audits, section grading, and finding codebase gaps.

## Session Mode & Reading Strategy

Apply a **Garbage In, Garbage Out** filter before transferring context: classify each candidate file as `production`, `test`, `docs`, or `scratch`. Exclude scratch/debug artifacts unless they are the only place a bug is reproduced. Prefer production files for architecture conclusions, and treat tests as behavioral evidence.

If the repo has an active `graphify-out/` or the user asks for structure, bridge nodes, stale-doc checks, or cross-folder connectivity, use `graphify` as the first map before manual file reads. Use the graph to narrow the blast-through to the unresolved subgraphs, then verify the specific files with direct reads.

Blast-through is self-evolving: when a pass uncovers a durable workflow lesson, promote that lesson into this skill after the repo-local state files are updated. Prefer rules that help future audits avoid the same blind spot.
When the user asks to print data for inspection, prefer a real artifact or live snapshot; if only a synthetic contract sample exists, label it explicitly and do not present it as real data.
When the user asks for places needing developer review, create or update `workspace/DEV_REVIEW.md` before final response. It must list concrete files, why each path needs review, required reviewer decision, evidence used, and the verification gate that should clear it.

**Mode Selection:**
- **Hard Reading Mode:** Use on the first pass for a repo, or after the report/state is stale. Read the project state, graph report, and only the files needed to explain the gap.
- **Fast Reading Mode:** Use on the second and later passes during the current work streak. Reuse the existing blast-through report, search only unresolved sections, and move directly to section isolation.

## Section Grading System

Every blast-through pass must assign a cleanliness grade to each major folder or section reviewed.

Score each section across these lenses before assigning the final grade:
- **Path clarity**: Is the active path obvious?
- **Duplication/drift**: Are there overlapping implementations or stale copies?
- **Verification**: Are tests or visibility logs proving the current behavior?
- **Artifact hygiene**: Are there placeholders, dead files, debug prints, or clutter?
- **Doc alignment**: Do docs and UI claims match the current state?
- **System Design Alignment**: Does the section adhere to its designated domain (Backend, Frontend, Shared, Infra)? Are cross-domain dependencies explicit and minimal?

Use both a letter grade and a short reason:
- **A**: Clean, canonical, low drift, good verification, minimal stale artifacts.
- **B**: Mostly clean, a few contained debts or placeholders, no major confusion.
- **C**: Mixed cleanliness, noticeable duplication, drift, stale docs, or weak verification.
- **D**: Messy, unclear ownership, active/legacy overlap, debug leftovers, or major trust gaps.
- **F**: Broken or fundamentally untrusted; the section cannot be treated as a reliable base.

When grading, prefer architectural cleanliness over raw feature count. A small but coherent section can outscore a feature-rich but messy one.

## Evidence Standard

When blast-through touches tests, fixtures, or verification logs, require visible data flow instead of a bare pass/fail result.

Report:

- input source or fixture
- key transform or filter steps
- record counts or row counts at each stage
- rejected or skipped records, when relevant
- output artifact path and a small sample of the produced result
- the invariant that explains why the test passed

Codex and Gemini must follow the same evidence standard.

## Tiered AI Model Orchestration

To maintain high-level reasoning and implementation efficiency, follow this strict model division:
1. **Phase 1 (High-Tier):** Initial review, planning, and strategic design.
2. **Phase 2 (Lighter-Tier):** Tactical execution and surgical coding.
3. **Phase 3 (High-Tier Audit):** Mandatory hallucination check. Search for invented conventions where a lighter model hallucinated naming schemes, error handling, or patterns that do not exist elsewhere in the repo.
4. **Phase 4 (Low-Tier):** Reporting, state updates, LOC breakdown, and section grades.

## Audit Workflow

0. **DCS Audit**: Report current Confidence Score. If < 0.95, halt and investigate degraded paths.
1. **Archive Integrity Check**: Verify `workspace/STATE.md`, `workspace/SESSION_MEMORY.md`, `workspace/HANDOFF.md`, and existing blast-through files are present and chronologically plausible. Append corrections; do not rewrite old history.
2. **Developer Review Ledger**: Search for `TODO`, `FIXME`, `HACK`, `BUG`, `XXX`, hardcoded test values, synthetic fixtures promoted as real data, and unresolved developer comments. Sync high-signal items into `workspace/DEV_COMMENTS.md` and active reviewer decisions into `workspace/DEV_REVIEW.md`.
3. Read the current prompt and the repo state files.
4. If `graphify-out/` exists, use the graph report before broad manual exploration so the first pass starts from communities, god nodes, and bridge nodes instead of raw file sprawl.
5. Identify the session goal and the smallest useful review objective.
6. Review code, docs, tests, config, and handoff notes for gaps, risk, and optimization opportunities, but trust the safe-file checklist first for stable files.
7. Trace critical data paths from config to provider call to normalization to cache/report/UI, and flag any mismatch between docs, commands, folder names, runtime output, and actual files.
   - **System Design Hygiene**: Verify that files are correctly categorized into Backend, Frontend, Shared, or Infra domains. Check for cross-domain leaks (e.g., frontend-only logic in a backend script).
   - **Dependency Isolation**: Ensure that domains only communicate through explicit APIs or shared packages.
   - **Path Integrity**: Verify that all relative imports are correct following the Sovereign Domain-Based refactor.
   If the data is suspect, stop at the seam and label it degraded rather than promoting it downstream.
   For web surfaces, verify the served entrypoint, static asset wiring, and the actual browser-facing files before trusting UI docs or shell placeholders.
8. For data and ML paths, check data preservation. Destructive overwrite logic, missing provenance, missing freshness checks, or a transformation without visible sample evidence belongs in the dev-review ledger.
9. Capture findings, open questions, and next ideas in the repo memory files.
10. Include a granular LOC breakdown when the session is a major audit or when the user asks for a deep blast-through.
11. If the user asks for a code review, use findings-first output.
## Data-Driven Confidence Score (DCS)
- **Calculation**: $DCS = (0.3 \cdot \text{Freshness}) + (0.4 \cdot \text{Schema}) + (0.3 \cdot \text{Coverage})$
- **Checklist**:
  - [ ] Report DCS at start and end of audit.
  - [ ] If DCS < 0.95, halt model promotion and investigate the lowest-scoring factor.
  - [ ] Ensure all 'degraded' paths are accounted for in the integrity report.
  - [ ] No data transformation is allowed without a corresponding integrity log.


## What Not To Do

- **No bullshit:** Do not report pedantic, theoretical, or low-signal edge cases as real bugs.
- **Do not invent issues:** If the code is solid, state that it is solid.
- **No monolithic blasts:** Do not try to ingest the whole codebase in one turn.
- **No heavy coding:** Do not turn the session into a large implementation sprint unless the user explicitly asks for fixes.
- **No redundant reads:** Do not re-read the same files repeatedly when the state has not changed.
- **Do not skip hygiene:** Do not skip security-sensitive paths, build wiring, validation gaps, or stale docs when doing a system check.

## Output Shape

When using this skill, report:
- strongest gap candidates first
- section cleanliness grades second
- verification evidence used
- data-flow evidence when tests or pipelines are involved
- the next cleanup move on the critical path
