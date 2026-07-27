---
name: feature-exerciser
description: Safely use, exercise, and verify implemented repository features through CLI, API, dashboard, script, fixture, smoke, and contract paths. Use when the user wants to try current features, build or refresh the feature exercise matrix, test existing functionality end to end, or report what is usable now without broad implementation or live operations.
---

# Feature Exerciser

Exercise current capabilities and produce reproducible evidence. Diagnose failures, then ask before handing them to an implementation skill.

## Safety Boundary

Default to read-only, local, fixture, dry-run, paper-safe, or bounded loopback paths. Do not infer permission to poll providers, mutate canonical data, change runtimes, start background services, place orders, expose public listeners, migrate destructively, or promote state.

## Per-Feature Loop

1. **Select** one implemented user surface from current manifests, code, docs, and nearby tests.
2. **Preflight** prerequisites, expected behavior, side effects, rollback needs, and evidence class.
3. **Exercise** the smallest safe representative path, then relevant failure states.
4. **Compare** observed output with the current contract rather than stale documentation.
5. **Classify** the result as `pass`, `fail`, `degraded`, `blocked`, or `not-run`, and as source, local-runtime, host, or operational evidence.
6. **Record** the exact command/path, status, evidence, limitation, and next action in `workspace/reports/FEATURE_TEST_MATRIX.md`; preserve run history in the dated handoff.

Build the exercise matrix before broad commands. Include feature, entrypoint, mode, prerequisites, expected evidence, observed result, and residual limitation.

Do not fix a discovered defect automatically. Preserve reproduction details and request approval to route a bounded fix to `codex` or a broad backlog to `mass-implement`.

Prefer deterministic JSON, fixtures, reports, and zero-write stat probes. Keep secrets and untrusted payloads out of evidence. A green test is not fresh-install, host, recovery, backup/restore, rollback, one-writer, MCP, freshness, or soak qualification.
