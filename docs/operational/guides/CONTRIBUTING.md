# Contributing to Sovereign Trading Platform

This guide defines the contribution workflow, zero-key development model, and canonical skill protocols for human contributors, reviewers, and AI coding assistants working in this repository.

The repository-level [contribution entrypoint](../../../workspace/CONTRIBUTING.md) defines the pull-request workflow, contribution attestation, protected operational boundaries, and links to [governance](../../../workspace/GOVERNANCE.md), the [maintainer roster](../../../workspace/MAINTAINERS.md), and the [security policy](../../../workspace/SECURITY.md).

---

## 1. Quick Start & Zero-Key Setup

The repository is pure **Node.js (v20+)** and **C++20 (CMake 3.15+)**. No Python virtual environments (`venv`) or external API keys are required for development, testing, or strategy research:

```bash
# Automated setup (installs workspaces, compiles native C++ core, seeds fixtures, runs tests)
npm run setup:dev
```

---

## 2. Canonical Skill Protocols for Contribution

All contributions, reviews, and bug triages reuse the repository's canonical skill protocols (`skills/manifest.json`):

```text
┌───────────────────────────┬────────────────────────────────────────────────────────┐
│ Contribution Step         │ Protocol / Skill Command                               │
├───────────────────────────┼────────────────────────────────────────────────────────┤
│ 1. Feature / Refactor     │ skills/mass-implement (bounded radius, zero-key safety)│
│ 2. Pre-PR Test Integrity  │ skills/verify-test-integrity (anti-cheating test audit)│
│ 3. Native C++ Core Verify │ skills/native-core-verify (34/34 CTests pass)          │
│ 4. Hygiene & Docs Sync    │ skills/repo-hygiene & skills/audit-documentation       │
│ 5. PR Review & Audit      │ skills/blast-through (single-mode review with fault ID)│
│ 6. Failure Triage         │ skills/bayesian-troubleshooter (binary probe triage)   │
│ 7. Architecture Sync      │ skills/codebase-untangler (Code Atlas record sync)     │
└───────────────────────────┴────────────────────────────────────────────────────────┘
```

---

## 3. Git Branch & Worktree Workflow

1. **Create an isolated worktree for your feature**:
   ```bash
   git worktree add .claude/worktrees/<feature-name> -b feat/<feature-name>
   cd .claude/worktrees/<feature-name>
   ```

2. **Verify tests before submitting**:
   ```bash
   npm run hygiene
   npm run audit:documentation
   npm run test:structure
   npm run test:core
   npm run test:data
   npm test
   ```

3. **Open a Pull Request**:
   - Follow the template in `.github/PULL_REQUEST_TEMPLATE.md`.
   - Ensure the automated status checks pass.

4. **Post-Merge Cleanup**:
   ```bash
   cd /path/to/personal_finance_draft
   git checkout main
   git pull origin main
   git worktree remove .claude/worktrees/<feature-name>
   git branch -d feat/<feature-name>
   git fetch --prune
   ```

---

## 4. Code & Evidence Standards

- **C++20**: Prefer standard-library constructs. Public headers in `backend/core/include/`, implementations in `backend/core/src/`, tests in `backend/core/test/`.
- **Node.js**: Native test runner (`tests/run_node_tests.js`). No external testing framework dependencies.
- **Evidence Disclosure**: Every pull request must list exact commands run, record counts, and state what was not run.




