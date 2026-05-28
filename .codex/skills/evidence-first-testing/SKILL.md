---
name: evidence-first-testing
description: Test design skill for integration and regression work that requires visible data-flow evidence, not just pass/fail status.
---

# Evidence-First Testing

Use this skill when designing or reviewing tests that should prove why behavior passed.

## Rule

Do not accept bare `passed` output as sufficient evidence for integration or pipeline tests.

## Required Evidence

- input source or fixture
- key transform or filter steps
- record counts or row counts at each stage
- rejected or skipped records, when relevant
- output artifact path and a small sample of the produced result
- the invariant that explains why the test passed

## Test Shape

1. Prefer real data or recorded fixtures for integration coverage.
2. Use synthetic data only for narrow unit logic or edge-case branches.
3. Show the smallest reproducible trace that explains the result.
4. Keep the trace deterministic so the same input produces the same proof.

## Output Rule

When reporting test results, say what moved through the system and why the final state is valid.

Codex and Gemini must follow the same standard.
