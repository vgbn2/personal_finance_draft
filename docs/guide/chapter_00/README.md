# Chapter 00 - How To Use This Book

## Goal

This chapter explains how to use the guide without getting buried in details too early.

You are not expected to know JavaScript, C++, Rust, trading systems, or this repository. You are expected to read carefully, run small commands, and stop when a checkpoint says the base is not ready yet.

## What You Are Building

You are not building the platform in this chapter. You are building your working method:

- how to read each chapter
- how to run commands safely
- how to compare expected output to real output
- how to defer advanced work without losing the path

## Prerequisite Concepts

You only need these ideas:

- a folder can contain files and other folders
- a command is something you run in a terminal
- a file can be source code, config, or generated output

If those terms feel vague, continue anyway. Chapter 01 will make them concrete.

## Language Proficiency Required

- JavaScript/Node.js: none
- C++: none
- Rust: none
- PowerShell: none
- Git: none

## Library And Tool Requirements

- a text editor
- a PowerShell terminal
- Git installed
- Node.js installed later, not required for this chapter

## Beginner Translation Box

- `repo`: the project folder and everything inside it
- `chapter`: one unit of the guide, focused on a single theme
- `checkpoint`: a small proof that you understood or ran the current step correctly
- `minimum working slice`: the smallest version of a feature that proves the idea works
- `do not build yet`: a boundary that stops you from layering complexity too early

## How To Read A Chapter

Read each chapter in this order:

1. Goal
2. What You Are Building
3. Prerequisite Concepts
4. Language Proficiency Required
5. Library And Tool Requirements
6. Minimum Working Slice
7. Step-By-Step Build
8. Tests And Verification
9. Common Failure Modes
10. Do Not Build Yet

Do not jump straight to the largest code block. Read the plain-English explanation first. In this guide, code comes after the reason for the code.

## Zero-Experience Path

If you are new to programming, read every chapter in order from `chapter_00` through `chapter_23`.

If a chapter mentions a concept you do not understand:

- check [glossary.md](../glossary.md)
- read the Beginner Translation Box again
- run the minimum working slice before reading the rest

Do not treat confusion as a signal to skip ahead. In this guide, later chapters depend on earlier ones on purpose.

## Developer Fast Path

If you already know your way around code, you can move faster:

1. read [build_order.md](../build_order.md)
2. read [chapter_06](../chapter_06/README.md)
3. read [chapter_07](../chapter_07/README.md)
4. read [chapter_08](../chapter_08/README.md)
5. then jump to the subsystem you need

The fast path is only for readers who can recover from gaps on their own.

## How To Run Commands Safely

Use a terminal from the repo root.

Start with harmless inspection commands:

```powershell
Get-Location
Get-ChildItem
git status --short -- .
```

Expected result:

- `Get-Location` prints the current folder
- `Get-ChildItem` prints files and folders in the current folder
- `git status --short -- .` prints the local repo state

If a command changes files, the chapter should say so explicitly. If it does not say so, assume the command should be read-only.

## How To Compare Expected Output

Every serious chapter should give you:

- one command to run
- one expected outcome
- one failure mode to look for

Do not settle for "it probably worked." Use observable proof:

- the command exits cleanly
- a file exists where the chapter said it would exist
- JSON output has the expected keys
- a test passes

## When To Stop And Back Up

Stop and back up if:

- you do not understand what folder you are in
- you do not know whether the file you are editing is source or generated output
- the chapter's minimum working slice fails and you cannot explain why
- you skipped a prerequisite chapter and now the terms no longer make sense

When that happens, go back one chapter, not five chapters forward.

## Files This Book Uses As Repo Truth

This guide is not the only source of truth in the repository.

When current-state claims conflict, trust:

1. `workspace/STATE.md` for current status
2. `docs/engineering/codebase_org.md` for where things belong
3. subsystem-specific docs only after those two

That rule prevents the book from drifting into fiction if the repo changes.

## Minimum Working Slice

The minimum slice for this chapter is simple:

- open the guide root
- find the chapter map
- run a few safe inspection commands
- understand where repo truth lives

If you can do those four things, you are ready to continue.

## Step-By-Step Build For This Chapter

This chapter has no code build. Do these steps instead:

1. Open `docs/guide/README.md`.
2. Find the chapter list.
3. Open [glossary.md](../glossary.md).
4. Run the three safe commands shown earlier.
5. Confirm you know where the repo root is.

## Tests And Verification

Run:

```powershell
Get-Location
Get-ChildItem docs\guide
git status --short -- docs\guide
```

Expected outcome:

- you are inside the repository
- `docs\guide` exists
- Git shows guide files if they are uncommitted, or nothing if already committed later

## Expected File Tree

```text
docs/guide/
  README.md
  CHECKLIST.md
  glossary.md
  commands.md
  troubleshooting.md
  build_order.md
  chapter_00/
    README.md
```

## Common Failure Modes

- You run commands outside the repo root.
  Fix: use `Get-Location` first.
- You assume every file in `docs/` is canonical truth.
  Fix: use the truth order listed above.
- You skip the chapter because it looks non-technical.
  Fix: this chapter exists to stop later confusion.

## Do Not Build Yet

- any runtime feature
- any broker integration
- any native code
- any dashboard surface
- any deployment workflow

## Checkpoint Exercise

Answer these questions in your own words:

1. What is the difference between source code and generated output?
2. Which file is the repo's current status anchor?
3. What should you do if a minimum working slice fails?

If you cannot answer those cleanly, stay here before continuing.

## Done Criteria

This chapter is done when you can explain:

- how the book is structured
- how to verify a step
- where to look for repo truth
- when to pause instead of pushing forward blindly
