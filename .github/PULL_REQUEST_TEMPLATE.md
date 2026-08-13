## Summary

Describe the problem, the change, and why this scope is necessary.

## Affected Areas

- [ ] C++ core / analytics / backtesting
- [ ] CLI / TUI
- [ ] Private API / dashboard
- [ ] Gateway / execution / runtime policy
- [ ] Auth / credentials / provider integration
- [ ] Configuration / strategy policy
- [ ] Infrastructure / GitHub Actions / deployment
- [ ] Documentation / governance
- [ ] Other: <!-- describe -->

## Evidence

List commands actually run and their outcomes. State what was not run and why.

```text
command:
outcome:
evidence scope:
```

- [ ] Behavior changes include an appropriate test, or this PR explains why one is not useful.
- [ ] Integration or regression evidence shows relevant input, transforms, counts, rejected/skipped records, output, and invariants where applicable.
- [ ] No test was weakened, skipped, suppressed, or replaced merely to create a passing result.

## Safety and Operations

- [ ] This PR does not alter execution, provider access, credentials, canonical-data writes, hosts, deployment, or CI administration.
- [ ] This PR alters one of those boundaries and identifies the named Core Maintainer who reviewed it: <!-- name or handle -->
- [ ] Not applicable: explain why the changed area cannot affect those boundaries. <!-- explanation -->

A pull request does not authorize an order, provider mutation, credential use, data write, host change, deployment, or execution.

## Documentation and State

- [ ] Relevant docs are updated.
- [ ] `workspace/STATE.md` is unchanged because current project direction did not change.
- [ ] `workspace/STATE.md` was updated because: <!-- explain -->

## Contribution Attestation

- [ ] I have authority to submit this contribution and permit it to be used under this repository's [license](../LICENSE).
