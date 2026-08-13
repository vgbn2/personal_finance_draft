# Security Policy

## Reporting Status

This project intends to accept confidential reports through GitHub private vulnerability reporting. A repository administrator must enable that GitHub feature before it is an active reporting channel. Until then, do **not** assume this repository has a confidential reporting channel or disclose sensitive details in a public issue, discussion, commit, or pull request.

When private reporting is enabled, use the repository's GitHub **Report a vulnerability** flow. Do not include secrets in the report unless GitHub's private reporting flow and the receiving maintainer explicitly request the minimum necessary redacted evidence.

## What to Report

Examples include:

- authentication, authorization, session, secret-handling, or permission-boundary defects;
- unsafe access to provider credentials, private hosts, or restricted artifacts;
- bypasses of execution, risk, runtime-policy, or kill-switch controls;
- CI, deployment, dependency, or supply-chain weaknesses that materially affect repository security;
- data exposure that could reveal private account, host, or execution information.

Do not use public issues for suspected vulnerabilities. Public feature requests, ordinary bugs without sensitive impact, and documentation corrections belong in the appropriate issue template.

## Report Contents

Provide the smallest safe reproduction that explains the issue:

- affected version, commit, or path;
- impact and preconditions;
- reproducible steps or a proof of concept that avoids provider mutations, orders, data writes, host changes, and credential exposure;
- suggested mitigation, if known.

Never publish API keys, tokens, account identifiers, raw headers, private URLs, production logs, or active execution details.

## Handling Expectations

Maintainers will triage reports privately, request only necessary redacted evidence, and coordinate a remediation and disclosure approach appropriate to impact. Response timing depends on maintainer availability and report severity; this policy makes no service-level guarantee.

## Scope Boundaries

This policy does not authorize testing against third-party providers, accounts, production hosts, or live/paper execution paths. Obtain explicit written authorization from the relevant system owner before performing any such testing.
