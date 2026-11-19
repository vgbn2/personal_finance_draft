'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { runHostBackupLoop } = require('../../../backend/scripts/ops/host_backup');

test('real backup destination failure emits bounded diagnostics without paths or secrets', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-diagnostics-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo);
  fs.writeFileSync(path.join(repo, 'input'), 'fixture');
  const destination = path.join(root, 'secret-token-destination');
  fs.writeFileSync(destination, 'not a directory');
  const heartbeats = [];
  const output = [];
  const result = await runHostBackupLoop({
    backupOptions: {
      repoRoot: repo,
      sources: [path.join(repo, 'input')],
      backupRoot: destination,
      checkRootDisk: false,
    },
    checkStartupDisk: false,
    writeHeartbeat: (service, patch) => heartbeats.push(patch),
    output: (value) => output.push(value),
  });
  assert.equal(result.exitCode, 1);
  assert.equal(result.result.operation, 'create_host_backup');
  assert.equal(result.result.system_error_code, 'ENOTDIR');
  assert.equal(result.result.staging_path, null);
  assert.equal(fs.readFileSync(destination, 'utf8'), 'not a directory');
  assert.doesNotMatch(JSON.stringify({ result, heartbeats, output }), /secret-token|backup-diagnostics-/);
});

test('real successful backup restores fixture bytes and verifies manifest hashes', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-restore-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo);
  const bytes = Buffer.from([0, 255, 10, 13, 42]);
  fs.writeFileSync(path.join(repo, 'input.bin'), bytes);
  const result = await runHostBackupLoop({
    backupOptions: {
      repoRoot: repo,
      sources: [path.join(repo, 'input.bin')],
      backupRoot: path.join(root, 'backups'),
      checkRootDisk: false,
    },
    checkStartupDisk: false,
    writeHeartbeat: () => {},
  });
  assert.equal(result.exitCode, 0);
  const manifest = JSON.parse(fs.readFileSync(path.join(result.result.backup_path, 'manifest.json')));
  assert.equal(manifest.file_count, 1);
  const restored = path.join(root, 'restored');
  fs.cpSync(result.result.backup_path, restored, { recursive: true, errorOnExist: true });
  const actual = fs.readFileSync(path.join(restored, 'input.bin'));
  assert.deepEqual(actual, bytes);
  assert.equal(manifest.files[0].sha256, crypto.createHash('sha256').update(actual).digest('hex'));
});

test('diagnostics withhold unknown codes, cleanup paths and startup messages', async () => {
  for (const code of ['EIO', 'PRIVATE_SECRET_CODE', undefined]) {
    const error = new Error('private-token at /private/customer');
    error.code = code;
    error.stagingPath = '/private/customer/staging';
    const result = await runHostBackupLoop({
      checkStartupDisk: false,
      createBackup: async () => { throw error; },
      writeHeartbeat: () => {},
    });
    assert.equal(result.result.system_error_code, code === 'EIO' ? 'EIO' : null);
    assert.equal(result.result.staging_path, null);
    assert.equal(result.result.staging_retained, true);
    assert.doesNotMatch(JSON.stringify(result), /private|customer|PRIVATE_SECRET/);
  }
  const output = [];
  const result = await runHostBackupLoop({
    checkRootDisk: () => { throw new Error('private-token at /private/customer'); },
    writeHeartbeat: () => {},
    output: (value) => output.push(value),
  });
  assert.equal(result.exitCode, 1);
  assert.equal(output[0].operation, 'check_root_disk');
  assert.doesNotMatch(JSON.stringify(output), /private|customer/);
});

test('omitted watch interval uses the daily default on every wait', async () => {
  const waits = [];
  const result = await runHostBackupLoop({
    watch: true,
    checkStartupDisk: false,
    readHeartbeat: () => ({ reason: 'heartbeat_missing' }),
    listBackups: () => [],
    createBackup: async () => ({ ok: true, backup_ok: true }),
    writeHeartbeat: () => {},
    sleep: async (milliseconds) => {
      waits.push(milliseconds);
      return false;
    },
  });
  assert.equal(result.cycles, 1);
  assert.deepEqual(waits, [86400000]);
});

test('startup returns emitted diagnostics and non-Error failures remain bounded', async () => {
  const output = [];
  const error = Object.assign(new Error('private-path'), { code: 'EIO' });
  const startup = await runHostBackupLoop({
    checkRootDisk: () => { throw error; },
    writeHeartbeat: () => {},
    output: (value) => output.push(value),
  });
  assert.deepEqual(startup.result, output[0]);
  assert.equal(startup.result.system_error_code, 'EIO');
  for (const thrown of [null, undefined, 'private-token', 42]) {
    const result = await runHostBackupLoop({
      checkStartupDisk: false,
      createBackup: async () => { throw thrown; },
      writeHeartbeat: () => {},
    });
    assert.equal(result.exitCode, 1);
    assert.equal(result.result.system_error_code, null);
    assert.equal(result.result.operation, 'create_host_backup');
    assert.doesNotMatch(JSON.stringify(result), /private-token/);
  }
});
