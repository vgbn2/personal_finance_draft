# Build Order

This file defines the intended build order for a zero-experience reader.

## Stage Order

1. Learn the book and tool basics.
2. Understand the product scope and safety boundaries.
3. Create the repo scaffold.
4. Add config loading.
5. Add fake data ingestion.
6. Add storage and validation.
7. Add provider and quote routing logic.
8. Add the CLI.
9. Add the TUI.
10. Add the execution gateway.
11. Add strategies and backtesting.
12. Add the dashboard and API.
13. Add native C++ acceleration.
14. Add ML and ONNX only after the base system works.
15. Add deployment and operations last.

## Safe To Skip At First

- Rust-specific work
- ONNX model serving
- Docker deployment
- live broker execution
- multi-provider ranking complexity
- advanced TUI polish

## Must Not Be Skipped Before Live Trading

- environment and secret handling
- execution guardrails
- paper-trading path
- verification tests
- redacted diagnostics
- explicit auth and confirmation flow

## Writing Rule

When drafting a chapter, state where that chapter sits in the stage order and whether the reader can safely skip it on the first pass.
