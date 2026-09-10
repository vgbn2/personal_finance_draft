# Operations Guide

This document covers day-to-day development, verification, and maintenance operations.

## Local Development Loop

Recommended loop:

```bash
git status --short
npm run native:doctor
npm run native:build
npm run test:core
npm run test:safety
```

The `native:doctor` command reports whether `cmake`, `ctest`, and a focused compiler fallback are available on the current machine. The `npm run native:build` command configures and compiles the C++20 engine in `backend/core/build`. The `npm run test:core` runs all 34 CTests.

## Verification Checklist

Before handing off a change:

- project builds (`npm run native:build`)
- native CTests pass (`npm run test:core`)
- safety tests pass (`npm run test:safety`)
- structure contracts pass (`npm run test:structure`)
- documentation filter passes (`npm run docs:filter -- --strict`)
- no build artifacts or uncommitted temporary files are tracked

## Native Build Commands

To configure, compile, and test the native C++20 engine:

```bash
# Automated via npm:
npm run native:build
npm run test:core

# Or manual CMake commands:
cmake -S backend/core -B backend/core/build -DCMAKE_BUILD_TYPE=Release -DSOVEREIGN_ENABLE_ONNX_RUNTIME=OFF
cmake --build backend/core/build --config Release --parallel
ctest --test-dir backend/core/build -C Release --output-on-failure
```

This does not replace the CMake path for final verification.

## Troubleshooting

Problem: `cmake` command not found.

Resolution: run `npm run native:doctor`, install CMake, and ensure both `cmake` and `ctest` are on `PATH`. On Windows, installing CMake from the official installer or via a package manager is acceptable as long as a new terminal can resolve both commands.

Problem: `npm run native:doctor` reports `fallback_compile_available=true` but `can_run_cmake=false`.

Resolution: focused direct `g++` smoke tests can still prove small native seams, but this does not replace CMake configure/build/CTest verification.

Problem: executable path does not exist.

Resolution: run `cmake --build build` and check whether your generator places binaries under `build/backend/core`.

Problem: test target not found.

Resolution: confirm `backend/core/CMakeLists.txt` defines `phase1_compounding_test` and `add_test`.

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
