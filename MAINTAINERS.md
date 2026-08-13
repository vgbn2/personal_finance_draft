# Maintainers

This roster deliberately uses placeholders until verified GitHub users or teams are selected. Replace every placeholder before enabling GitHub CODEOWNERS enforcement or granting repository permissions.

| Role | GitHub owner | Review scope |
|---|---|---|
| Core Maintainer | `@PRIMARY_OWNER_HANDLE` | Repository governance, sensitive boundaries, release and operational policy |
| C++ Core Maintainer | `@CPP_MAINTAINER_HANDLE` | `backend/core/` analytics, backtesting, and risk contracts |
| Application Maintainer | `@APPLICATION_MAINTAINER_HANDLE` | CLI/TUI, API, dashboard, and ordinary application integration |
| Documentation Maintainer | `@DOCUMENTATION_MAINTAINER_HANDLE` | Documentation, module maps, and contributor guidance |

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
