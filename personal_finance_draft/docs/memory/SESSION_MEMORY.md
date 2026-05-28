# Session Memory Index

This file tracks project-specific, volatile findings and current session state.
For persistent, durable project protocols, refer to `.codex/skills/repo-global-protocol/SKILL.md`.

## Active Findings & Risks
- **Security (Web Server):** Bound to `127.0.0.1`. Do not override without adding authentication.
- **CI/CD:** Pipelines defined in `.github/workflows` but require remote push to trigger.
- **Backfill Engine:** `fetchParallelBackfill` in `scripts/lib/backfill.js` needs deep logic validation for temporal stitching.
- **Provider Migration:** Legacy `ingestMarketData.js` overlap with `lib/providers/` modularization needs final cleanup pass.

## Recent Task Log
- **2026-05-22**: Completed structural CLI reorganization, path reconciliation, and integration of DCS audit into procedural workflows.

- **2026-05-23**: Updated testing policy to require visible data-flow evidence in integration/regression output and explicitly aligned the standard for both Codex and Gemini.



- **2026-05-23**: Added the agentic coding hard copy and new repo skills: evidence-first-testing, subagent-contracts, technical-debt-ledger, and verification-gates.

- **2026-05-23**: Added docs/agentic_coding.md and linked it from the docs index and contributor guide as the human-facing summary of the agentic coding standard.

