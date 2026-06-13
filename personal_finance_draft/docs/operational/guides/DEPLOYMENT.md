# Deployment Plan

Deployment is still local-first. The repo does not ship a public production service yet, but the local prototype now has a buildable CLI, web/API bridge, and repo-local state files that make packaging work easier to stage later.

## Current Status

Current runtime remains local-only.

Current runtime:

- local prototype docs and starter assets
- optional legacy local executable
- optional local config examples
- no network access
- Supabase-backed database/auth available when local or deployment env vars are provided
- secrets required for deployment targets that use Supabase or protected write routes
- no deployment target

## Deployment Goals

Later phases may need:

- reproducible release builds
- Docker images
- CI build and test jobs
- artifact publishing
- environment-specific config
- secrets handling
- monitoring and operational logs

## Deployment Shape

The current build is organized for local verification first:

- CLI commands run locally against recorded or cached data.
- The web/API bridge is a local inspection surface.
- C++ and Node modules are wired for local test runs before any packaging work.
- Generated artifacts should stay out of source control.

## Future Production Requirements

Before any live execution deployment, the project must have:

- dry-run mode
- explicit live flag
- confirmation gate
- credential storage policy
- audit logs
- kill switch behavior
- connection failure behavior
- rollback procedure

## Docker Status

Docker is optional for the local prototype and should not be required for ordinary repo verification.

The repo now includes a local container starter under `docker/`:

- `docker/Dockerfile` builds the web/API bridge on top of `node:22-slim`
- `docker/docker-compose.yml` runs the web service on port `8787`
- `docker/.dockerignore` keeps build outputs, logs, and notebook/data noise out of the image context

The container starter is for reproducibility and local packaging, not a replacement for direct CLI verification.

## Secrets Policy

The current local prototype should not need live secrets for ordinary validation.

Future deployment work must never hardcode credentials. Credentials should come from an approved secret source such as environment variables, a local encrypted store, or a deployment secret manager.

## Starter Manifests

The repo now includes starter deployment assets under `deployment/`:

- `deployment/heroku/` for a Node process entrypoint and environment hints
- `deployment/kubernetes/` for a web/API deployment, config map, and service
- `deployment/terraform/` for managing the Kubernetes web surface from variables and outputs

These are intentionally web-first and assume the local dashboard bridge is the supported runtime target until the live execution stack is promoted.

Kubernetes starter manifests now expect a `sovereign-supabase` secret with `url`, `publishable_key`, and `secret_key` keys when the web/API bridge is deployed with Supabase-backed private data enabled.
