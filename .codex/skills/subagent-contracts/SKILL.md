---
name: subagent-contracts
description: Delegation skill for splitting work across subagents with clear ownership, non-overlapping file sets, and concrete deliverables.
---

# Subagent Contracts

Use this skill when work is split across subagents.

## Rule

Each subagent must own a disjoint slice of work and return a concrete artifact.

## Contract

- assign one clear responsibility per agent
- avoid overlapping file ownership
- do not duplicate discovery work
- do not ask two agents to solve the same unknown unless you are comparing outputs on purpose
- require changed file paths, verification results, and open risks in the final report

## Good Split

- one agent for CLI or orchestration
- one agent for data/providers
- one agent for tests or verification
- one agent for docs or cleanup

## Bad Split

- many agents touching the same files
- many agents re-reading the same evidence
- many agents without a final integration pass

## Output Rule

The main agent must reconcile the results and decide what remains unverified.

Codex and Gemini must follow the same standard.
