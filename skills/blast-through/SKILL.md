---
name: blast-through
description: Speed implementation, section grading, evidence-first audit, repo connectivity sweeps, unused or incomplete stub detection, string/config/docs wiring checks, and data-driven confidence score calculation in personal_finance_draft. Use when doing broad codebase review, focused audits, dependency/path/string connectivity checks, stub or orphan detection, or grading repository cleanliness.
---

# Blast Through

Use this skill for broad codebase audits, section grading, and finding codebase gaps.

## Required Mode Selection

Before reading broadly, choose exactly one audit mode and state it in the first progress update. If the user asks for multiple outcomes, choose the narrowest mode that covers the request and list any deferred modes.

Modes:
- **triage**: Quick bug/risk scan. Use when the user asks "anything wrong?" or gives a small suspicious surface. Output top findings only; no full section grades unless a section is actually reviewed.
- **section-grade**: Folder cleanliness review. Use when the user asks for grades, cleanliness, architecture quality, or review ledger updates. Output section grade table, evidence, and grade movement.
- **connective-tissue**: Stub/string/dependency/import/config/docs wiring review. Use when the user says full repo, every corner, connect strings, unused stubs, orphan, dependency, env, or missing paired stub. Output the orphan matrix.
- **data-integrity**: Data, ML, ingestion, cache, historical data, provenance, replay, or backtest trust review. Output data-flow evidence, degraded paths, freshness/schema/coverage notes, and DCS.
- **review**: Code-review mindset. Use when the user asks for review. Output findings first, severity ordered, with file:line references.
- **full**: Use only when the user explicitly asks for "full repo", "every corner", or "deep blast-through" without a narrower target. Output archive check, connective matrix, section grades, DCS, review ledger updates, and next cleanup move.

Default mode mapping:
- Broad but underspecified request -> **triage**.
- "Deep blast-through" -> **full**.
- "Stubs", "strings", "dependencies", "orphan", "unused" -> **connective-tissue**.
- "Data", "ML", "backfill", "replay", "cache", "integrity" -> **data-integrity**.
- "Grade", "cleanliness", "ledger" -> **section-grade**.
- "Review" -> **review**.

Do not silently mix modes. If implementation is requested after an audit, stop after reporting the audit or hand off to `mass-implement`.

## Session Mode & Reading Strategy

Apply a **Garbage In, Garbage Out** filter before transferring context: classify each candidate file as `production`, `test`, `docs`, or `scratch`. Exclude scratch/debug artifacts unless they are the only place a bug is reproduced. Prefer production files for architecture conclusions, and treat tests as behavioral evidence.

If the repo has an active `graphify-out/` or the user asks for structure, bridge nodes, stale-doc checks, or cross-folder connectivity, use `graphify` as the first map before manual file reads. Use the graph to narrow the blast-through to the unresolved subgraphs, then verify the specific files with direct reads.

Blast-through is self-evolving: when a pass uncovers a durable workflow lesson, promote that lesson into this skill after the repo-local state files are updated. Prefer rules that help future audits avoid the same blind spot.
When the user asks to print data for inspection, prefer a real artifact or live snapshot; if only a synthetic contract sample exists, label it explicitly and do not present it as real data.
When the user asks for places needing developer review, create or update `workspace/DEV_REVIEW.md` before final response. It must list concrete files, why each path needs review, required reviewer decision, evidence used, and the verification gate that should clear it.

**Mode Selection:**
- **Hard Reading Mode:** Use on the first pass for a repo, or after the report/state is stale. Read the project state, graph report, and only the files needed to explain the gap.
- **Fast Reading Mode:** Use on the second and later passes during the current work streak. Reuse the existing blast-through report, search only unresolved sections, and move directly to section isolation.

Hard/Fast Reading Mode is separate from audit mode. Always select both: one audit mode from `Required Mode Selection`, then Hard or Fast reading mode.

When `HEAD` is a merge commit, or the dirty worktree repairs conflict markers or other load-bearing files, validate the clean committed state with `git archive HEAD` (or an equivalent temporary clean tree), module-load checks, and package-script target checks. A green dirty worktree is not clean-clone proof.

## Deterministic Checklists

Run the checklist for the selected audit mode. Skip a command only when it is not applicable and state why.

### triage
- Read the latest `workspace/STATE.md`, `workspace/DEV_REVIEW.md`, and `workspace/REVIEW_LEDGER.md` tails.
- Run targeted `rg` searches for the user-provided symptom, command, file, or domain.
- Verify at most the top 3 high-risk candidates with direct file reads or a focused command.
- Output confirmed findings, dismissed false positives, and the next narrow check.

### section-grade
- Read `workspace/REVIEW_LEDGER.md` and the latest relevant `workspace/DEV_REVIEW.md` section.
- For each reviewed section, inspect active production entrypoints, tests, docs, and config.
- Assign grades only for sections actually checked.
- Update `workspace/REVIEW_LEDGER.md`.

### connective-tissue
- Run `rg --files` with generated/cache directories excluded.
- Run `find . -name package.json -not -path '*/node_modules/*'`.
- Search active roots for `TODO|FIXME|HACK|BUG|XXX|stub|mock|fake|fixture|placeholder|not implemented|return \{\}|return \[\]`.
- Compare env var usage against `.env.example` and frontend env examples.
- Compare direct imports/requires against each package root's declared dependencies.
- Compare CLI/TUI/docs command strings against dispatchers and package scripts.
- Verify every high-signal orphan with a direct file read before reporting it.

