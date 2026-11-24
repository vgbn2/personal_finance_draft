# SearXNG Private Deployment & Preflight Architecture

## Overview
This service captures the previously unmanaged `sv-searxng` container on CT114 under source-controlled Docker Compose definition (`compose.yml`), constraining external port exposure strictly to IPv4 loopback (`127.0.0.1:8888:8080`).

## Exposure & Security Model
- **Bound Socket:** `127.0.0.1:8888:8080/tcp` (IPv4 loopback only).
- **Network Mode:** `bridge` (preserves container runtime environment on Docker default bridge).
- **Secrets Projection:** `SEARXNG_ENV_FILE` points to a host-only mode `0600` file with `format: raw`, providing `BASE_URL` and `SEARXNG_SECRET`.
- **Classification:** Classified as `developer` profile under `process_internal` scope in `configs/system/environment_manifest.json`.

## Volume Inventory
The container mounts two pre-existing external anonymous volumes:
1. `search-config` (`a95e0f51192da50204771df5364a36bf570e7e6a0bdd4671c118106e8f94c600`): `/etc/searxng` (uid 977, gid 977)
2. `search-cache` (`f604a8165306fc84e0832bbe557ed4494746c51ddf0def48590323b91bb11017`): `/var/cache/searxng` (uid 977, gid 977)

## Cutover Gate & Rollback Invariants
Live container cutover is currently **BLOCKED** pending operator resolution of client routing:
1. **Bridge IP Volatility:** `sv-searxng` currently holds IP `172.17.0.2` on the default Docker bridge. Docker's default bridge does not support static IP assignment via `--ip` (which requires a user-defined network). Recreating the container may change this IP.
2. **Consumer Route Identification:** None of the active application containers on CT114 (`sv-bot-alpaca-paper`, `sv-web`, `sv-quant`, etc.) reside on the default `bridge` (they reside on `sv_internal-net`), nor do they contain environment references to port 8888 or SearXNG. Standalone external LAN consumers connecting to `http://<host-ip>:8888` will be cut off by loopback binding unless routed through an SSH tunnel or a reverse proxy.
3. **Volume Single-Writer & Offline Inventory:** The original container and the candidate cannot share writable volumes concurrently. Pre-cutover requires:
   - Halting `sv-searxng`
   - Disabling its restart policy (`docker update --restart=no`)
   - Creating offline tarball archives with `--numeric-owner`
   - Reverting volume state from archives before restarting original if candidate fails
