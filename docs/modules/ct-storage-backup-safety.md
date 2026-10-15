# Module: Proxmox Host Storage & Backup Safety Guard

> **Status:** Implemented & Verified (CT-STORAGE-01)  
> **Audience:** DevOps Engineers, System Administrators, Infrastructure Maintainers  
> **Canonical owners:** `shared/lib/runtime/host_maintenance.js`, `backend/scripts/ops/host_backup.js`, `scripts/deploy/deploy_proxmox.sh`  
> **Review triggers:** Disk thresholds, backup mount paths, container cgroup storage limits, retention policies  

## Purpose And Non-Goals

This module provides fail-closed root filesystem storage monitoring, dedicated backup volume mount enforcement, and atomic provenance-aware archive retention for the Sovereign Platform across Proxmox LXC containers (specifically CT 114 `hp-svconsole`) and Docker deployments. It resolves the `CT-STORAGE-01` production incident where backup staging exhausted the container root filesystem (`/`), causing `storage_unavailable` alarms.

**Goals:**
- **External Volume Mount Partitioning**: Binds host backups strictly to high-capacity dedicated storage mounts (`/data/backups/` across `infra/docker/docker-compose.yml` and `scripts/deploy/deploy_proxmox.sh`), preventing archive tarballs from writing to the container root partition.
- **Fail-Closed Root Disk Exhaustion Guard**: Pre-checks filesystem capacity before creating staging directories or pulling container images. Throws an immediate `ENOSPC` error if free space is `< 1 GiB` or free percentage is `< 5%`.
- **Atomic Manifest Commitments**: Staged backups write to temporary directories (`<timestamp>.<pid>.tmp`) with streaming SHA-256 payload digests before an atomic `fs.renameSync` commits the verified backup.
- **Provenance-Aware Retention**: Automatically prunes older backup archives only when their `manifest.json` `source_root` matches the active repository root, preserving external or co-located host backups.

**Non-Goals:**
- It is not an automated offsite cloud backup sync (S3/Rclone upload is managed by external cron jobs).
- It does not resize Proxmox LXC ZFS pools or partition tables.

---

## Entrypoints And Public Contracts

| Surface | Owner | Contract |
|---|---|---|
| `checkRootDiskSpace(rootPath, options)` | `shared/lib/runtime/host_maintenance.js` | Inspects filesystem via native `statfs`; throws `ENOSPC` error if free bytes `< 1024^3` (1 GiB) or free percentage `< 5%`. |
| `createHostBackup(options)` | `shared/lib/runtime/host_maintenance.js` | Creates SHA-256 verified atomic backup of TS binary bins, config, and state. |
| `runHostBackupLoop(options)` | `backend/scripts/ops/host_backup.js` | Scheduled backup daemon; emits degraded `storage_unavailable` heartbeat and exits code 1 upon disk exhaustion. |
| `scripts/deploy/deploy_proxmox.sh` | Deployment script | Step 1b runs `df -k /` pre-check before container image pull or recreation. |

---

## Dependencies And Data Flow

```text
Host Storage Mount (/data/backups/ [608 GiB Free])
       │
       ▼
shared/lib/runtime/host_maintenance.js
  ├── checkRootDiskSpace('/') ──► Checks free >= 1 GiB AND free >= 5%
  ├── Staging: <timestamp>.<pid>.tmp ──► Copy & SHA-256 stream
  ├── Atomic Rename ──► /data/backups/<timestamp>
  └── Provenance Pruning ──► Retains 14 most recent matching source_root
```

---

## Invariants And Safety Boundaries

1. **Dual-Threshold Fail-Closed Invariant**:
   $$\text{StorageSafe}(\text{root}) \iff \text{FreeBytes} \ge 1024^3 \quad \text{and} \quad \frac{\text{FreeBytes}}{\text{TotalBytes}} \ge 0.05$$
   If either threshold is breached, backup operations abort immediately before disk allocation.
2. **Topology Isolation Boundary**: Staging directories and backup destinations must never overlap with the source repository root (prevents recursive self-archiving loops).
3. **Symlink Rejection**: Backups reject encountering symbolic links to prevent leaking arbitrary host paths or creating cyclic tar bombs.
4. **Degraded Heartbeat Emission**: When disk exhaustion occurs, the backup daemon writes a degraded status payload (`error: 'root_disk_exhausted'`) to `storage/data/cache/` to ensure central monitoring alerts operators.

---

## Failure Modes And Degraded Behavior

| Failure | Visible evidence | Safe behavior | Repair owner |
|---|---|---|---|
| Root disk space $< 1$ GiB | `error: 'ENOSPC'`, `storage_unavailable` | Aborts backup creation; zero bytes written to disk | Host Operator |
| Backup volume unmounted | Destination falls back to `/data/backups` | Rejects write if directory missing/unmounted | Docker Compose / Proxmox |
| Corrupt archive checksum | Manifest SHA-256 mismatch | Marks archive invalid; retains previous valid backups | Audit Tool |
| Retention pruning permission error | Exit code 3 | Preserves latest backup; logs warning for operator | System Admin |

---

## Observability

- **Watchdog Heartbeat**: `storage/data/cache/host_backup_status.json` (records `healthyAt`, `lastBackupSha256`, `diskFreeBytes`).
- **Deployment Evidence**: `/opt/sovereign/deployment_evidence.json` (records pre-deploy backup archive path and verification hash).
- **Console Telemetry**: `[MAINTENANCE] Root disk space: X MB (Y%) free` logged during every scheduled backup pass.

---

## Tests And Evidence

- **Baseline Reproducer**: `tests/repro/repro_20261014_195038_ct_storage_01_root_disk_check.sh`
- **Host Maintenance Contract Suite**: `tests/scripts/operational/host_maintenance.test.js` (17/17 tests passing).
- **Host Backup CLI Suite**: `tests/scripts/operational/host_backup_cli.test.js` (10/10 tests passing).
- **Deployment Manifest Contract**: `tests/scripts/architecture/cli/core/deployment_manifest_contract.test.js` (1/1 test passing).
