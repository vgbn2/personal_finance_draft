---
name: technical-debt-ledger
description: Technical debt tracking skill for logging temporary workarounds, cleanup ownership, and expiry conditions before debt becomes permanent.
---

# Technical Debt Ledger

Use this skill when a change introduces a workaround, shortcut, or deferred cleanup.

## Rule

If the work is temporary, write down the expiration condition.

## Ledger Entry

Each debt item should include:

- what was deferred
- why it was deferred
- where the debt lives
- what breaks if it is ignored
- the condition that retires it
- who owns the cleanup

## Prevention

- add the regression test now
- update the doc now
- name the temporary path now
- avoid silent workarounds

## Review Rule

If a fix creates future cleanup, the cleanup must be visible in the repo memory or a durable doc.

Codex and Gemini must follow the same standard.
