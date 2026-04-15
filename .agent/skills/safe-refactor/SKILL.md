---
name: Safe Refactor Protocol
description: Enforces backup of the entire project before beginning any major refactor (e.g., duplicate folder, or commit to git).
---

# Safe Refactor Protocol

## Core Principle

> **"Never perform a destructive or architectural refactor without an instantaneous fallback backup."**
> 
> Before starting *any* refactoring task that moves files, changes architectural patterns, or rewrites significant blocks of code, you MUST create a point-in-time backup of the repository.

## Backup Methods

Whenever the user requests a refactor, you must choose one of the following methods to back up the repository *before* making any structural modifications:

1. **Git Snapshot & Push (Preferred)**
   - Check the git status (`git status`).
   - Commit any existing work with a descriptive safety message.
   - Run `git branch backup/pre-refactor-<date>` or push directly to the remote repository (GitHub) to act as an unassailable restore point.

2. **Project Duplication (Physical Copy)**
   - If the user explicitly asks to copy the code folder, or if git isn't sufficient, duplicate the entire project folder to a safe parallel directory (e.g., `../hyperglycemia-faint-predictor-backup-<timestamp>`).
   - Use standard command line utilities (e.g. `Copy-Item -Recurse` in PowerShell or `cp -r` in bash) to perform the duplication.

## Trigger Conditions

This skill triggers automatically when the user uses keywords in their prompt such as:
- "refactor"
- "reorganize"
- "restructure"
- "clean up the codebase"
- "purge"

## Validation
Always verify the backup actually exists (by checking `git log`, `git branch`, or verifying the new copied folder's presence) BEFORE executing the first step of any refactoring plan that modifies the existing files.
