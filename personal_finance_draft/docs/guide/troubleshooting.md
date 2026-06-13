# Troubleshooting Index

Use this as the shared troubleshooting reference instead of repeating the same long explanations in every chapter.

## Node Problems

- `Cannot find module`: the file path is wrong, the install step was skipped, or the module export path changed.
- `npm` command not found: Node.js is not installed correctly or is missing from `PATH`.
- `npm.ps1` blocked by execution policy: on Windows PowerShell, retry the same command with `npm.cmd`.
- JSON parse errors: a config file has trailing commas, invalid quotes, or malformed structure.

## C++ Problems

- `cmake` command not found: CMake is missing or not on `PATH`.
- compiler not found: Visual Studio Build Tools or another supported compiler is missing.
- link errors: required native libraries or runtime flags were not configured correctly.

## Docker Problems

- daemon unavailable: Docker Desktop is not running or is wedged.
- build hangs: registry access, daemon state, or a stale build process is blocking progress.

## Repo Problems

- dirty working tree confusion: check `git status --short -- .` before assuming your change caused the issue.
- generated files tracked as source: compare against `docs/engineering/codebase_org.md` and the structure rules.

## Learning Problems

- chapter feels too large: split it before adding more prose.
- reader does not know the terminology: add to `glossary.md` first, then reference the term from the chapter.
- the guide feels too abstract: switch to `docs/guide/examples/minimal_sovereign/` and run the worked example before continuing.
