# CodePTIT Remote Sync And Private-Defense Plan

Status: mass-implement preflight complete; no sync script, remote connection, timer, or host service was changed

Lifecycle: `proposed -> preflight`; Batch 1 is `GO WITH FIXES` pending user inputs, Batches 2–3 are `NO-GO`

Date: 2026-07-28

## Objective

Maintain an operator-controlled, one-way mirror of `/home/vgbn1/Documents/codeptit` on a second machine when
that machine is reachable, without treating file replication as deployment, backup, or security qualification.

The sync command will live in the canonical workstation toolkit at
`/home/vgbn1/Documents/codeptit/bash`, not inside the Sovereign application repository.

## Defense Model

Use the supplied military analogies only as defensive threat-model vocabulary:

| Analogy | Repository/host requirement |
|---|---|
| Choke point | The web API remains loopback/private and is reached through SSH or an access-controlled VPN. |
| Defense in depth | SSH authentication, host permissions, private API auth, separate service/MCP credentials, and application capabilities must all remain independent layers. |
| Decoy/sandbox | Any future hostile-input or release rehearsal uses disposable fixtures or a separate sandbox, never production data or credentials. |
| Reconnaissance | Inventory the exposed surface and dependency advisories before widening access; do not add offensive scans or traffic generation. |
| Segmentation | The remote mirror is a distinct host boundary; a synced checkout does not inherit local process state, secrets, authority, or readiness. |

## Current Evidence

- The remote CodePTIT copy exists and the Sovereign checkout is on `main` at `e78e1788`.
- The SSH host passed static Compose validation; no application listener or container was started.
- The workstation toolkit source is `/home/vgbn1/Documents/codeptit/bash` and its existing
  `tools/sync-to-home.sh` only mirrors that toolkit to `/home/vgbn1/bash`.
- Sovereign security release remains blocked by the documented dependency and operational gates. A sync script
  must not bypass those gates or enable public access, a writer, a bot, or live execution.

## In Scope

1. Add a readable Bash command under `bash/tools/` for a one-way local-to-remote CodePTIT sync.
2. Detect remote availability with an authenticated SSH no-op using `BatchMode=yes` and a short connection
   timeout. ICMP ping alone is informational only and never authorizes a transfer.
3. Validate a fixed remote root with canonical path plus a sentinel, then validate every selected nested Git
   repository separately; fail closed on an unexpected, symlinked, divergent, or non-writable target.
4. Use rsync with an explicit safe option set: archive semantics without owner/group restoration, safe links,
   protected arguments, delayed updates, fixed validated paths, and `--` before path operands. Dry-run remains
   the default and `--apply` is required for writes.
5. Produce a compact local log containing timestamp, target alias, preflight status, Git revisions, dry-run or
   apply mode, exit status, and file counts; never log tokens, environment values, or private key paths.
6. Add `--status` and `--dry-run` commands plus a local `flock` from Batch 1 so concurrent invocations cannot
   overlap. A scheduler is deferred until manual sync and recovery behavior are demonstrated.

## Decisions Required Before Implementation

1. **Direction:** local machine -> remote mirror only is the safe default. Bidirectional sync is out of scope
   because it can silently overwrite divergent work.
2. **Deletion semantics:** deletion is out of scope. A future mirror mode is NO-GO until per-repo backup,
   recovery, divergence, and per-run deletion confirmation are proven.
3. **Sensitive/local-only content:** decide whether `.env*`, `storage/`, `node_modules/`, build output, and
   runtime state are excluded, copied read-only, or handled by a separate encrypted backup workflow. The default
   plan excludes secrets and runtime state from automatic replication.
4. **Remote selector:** use a preconfigured SSH host alias rather than embedding a raw IP, password, or private
   key option in the script.
5. **Git metadata:** exclude `.git/` from rsync. Inventory selected nested repositories and report their local
   and remote revisions separately; never copy live Git metadata during a worktree sync.

## Out Of Scope

