---
name: multi-agent-research
description: Orchestrate parallel research workers for backend, CLI, and frontend planning while keeping context small.
---

# Multi-Agent Research

Use this skill when a task benefits from splitting into focused agents.

## When To Use

- Backend implementation or architecture needs one thread.
- CLI testing or report generation needs a second thread.
- Frontend/page wiring or documentation review needs a third thread.

## Workflow

1. Read the current handoff or session memory first.
2. Spawn one worker per bounded responsibility.
3. Give each worker a narrow deliverable and explicit ownership.
4. Tell workers not to revert other agents' edits.
5. Collect only concrete findings, commands run, and file paths changed.
6. Synthesize the results before editing shared glue.

## Suggested Worker Roles

- Backend worker: implement or plan the core code path.
- CLI worker: run focused tests and capture output.
- Frontend worker: inspect the page or UI and identify integration points.
- Research worker: find alternative data sources or API coverage.

## Output Format

Return:

- active agents and their roles
- what each agent is responsible for
- file paths touched or inspected
- the next local action on the critical path

