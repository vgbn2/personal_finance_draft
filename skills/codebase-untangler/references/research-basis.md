# Research Basis

Use these principles as design guidance, not as substitutes for repository evidence. Re-fetch primary pages before quoting or making page-specific claims.

- [Strangler Fig Application](https://martinfowler.com/bliki/StranglerFigApplication.html) — replace or reorganize incrementally behind stable boundaries.
- [Branch by Abstraction](https://martinfowler.com/articles/branch-by-abstraction.html) — introduce a seam, migrate callers, then retire the old owner after parity proof.
- [Architecture Decision Records](https://adr.github.io/) — preserve context, decisions, alternatives, and consequences.
- [Team Topologies: cognitive load](https://teamtopologies.com/key-concepts-content/what-is-cognitive-load) — choose boundaries maintainers can understand and own.
- [Google Engineering Practices: small changes](https://google.github.io/eng-practices/review/developer/small-cls.html) — prefer focused, reviewable changes.
- Repository contracts: `docs/engineering/documentation_standard.md`, `docs/modules/TEMPLATE.md`, `docs/atlas/README.md`, `PROJECT_RULES.md`, and the truth/test-integrity rules.

The repository's current source, config, tests, manifests, and operational evidence remain authoritative for the active batch.