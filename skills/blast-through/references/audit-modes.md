# Audit Mode Checklists

## Triage

- Read the latest relevant state, developer-review, and review-ledger sections.
- Search the user-provided symptom, command, file, or domain.
- Verify at most three high-risk candidates.
- Return confirmed findings, dismissed candidates, and the next narrow check.

## Section Grade

- Inspect active production entrypoints, tests, docs, and config for each named section.
- Score path clarity, duplication/drift, verification, artifact hygiene, doc alignment, and domain boundaries.
- Use A for coherent/verified, B for contained debt, C for material drift, D for unclear or untrusted ownership, and F for broken/unsafe foundations.
- Grade only sections actually checked and update the review ledger.

## Data Integrity

- Trace source, adapter, validation, storage/cache, transform, decision/report, UI, and tests.
- Report row/record counts, freshness, schema, coverage, provenance, point-in-time correctness, and overwrite risk.
- Calculate `DCS = 0.3*Freshness + 0.4*Schema + 0.3*Coverage` only from current evidence.
- Mark suspect seams degraded and block downstream promotion.

## Maintainability

- Read governing rules, the complete target, direct callers, tests, docs, and relevant legacy constraints.
- Map the touched behavior to one canonical owner and its operator entrypoint.
- Compare sibling modules for naming, error, async, validation, configuration, and dependency conventions.
- Find duplicated policy, mixed responsibilities, generic utility dumping grounds, speculative abstractions,
  deep control flow, misleading names, stale comments, and docs that overstate current behavior.
- Use size only as a review signal: inspect changed functions above 60 lines, nesting deeper than three levels,
  files above 300 lines, and especially files above 500 or 1,000 lines. Do not split cohesive legacy code
  mechanically.
- Trace one incident path from symptom to owner, logs/health, safe shutdown, recovery, and verification.
- Classify each candidate as readability debt, ownership debt, behavioral defect, intentional compatibility,
  legacy constraint, or dismissed false positive.
- Route behavior-preserving cleanup to `refactor-readability`; route behavior changes through `codex` or
  `mass-implement`.

## Review

- Read changed/requested files, then callers and tests.
- Report findings first in severity order with file:line, impact, and missing verification.
- Do not lead with a broad summary or section grades.

## Full

- Check workspace archive chronology and clean committed/archive truth.
- Run the connective-tissue checklist and inspect the mandatory critical path.
- Grade only reviewed major sections.
- Run one broad hygiene/test gate when practical.
- Update review ledgers and report DCS only when canonical data is actually reviewed.

## Reading Modes

- Hard: use for a first pass or stale state; establish current production ownership before conclusions.
- Fast: reuse current verified context and inspect unresolved surfaces only.

If `HEAD` is a merge commit or the dirty tree repairs load-bearing files, use a temporary `git archive HEAD` proof before calling the source clean-clone reproducible.
