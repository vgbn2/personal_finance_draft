# Host backup diagnostics and restore qualification

The CLI preserves the coarse heartbeat error category and adds a fixed operation plus an allowlisted system errno to failed results. Arbitrary messages and retained staging paths are withheld: like a shipping failure receipt, it names the failed operation without printing the customer's address.

`staging_path` is always null on failure; `staging_retained` signals cleanup work without exposing its location. Unknown or absent errno is null. Detailed diagnostics belong to results/stderr; the existing heartbeat schema remains a coarse projection. Retention and backup source selection are unchanged.

## 1. Inspection / probe

```bash
git diff -- backend/scripts/ops/host_backup.js # inspect the single diagnostic owner
```

Failures retain `ok:false`, `backup_ok:false`, and the existing `error_code`; successful backups keep their manifest and existing result shape.

## 2. Remediation / action

Use the reported operation and system errno to inspect the responsible filesystem. Do not print raw error messages, delete backup archives, alter retention, or deliberately break a production backup to test diagnostics.

## 3. Verification / oracle

```bash
node --test tests/scripts/operational/host_backup_diagnostics.test.js tests/scripts/operational/host_backup_cli.test.js tests/scripts/operational/host_maintenance.test.js tests/scripts/operational/service_heartbeat.test.js # native tests; real filesystem failure/copy/restore
```

Production file qualification on 2026-11-19 restored 1,467 files / 1,988,327,513 bytes serially into isolated tmpfs and matched every manifest SHA256 and length. Source backups were untouched. This is file recoverability, not database consistency, backup completeness, or an application recovery drill. Historical November 14 dependency attribution remains unknown.

## 4. Rollback / safety

Keep the preceding production image and Compose overlay before deployment. Recreate only the backup service if rollback is necessary; never remove backups or change retention as rollback. An old image loses detailed safe diagnostics and may expose a retained staging path.
