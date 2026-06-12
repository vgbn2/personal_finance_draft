# Glossary

This glossary is written for a reader with no prior systems or trading-platform background.

- `API`: a callable program surface exposed over code or HTTP.
- `artifact`: a generated output such as a build folder, binary, or report file.
- `async`: code that waits for work like file or network operations without blocking the whole program.
- `backfill`: fetching older historical data to populate a cache.
- `broker`: a service that can hold balances and execute trades.
- `cache`: a local saved copy of data so the system does not fetch everything again every time.
- `chapter minimum slice`: the smallest working version of the chapter's feature.
- `CLI`: command-line interface.
- `contract test`: a test that locks behavior at a boundary, such as command output or JSON shape.
- `CMake`: the build system used for the C++ core.
- `core engine`: the native C++ compute surface in this repository.
- `env var`: an environment variable, usually used for secrets or runtime settings.
- `fixture`: saved test input used to make tests stable and repeatable.
- `gateway`: the execution layer that sits between the CLI and external brokers.
- `JSON`: structured text format used heavily in this repo for machine-readable data.
- `module`: a file that exports code other files can import.
- `ONNX`: a portable model format used to run trained models outside Python.
- `paper trading`: simulated execution without spending real money.
- `provider`: a module that knows how to fetch market or macro data from one source.
- `repo truth`: the files this repo treats as authoritative for structure or state.
- `Rust mirror`: a parallel implementation path or experimental runtime that is not required for the base build.
- `scaffold`: a starting file structure with placeholders and constraints.
- `source`: hand-written project files.
- `TUI`: terminal user interface.
- `TS index`: binary time-series index used for faster historical reads.
- `YAML`: structured text format often used for config files.
