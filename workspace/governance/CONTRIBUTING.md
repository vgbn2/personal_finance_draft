# Contributing to Sovereign

Sovereign is a local-first trading research and controlled-execution platform. Contributors and maintainers may work across the complete source tree through focused pull requests. Repository access does **not** grant access to provider credentials, production hosts, deployment authority, CI administration, paper/live execution authorization, or operator-controlled data.

## Start Here

Read these before beginning work:

- [Detailed contribution guide](docs/operational/guides/CONTRIBUTING.md)
- [Project rules](PROJECT_RULES.md)
- [Current project direction](workspace/STATE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Testing surfaces](docs/operational/guides/testing_surface.md)
- [Governance](GOVERNANCE.md) and [maintainer roster](MAINTAINERS.md)
- [Security policy](SECURITY.md)

`workspace/STATE.md` is the current phase anchor. Do not treat a source adapter, credential variable, menu item, or test as authority to contact a provider, write canonical data, change a host, deploy, or place an order.

## Collaboration Workflow

1. Open or reference an issue for material changes; do not report security-sensitive information in a public issue.
2. Create a focused branch and keep unrelated changes out of the pull request.
3. Follow the active phase and the owning module's documented boundaries.
4. Add or update tests for behavior changes, unless the detailed guide explains why a test is not useful.
5. Update documentation when public behavior, configuration, commands, dependencies, runtime boundaries, or repository structure changes.
6. Complete the pull-request template with commands run, evidence scope, safety impact, and contribution attestation.

Core-maintainer review is required for execution, provider or credential handling, deployment, CI, branch rules, license/governance, and architectural safety-boundary changes. See [GOVERNANCE.md](GOVERNANCE.md) and the bootstrap note in [`.github/CODEOWNERS`](.github/CODEOWNERS).

## Evidence and Qualification

Use the project test runner and focused checks described in the detailed guide. A passing source test is not proof of CI, provider acceptance, host deployment, restart/recovery, soak, paper, or live-execution qualification. Report what you ran and what remains unverified.

## Contribution Attestation

By submitting a pull request, you confirm that you have authority to submit the contribution and permit it to be used under this repository's [license](LICENSE). This is an attestation in the pull request; it is not a separate CLA or DCO program.

## Security Reports

Do not disclose suspected vulnerabilities, credentials, account information, active execution details, or host access paths in public issues, discussions, commits, or pull requests. Follow [SECURITY.md](SECURITY.md) for confidential reporting status and handling guidance.
