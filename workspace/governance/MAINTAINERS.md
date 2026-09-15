# Maintainers & Subsystem Roster

This roster documents subsystem domain ownership and review responsibility following the Linux Kernel `MAINTAINERS` convention.

All entries use placeholder handles (`@HANDLE`) until real GitHub users/teams are assigned. Replace placeholders before enforcing `.github/CODEOWNERS` or branch protections.

```text
----------------------------------------------------------------
CORE SYSTEM & GOVERNANCE
M: Core Maintainer <@PRIMARY_OWNER_HANDLE>
S: Maintained
F: .github/
F: config/
F: infra/
F: workspace/
F: package.json
F: CMakeLists.txt

NATIVE C++ ENGINE & RISK SUBSYSTEM
M: C++ Core Maintainer <@CPP_MAINTAINER_HANDLE>
S: Maintained
F: backend/core/
F: tests/core/

APPLICATION GATEWAY, CLI & DASHBOARD
M: Application Maintainer <@APPLICATION_MAINTAINER_HANDLE>
S: Maintained
F: backend/api/
F: backend/cli/
F: backend/gateway/
F: backend/mcp_server/
F: Frontend/dashboard/
F: shared/

QUANTITATIVE STRATEGY & MARKET RESEARCH
M: Quant Maintainer <@QUANT_MAINTAINER_HANDLE>
S: Maintained
F: config/strategies/
F: config/markets/
F: scripts/strategies/
F: docs/research/

DOCUMENTATION & DEVELOPER EXPERIENCE
M: Documentation Maintainer <@DOCUMENTATION_MAINTAINER_HANDLE>
S: Maintained
F: docs/
F: CONTRIBUTING.md
F: README.md
----------------------------------------------------------------
```

A role assignment grants review responsibility, not credentials, host access, deployment control, or execution authority.

## Onboarding

Before adding a maintainer:

1. Verify their GitHub identity and repository-access level.
2. Agree on the source domains and review expectations they own.
3. Replace the relevant placeholder in this file and [`.github/CODEOWNERS`](.github/CODEOWNERS) with a real GitHub user or team.
4. Configure protected-branch and required-review settings only after valid owners are present.
5. Share the contributor, governance, security, architecture, and testing guidance.
6. Confirm explicitly that repository access does not include credentials, provider accounts, private hosts, deployments, or execution authorization.

## Offboarding

When a maintainer leaves:

1. Remove or reduce their repository access in GitHub.
2. Remove them from CODEOWNERS and update this roster.
3. Review whether any team membership, workflow permission, secret access, provider account, host access, or external integration was ever granted separately; revoke it through its owning system.
4. Reassign review responsibility before leaving a sensitive path without an owner.

## Administrator Notes

The maintainer roster is source-controlled documentation, not GitHub access control. Repository administrators must apply branch protection, team membership, private vulnerability reporting, and any external access changes in GitHub or the owning credential/host system.
