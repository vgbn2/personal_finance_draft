# GitHub Environment & Repository Rulesets Guide

This document defines the configuration, branch protection rulesets, environment boundaries, secrets policy, and GitHub Actions CI matrix for the **Sovereign Trading Platform** repository (`personal_finance_draft`).

---

## 1. Branch Ruleset Configuration (`main` branch)

Repository administrators must configure the branch ruleset in GitHub under **Settings → Rules → Rulesets → New ruleset**.

| Setting | Recommended Value | Rationale |
|---|---|---|
| **Ruleset Name** | `Main Protection & Verification Gates` | Clear operational label. |
| **Enforcement Status** | `Active` | Full enforcement for all contributors. |
| **Target Branches** | `Default branch` (`main`) | Protect production release line. |
| **Require Pull Request** | Yes | All changes must arrive via PR. |
| **Required Approvals** | `1` (or 2 for multi-maintainer) | Peer verification before merge. |
| **Require Review from Code Owners** | Enabled (after populating real handles in `.github/CODEOWNERS`) | Enforces domain review boundaries. |
| **Dismiss Stale Approvals** | Enabled | Re-approves when new commits are pushed. |
| **Require Status Checks to Pass** | Enabled (`strict: true` / Require branches to be up to date) | Prevents merge skew and broken HEAD. |
| **Required Status Checks** | 1. `Committed source evidence`<br>2. `C++ release build`<br>3. `C++ debug sanitizer tests` | Automated continuous integration guarantees. |
| **Block Force Pushes** | Enabled | Protects append-only git history. |
| **Block Deletions** | Enabled | Prevents accidental branch removal. |

### 1.1 Branch Lifecycle & Automated Cleanup

To prevent stale branch accumulation and maintain clean git graph hygiene:

1. **GitHub Repository Merge Settings**:
   - In **Settings → General → Pull Requests**, enable **Automatically delete head branches**.
   - When a pull request is merged to `main`, GitHub will automatically delete the remote feature branch.

2. **Local Worktree & Branch Pruning Runbook**:
   After your pull request is merged into `main`, clean up your local worktree and branch:
   ```bash
   # 1. Switch to main repo root
   cd /path/to/personal_finance_draft

   # 2. Update main
   git checkout main
   git pull origin main

   # 3. Remove the local worktree
   git worktree remove .claude/worktrees/<worktree-name>

   # 4. Delete the local branch
   git branch -d <branch-name>

   # 5. Prune stale remote tracking references
   git fetch --prune

---

## 2. GitHub Environments & Secret Separation

GitHub Environments provide deployment protection rules and scoped credentials.

```text
┌────────────────────────────────────────────────────────┐
│             GitHub Actions Environments                │
├───────────────────┬────────────────────────────────────┤
│   `development`   │  - Open to PRs & Feature Branches  │
│                   │  - Zero Live Secrets (Mock/Dummy)  │
├───────────────────┼────────────────────────────────────┤
│   `hpdesk-paper`  │  - Alpaca Paper Sandbox Key        │
│                   │  - Virtual Paper Ledger Execution  │
├───────────────────┼────────────────────────────────────┤
│   `production`    │  - Isolated Host (hpdesk-1)        │
│   (Restricted)    │  - Real-Money Trading Keys         │
│                   │  - Required Manual Reviewers       │
└───────────────────┴────────────────────────────────────┘
```

### Environment Matrix

1. **`development` (Default CI)**:
   - **Protection Rules**: None (runs automatically on all pull requests).
   - **Secrets Required**: **Zero**. Tests run 100% keyless against fixtures (`tests/fixtures/`, `storage/data/cache/last_fetch.json`).

2. **`hpdesk-paper` (Staging / Paper Soak)**:
   - **Protection Rules**: Restricted to `main` branch.
   - **Allowed Secrets**:
     - `ALPACA_PAPER_API_KEY`: Free sandbox key from alpaca.markets.
     - `ALPACA_PAPER_API_SECRET`: Free sandbox secret.
   - **Safety Boundary**: Polymarket uses internal virtual cash ledger (`backend/gateway/src/paper_ledger.js`) requiring no Polygon wallet credentials.

3. **`production` (Live Execution Boundary)**:
   - **Protection Rules**: Required reviewer approval + deployment branches restricted to `main` with protected tag releases.
   - **Safety Rule**: Real-money credentials reside strictly on the isolated production hardware (`hpdesk-1`) and are **never uploaded to GitHub Secrets or CI runners**.

---

## 3. GitHub Actions Workflows

The repository maintains three GitHub Actions workflows in `.github/workflows/`:

| Workflow File | Trigger | Purpose & Gates |
|---|---|---|
| `.github/workflows/test.yml` | `pull_request`, `push` to `main` | 1. `Committed source evidence` (`npm run verify:committed-archive`) across all workspaces.<br>2. `C++ debug sanitizer tests` (`ctest` with AddressSanitizer/UndefinedBehaviorSanitizer). |
| `.github/workflows/build.yml` | `pull_request`, `push` to `main` | `C++ release build` (`cmake --build build/ci-release -DCMAKE_BUILD_TYPE=Release`). |
| `.github/workflows/deploy.yml` | `workflow_dispatch` (Manual only) | Central host readiness preflight (`node backend/scripts/ops/central_host_preflight.js`), Compose syntax validation, and zero-secret container build. |

---

## 4. CODEOWNERS & Maintainer Mapping

Domain ownership is defined in `.github/CODEOWNERS` and aligned with `workspace/MAINTAINERS.md`:

```text
# Default review owner
* @PRIMARY_OWNER_HANDLE