- Reverse sync, conflict resolution, automatic deletion, Wake-on-LAN, password automation, public exposure,
  service/container startup, provider polling, data writes, trading, backup/restore claims, or a systemd timer.
- Offensive reconnaissance, flooding, exploit testing, or honeypot deployment.
- Treating `rsync` success as a test of runtime parity, Supabase/RLS, MCP, one-writer, or recovery readiness.

## Ranked Batches

### Batch 1 — safe manual source sync (`GO WITH FIXES`)

- Create the command with `--status`, default dry-run, and explicit `--apply`.
- Require SSH preflight, fixed-root sentinel validation, per-repo identity checks, safe-link enforcement, and a
  non-overlapping local lock before rsync.
- Exclude `.git`, every non-example `.env*`, keys, storage contents, dependencies, builds, caches, runtime state,
  and logs. Sanitized `*.env.example` files remain eligible.
- Define script-owned exit codes after interpreting SSH/rsync results; SSH 255 alone cannot distinguish every
  offline, authentication, or transport failure.
- Use delayed updates and a safe partial-transfer policy so interruption leaves the previous destination usable.
- Log only a sanitized classification, counts, and revisions; do not persist raw SSH stderr or private-key paths.

### Batch 2 — deletion/mirror mode (`NO-GO`)

- Do not implement `--mirror` or any deletion flag in the current roadmap.
- Reconsider only after per-repository backup/restore, remote-divergence handling, excluded-path immunity, and an
  explicit per-run deletion confirmation exist.

### Batch 3 — optional scheduling (`NO-GO / deferred`)

- Only after manual use is stable, add an opt-in user timer with a lock to prevent overlap, network/backoff
  bounds, and notification/log rotation.
- Keep scheduling disabled by default and never auto-start remote application services.

## Acceptance Criteria

- With the remote host off or unreachable, `--status` exits quickly, changes nothing, and reports the failure
  class without exposing credentials.
- Offline, authentication, and target-mismatch failures complete within the configured timeout, report a stable
  stage-specific script exit code, and never invoke rsync.
- With the host reachable, dry-run shows the target and itemized changes but writes nothing.
- Default dry-run writes zero bytes; apply is one-way and never deletes.
- `--apply` performs only the configured one-way scope and returns the remote Git/worktree identity in its log.
- A typoed or unexpected remote path fails before rsync runs.
- Default mode never deletes a remote file or transfers `.env*`/runtime-state paths.
- Sanitized tracked `*.env.example` files are the only environment-file exception.
- `.git/` is never transferred; every selected nested repo revision is reported independently.
- Pre-existing remote `storage/` content is neither transferred, emptied, nor deleted.
- Two simultaneous invocations cannot overlap.
- Unsafe symlinks, devices, and special files are ignored; canonical source/target roots and sentinels must match.
- Itemized counts are reproducible, interruption leaves no unsafe published temporary state, and rerun converges.
- `bash -n`, shellcheck when available, fixture-based SSH/rsync tests, path/symlink attacks, interruption/rerun,
  concurrent invocation, and a disposable remote-directory rehearsal pass before using a real mirror.

## Difficulty, Ownership, And Rollback

- Batch 1: medium/high, approximately 180–300 LOC under
  `/home/vgbn1/Documents/codeptit/bash/tools`, its README, and fixture tests.
- Batch 2: destructive/high; NO-GO.
- Batch 3: operational/high; deferred until repeated manual apply and recovery evidence exists.
- Rollback: no deletion is allowed. Preserve a destination snapshot for rehearsal; an interrupted apply must be
  recoverable by rerunning the same source-only command.

Dirty-tree boundary: the current Sovereign workspace notes/plans are unrelated to the external Bash
implementation and must not be mixed into its change set.

## First Implementation Prompt

Implement Batch 1 in `/home/vgbn1/Documents/codeptit/bash` only after the user confirms: (a) the SSH host alias,
(b) local-to-remote direction, (c) the fixed remote root/sentinel, and (d) the selected nested repositories.
Do not activate a timer or use any deletion/mirror option.
