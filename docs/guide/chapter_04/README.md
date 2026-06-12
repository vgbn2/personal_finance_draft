# Chapter 04 - C++ Crash Course For The Core Engine

## Goal

This chapter explains why the repository has a native C++ core and how a beginner should think about it.

You are not trying to master C++ here. You are trying to understand what the native layer is for, how it is built, and how to approach it without overcomplicating the early system.

## What You Are Building

You are building a minimal mental and technical model for the native layer:

- what headers and source files do
- what CMake does
- what a native target is
- how JavaScript can call native code indirectly

## Prerequisite Concepts

You should already understand:

- files and folders
- CLI commands
- source code vs generated outputs
- simple JSON-shaped thinking

## Language Proficiency Required

- JavaScript/Node.js: beginner
- C++: none to beginner
- Rust: none
- PowerShell: beginner

## Library And Tool Requirements

- CMake
- a supported C++ compiler
- the repo's `backend/core/` layout

## Beginner Translation Box

- `header file`: a file that declares functions, classes, or types
- `source file`: a file that defines how those declarations work
- `target`: something the build system produces, such as an executable
- `build directory`: the generated folder CMake uses for compiled outputs

## Why This Repo Has C++

The project uses JavaScript for flexibility and integration, but some workloads benefit from native code:

- numerical work
- high-volume historical processing
- model inference integration
- tighter control over compute-heavy routines

That does not mean every feature belongs in C++. It means the repo has a split:

- orchestration and glue in JavaScript
- selected compute in C++

## Header And Source Files

A common pattern:

```text
backend/core/src/sample.hpp
backend/core/src/sample.cpp
```

Think of it this way:

- `.hpp` says what exists
- `.cpp` says how it works

That is a simplification, but it is enough to start.

## What CMake Does

CMake is the build system description layer.

It does not compile the code by itself. It generates the build configuration that tells a compiler how to compile the code.

Typical flow:

```powershell
cmake -S backend\core -B backend\core\build
cmake --build backend\core\build --config Release
```

The first command configures.
The second command builds.

## Native Outputs Are Generated Artifacts

Everything inside `backend/core/build/` should be treated as generated output, not hand-written source.

That matters because:

- builds can overwrite it
- builds can differ by machine
- Git usually should not treat it as source

## Minimum Working Slice

The minimum slice for understanding this layer is not a large engine. It is one tiny executable target that prints a small structured message.

Conceptually:

- source file contains `main`
- build target produces an executable
- executable prints a result

Even if you do not implement this from scratch yet, that is the right first shape.

## Step-By-Step Build

1. Find the native source root under `backend/core/`.
2. Identify the CMake entry file.
3. Configure the build directory with CMake.
4. Build one target.
5. Run that target and observe its output.

If one of those steps fails, fix the toolchain first. Do not continue pretending the native layer is healthy.

## Contracts And Interfaces

The native layer should expose a clean contract to the rest of the system:

- input comes from arguments, files, or structured data
- output returns structured text or machine-readable payloads
- JavaScript should not need to know the internal implementation details

This matters because the native layer is not the whole application. It is a subsystem.

## Tests And Verification

Run:

```powershell
cmake -S backend\core -B backend\core\build
cmake --build backend\core\build --config Release
```

Expected outcome:

- CMake configures without missing-tool errors
- the build completes
- generated outputs appear under `backend/core/build/`

If configuration fails because the compiler is missing, that is a toolchain problem, not a code problem.

## Expected File Tree

```text
backend/
  core/
    CMakeLists.txt
    src/
    build/
```

Treat `build/` as generated.

## Common Failure Modes

- `cmake` not found
  Fix: install CMake or add it to `PATH`.
- compiler not found
  Fix: install the compiler toolchain first.
- reader tries to start with the C++ layer before the JS layer exists
  Fix: come back after Chapters 08 through 14.

## Do Not Build Yet

- ONNX integration
- advanced numerical optimization
- broad native feature parity with the JS layer
- cross-platform performance tuning

## Checkpoint Exercise

Answer these in your own words:

1. Why does the repo use C++ at all?
2. What is the difference between `src/` and `build/`?
3. What is the difference between configuring and building?

If you can answer those clearly, the chapter succeeded.

## Done Criteria

This chapter is done when you can explain:

- why the native layer exists
- what CMake does
- why `build/` is generated
- why early prototype work should not begin in the most advanced native subsystem
