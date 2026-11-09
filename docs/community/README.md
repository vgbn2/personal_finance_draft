# Community & Contributor Portal

Welcome to the Sovereign Trading Platform community and contributor portal. This section provides onboarding guides, architectural walkthroughs, and collaboration standards for developers, researchers, and maintainers.

---

## 1. Getting Started

- [Comprehensive Contributor Guide](contributing.md): Complete guide to local zero-key development, native C++20 toolchains, subsystem extension recipes, testing matrix, and PR hygiene.
- [Tutorial 00: Quick Onboarding](../tutorials/00_quick_onboarding.md): Step-by-step learning tutorial for setting up your first development workspace.
- [Contributing & PR Hygiene Runbook](../how_to/contributing_and_pr_hygiene.md): Fast operational runbook for git worktrees, verification commands, and pull requests.

---

## 2. Governance & Community Policies

Sovereign is developed with strict adherence to security, technical honesty, and reproducible evidence.

- **[Code of Conduct](../../workspace/governance/CODE_OF_CONDUCT.md)**: Standards for respectful collaboration, technical truthfulness, and anti-cheating rules.
- **[Governance Model](../../workspace/governance/GOVERNANCE.md)**: Maintainer roles, core approval boundaries, and consensus procedures.
- **[Maintainers Roster](../../workspace/governance/MAINTAINERS.md)**: Domain maintainers and subsystem ownership mapping.
- **[Security Policy](../../workspace/governance/SECURITY.md)**: Confidential vulnerability reporting and credential isolation rules.
- **[Project Rules](../../workspace/governance/PROJECT_RULES.md)**: Architectural invariants, empirical proof requirements, and safety gates.

---

## 3. Subsystem Extension Points

| Subsystem | Primary Tech | Key Extension Points |
|---|---|---|
| **Native Core Engine** | C++20 / CMake | `backend/cpp_core/src/technical_indicators/`, `backend/cpp_core/src/risk_management/`, `backend/cpp_core/src/machine_learning/` |
| **Broker Gateways** | TypeScript / Node.js | `backend/execution/src/adapters/`, `backend/execution/src/polymarket/` |
| **Strategy & Indicators** | JavaScript (ESM/CJS) | `shared/lib/market/indicators.js`, `config/strategies/curated/` |
| **Terminal UI & CLI** | React 19 / Ink 5 / Node.js | `frontend/cli-tui/commands/`, `frontend/cli-tui/tui/manifest.js`, `frontend/cli-tui/sovereign_dashboard.mjs` |
| **Web Dashboard** | React 19 / Vite / Tailwind | `frontend/dashboard/src/components/panels/`, `frontend/dashboard/src/lib/` |
| **Documentation** | Diátaxis / MkDocs | `docs/tutorials/`, `docs/how_to/`, `docs/reference/`, `docs/explanation/` |
