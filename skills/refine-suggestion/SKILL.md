---
name: refine-suggestion
description: Turn rough, suggestive, preference-based, or multi-area improvement ideas into scoped, evidence-backed implementation prompts. Use when the user says things like "maybe", "could we", "less bloat", "clean this up", "remove duplicates", "leave it for later", proposes several loosely connected repo changes, or gives a direction without concrete acceptance criteria.
---

# Refine Suggestion

Convert the user's intent into an actionable prompt before implementation. Preserve their priorities
without inventing scope, and ground every repository claim in current evidence.

## Workflow

1. Restate the desired outcome in concrete terms.
2. Separate immediate work, deferred work, constraints, and non-goals.
3. Read the narrowest relevant repo truth: current handoff/state, governing docs, implementation paths,
   and existing tests or audit findings.
4. Classify each idea as one of: security/runtime contract, UX simplification, duplicate/stub cleanup,
   documentation, verification, or roadmap feature.
5. Resolve harmless ambiguity with a stated assumption. Ask only when a choice materially changes safety,
   external behavior, data retention, or deletion scope.
6. Produce the refined prompt using the contract below.
7. Implement only when the user asked to proceed. If they said to leave it for a future session, update
   durable handoff/state files and stop after refinement.

## Refined Prompt Contract

Return or record these fields:

- `objective`: one observable outcome.
- `in scope`: exact surfaces or behaviors.
- `out of scope`: adjacent work intentionally deferred.
- `evidence`: current files, tests, or audit findings supporting the work.
- `requirements`: behavioral and UX rules stated without implementation guesswork.
- `ranked batches`: safety and broken contracts first, cleanup second, polish last.
- `acceptance criteria`: measurable behavior, including character, row, latency, count, or state limits
  when the suggestion uses words such as "less", "faster", or "cleaner".
- `verification`: focused probes plus the broadest practical regression gate.
- `safety constraints`: authentication, local binding, data preservation, deletion thresholds, and dirty
  worktree boundaries that apply.
- `handoff`: the first next-session action when the work is deferred.

Do not describe an aspiration as a requirement. Convert subjective language into a measurable budget or
explicit comparison against the current behavior.

## Domain Guardrails

### API Binding And Automatic Login

- Treat wider-than-loopback binding as a security change.
- Establish authenticated session restoration and unauthenticated rejection before widening the bind.
- Keep secrets server-side; never replace login with browser-bundled admin tokens.
- Specify restart, expiry, logout, invalid-session, and unavailable-auth-provider behavior.
- Retain loopback as the safe default unless the user explicitly approves a wider exposure model.

### UI Bloat

- Define character, line, panel, or viewport budgets before changing styling.
- Preserve command discoverability, safety state, errors, and decision-critical values.
- Prefer removing repeated labels, borders, rules, and help copy over hiding operational truth.
- Verify at representative narrow, normal, and wide terminal or browser widths.

### Stubs And Duplicates

- Classify each candidate as intentional compatibility shim, generated artifact, test fixture, honest
  unavailable feature, dead duplicate, or divergent implementation.
- Remove only candidates with known ownership and zero required consumers.
- Consolidate repeated trade, research, backend, and data logic behind the existing canonical owner.
- Add or retain a contract test before deleting a compatibility path.
- Obey repository deletion-confirmation rules and preserve unrelated dirty-tree changes.

## Example

Suggestion: "Make the UI less bloated and remove duplicate trade/data stubs later."

Refinement: define viewport and character budgets, inventory duplicate/stub candidates by owner and
consumer count, preserve safety/error output, rank dead duplicates ahead of design-heavy rewrites, name
the tests that prove parity, and append the resulting batches to the current handoff without editing
production code.

## Truthfulness And Test Integrity

- Context is bounded. Build a task-local architecture map and disclose material surfaces not read or verified.
- Never claim a file was read, command ran, test passed, host was checked, or behavior was proved without direct
  evidence. Keep source, test, clean-install, CI, host, deployment, recovery, soak, paper, and live proof distinct.
- Do not weaken, skip, delete, mock away, suppress, or rewrite tests merely to make a result pass.
- Change a stale test only with canonical contract or approved behavior evidence; report the before/after
  expectation and keep production, tests, and docs aligned.
