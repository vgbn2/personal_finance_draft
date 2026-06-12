# Sovereign Build Guide

This directory is a book scaffold for writing a from-scratch implementation guide for the repository.

It is intentionally isolated from `docs/README.md` so normal repo boot flows and casual documentation reads do not pull it into context unless someone asks for it directly.

## Audience

- Reader profile: one person rebuilding the project from zero.
- Assumption: no prior JavaScript, C++, or Rust experience.
- Goal: explain what to build, why it exists, how to verify it, and what to skip until later.

## Structure Rules

- One directory per chapter: `chapter_00`, `chapter_01`, and so on.
- One main chapter file per chapter: `chapter_xx/README.md`.
- Target chapter size: 250 to 350 lines.
- Hard limit: 400 lines per chapter file.
- If a chapter grows too large, split it into `part_01.md` and `part_02.md` inside the same chapter directory.
- Use short sections and explicit checkpoints.

## Writing Rules

- Start each chapter with plain English before code.
- Include language proficiency requirements in every chapter.
- Include library and tool requirements in every chapter.
- Show a minimum working slice before production-grade behavior.
- Include one runnable command in every chapter.
- Include expected output in every chapter.
- Include a "Do Not Build Yet" section in every chapter.
- Include a file tree snapshot in every chapter.
- Treat `workspace/STATE.md` as status truth if current-state claims conflict.
- Treat `docs/engineering/codebase_org.md` as the canonical path map.

## Global Files

- `CHECKLIST.md`: book-level authoring tracker.
- `glossary.md`: beginner-friendly definitions.
- `commands.md`: command cookbook.
- `troubleshooting.md`: common failure modes and fixes.
- `build_order.md`: staged build order and safe-skip guidance.

## Reader Modes

### Zero-Experience Path

Read in order from `chapter_00` through `chapter_23`.

### Developer Fast Path

Start with:

1. `build_order.md`
2. `chapter_06`
3. `chapter_07`
4. `chapter_08`
5. the runtime chapter you actually need

## Chapter Map

1. `chapter_00`: How To Use This Book
2. `chapter_01`: Programming Foundations
3. `chapter_02`: Terminal, Git, And Project Tools
4. `chapter_03`: JavaScript And Node Crash Course
5. `chapter_04`: C++ Crash Course For The Core Engine
6. `chapter_05`: Rust Awareness And Optional Mirror
7. `chapter_06`: Product Scope And Safety Rules
8. `chapter_07`: Architecture Blueprint
9. `chapter_08`: Repository Scaffold
10. `chapter_09`: Configuration System
11. `chapter_10`: Data Ingestion Layer
12. `chapter_11`: Storage And Cache Design
13. `chapter_12`: Market And Provider Layer
14. `chapter_13`: C++ Core Engine
15. `chapter_14`: CLI Foundation
16. `chapter_15`: TUI Surface
17. `chapter_16`: Execution Gateway
18. `chapter_17`: Strategy And Backtesting
19. `chapter_18`: ML And ONNX Pipeline
20. `chapter_19`: API And Dashboard
21. `chapter_20`: Testing And Validation
22. `chapter_21`: Deployment And Operations
23. `chapter_22`: Agent Workflow And Handoff
24. `chapter_23`: Roadmap From Zero To Production

## Standard Chapter Template

Every chapter should contain these sections:

1. Goal
2. What You Are Building
3. Prerequisite Concepts
4. Language Proficiency Required
5. Library And Tool Requirements
6. Beginner Translation Box
7. Files And Folders To Create
8. Minimum Working Slice
9. Step-By-Step Build
10. Contracts And Interfaces
11. Tests And Verification
12. Expected File Tree
13. Common Failure Modes
14. Do Not Build Yet
15. Checkpoint Exercise
16. Done Criteria

## Exit Criteria

This book scaffold is complete when:

- every chapter directory exists
- every chapter has a scoped authoring checklist
- every chapter declares language and library requirements
- the full guide can be written without any chapter exceeding the line cap
