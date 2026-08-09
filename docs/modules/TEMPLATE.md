# Module: <Human-Readable Name>

> **Status:** Implemented | Research-only | Gated | Not qualified
> **Audience:** <maintainer/operator/researcher/API developer/etc.>
> **Canonical owners:** `<source/path>`, `<source/path>`
> **Review triggers:** <interfaces/config/data format/safety/recovery changes>

## Purpose And Non-Goals

Explain the problem this module owns, why it exists, and what belongs elsewhere.

## Entrypoints And Public Contracts

List operator entrypoints, exported APIs, native commands, routes, schemas, and config surfaces. Prefer symbols and repository-relative paths over line numbers.

| Surface | Owner | Contract |
|---|---|---|
| `<command/function/route>` | `<path>` | <inputs, outputs, side effects, errors> |

## Dependencies And Data Flow

```text
input/source -> canonical owner -> output/consumer
```

Explain dependency direction, persisted artifacts, generated outputs, and compatibility shims.

## Invariants And Safety Boundaries

Document the rules that must remain true, including applicable:

- authentication and authorization;
- research, paper, and live separation;
- provenance and point-in-time correctness;
- one-writer, locking, append/merge, and atomicity;
- units, clocks, timeframes, and numeric conventions;
- resource and concurrency bounds;
- fail-closed behavior.

## Failure Modes And Degraded Behavior

| Failure | Visible evidence | Safe behavior | Repair owner |
|---|---|---|---|
| <condition> | <error/status/log> | <fail/skip/degrade> | <module/operator/provider> |

Separate our source, environment, operator configuration, owned host/deployment, and external provider boundaries.

## Observability

List structured status, logs, health fields, counters, evidence manifests, or inspection commands. State what each signal proves and does not prove.

## Recovery And Rollback

Describe bounded recovery, replay, restart, rollback, quarantine, or rebuild procedures. Link to the owning runbook rather than duplicating a long procedure.

## Examples

Provide the smallest representative read-only example first. Label commands that use the network, write data, start persistent processes, alter hosts, or touch paper/live execution.

## Tests And Evidence

List representative focused tests and broader gates. Distinguish source/test evidence from clean-checkout, CI, provider, host, deployment, recovery, soak, paper, and live proof.

## Related Code Atlas Records

Link the stable ids and paths for algorithms, structures, protocols, and topology owned by this module. Do not repeat their deep mechanism sections here.

## Compatibility And Historical Notes

Document only compatibility constraints that affect current maintainers. Link historical evidence rather than embedding session narratives.

## Change Checklist

- [ ] Public contract and examples remain accurate.
- [ ] Config/env/data-format changes are documented.
- [ ] Safety and failure behavior remain explicit.
- [ ] Recovery owner and runbook remain valid.
- [ ] Source paths and links pass documentation checks.
- [ ] Historical facts were source-verified before promotion.
