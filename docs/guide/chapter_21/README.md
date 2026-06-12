# Chapter 21 - Deployment And Operations

## Goal

This chapter explains how the system runs outside a development shell and why deployment is not the same thing as correctness.

A build can succeed while the runtime is still broken. Operations work begins where local code confidence ends.

## What You Are Building

You are building a basic operational path that can:

- run the system locally in a reproducible way
- package it for deployment
- inject runtime configuration safely
- verify service health after startup

## Prerequisite Concepts

You should already understand:

- health and status routes
- local-first configuration
- runtime data boundaries
- why live execution must be guarded

## Language Proficiency Required

- JavaScript/Node.js: beginner
- Docker: beginner
- Shell/PowerShell: beginner

## Library And Tool Requirements

- Docker Desktop
- compose support
- env files

## Beginner Translation Box

- `image`: a packaged application template used to start containers
- `container`: a running instance of that image
- `health check`: a test that asks whether the service is actually alive
- `runtime config injection`: supplying environment values at start time instead of hardcoding them

## Why Deployment Comes Late

Deployment is late in the roadmap because it assumes:

- the app already works locally
- status and health surfaces exist
- config loading is clear
- dangerous actions are still gated

If those are not true, deployment mostly makes the failures harder to inspect.

## Local Run Vs Deployed Run

Local run helps you debug quickly.

Deployed run helps you verify:

- startup reproducibility
- environment handling
- runtime health behavior

They serve different goals. Passing one does not automatically prove the other.

## Docker As A Packaging Boundary

Docker is useful because it bundles:

- runtime files
- dependency installation
- startup command

That does not guarantee the app is healthy. It only standardizes how the app is started.

## Minimum Working Slice

The minimum slice for this chapter:

- one local run path
- one Docker or packaged run path
- one health endpoint check after startup

That is enough to prove the system can leave the developer shell without becoming opaque.

## Step-By-Step Build

1. Confirm the app runs locally.
2. Define the image or startup packaging path.
3. Pass configuration through env files or environment variables.
4. Start the service.
5. Call the health endpoint.
6. Confirm health and runtime status, not just process existence.

## Contracts And Interfaces

The operational layer should guarantee:

- secrets are supplied at runtime, not baked into source
- startup commands are reproducible
- health checks reflect real service readiness
- failure logs are inspectable

That is the difference between a shippable system and a demo that only works on one machine.

## Tests And Verification

Check Docker tooling first:

```powershell
docker --version
docker compose version
```

Then start the local or containerized service and verify health:

```powershell
curl http://localhost:3000/health
```

Expected outcome:

- Docker commands return versions if the tooling is healthy
- the health endpoint returns a small success payload once the app is actually ready

Example:

```json
{
  "ok": true,
  "service": "sovereign-web"
}
```

## Expected File Tree

```text
infra/
  docker/
backend/
  api/
docs/
  operational/
```

## Common Failure Modes

- the image builds but the app crashes at runtime
  Fix: separate build success from runtime health.
- secrets are copied into the image
  Fix: inject them at runtime.
- the process is running but the service is not ready
  Fix: use health checks, not process existence alone.

## Do Not Build Yet

- automatic cloud rollout
- live-money unattended production jobs
- hidden startup scripts with undocumented behavior

## Checkpoint Exercise

Explain the difference between these three statements:

- the code compiles
- the container starts
- the service is healthy

If you treat them as identical, deployment reasoning is still weak.

## Done Criteria

This chapter is done when you can explain:

- why deployment comes late
- what Docker solves and does not solve
- why runtime config injection matters
- why health checks are stronger evidence than a running process
