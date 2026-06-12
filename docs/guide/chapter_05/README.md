# Chapter 05 - Rust Awareness And Optional Mirror

## Goal

This chapter exists to lower pressure, not add more. If you saw Rust-related files, names, or discussions around the project, you should know what they mean and why they are not part of the first build path.

## What You Are Building

You are building scope discipline:

- what belongs in the first implementation path
- what can wait
- how to recognize optional experimentation without treating it as a blocker

## Prerequisite Concepts

You should already understand:

- source vs generated output
- multiple languages can exist in one repo
- not every subsystem is required for the first useful version

## Language Proficiency Required

- JavaScript/Node.js: none
- C++: none
- Rust: none

## Library And Tool Requirements

- none for the beginner path
- optional Rust toolchain only for later experiments

## Beginner Translation Box

- `optional mirror`: a parallel implementation idea, not part of the first required build
- `toolchain`: the compiler and supporting tools for a language
- `blocker`: something that truly prevents the next step

## Why This Chapter Exists

When a repo mentions several languages, beginners often make one of two mistakes:

- they panic and think they must learn all of them immediately
- they ignore the extra language entirely and later misunderstand a design choice

This chapter avoids both mistakes.

Rust may matter in future expansion, performance experiments, or alternate runtime ideas. It does not define the base path of this guide.

## What To Assume For The Base Build

For the first end-to-end version, assume:

- JavaScript handles orchestration, CLI, and most integration work
- C++ handles the native core where needed
- Rust is not required to reach a useful prototype

That is the working assumption for this book unless a later chapter says otherwise.

## When Rust Might Matter Later

Rust may become relevant if:

- a subsystem is intentionally mirrored or reimplemented
- a deployment or runtime strategy is changed
- a future architecture choice prefers Rust for a specific boundary

Those are later decisions, not prerequisites.

## Minimum Working Slice

The minimum slice is conceptual:

- identify whether the current feature path depends on Rust
- if it does not, do not let Rust block your progress

This chapter is successful if it removes false dependencies from your mental model.

## Step-By-Step Build

This chapter has no build command. Instead:

1. Inspect the repo structure.
2. Identify the current base path of the guide: JavaScript plus C++.
3. Mark Rust-related work as optional unless a later chapter explicitly promotes it.

## Contracts And Interfaces

The most important interface here is conceptual:

- the base implementation path must be teachable without Rust
- optional runtime ideas must not be confused with required architecture

If a future author adds Rust-heavy content, they should label it as optional until the repo truth says otherwise.

## Tests And Verification

Verification for this chapter is a reasoning check:

- can you state the main implementation path without mentioning Rust?
- can you explain when Rust might become relevant later?

If yes, the chapter worked.

Run a simple repo inspection command while holding that boundary in mind:

```powershell
Get-ChildItem
```

Expected outcome:

- you can inspect the repo without needing any Rust toolchain
- you can identify the current beginner-critical path as JavaScript plus C++

## Expected File Tree

No new files are required for this chapter.

## Common Failure Modes

- reader assumes more languages means better architecture
  Fix: more languages usually means more integration cost.
- reader treats optional exploration as required scope
  Fix: return to `build_order.md` and the chapter roadmap.
- reader skips the chapter and later stalls on optional tooling
  Fix: use this chapter as a scope filter.

## Do Not Build Yet

- Rust ports
- Rust-specific tooling
- cross-language parity projects
- premature rewrites

## Checkpoint Exercise

Write a one-sentence summary:

`The first useful version of this project can be built with ______ and ______, while ______ can wait.`

If you can fill that sentence correctly, the chapter succeeded.

## Done Criteria

This chapter is done when you can explain:

- Rust is not part of the beginner-critical path
- why optional subsystems should not block early implementation
- how to defer advanced work without losing the roadmap
