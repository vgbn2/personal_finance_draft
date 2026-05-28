# Operations Guide

This document covers day-to-day development, verification, and maintenance operations.

## Local Development Loop

Recommended loop:

```bash
git status --short
npm run native:doctor
cmake -S . -B build
cmake --build build
ctest --test-dir build/cpp_core
```

Windows PowerShell:

```powershell
git status --short
npm run native:doctor
cmake -S . -B build
cmake --build build
ctest --test-dir build/cpp_core
```

The `native:doctor` command reports whether `cmake`, `ctest`, and a focused compiler fallback are available on the current machine. The CMake build verifies the C++ backend path. Node CLI and web/API checks should also be run when touching ingestion, validation, research, quote, or dashboard bridge behavior.

## Verification Checklist

Before handing off a change:

- project builds
- tests pass
- warnings are reviewed
- docs match changed behavior
- no build artifacts are included
- no future-phase dependency was added accidentally

## Manual Smoke Test

If CMake is unavailable locally, a direct compiler smoke test may be used during development:

```bash
g++ -std=c++20 -Wall -Wextra -Werror -I ./cpp_core/include \
  ./cpp_core/src/main.cpp \
  ./cpp_core/src/wealth/finance_engine.cpp \
  ./cpp_core/src/wealth/param_loader.cpp \
  -o ./build/manual/sovereign_wealth
```

This does not replace the CMake path for final verification.

## Troubleshooting

Problem: `cmake` command not found.

Resolution: run `npm run native:doctor`, install CMake, and ensure both `cmake` and `ctest` are on `PATH`. On Windows, installing CMake from the official installer or via a package manager is acceptable as long as a new terminal can resolve both commands.

Problem: `npm run native:doctor` reports `fallback_compile_available=true` but `can_run_cmake=false`.

Resolution: focused direct `g++` smoke tests can still prove small native seams, but this does not replace CMake configure/build/CTest verification.

Problem: executable path does not exist.

Resolution: run `cmake --build build` and check whether your generator places binaries under `build/cpp_core`.

Problem: test target not found.

Resolution: confirm `cpp_core/CMakeLists.txt` defines `phase1_compounding_test` and `add_test`.

Problem: linker errors for `FinanceEngine`.

Resolution: this is compatibility wealth smoke-test code. Either restore the legacy build path intentionally or keep the trading docs clear that the wealth executable is not the active product direction.

## Release Hygiene

Before tagging or sharing a build:

- run a clean configure
- run tests
- record compiler and platform
- update docs if commands changed
- keep `build/` and generated binaries out of source control

## Runtime Safety

The local prototype can read external market data and local quote exports, but it must not place live trades. Broker execution and production portfolio side effects remain gated.

Future phases involving broker execution must require:

- dry-run mode
- explicit live mode flag
- confirmation gate
- credential storage policy
- operational kill switch
