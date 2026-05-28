---
name: verification-gates
description: Verification skill for defining done-criteria using empirical checks, trace evidence, and aligned docs before work is considered complete.
---

# Verification Gates

Use this skill when deciding whether work is done.

## Gate Set

1. Code behavior matches the request.
2. Tests prove the behavior.
3. Evidence shows the data flow or execution path.
4. Docs and status files match the code.
5. Known debt is explicitly named.
6. Human review still happens; the evidence supports it, not replaces it.

## Do Not Mark Done If

- only a happy-path test exists
- the output does not explain why it passed
- the doc state is stale
- the workaround is hidden
- the verification depends on trust instead of evidence
- no human reviewer has had a chance to inspect the result when review is required

## Completion Rule

Treat work as provisional until the empirical proof is visible.

Codex and Gemini must follow the same standard.
