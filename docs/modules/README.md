# Module Catalog

Module pages explain which source owner is responsible for a capability across entrypoints, configuration, persistence, tests, failure behavior, and recovery.

## Rules

- One capability has one canonical module page.
- Use stable symbols and repository-relative paths instead of mutable line numbers.
- Link to Code Atlas records for deep algorithms, structures, protocols, and topology; do not repeat them.
- Link to operational runbooks for procedures; do not copy them.
- Historical evidence may justify a note only after current source verification.

## Catalog

- [Documentation retrieval and knowledge boundaries](documentation-retrieval.md) — manifest-selected canonical/historical lookup, index/cache ownership, and documentation validation.

New pages must follow [TEMPLATE.md](TEMPLATE.md), link to their Code Atlas records, and be registered in [`docs/documentation_manifest.json`](../documentation_manifest.json).