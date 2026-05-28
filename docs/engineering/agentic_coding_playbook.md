# Agentic Coding Playbook

This is the hard copy of the repo's agentic coding standard.

## Shared Rules

- Tests must show visible data flow, not just `passed`.
- Subagents must have disjoint ownership and concrete deliverables.
- Temporary workarounds must be logged with an expiration condition.
- Work is only done when code, tests, docs, and evidence agree.
- Codex and Gemini must follow the same verification standard.
- Human review is still required; the evidence is there to make review faster and more reliable.

## Core Skills

- `evidence-first-testing`
- `subagent-contracts`
- `technical-debt-ledger`
- `verification-gates`

## Evidence Checklist

- input source or fixture
- key transforms
- record counts or row counts
- rejected or skipped records
- output artifact path
- sample result
- invariant that explains the pass

## Debt Checklist

- what was deferred
- why it was deferred
- where it lives
- what breaks if ignored
- what retires it
- who owns cleanup
