---
name: blast-through
description: Run evidence-first repository audits, code reviews, section grading, connectivity sweeps, data-integrity reviews, and full system assessments in personal_finance_draft. Use for broad or focused review, gap finding, dependency/path/string wiring, stub or orphan detection, data trust, architecture completeness, or repository cleanliness grading; do not use it to implement fixes.
---

# Blast Through

Audit only. Report findings and route approved fixes to `codex` or `mass-implement`.

## Select One Audit Mode

- `triage`: top confirmed risks for a small or underspecified surface.
- `section-grade`: cleanliness grades for explicitly reviewed sections.
- `connective-tissue`: imports, dependencies, commands, config, env, docs, stubs, and orphan wiring.
- `data-integrity`: source-to-output lineage, freshness, schema, provenance, replay, and DCS.
- `review`: findings-first code review of changed or requested files.
- `full`: archive, connectivity, grades, data trust, and system completeness; use only when explicitly requested.

State one audit mode and either Hard Reading Mode (first/stale pass) or Fast Reading Mode (current follow-up). Do not mix modes silently. Read [audit-modes.md](references/audit-modes.md) for the selected checklist.

## Core Workflow

1. Load current state, handoff, review ledger, governing docs, and the narrowest production/test surfaces.
2. Use `graphify-out` when current and available; otherwise use `rg` and direct reads.
3. Separate production, tests, docs, and scratch. Treat tests as evidence, not architecture ownership.
4. Verify every high-signal candidate directly before reporting it.
5. Classify evidence as proven, partial, unproven, or failed.
6. Record confirmed debt with impact, owner, evidence, and the gate that clears it.
7. Stop after the audit. Produce a structured implementation handoff only when fixes are desired.

For connective-tissue or full mode, read [connective-tissue.md](references/connective-tissue.md). For system-design, architecture, completeness, production-readiness, or full mode, read [system-design-review.md](references/system-design-review.md).

## Boundaries

- Grade sections only in `section-grade` or `full`; do not add grades to triage/review output.
- Calculate DCS only in `data-integrity` or `full` when canonical market-data evidence is in scope. DCS below `0.95` blocks promotion, not diagnosis.
- Do not transform data without an integrity record.
- Do not delete orphan candidates during an audit.
- Do not browse raw internet in auto-approve mode. Follow the `AGENTS.md` structured air-gap; external research requires authorized restricted delegation and structured JSON evidence.
- Use subagents or model tiering only when the user explicitly authorizes it.

## Output Contract

Report:

1. severity-ordered confirmed findings;
2. dismissed false positives;
3. mode-specific matrix or grades;
4. commands, inputs, counts, outputs, and limitations;
5. the next critical action;
6. an implementation handoff containing finding ID, evidence, severity, acceptance criteria, safety boundary, owner, and verification gate.
