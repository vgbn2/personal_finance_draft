# Governance

## Purpose

This document defines how Sovereign is maintained as a controlled multi-maintainer repository. It enables broad source collaboration without expanding authority over credentials, providers, hosts, deployment, or execution.

Current technical direction remains in [`workspace/STATE.md`](workspace/STATE.md). This document governs decision-making and review; it is not a second roadmap.

## Roles

### Core Maintainer

Core Maintainers steward repository policy and operational boundaries. They may approve or veto changes affecting:

- live or paper execution policy, broker gateways, risk limits, or kill switches;
- provider credentials, secret handling, service principals, and authentication;
- production or private-host deployment, infrastructure, backups, and recovery;
- GitHub Actions, protected branches, repository permissions, security policy, and release controls;
- the license, governance documents, or architectural safety boundaries.

### Domain Maintainer

Domain Maintainers review work in assigned source areas, keep module contracts and tests current, and escalate changes that cross a Core Maintainer boundary. Domain ownership does not grant operational credentials or deployment authority.

### Contributor

Contributors may propose and implement focused changes through pull requests. They follow the active phase, evidence requirements, contribution attestation, and review process.

## Decisions and Review

- Prefer focused pull requests with evidence over broad, coupled changes.
- Seek agreement among affected domain maintainers for ordinary module work.
- Escalate cross-domain, safety, security, or operational changes to a Core Maintainer before merge.
- A Core Maintainer may block a change that lacks evidence, crosses a protected boundary, conflicts with current project direction, or threatens safety or license obligations.
- Disagreements should state the relevant contract, evidence, trade-off, and proposed resolution. If unresolved, a Core Maintainer makes the final repository decision.

## Protected Boundaries

No pull request, approval, or repository role authorizes an order, provider mutation, canonical-data write, host change, deployment, or credential use. Those activities require the separate runtime-policy, authorization, risk, credential, and operator review described by the repository's operational guidance.

## Repository Administration Checklist

After real maintainer identities replace all placeholders in [`MAINTAINERS.md`](MAINTAINERS.md) and [`.github/CODEOWNERS`](.github/CODEOWNERS), a repository administrator should:

1. Protect `main`: require pull requests, at least one approval, and CODEOWNERS review for protected paths.
2. Require the existing checks: `C++ release build`, `Committed source evidence`, and `C++ debug sanitizer tests`.
3. Block force pushes and branch deletion; select and document a merge strategy.
4. Enable GitHub private vulnerability reporting before advertising it as an active report channel.
5. Keep GitHub Actions permissions minimal and preserve `deploy.yml` as a manual readiness-only workflow unless separately reviewed.

Do not enable required CODEOWNERS review while placeholders remain: placeholder accounts do not provide valid review enforcement.

## Scope of This Policy

This policy does not create a GitHub Project board, a CLA service, DCO enforcement, automated labeling, expanded CI gates, provider redistribution rights, remote-public product access, multi-tenant operation, deployment qualification, Paper qualification, or live-execution qualification.
