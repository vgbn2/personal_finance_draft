---
name: mass-implement
description: Execute broad repository improvement passes that fill known gaps, improve blast-through grades, and convert audit findings into verified implementation batches. Use when the user asks to mass implement, fill gaps, improve grades, blast through with fixes, or continue a large implementation cleanup across multiple repo sections.
---

# Mass Implement

Use this skill when the user wants forward motion across many gaps, not a single narrow fix.

## Operating Rule

Start from evidence, then implement in ranked batches. Do not turn a broad request into random edits. Each batch must improve at least one known grade factor: path clarity, duplication/drift, verification, artifact hygiene, or doc alignment.

## Workflow

1. Load `repo-global-protocol` first when working in this repository.
2. Read the latest `workspace/STATE.md` tail and any current blast-through findings.
3. Build a short ranked backlog:
   - trust-breaking failures first
   - stale contract/test drift second
   - small hygiene fixes third
   - design-heavy stubs only when the required behavior is already clear
4. Split work into batches with disjoint file ownership.
5. Use subagents only for bounded side tasks when the user allows delegation; keep the main thread on the critical path.
6. Before edits, name the batch and the files it will touch.
7. Implement conservatively using existing repo patterns.
8. Verify with the narrowest commands that prove the changed behavior, then one broader gate when practical.
9. Append a correction note to `workspace/STATE.md` when a grade-relevant fact changes.

## Batch Selection

Prefer fixes that make current claims true:

- failing tests over missing features
- stale docs/contracts over decorative implementation
- real data normalization over synthetic demos
- source-tree hygiene over adding more scaffold
- minimal complete modules over half-filled architecture stubs

Avoid broad deletion unless the user explicitly approves cleanup of generated artifacts.

## Verification Standard

Report evidence, not vibes:

- command run
- input source or fixture
- record or row counts when data is involved
- failing assertion fixed or invariant proven
- output path or artifact touched

If a gate cannot run locally, state the blocker and use a source-level or direct compiler fallback only when it genuinely covers the changed files.

## Closeout

End with:

- grade movement achieved
- files changed
- commands run and result
- remaining highest-impact gap

Do not mark the broader objective complete unless every named requirement is verified against current state.
