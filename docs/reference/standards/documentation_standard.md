# Documentation Standard

## Purpose

This standard defines how Sovereign documents code, architecture, operations, and research. Documentation is maintained with the code: versioned, reviewed, tested, and updated when its owning contract changes.

The goal is not to comment every line or create one page per file. The goal is to make ownership, interfaces, invariants, safety boundaries, failure behavior, and recovery understandable without reconstructing old sessions.

## Research Basis

This standard adapts five established documentation practices. Verify these sources when changing the standard:

- [Diátaxis](https://diataxis.fr/) separates learning-oriented tutorials, task-oriented how-to guides, factual reference, and conceptual explanation.
- [Google developer documentation style](https://developers.google.com/style) emphasizes a defined audience, clear purpose, direct language, useful organization, and tested links and examples.
- [JSDoc](https://jsdoc.app/about-getting-started) keeps JavaScript API reference close to exported symbols.
- [Doxygen documentation blocks](https://www.doxygen.nl/manual/docblocks.html) keep C++ API contracts close to public declarations.
- [Write the Docs: docs as code](https://www.writethedocs.org/guide/docs-as-code/) treats documentation as versioned source reviewed and tested through the engineering workflow.

Do not quote or paraphrase these sources as normative text without checking the current primary page.

## Documentation Types

Use one primary purpose per page.

| Type | Reader need | Repository location | Typical content |
|---|---|---|---|
| Orientation | “What is this, and where do I start?” | `README.md`, `docs/README.md`, `docs/ARCHITECTURE.md` | purpose, safety boundary, first steps, navigation |
| Tutorial | “Teach me by walking through the real system.” | `docs/codebase_tour/` | guided traces and bounded labs |
| How-to / runbook | “Help me complete or recover a task.” | `docs/operational/` | setup, deployment, diagnosis, recovery, rollback |
| Reference | “Give me the exact contract.” | `docs/reference/`, source API comments | CLI/API/config/schema/data-format contracts |
| Explanation | “Why is the system designed this way?” | `docs/engineering/`, `docs/research/`, `docs/design/` | architecture, trade-offs, safety model, research rationale |
| Module documentation | “Who owns this behavior across files?” | `docs/modules/` | entrypoints, ownership, public contract, failures, recovery |
| Code Atlas | “How does this important mechanism work safely?” | `docs/atlas/` | algorithms, equations, structures, protocols, topology, invariants, complexity, numerical behavior |
| Historical evidence | “What happened, and where did this decision come from?” | `workspace/`, `workspace/handoff/`, `docs/memory/`, `docs/archive/`, graph reports | dated evidence, reviews, plans, session continuity |

Historical evidence is deliberately retained and scraped for durable knowledge. It is not the default developer reference. Promote a historical fact only after verifying it against current source, config, tests, or a current operator contract.

## Audience And Page Contract

Every canonical page must answer:

1. Who is the intended reader?
2. What question does the page answer?
3. Which source paths own the described behavior?
4. What is implemented, research-only, gated, or not qualified?
5. What evidence supports the claim, and what does it not prove?
6. What change should trigger a documentation review?

Lead with purpose and scope. Put prerequisites before procedures. Use concrete repository-relative paths and commands. Prefer stable symbols and module names over brittle line numbers.

## Where Documentation Belongs

### Module pages

Use `docs/modules/*.md` when a behavior spans entrypoints, source modules, config, tests, and operational recovery. Follow `docs/modules/TEMPLATE.md`.

A module page should document:

- the canonical owner and public entrypoints;
- dependencies and data flow;
- security, data-integrity, concurrency, and safety invariants;
- errors, degraded behavior, observability, and recovery ownership;
- compatibility shims and generated artifacts;
- representative tests and evidence limitations;
- review triggers.

### Code Atlas records

Use `docs/atlas/` for source-linked mechanisms that require deeper study than a module page should carry:

- algorithms and equations, including symbols, units, reference vectors, complexity, and numerical behavior;
- important structures and schemas, including mutation, persistence, compatibility, concurrency, and recovery;
- protocols across CLI, API, native, process, file, provider, or generated-artifact boundaries;
- topology from entrypoint through canonical owner, adapter/persistence, output/status, and recovery.

Every current Atlas record must declare a stable id, source symbols, focused tests, owning module page, review triggers, and honest revision evidence. A working-tree record identifies its base commit and must not be presented as committed-archive proof. Link module, Atlas, research, ADR, and runbook pages instead of repeating their complete contracts.

### JavaScript and TypeScript APIs

Use JSDoc on exported functions, classes, and data contracts when parameters, return values, thrown errors, side effects, mutation, asynchronous behavior, security decisions, or units are not obvious.

Do not add JSDoc that only repeats the function name. Document the contract callers must preserve.

### C++ APIs

Use Doxygen-style blocks on public headers and cross-module declarations. Document:

- preconditions and postconditions;
- units and numeric conventions;
- ownership and lifetime;
- thread-safety and mutation;
- error/result semantics;
- security or execution consequences.

Keep implementation rationale near the non-obvious implementation, not duplicated across declarations and source files.

### Inline comments

Use inline comments for why an invariant exists, why a simpler approach is unsafe, compatibility constraints, and non-obvious failure behavior.

Do not narrate ordinary control flow or preserve obsolete session stories inside production code.

### Runbooks

Use operational guides for procedures with prerequisites, commands, expected evidence, failure branches, rollback, and stop conditions. Clearly label commands that perform network requests, write canonical data, start persistent services, alter a host, place paper orders, or permit live execution.

## Truth And Evidence Language

Keep evidence layers distinct:

- source inspection;
- focused tests;
- aggregate tests;
- committed-archive or clean-checkout proof;
- authenticated CI;
- provider acceptance;
- owned-host runtime;
- deployment, restart, rollback, recovery, and soak;
- paper and live execution.

A passing source test does not prove provider, host, deployment, recovery, paper, or live behavior. A dated test count belongs in historical evidence, not a canonical capability guarantee.

Use the status vocabulary consistently:

- **Implemented** — production-reachable source exists and its stated source/test contract is current.
- **Research-only** — output is explicitly non-promotional and non-executing.
- **Gated** — source exists but requires explicit authorization, credentials, feature/risk checks, or runtime qualification.
- **Not qualified** — the named provider, host, deployment, recovery, soak, paper, or live evidence has not been established.
- **Historical** — true for a dated revision or session, not asserted for the current tree.

## Historical Knowledge Promotion

Record mined facts in `workspace/reports/DOCUMENTATION_KNOWLEDGE_INVENTORY.md`.

Promotion lifecycle:

`candidate -> source-verified -> promoted | rejected | superseded`

For every candidate, record:

- the historical source;
- the durable claim or gotcha;
- current source/config/test evidence;
- the target canonical page;
- status and verification date;
- rejected alternatives or caveats.

Never copy credential values, private identifiers, raw provider responses, or host-sensitive details from history into canonical docs.

## Review Triggers

Review the owning documentation when a change modifies:

- a public JS/TS/C++ interface or native/CLI/API/MCP protocol;
- module ownership or dependency direction;
- config or environment fields;
- storage format, provenance, freshness, append/merge, or one-writer behavior;
- authentication, authorization, risk, kill-switch, paper, or live boundaries;
- failure, degraded-mode, observability, recovery, restart, or rollback behavior;
- build, test, deployment, migration, or operator commands;
- a generated artifact that is served or consumed at runtime.

A change does not require unrelated documentation churn. Update the page whose declared source paths or contract changed.

## Style Checklist

- Write for a named audience and one primary task.
- Start with purpose, scope, and safety boundary.
- Use short headings, active voice, and concrete terms.
- Define acronyms and units on first use.
- Prefer repository-relative links and paths.
- Use executable examples; state prerequisites and side effects.
- Avoid fixed line numbers where a symbol or path is sufficient.
- Avoid “current,” “complete,” “production-ready,” or “works” without the evidence scope.
- Avoid mutable counts in canonical docs unless clearly dated and automatically generated.
- Link instead of duplicating a contract owned elsewhere.
- Mark planned, research-only, gated, historical, and generated material explicitly.

## Documentation Review Checklist

Before review:

- confirm every active link and source path exists;
- compare commands and route/config inventories to their canonical registries;
- verify promoted historical facts against current source;
- run the documentation and structure gates available for the batch;
- execute read-only, environment-safe examples where practical;
- disclose unexecuted provider, data-write, container, host, paper, and live steps;
- ensure generated and historical artifacts are not presented as canonical source;
- ensure unrelated dirty-tree changes remain untouched.
