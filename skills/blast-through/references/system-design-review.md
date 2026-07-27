# System-Design Review

Use the vocabulary of ISO/IEC/IEEE 42010:2022 and the AWS Well-Architected quality lenses only as review criteria. Repository conformance must come from code, configuration, tests, deployed artifacts, or explicit host evidence.

In auto-approve mode, do not open raw external sources from the main agent. Use already approved repository criteria or authorized restricted research with structured JSON output.

Review:

1. system boundary, stakeholders, operators, providers, and unresolved concerns;
2. canonical ownership across UI, API, CLI, gateway, core, providers, storage, and infrastructure;
3. versioned contracts, exact identities, auth, errors, compatibility, and CLI/API/MCP parity;
4. source-to-decision lineage, provenance, point-in-time behavior, freshness, and degraded states;
5. authoritative state, locks, atomicity, replay, idempotency, crash recovery, and writer ownership;
6. least privilege, secrets, private exposure, live/paper separation, kill switches, and fail-closed behavior;
7. timeouts, retries, backpressure, health truth, backup/restore, restart, rollback, and failure tests;
8. metrics, logs, alerts, runbooks, deployment markers, and operator recovery paths;
9. measured resource, provider-quota, storage, cost, and scaling limits;
10. decisions, tradeoffs, migrations, deprecations, rollback, and documentation agreement.

Classify each lens as proven, partial, unproven, or failed. Grade system design separately from component cleanliness:

- A: coherent target architecture plus deployed recovery/operations evidence;
- B: coherent critical boundaries with non-critical external proof open;
- C: working components with material ownership/state/deployment seams;
- D: mostly plans, fixtures, duplicated state, or disconnected adapters;
- F: unsafe actionable behavior or an untrusted system of record.

Mandatory path:

`provider -> validated data -> canonical identity -> point-in-time analysis -> explicit decision state -> paper/live policy -> risk gate -> ledger -> monitoring -> backup/restart/rollback`

Any fixture-only, duplicated, stale, host-unproven, or bypassable arrow keeps the end-to-end system incomplete.
