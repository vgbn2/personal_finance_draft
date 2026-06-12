# Chapter 02 - Terminal, Git, And Project Tools

## Goal

This chapter teaches the tooling habits you need to work in the repo without damaging your understanding of state.

In this project, confusion often comes from tooling, not code. If you do not know where you are, what changed, or which tool produced a file, later chapters become unreliable.

## What You Are Building

You are building operational discipline:

- navigate the terminal
- inspect the repo safely
- tell source files from generated files
- use Git to inspect changes
- understand the role of Node, npm, CMake, and Docker

## Prerequisite Concepts

From Chapter 01 you should already know:

- files
- folders
- config
- source code

## Language Proficiency Required

- JavaScript/Node.js: none
- C++: none
- Rust: none
- PowerShell: beginner
- Git: beginner

## Library And Tool Requirements

- Git
- Node.js
- npm
- CMake
- Docker Desktop

## Beginner Translation Box

- `repo root`: the top-level project folder
- `working tree`: your current local files in Git
- `tracked file`: a file Git already knows about
- `untracked file`: a file Git sees but is not yet tracking
- `generated file`: a file created by a build, test, or runtime process

## PowerShell Basics

These are enough to start:

```powershell
Get-Location
Get-ChildItem
Get-ChildItem docs
```

What they do:

- `Get-Location` shows where you are
- `Get-ChildItem` lists files and folders
- `Get-ChildItem docs` lists one specific folder

Always know where you are before assuming a path is wrong.

## Git Basics That Matter Here

Use these first:

```powershell
git branch --show-current
git status --short -- .
git diff -- docs\guide
```

What they tell you:

- which branch you are on
- what changed in the current repo
- what changed in one path you care about

This guide assumes you inspect before editing.

## Toolchain Overview

### Node.js

Runs JavaScript code used by the CLI, scripts, and server layers.

### npm

Installs JavaScript packages and runs package scripts.

### CMake

Configures and builds the native C++ core.

### Docker

Packages the system into containers for deployment or reproducible local runs.

You do not need to master all four at once. You need to know which layer each one belongs to.

## Generated vs Hand-Written Outputs

This repo has both source and generated paths.

Examples of hand-written source:

- `backend/`
- `shared/`
- `config/`
- `docs/`

Examples of generated or runtime outputs:

- `build/`
- `dist/`
- `node_modules/`
- `storage/data/cache/`
- `graphify-out/`

If you edit generated output as if it were source, the next build may erase or replace your work.

## Minimum Working Slice

Run these commands from the repo root:

```powershell
Get-Location
git branch --show-current
git status --short -- .
```

Then answer:

- Which branch am I on?
- Are there modified files?
- Are there untracked files?

## Step-By-Step Build

1. Open PowerShell in the repo root.
2. Run `Get-Location`.
3. Run `Get-ChildItem`.
4. Run `git branch --show-current`.
5. Run `git status --short -- .`.
6. Pick one modified file and inspect it with `git diff -- <path>`.

This chapter is about observation, not creation.

## Contracts And Interfaces

Your tooling has contracts too:

- `git status` reports the working tree state
- `node --version` reports the installed Node version
- `cmake --version` reports whether native tooling exists
- `docker --version` reports whether container tooling exists

If a tool command fails, do not continue as if the tool is healthy.

## Tests And Verification

Run:

```powershell
node --version
npm --version
cmake --version
git status --short -- .
```

Expected outcome:

- each version command prints a version
- Git prints the current working tree state

If `docker --version` fails, that does not block the early chapters. If `node --version` fails, many later chapters are blocked.

## Expected File Tree

This chapter does not create files. It depends on understanding the existing repo layout instead.

## Common Failure Modes

- You run commands from the wrong folder.
  Fix: start with `Get-Location`.
- You assume untracked means broken.
  Fix: untracked only means Git is not tracking the file yet.
- You treat `node_modules/` or `build/` as source.
  Fix: compare against `docs/engineering/codebase_org.md`.

## Do Not Build Yet

- deployment pipelines
- automated release workflows
- branch cleanup strategies
- anything that requires destructive Git commands

## Checkpoint Exercise

Run `git status --short -- .` and classify three files or paths as:

- source
- config
- generated

If you cannot do that confidently, stop before Chapter 03.

## Done Criteria

This chapter is done when you can:

- identify the repo root
- inspect the working tree
- explain the role of Node, npm, CMake, and Docker
- distinguish likely source paths from generated paths
