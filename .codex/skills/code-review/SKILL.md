---
name: code-review
description: Findings-first review skill for bug, regression, test-gap, and risk inspection of repo changes.
---

# Code Review

Use this skill whenever the user asks for a review or when you are validating a finished change set.

## Review Order

1. Look for correctness bugs.
2. Look for behavioral regressions.
3. Look for missing tests.
4. Look for maintainability risks that could block future work.

## Review Rules

- Lead with findings, not summaries.
- Give file references for every finding.
- Keep each finding concrete and falsifiable.
- Separate confirmed bugs from residual risk.
- Do not soften a real issue into general commentary.

## What To Check

- Build and link coverage.
- Input validation and fail-closed behavior.
- Boundary conditions and empty data paths.
- CMake or manifest wiring for new sources.
- Test coverage for new contracts or routing rules.
- Consistency between docs, config, and code.

## Output Shape

- Findings first, ordered by severity.
- Open questions or assumptions second.
- Short change summary last.

## When No Issues Are Found

- Say that explicitly.
- Mention any remaining test gaps or risk surfaces.