### data-integrity
- Identify the data source, transform, cache/write path, report/UI path, and tests.
- Report record counts or row counts before and after transforms when commands are run.
- Check freshness, schema, coverage, provenance, and destructive overwrite risk.
- Mark any suspect data seam as degraded instead of promoting it downstream.

### review
- Inspect the changed or requested files first, then tests and callers.
- Report findings first, ordered by severity.
- Include file:line, impact, and the missing verification.
- Do not include a broad summary before findings.

### full
- Execute archive integrity check.
- Execute connective-tissue checklist.
- Grade the reviewed major sections.
- Run one broad hygiene or test gate when practical.
- Update `workspace/DEV_REVIEW.md`, `workspace/REVIEW_LEDGER.md`, and session state.

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

## Combined Actionable Engine Gate

When a repository contains separate technical, macro, fundamental, or schema-versioned engines, grade the combined actionable engine separately from its components.

Treat the combined engine as existing only when a production-reachable path:
- resolves one canonical exact asset identity such as `asset_id`, never a family or bare-symbol approximation;
- consumes live or recorded point-in-time factors through canonical stores and validated adapters;
- enforces freshness, provenance, quality, required-domain, and decision-state gates;
- emits one versioned combined contract through the actual CLI, API, or MCP research surface; and
- has tests proving same-asset composition and stale, missing, synthetic, or mismatched factor rejection.

Grade the combined engine:
- **D / nonexistent** when adapters, policies, or fixtures exist but no production composition caller exists.
- **F / dangerous** when synthetic, stale, mismatched, or unvalidated factors can produce actionable output.

Do not average strong component grades into the combined-engine grade. Treat intentionally separated schema versions as a migration seam, not duplicate engines, until the production composition path exists.

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

## Connective Tissue Sweep

Use this mode when the user asks for a full repo blast-through, every-corner sweep, string connectivity, unused stubs, missing paired stubs, dependency checks, or "connect every string" style review.

Build a connectivity matrix before reading files deeply. Prefer repo-native tools first (`rg`, package scripts, graph reports, tests), then verify suspicious paths with direct reads.

Required checks:
- **Import/export graph**: Find exported symbols, modules, CLI entries, package scripts, and route handlers with zero obvious consumers. Classify each as intentional public API, test-only, stale, incomplete, or dangerous.
- **Stub pairing**: Search for `stub`, `mock`, `fake`, `fixture`, `adapter`, `provider`, `TODO`, `throw new Error`, `NotImplemented`, `placeholder`, and no-op implementations. Verify each production stub has a matching runtime caller, config path, test or fixture, docs claim, and owner decision.
- **String wiring**: Compare command names, env vars, feature flags, provider names, event names, metric names, queue/topic names, file paths, and model artifact names across code, docs, tests, scripts, and config. Flag repeated literals that should share a source of truth only when drift risk is real.
- **Docs-to-runtime parity**: Run or source-check README/docs commands against package scripts, CLI registries, shell scripts, and actual entrypoints. Label stale docs separately from broken code.
- **Dependency parity**: Compare declared dependencies against imports, dynamic requires, generated clients, optional provider SDKs, and nested package roots. Report missing installs, undeclared runtime imports, and likely unused dependencies separately.
- **Config/env parity**: Compare env var usage against `.env.example`, README/docs, schema validation, startup checks, and CI/test defaults. Flag secrets only by key name, never by value.
- **Test coverage seams**: For each adapter/provider/CLI/data pipeline touched, identify whether tests prove the active runtime path or only a synthetic shell.
- **Domain boundary leaks**: Verify backend, frontend, shared, infra, and workspace artifacts communicate through explicit APIs or documented shared packages, not hidden relative imports or copied constants.

Orphan classification:
- **Intentional**: Public API, generated artifact, external plugin hook, or documented future extension with a real owner.
- **Stale**: No consumer, no current docs contract, and no clear future owner.
- **Incomplete**: Has docs/tests/config naming but lacks one or more runtime links.
- **Dangerous**: Can be called in production but fails silently, no-ops, uses synthetic data as real data, or bypasses validation/security.

Do not delete broad orphan sets during the audit unless the user explicitly asks for cleanup. Record high-confidence stale or dangerous items in `workspace/DEV_REVIEW.md` with the evidence and the verification gate that would close them.

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
8. When the user asks for a full repo sweep or stub/string connectivity, execute the Connective Tissue Sweep and report the orphan matrix before section grades.
9. For data and ML paths, check data preservation. Destructive overwrite logic, missing provenance, missing freshness checks, or a transformation without visible sample evidence belongs in the dev-review ledger.
10. Capture findings, open questions, and next ideas in the repo memory files.
11. Include a granular LOC breakdown when the session is a major audit or when the user asks for a deep blast-through.
12. If the user asks for a code review, use findings-first output.
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
- connective-tissue/orphan matrix when requested, with each item classified as intentional, stale, incomplete, or dangerous
- section cleanliness grades second
- verification evidence used
- data-flow evidence when tests or pipelines are involved
- the next cleanup move on the critical path
