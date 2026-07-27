# Connective-Tissue Checklist

Build a matrix before deep reads.

- Inventory active files with generated/cache directories excluded.
- Compare imports and requires with package-root dependencies.
- Compare exports, CLI handlers, routes, scripts, and model artifacts with real consumers.
- Search production roots for TODO, FIXME, HACK, BUG, XXX, stub, mock, fake, placeholder, no-op, and not-implemented paths.
- Compare command names, env vars, flags, providers, events, metrics, paths, schemas, and artifacts across code, config, tests, scripts, and docs.
- Verify docs commands against dispatchers and package scripts.
- Confirm tests exercise the active runtime path rather than a synthetic shell.
- Check backend, frontend, shared, infra, and workspace boundaries for copied policy or hidden relative coupling.

Classify each candidate:

- intentional: public API, generated artifact, external hook, compatibility shim, or owned extension;
- stale: no consumer, current contract, or owner;
- incomplete: named in docs/tests/config but missing a runtime link;
- dangerous: production-reachable no-op, silent failure, synthetic-as-real path, or validation/safety bypass.

For each reported candidate include exact evidence, owner, impact, and the test or decision that clears it. Do not delete candidates during the audit.