# Domain ownership
/backend/core/        @PRIMARY_OWNER_HANDLE @CPP_MAINTAINER_HANDLE
/backend/cli/         @PRIMARY_OWNER_HANDLE @APPLICATION_MAINTAINER_HANDLE
/backend/api/         @PRIMARY_OWNER_HANDLE @APPLICATION_MAINTAINER_HANDLE
/Frontend/dashboard/  @PRIMARY_OWNER_HANDLE @APPLICATION_MAINTAINER_HANDLE
/docs/                @PRIMARY_OWNER_HANDLE @DOCUMENTATION_MAINTAINER_HANDLE

# Core-maintainer-only boundaries (Risk, Execution, Auth, Infrastructure)
/backend/gateway/     @PRIMARY_OWNER_HANDLE
/shared/lib/auth/     @PRIMARY_OWNER_HANDLE
/shared/lib/runtime/  @PRIMARY_OWNER_HANDLE
/config/              @PRIMARY_OWNER_HANDLE
/infra/               @PRIMARY_OWNER_HANDLE
/.github/             @PRIMARY_OWNER_HANDLE
```

*Note: Replace `@PRIMARY_OWNER_HANDLE`, `@CPP_MAINTAINER_HANDLE`, `@APPLICATION_MAINTAINER_HANDLE`, and `@DOCUMENTATION_MAINTAINER_HANDLE` with real GitHub usernames or team slugs before enabling required CODEOWNERS review in GitHub settings.*

---

## 5. Security & Vulnerability Handling

- **Private Vulnerability Reporting**: Repository administrators should enable **Private vulnerability reporting** in GitHub under **Settings → Code security and analysis**.
- **Public Disclosures Prohibited**: Do not open public issues for potential security vulnerabilities, leaked keys, or execution bypasses. Follow [workspace/SECURITY.md](../../../workspace/SECURITY.md).

---

## 6. Canonical Skill Protocols for Pull Requests & Verification

Contributors, code reviewers, and AI coding agents (Claude, Codex, Gemini) follow the repository's canonical skill protocols in `skills/manifest.json` across the PR lifecycle:

| Lifecycle Phase | Developer / Reviewer Action | Canonical Skill Protocol | Enforced Safety & Verification Gate |
|---|---|---|---|
| **Authoring & Refactor** | Implementing approved features/fixes | `skills/mass-implement/SKILL.md` | Bounded blast radius, zero-key development preservation. |
| **Test Integrity Scan** | Pre-PR anti-cheating verification | `skills/verify-test-integrity/SKILL.md` | Scans for Release-elided assertions (`assert()`) and swallowed mocks. |
| **Native Core Verification** | Native engine & CTest checks | `skills/native-core-verify/SKILL.md` | 34/34 CTests pass with sanitizer validation (`npm run test:core`). |
| **Hygiene & Docs Audit** | Clean tree & Atlas consistency | `skills/repo-hygiene/SKILL.md`<br>`skills/audit-documentation/SKILL.md` | `npm run hygiene` (0 noise) + `npm run audit:documentation` (100% manifest match). |
| **PR Review & Audit** | Code owner / security audit | `skills/blast-through/SKILL.md` | Single-mode audit (`review`, `security`, `connective-tissue`) with 6-tuple fault attribution. |
| **CI Failure Triage** | Debugging build/test failures | `skills/bayesian-troubleshooter/SKILL.md` | Hypothesis ranking & evidence-based binary search before editing code. |
| **Architecture & Atlas Sync**| Boundary & schema shifts | `skills/codebase-untangler/SKILL.md` | Updates Code Atlas records (`docs/atlas/`) and manifest contracts. |

