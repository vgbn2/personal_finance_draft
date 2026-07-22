---
name: mass-implement
description: Execute broad repository improvement passes that fill known gaps, improve blast-through grades, and convert audit findings into verified implementation batches. Use when the user asks to mass implement, fill gaps, improve grades, blast through with fixes, or continue a large implementation cleanup across multiple repo sections.
---

# Mass Implement

Use this skill when the user wants forward motion across many gaps, not a single narrow fix.

## Operating Rule

Start from evidence, then implement in ranked batches. Do not turn a broad request into random edits. Each batch must improve at least one known grade factor: path clarity, duplication/drift, verification, artifact hygiene, or doc alignment.

When the user asks for planning, produce an objective implementation plan before editing. The plan must say what will be done, why it is ranked there, and the concrete source for that claim.

## Workflow

1. Load current repo truth first:
   - `PROJECT_RULES.md`
   - latest tail of `workspace/STATE.md`
   - latest relevant section of `workspace/DEV_REVIEW.md`
   - `README.md` or the nearest task-specific doc when behavior or deployment intent matters
2. Read any current blast-through findings.
3. If the user is asking for planning or score improvement strategy, switch into Planning Mode before editing anything.
4. Build a short ranked backlog:
   - trust-breaking failures first
   - stale contract/test drift second
   - small hygiene fixes third
   - design-heavy stubs only when the required behavior is already clear
5. Split work into batches with disjoint file ownership.
6. Use subagents only for bounded side tasks when the user allows delegation; keep the main thread on the critical path.
7. Before edits, name the batch and the files it will touch.
8. Implement conservatively using existing repo patterns.
9. Verify with the narrowest commands that prove the changed behavior, then one broader gate when practical.
10. Append a correction note to `workspace/STATE.md` when a grade-relevant fact changes.

## Planning Mode

Use this mode when the user asks to "plan", "raise the score", "improve grades", "tell me what you're going to do", or wants an objective implementation order.

The output must be evidence-backed, not aspirational. For each planned batch include:

- `objective`: the concrete grade-lifting outcome
- `why now`: the specific risk, regression, or trust gap it closes
- `source`: exact file and note that justified the batch, such as `workspace/DEV_REVIEW.md`, `workspace/STATE.md`, `README.md`, `PROJECT_RULES.md`, or a direct code/test contract
- `expected score movement`: which grade factor should improve (`verification`, `contract truth`, `runtime safety`, `artifact hygiene`, `doc alignment`)
- `verification`: the command or probe that will prove the batch is complete

Rank planning batches using this order:

1. Proven production-contract mismatches
2. Resource exhaustion or data-loss risks
3. False health or monitoring signals
4. Deployment/profile traps that look healthy while doing nothing
5. Low-cost hygiene items that remove misleading repo state

If a score claim is not tied to a source, do not include it in the plan.

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

If the run stopped in Planning Mode without edits, end with:

- ranked batches
- source for each batch
- expected grade movement
- first verification gate to run after implementation starts

Do not mark the broader objective complete unless every named requirement is verified against current state.
