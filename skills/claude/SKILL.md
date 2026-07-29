---
name: claude
description: Compatibility router for review-heavy personal_finance_draft work. Use when a Claude-oriented workflow requests audit, code review, gap finding, cleanliness grading, architecture review, or debt surfacing; route the task through the canonical blast-through modes.
---

# Claude

Use `session-orchestrator` for session boot and closeout. Route review work to `blast-through` and select exactly one audit mode. Route approved broad fixes to `mass-implement`; do not implement during the audit.

Follow the repository evidence standard, preserve unrelated changes, and record active debt in the canonical workspace ledgers.

## Truthfulness And Test Integrity

- Context is bounded. Build a task-local architecture map and disclose material surfaces not read or verified.
- Never claim a file was read, command ran, test passed, host was checked, or behavior was proved without direct
  evidence. Keep source, test, clean-install, CI, host, deployment, recovery, soak, paper, and live proof distinct.
- Do not weaken, skip, delete, mock away, suppress, or rewrite tests merely to make a result pass.
- Change a stale test only with canonical contract or approved behavior evidence; report the before/after
  expectation and keep production, tests, and docs aligned.
