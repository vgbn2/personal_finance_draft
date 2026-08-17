---
name: refactor-readability
description: Refactor personal_finance_draft code for readability, maintainability, coherent ownership, and consistent conventions without changing behavior. Use when the user asks to make code easier to read, simplify a large file or function, reduce AI-generated style drift, consolidate duplicate implementations, clarify names/control flow, or perform a behavior-preserving cleanup; use blast-through for audit-only requests and codex or mass-implement when behavior must change.
---

# Refactor Readability

Work like an engineer joining an established production team. Read before editing, learn the repository's
rules and legacy constraints, and make small behavior-preserving improvements instead of clean-slate rewrites.
Readability is an operational safety property: another person must be able to identify ownership, invariants,
side effects, and recovery paths.

## Intake

Establish:

- the exact module, behavior, and reason it is hard to understand;
- the canonical owner, callers, tests, docs, runtime entrypoint, and applicable legacy constraints;
- the behavior, API, schema, error output, and compatibility surface that must remain unchanged;
- the dirty-tree boundary and focused verification gate.

If behavior or ownership is unclear, use `blast-through` first. If the desired result changes behavior,
permissions, data, dependencies, public interfaces, or runtime policy, route it to `codex` or
`mass-implement`.

## Workflow

1. Read governing rules, the complete target, direct callers, tests, docs, and relevant history before editing.
2. Describe current responsibilities, invariants, side effects, failure paths, and intentional legacy behavior
   in plain language.
3. Identify verified friction: inconsistent conventions, duplicate ownership, mixed responsibilities, deep
   nesting, repetitive or nested `if/else if` case dispatch, misleading names, long functions, stale comments,
   or unnecessary indirection.
4. Freeze observable behavior with existing tests or add a focused characterization test when evidence is weak.
5. Refactor one cohesive slice through existing canonical owners and local style.
6. Reread the diff as a narrative; remove generated-looking repetition, needless wrappers, and comments that
   merely restate code.
7. Run focused tests, then the broadest practical regression gate.
8. Report before/after ownership, hotspot sizes, behavior proof, legacy constraints, and deferred cleanup.

## Readability Contract

- Keep one canonical owner for each domain rule.
- Use names that express financial or operational intent.
- Make high-level control flow readable top-down; prefer guard clauses over deep nesting.
- When branches only enumerate cases, prefer the simplest locally readable general representation—such as a
  lookup/dispatch table, strategy, declarative rule set, polymorphic owner, or language-native match—over
  `if (case1)`, `else if (case2)`, `else if (case3)` chains.
- Do not force abstraction: retain explicit conditionals for short bounded decisions, ordered or coupled guards,
  validation, authorization or safety gates, genuinely divergent workflows, and edge-case handling. A retained
  lengthy or nested case-dispatch chain must document or report why generalization would reduce correctness or
  readability.
- Keep mutation, I/O, credentials, trading capability, and error states explicit.
- Extract cohesive concepts, not arbitrary line ranges.
- Avoid static hardcoded domain arrays, fixed symbol lists, or magic thresholds in C++/JS runners; drive strategy and domain parameters dynamically from configuration manifests, JSON specs, or storage indexes.
- Avoid generic utility dumping grounds and speculative abstractions.
- Comments explain why, invariants, units, compatibility, or non-obvious safety decisions.
- Update nearby docs when ownership moves; do not rewrite unrelated history.
- Preserve error sanitization, fail-closed behavior, and externally observed compatibility.

Use size only as a review signal. Inspect functions above 60 lines, nesting beyond three levels, and files above
300 lines. For a touched file above 500 lines, avoid net growth unless extraction would reduce cohesion. For a
touched file above 1,000 lines, record a split-or-keep decision.

## Safety Boundary

Do not change public APIs, schemas, environment names, auth roles, provider behavior, canonical data, order
semantics, live/paper policy, dependencies, deployment, or persistence unless the user separately approves that
behavioral work. Never combine cleanup with provider polling, data repair, migration, service startup, trading,
public exposure, or destructive deletion.

## Truthfulness And Test Integrity

- Context is bounded. Build a task-local architecture map and disclose material surfaces not read or verified.
- Never claim a file was read, command ran, test passed, host was checked, or behavior was proved without direct
  evidence. Keep source, test, clean-install, CI, host, deployment, recovery, soak, paper, and live proof distinct.
- Do not weaken, skip, delete, mock away, suppress, or rewrite tests merely to make a result pass.
- Change a stale test only with canonical contract or approved behavior evidence; report the before/after
  expectation and keep production, tests, and docs aligned.
