# Security Policy

## Supported Versions

Only the latest commit on `main` receives security fixes.

| Version | Supported |
|---------|-----------|
| `main` (latest) | ✅ |
| older commits | ❌ |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Use [GitHub private vulnerability reporting](https://github.com/vgbn2/personal_finance_draft/security/advisories/new) to submit a report confidentially.

Include:
- A description of the vulnerability and its potential impact
- Steps to reproduce or proof-of-concept (if safe to share)
- Affected component (ingestion, broker gateway, API, CLI, C++ core, dashboard)

### Response timeline

| Stage | Target |
|-------|--------|
| Acknowledgement | 3 business days |
| Triage & severity assessment | 14 business days |
| Fix or workaround | Depends on severity |

## Scope

In scope for security review:
- Credential handling and secrets isolation
- Broker gateway execution paths (Alpaca, Gate.io, Polymarket)
- Trade PIN and authorization gate (`shared/lib/auth/`)
- Runtime policy enforcement and feature gates
- API authentication and session management

Out of scope (no real funds or external connectivity):
- Paper ledger logic (virtual only, no real money)
- Backtest-only code paths
- Local CLI research commands with no network exposure
- Development fixtures (`tests/fixtures/`, `storage/data/cache/`)

## Security architecture notes

- Real-money execution credentials reside **only** on the isolated production host (`hpdesk-1`) and are never committed to this repository.
- All local tests run keyless against recorded fixtures; zero external API keys are required.
- The `shared/lib/auth/` module enforces explicit PIN-gated authorization before any live execution path is reached.
