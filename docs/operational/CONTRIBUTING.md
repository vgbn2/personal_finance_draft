# Contributing

This project is meant for several contributors. Keep changes understandable, bounded, and aligned with the active phase.

## Before Coding

Read:

- `docs/README.md`
- `docs/operational/QUICKSTART.md`
- `docs/engineering/product_spec.md`
- `docs/engineering/architecture_overview.md`

Then identify which phase your change belongs to. If the phase is not active, discuss the change before implementing it.

## Active Phase Rules

Phase 5 automated execution and risk hardening is complete. Treat `workspace/STATE.md` as the current phase anchor for active work and Phase 6 preparation.

Allowed by default:

- trading-platform module names and compatibility wrappers
- docs and module ownership maps
- config slot updates
- model metadata slots
- small sample-data fixtures for tests
- config sample updates
- documentation improvements
- local dashboard and API bridge alignment

Avoid by default:

- live web dashboard behavior
- broker execution
- real market ingestion
- ML inference
- deployment automation
- new external dependencies

## Code Standards

- Use C++20.
- Prefer standard-library code where practical.
- Keep public declarations in `cpp_core/include`.
- Keep implementations in the owning module under `cpp_core/src`.
- Keep tests in `cpp_core/test`.
- Write simple code before adding abstractions.
- Validate inputs close to the module that owns the behavior.

## Documentation Standards

Update docs in the same change when you alter:

- public API
- config fields
- build commands
- runtime commands
- dependencies
- phase boundaries
- repository layout

Use the right document:

- `docs/README.md`: orientation
- `docs/operational/QUICKSTART.md`: build and run commands
- `docs/engineering/product_spec.md`: product behavior and phase scope
- `docs/engineering/architecture_overview.md`: architecture and code boundaries
- `docs/operational/testing_surface.md`: verification and troubleshooting
- `docs/operational/DEPLOYMENT.md`: deployment plan
- `docs/engineering/web_api.md`: web/API contract
- `docs/engineering/agentic_coding_playbook.md`: human-facing standard for evidence-first tests, subagent ownership, and debt hygiene

## Test Expectations

Every behavior change needs a test or a clear reason why a test is not useful yet.

For integration and regression tests, show the actual data flow in the output instead of only reporting pass/fail. Include the input source, the important transforms, record counts, any rejected records, the output artifact, and the invariant that explains why the test passed.

Codex and Gemini must follow the same verification standard when they write or review tests.

Required active baseline:

```text
docs and tests distinguish active local behavior from planned production behavior
```

## Review Checklist

Before asking for review:

- build passes
- tests pass
- docs are updated
- generated frontend artifacts are included only when the served bridge contract changed
- no broker/deployment behavior is mixed into local prototype changes
- any new dependency is documented and justified



