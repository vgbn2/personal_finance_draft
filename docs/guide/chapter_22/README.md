# Chapter 22 - Agent Workflow And Handoff

## Goal

This chapter explains how repo state, handoff files, and review queues keep multi-session work coherent.

In a long-running repository, code is not the only thing that needs structure. Operational memory also needs structure, or future sessions waste time reconstructing old decisions.

## What You Are Building

You are building a continuity workflow that can:

- record current repo state
- record active carryovers
- record unresolved review items
- let a later human or agent resume with less confusion

## Prerequisite Concepts

You should already understand:

- canonical docs vs workspace truth
- source vs generated ownership
- why hidden state hurts debugging

## Language Proficiency Required

- JavaScript/Node.js: none
- Repo workflow awareness: beginner

## Library And Tool Requirements

- text editor
- Git

## Beginner Translation Box

- `handoff`: a durable note about what the next session should know
- `review queue`: a list of issues or decisions that are not resolved yet
- `truth hierarchy`: the order of files you trust when docs or notes disagree

## Why Session State Needs A Home

Without a home for session state:

- architecture notes drift
- active blockers disappear
- future work repeats old investigations

The `workspace/` area exists to keep that operational memory distinct from the product runtime.

## Core Workspace Truth Files

The most important continuity files include:

- `workspace/STATE.md`
- `workspace/HANDOFF.md`
- `workspace/DEV_REVIEW.md`
- `workspace/SESSION_MEMORY.md`
- `workspace/PROMPT_LOG.md`

They do not all serve the same purpose.

## A Practical Truth Hierarchy

For current state and structure reasoning, use this order:

1. `workspace/STATE.md` for current status
2. `docs/engineering/codebase_org.md` for path ownership
3. `workspace/HANDOFF.md` for carryover and resume context
4. `workspace/DEV_REVIEW.md` for active issues and review findings

That order helps when multiple notes exist and not all of them are equally current.

## What Should Not Become Canonical Truth

Avoid treating these as canonical architecture truth:

- transient prompt chatter
- generated reports without an owning source
- stale archived notes
- one agent's private assumption

The goal is durable operational memory, not a second uncontrolled documentation tree.

## Minimum Working Slice

The minimum slice for this chapter:

- update one current-state note
- update one handoff note
- record one unresolved review item

That already proves the session has a continuity discipline.

## Step-By-Step Build

1. Record the current active status in `workspace/STATE.md`.
2. Record what the next session should do in `workspace/HANDOFF.md`.
3. Put unresolved risks or findings in `workspace/DEV_REVIEW.md`.
4. Avoid duplicating the same information in three places unless each file has a different purpose.

## Contracts And Interfaces

The workspace continuity layer should guarantee:

- future readers can tell where to start
- current status is easy to find
- unresolved review items do not get buried in chat
- archives stay separate from active truth

This is the documentation equivalent of a clean module boundary.

## Tests And Verification

Inspect the core workspace files:

```powershell
Get-ChildItem workspace
Get-Content workspace\STATE.md -TotalCount 20
Get-Content workspace\HANDOFF.md -TotalCount 20
```

Expected outcome:

- the workspace root clearly contains state and continuity files
- `STATE.md` reads like current status
- `HANDOFF.md` reads like resume guidance

## Expected File Tree

```text
workspace/
  STATE.md
  HANDOFF.md
  DEV_REVIEW.md
  SESSION_MEMORY.md
  PROMPT_LOG.md
```

## Common Failure Modes

- the same note is copied everywhere
  Fix: keep each file's purpose distinct.
- future sessions read archives before current state
  Fix: keep the truth hierarchy explicit.
- review findings stay trapped in chat
  Fix: move them into `workspace/DEV_REVIEW.md`.

## Do Not Build Yet

- new workflow systems
- duplicate state files
- broad archival rewrites while active work is in flight

## Checkpoint Exercise

Write one sentence describing what belongs in `STATE.md` and one sentence describing what belongs in `HANDOFF.md`. If the two sentences are interchangeable, the boundary is still weak.

## Done Criteria

This chapter is done when you can explain:

- where a future session should start reading
- what each major workspace truth file is for
- why active review items need a durable home
- why not every note should become canonical truth
