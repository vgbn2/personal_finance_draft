# Session 92 Zero-Cost Host and Trust Recovery Plan

Date: 2026-07-23
Scope: planning only; current Lenovo laptop remains a test bench

## Current evidence

- Integrity: 92/92 configured assets cached, 0 missing, 87 required windows stale, 9 cadence-plausible grain
  notices, 0 unexplained grain, and 1 declared exception.
- DCS: `0.716` from freshness `5/92`, schema `1.0`, and coverage `1.0`.
- Local `storage/` footprint: approximately 20 GB.
- Full-universe deployment floor: 8 GB RAM; the backfill container permits a 6 GB V8 old-space.
- Current repository proof: hygiene pass, structure pass, focused deployment 11/11, and clean-`HEAD` archive
  deployment/preparation 2/2.
- Current laptop: explicitly excluded from persistent hosting, Docker-daemon enablement, timer installation,
  and continuous polling.

The lowest-scoring factor is freshness. Model/schema promotion and real-capital use remain halted.

## Zero-cost decision

Official-source research is recorded in
`workspace/research/zero_cost_persistent_host_options_2026-07-23.json`.

1. **Primary:** a separate user-owned amd64 Ubuntu machine with at least 8 GB RAM and 40 GB usable persistent
   storage; prefer 4 CPU threads/cores and 80 GB SSD.
2. **Conditional fallback:** Oracle Always Free A1 only after arm64 image support and a measured reduced
   workload prove that 2 OCPU/12 GB can stay fresh.
3. **Not persistent-host solutions:** Google permanent free e2-micro, AWS/Google trial credits, GitHub Actions,
   Render Free, Railway Free, and Fly.io.

The project history already mentions an old Ubuntu PC. Its availability and hardware are unverified, so it is
the first evidence gate rather than an assumed host.

## Batch 0 - Qualify the spare Ubuntu machine

Collect read-only evidence on that machine:

```bash
uname -m
lscpu
free -h
lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINTS
df -h
systemctl is-enabled ssh
systemctl is-active ssh
```

Decision gate:

- Select it only if it is separate from the Lenovo test bench, amd64/x86_64, has at least 8 GB RAM, at least
  40 GB usable persistent disk (80 GB preferred), reliable power/network, and can remain awake.
- If it misses RAM or disk minimums, do not silently reduce the production universe. Write a measured reduced-
  profile proposal or stop.
- Confirm whether the previous no-data-transfer decision still applies before copying any cache.

## Batch 1 - Bootstrap a private, reproducible host

1. Install Ubuntu security updates, Docker Engine/Compose v2, system-wide Node 22, Git, `flock`, and `curl`.
2. Create a non-root deployment user and a read-only Git credential.
3. Clone `origin/main`; require clean `main` at the exact remote commit.
4. Generate owner-only `.env.central` with the allowlist helper; include data/research settings only.
5. Keep port 8787 on loopback or a personal private VPN. Never add public port forwarding.
6. Create a backup target and prove one restore before continuous polling.

Acceptance:

- Central preflight passes every check.
- No execution PIN, wallet private key, Polymarket L2 secret, or live authorization is present.
- Reboot preserves storage and restores Docker availability.

## Batch 2 - First deployment without historical shrink

1. Run `infra/docker/update-central-host.sh` manually.
2. Require healthy `web` and exactly one running `backfill` writer; `bot` remains absent.
3. Honor the earlier no-data-transfer decision by default: rebuild provider data on the host unless the operator
   explicitly changes that decision.
4. Capture starting coverage, provider errors, disk usage, and daemon status before the first long catch-up.
5. Stop if any merge/write path shrinks existing history or produces unexplained grain.

Acceptance:

- API health succeeds through loopback/private access.
- Only one canonical writer exists.
- Storage remains mounted across recreate/reboot.
- Every transformation has an integrity record.

## Batch 3 - Freshness catch-up and soak

1. Let the writer catch up in bounded family lanes.
2. Record family/symbol counts, last timestamps, failures, and disk growth after each cycle.
3. Run `backend integrity --json` after catch-up and after a reboot/restart.
4. Require DCS at least `0.95`, no missing assets, no unexplained grain, and no unapproved stale required windows.
5. Run a 24-hour minimum soak before calling the host persistent; extend to 72 hours if provider throttling or
   retries occur.

Acceptance:

- Freshness is policy-green on the target host.
- Writer status advances across cycles.
- No bin shrinks and no lock residue remains.
- Backup/restore and restart evidence are recorded.

## Batch 4 - Enable reviewed updates

Only after the first deploy and soak:

1. Install the five-minute systemd updater.
2. Verify noninteractive `git fetch`, timer state, journal output, and retry-after-failure behavior.
3. Keep developer machines push-only; they do not mount or write target storage.
4. Obtain authenticated GitHub Test/Build/Readiness evidence separately; GitHub remains CI, not hosting.

## Batch 5 - Conditional Oracle Arm experiment

Run only if no qualifying spare machine exists:

1. Make ONNX Runtime package selection architecture-aware or define a deliberately ONNX-disabled central image.
2. Prove a clean arm64 image build, native load, Compose startup, and restart.
3. Benchmark a measured profile under the current 2 OCPU/12 GB Always Free allowance.
4. Reject the option if freshness, disk, capacity availability, or idle-reclamation risk cannot meet the same
   integrity contract.

## Noncritical audit cleanup after the host/MCP gates

- Add the documented Supabase variables to `Frontend/dashboard/.env.example`.
- Make `backend/api/package.json` declare its direct Supabase SDK dependency or explicitly remove its standalone
  package claim; correct the stale Dockerfile comment.
- Align `docs/engineering/stack_manifest.md` and `rust_mirror_status.md` with the recorded retire/archive decision.
- Remove the already-confirmed stale `scripts/dev/run_automated_strategies.js` and TradingView screener export
  only under a separately approved cleanup batch.
- Keep the schema-3 combined actionable engine graded D/nonexistent until a production exact-asset composer
  replaces fixture-only CLI/API selection and passes stale/missing/mismatched-factor rejection.

