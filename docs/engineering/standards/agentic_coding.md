# Agentic Coding

This page is the human-facing summary of the repo's agentic coding standard.

## What Matters

- Tests should show why they passed, not just that they passed.
- Subagents should have disjoint ownership and concrete deliverables.
- Temporary workarounds should be logged with an explicit cleanup condition.
- Work is not done until code, tests, docs, and evidence agree.
- Codex and Gemini should follow the same verification standard.
- Human review is still required; the evidence just makes it easier to review well.

## Practical Defaults

- Use real data or recorded fixtures for integration and regression coverage.
- Keep subagent counts small unless the task is naturally parallel.
- Add the regression test now if a change creates a new failure mode.
- Keep the workflow lightweight when the task is simple; do not force process where it adds no value.

## Good Evidence

- input source or fixture
- key transforms
- record counts or row counts
- rejected or skipped records
- output artifact path
- sample result
- invariant that explains the pass

## Good Debt Hygiene

- what was deferred
- why it was deferred
- where it lives
- what breaks if ignored
- what retires it
- who owns cleanup
