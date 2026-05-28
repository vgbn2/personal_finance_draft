---
name: repo-global-protocol
description: "Canonical first-read skill for working in this repository. Use at the start of non-trivial work in this repo, especially coding, audits, refactors, test design, docs sync, or cleanup passes. It captures durable repo-wide rules: where current truth lives, how blast-through audits must report grades, how append-only workspace notes should be corrected, and which findings belong in long-lived skill memory versus volatile session notes."
---

# Repo Global Protocol

## Purpose

Use this skill as the repo's durable operating memory.

Read it before broad implementation, audits, refactors, or docs changes so you do not rely on stale docs, scattered notes, or one-off session assumptions.

## Read Order

For non-trivial work in this repo:
1. Read `AGENTS.md`.
2. Read this skill.
3. Read the tail of `workspace/STATE.md`.
4. Read only the specific workspace or code files needed for the task.

Prefer focused reads over broad repo sweeps.

## Durable Repo Truths

- `workspace/STATE.md` is the current phase/status anchor when root docs or UI messaging drift.
- `workspace/STATE.md`, `workspace/SESSION_MEMORY.md`, and `workspace/HANDOFF.md` are append-only. If an older entry is stale, append a correction rather than rewriting history.
- For this repo, `blast through` defaults to the audit style centered on structure, gaps, bridge nodes, stale docs, and validation drift.
- Every blast-through pass must report the strongest gaps first, then a folder or section cleanliness grade summary.
- Cleanliness grades must use `A` through `F` and judge path clarity, duplication or drift, verification quality, artifact hygiene, and doc alignment.
- Integration or pipeline tests should use real data or recorded fixtures. Synthetic helpers are acceptable only for narrow unit logic, not as the main evidence for end-to-end trust.
- Integration and pipeline test output should show the actual data flow: input source, major transforms, record counts, output artifacts, and the invariant that explains the pass.
- Codex and Gemini must follow the same verification standard when writing or reviewing tests.
- Treat generated Gemini artifacts as project-local state, not as canonical architecture truth by themselves.

## Current Stable Cleanup Priorities

These are durable enough to matter across sessions until explicitly superseded:
1. `scripts/` is the highest-priority cleanup zone because active paths, test layout, and provider routing still drift.
2. `docs/`, `web/`, and `web_page/` need alignment with the repo's actual active state.
3. `workspace/` audit memory is useful but must be freshness-corrected when old conclusions become false.

If these stop being true, update this skill.

## What Belongs Here

Keep this skill focused on durable repo-wide guidance:
- stable workflow rules
- recurring repo-specific guardrails
- lasting cleanup priorities
- reporting expectations that future agents should inherit immediately

Do not store here:
- one-off bug discoveries
- temporary branch state
- line-specific findings that will age quickly
- session chatter or transient experiments

Those belong in `workspace/STATE.md`, `workspace/HANDOFF.md`, `workspace/SESSION_MEMORY.md`, or `workspace/ARCHITECTURAL_DEBT.md`.

## Update Rule

Refine this skill only when a lesson is likely to help future agents across multiple sessions.

When updating it:
1. Keep the wording concise.
2. Prefer durable rules over incident reports.
3. Append workspace notes first if the discovery is fresh, then promote it here only if it proves persistent.
4. If a prior rule becomes false, update the skill and append a correction note in workspace history.

## Output Expectation

When this skill materially affects the task, say so briefly and follow it.

