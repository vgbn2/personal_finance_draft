# Chapter 20 - Testing And Validation

## Goal

This chapter explains how to prove the system works instead of trusting a plausible-looking output.

In a repo with data, execution, and multiple runtimes, confidence without evidence is noise. Testing is how you keep the guide from teaching accidental myths.

## What You Are Building

You are building a validation mindset and a small test stack that can:

- test one unit of logic
- test one interface contract
- test one structure rule
- detect regressions after later edits

## Prerequisite Concepts

You should already understand:

- CLI and gateway boundaries
- normalized data shapes
- storage and config ownership

## Language Proficiency Required

- JavaScript/Node.js: beginner to intermediate
- Test-reading skills: beginner

## Library And Tool Requirements

- `node --test`
- repo test fixtures
- optional native test support

## Beginner Translation Box

- `unit test`: tests one small function or module behavior
- `contract test`: tests a boundary such as CLI JSON output or API shape
- `structure test`: tests repo rules such as forbidden tracked artifacts or path hygiene
- `regression`: a feature that used to work and now fails

## Why Different Test Types Exist

One test style cannot prove everything.

Examples:

- a unit test can verify a validator function
- a contract test can verify `status --json`
- a structure test can verify generated files are not treated as source

If you use only one type, the repo will hide failures in the gaps.

## Start Small But Real

A beginner does not need a giant test suite first.

The first useful test set is:

- one unit test
- one command contract test
- one failure case

That already proves both success and failure behavior.

## Testing The Right Boundary

Good examples:

- test a config loader with valid and invalid input
- test a CLI JSON payload shape
- test that a gateway blocks live mode without guards

Weak examples:

- testing decorative text only
- asserting a file exists without checking its contents or meaning
- assuming green tests prove coverage they never touched

## Minimum Working Slice

The minimum slice for this chapter:

- one passing unit test
- one passing contract test
- one intentionally failing case you then fix

That proves the reader can use tests to learn, not just to decorate a project.

## Step-By-Step Build

1. Add one small unit test for a helper.
2. Add one CLI contract test for JSON output.
3. Break the code or the expectation on purpose once.
4. Read the failure carefully.
5. Fix the root cause.
6. Rerun the tests.

## Contracts And Interfaces

The test layer should guarantee:

- real behavior is observable
- important boundaries are locked
- regressions are catchable
- failures help the reader locate the issue

Tests are not only for approval. They are also the main debugging evidence surface.

## Tests And Verification

Run:

```powershell
node --test
```

Or run a narrower contract slice:

```powershell
node --test tests\scripts\tests\some_cli_contract.test.js
```

Expected outcome:

- passing tests report success clearly
- failing tests point to the failing assertion or command behavior

The important habit is to read what failed, not just count failures.

## Expected File Tree

```text
tests/
  scripts/
    tests/
backend/
  cli/
shared/
  lib/
```

Tests usually sit outside the production modules they verify.

## Common Failure Modes

- tests only check happy paths
  Fix: add at least one failure-mode assertion.
- contract tests parse human output instead of JSON
  Fix: use machine-readable modes where available.
- green tests are assumed to cover unrelated behavior
  Fix: verify the test scope before trusting the result.

## Do Not Build Yet

- massive test matrix automation
- flaky end-to-end suites
- broad performance benchmarking before behavior is stable

## Checkpoint Exercise

Take one command from an earlier chapter and describe one unit test and one contract test you would write for it.

## Done Criteria

This chapter is done when you can explain:

- the difference between unit, contract, and structure tests
- why failure cases matter
- why test scope matters
- how tests support debugging instead of just approval
