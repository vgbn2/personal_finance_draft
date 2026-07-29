'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  exitCodeForResult,
  parseHostBackupOptions,
  resolveInitialBackupDueAt,
  runHostBackupLoop,
} = require('../../../backend/scripts/ops/host_backup');

test('host-backup CLI maps retention-only failure to exit code 3', () => {
  assert.equal(exitCodeForResult({ ok: true, backup_ok: true }), 0);
  assert.equal(exitCodeForResult({ ok: false, backup_ok: true }), 3);
  assert.equal(exitCodeForResult({ ok: false, backup_ok: false }), 1);
});

test('host-backup options preserve one-shot default and require a positive interval', () => {
  const parsed = parseHostBackupOptions([], {});
  assert.equal(parsed.watch, false);
  assert.equal(parsed.intervalSecs, 86400);
  assert.throws(
    () => parseHostBackupOptions(['--watch', '--interval-secs', '0'], {}),
    /positive number/,
  );
});

test('initial backup due time prefers a valid future heartbeat then a completed manifest', () => {
  const nowMs = Date.parse('2026-07-29T00:00:00.000Z');
  const heartbeatDue = nowMs + 60_000;
  assert.equal(resolveInitialBackupDueAt({
    nowMs,
    intervalSecs: 300,
    heartbeat: {
      reason: 'heartbeat_expired',
      next_run_at: new Date(heartbeatDue).toISOString(),
    },
    completedBackupAt: nowMs - 1000,
  }), heartbeatDue);

  assert.equal(resolveInitialBackupDueAt({
    nowMs,
    intervalSecs: 300,
    heartbeat: { reason: 'heartbeat_invalid', next_run_at: null },
    completedBackupAt: nowMs - 60_000,
  }), nowMs + 240_000);
});

test('watch mode does not create a backup before a preserved heartbeat due time', async () => {
  const nowMs = Date.parse('2026-07-29T00:00:00.000Z');
  const controller = new AbortController();
  let backupCalls = 0;
  const heartbeats = [];
  const result = await runHostBackupLoop({
    watch: true,
    intervalSecs: 300,
    backupRoot: '/tmp/test-backups',
    backupOptions: {},
    nowMs: () => nowMs,
    readHeartbeat: () => ({
      reason: null,
      next_run_at: new Date(nowMs + 60_000).toISOString(),
    }),
    listBackups: () => [],
    createBackup: async () => {
      backupCalls += 1;
      return { ok: true, backup_ok: true };
    },
    writeHeartbeat: (service, patch) => heartbeats.push({ service, patch }),
    sleep: async (milliseconds) => {
      assert.equal(milliseconds, 60_000);
      controller.abort();
      return false;
    },
    signal: controller.signal,
  });

  assert.equal(result.cycles, 0);
  assert.equal(backupCalls, 0);
  assert.equal(heartbeats[0].patch.next_run_at, '2026-07-29T00:01:00.000Z');
  assert.equal(heartbeats.at(-1).patch.state, 'stopped');
});

test('watch mode recovers a malformed heartbeat from the newest completed backup', async () => {
  const nowMs = Date.parse('2026-07-29T00:00:00.000Z');
  const completedAt = nowMs - 100_000;
  const controller = new AbortController();
  let backupCalls = 0;
  await runHostBackupLoop({
    watch: true,
    intervalSecs: 300,
    backupRoot: '/tmp/test-backups',
    backupOptions: {},
    nowMs: () => nowMs,
    readHeartbeat: () => ({ reason: 'heartbeat_invalid', next_run_at: null }),
    listBackups: () => [{ path: '/tmp/test-backups/valid', createdAt: completedAt }],
    createBackup: async () => {
      backupCalls += 1;
      return { ok: true, backup_ok: true };
    },
    writeHeartbeat: () => {},
    sleep: async (milliseconds) => {
      assert.equal(milliseconds, 200_000);
      controller.abort();
      return false;
    },
    signal: controller.signal,
  });

  assert.equal(backupCalls, 0);
});

test('watch mode continues after retention and hard backup failures', async () => {
  const results = [
    { ok: false, backup_ok: true, retention: { ok: false } },
    (() => { throw new Error('disk full at secret path'); }),
  ];
  const heartbeats = [];
  let calls = 0;
  const result = await runHostBackupLoop({
    watch: true,
    intervalSecs: 10,
    backupRoot: '/tmp/test-backups',
    backupOptions: {},
    readHeartbeat: () => ({ reason: 'heartbeat_missing', next_run_at: null }),
    listBackups: () => [],
    createBackup: async () => {
      const outcome = results[calls];
      calls += 1;
      if (typeof outcome === 'function') return outcome();
      return outcome;
    },
    writeHeartbeat: (service, patch) => heartbeats.push({ service, patch }),
    sleep: async () => true,
    output: () => {},
    maxCycles: 2,
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.cycles, 2);
  assert.equal(heartbeats[0].patch.error_code, 'backup_retention_failed');
  assert.equal(heartbeats[0].patch.success, true);
  assert.equal(heartbeats[1].patch.error_code, 'storage_unavailable');
  assert.doesNotMatch(JSON.stringify(heartbeats), /secret path/);
});

test('one-shot backup retains exit-code compatibility', async () => {
  const heartbeats = [];
  const result = await runHostBackupLoop({
    watch: false,
    intervalSecs: 86400,
    backupOptions: {},
    createBackup: async () => ({ ok: false, backup_ok: true }),
    writeHeartbeat: (service, patch) => heartbeats.push({ service, patch }),
    output: () => {},
    nowMs: () => Date.parse('2026-07-29T00:00:00.000Z'),
  });

  assert.equal(result.cycles, 1);
  assert.equal(result.exitCode, 3);
  assert.equal(heartbeats[0].patch.next_run_at, '2026-07-30T00:00:00.000Z');
});

test('watch mode retries unreadable backup schedule state without creating a backup', async () => {
  const controller = new AbortController();
  let backupCalls = 0;
  const heartbeats = [];
  await runHostBackupLoop({
    watch: true,
    intervalSecs: 10,
    backupRoot: '/tmp/test-backups',
    backupOptions: {},
    readHeartbeat: () => ({ reason: 'heartbeat_missing', next_run_at: null }),
    listBackups: () => {
      const error = new Error('EACCES reading backup manifests');
      error.code = 'EACCES';
      throw error;
    },
    createBackup: async () => {
      backupCalls += 1;
      return { ok: true, backup_ok: true };
    },
    writeHeartbeat: (service, patch) => heartbeats.push({ service, patch }),
    sleep: async () => {
      controller.abort();
      return false;
    },
    signal: controller.signal,
  });

  assert.equal(backupCalls, 0);
  assert.equal(heartbeats[0].patch.error_code, 'permission_denied');
  assert.equal(heartbeats.at(-1).patch.state, 'stopped');
});
