'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { STORAGE_DATA_DIR } = require('../../../shared/lib/runtime/paths');

const {
  HOST_BACKUP_MANIFEST_KIND,
  DEFAULT_DISK_PATH,
  probeRunner,
  probeHost,
  createHostBackup,
} = require('../../../shared/lib/runtime/host_maintenance');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-host-maintenance-'));
}

test('probeRunner uses observable status freshness without claiming cross-container PID liveness', () => {
  const root = tempDir();
  try {
    const statusPath = path.join(root, 'status.json');
    fs.writeFileSync(statusPath, JSON.stringify({
      status: 'sleeping', pid: 42, updated_at: '2026-07-10T00:00:00.000Z',
    }));
    const now = Date.parse('2026-07-10T00:10:00.000Z');
    const fresh = probeRunner(statusPath, now, 15 * 60 * 1000, () => false);
    assert.equal(fresh.ok, true);
    assert.equal(Object.hasOwn(fresh, 'pid_alive'), false);
    assert.equal(Object.hasOwn(fresh, 'pid'), false);
    assert.equal(probeRunner(statusPath, now + 10 * 60 * 1000, 15 * 60 * 1000).reason, 'stale_status');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('probeHost combines canonical freshness, disk, and runner health', () => {
  const root = tempDir();
  try {
    const tsDir = path.join(root, 'ts');
    const statusPath = path.join(root, 'status.json');
    fs.mkdirSync(tsDir);
    const bin = path.join(tsDir, 'BTCUSDT_1m.bin');
    fs.writeFileSync(bin, 'bars');
    const now = Date.now();
    fs.utimesSync(bin, new Date(now - 1000), new Date(now - 1000));
    fs.writeFileSync(statusPath, JSON.stringify({ status: 'running', pid: 7, updated_at: new Date(now - 1000).toISOString() }));

    const result = probeHost({
      now, tsDir, diskPath: root, statusPath, tsMaxAgeMs: 5000,
      runnerMaxAgeMs: 5000, minFreeBytes: 0, minFreePercent: 0,
    });
    assert.equal(result.ok, true);
    assert.equal(result.checks.canonical_data.reason, 'fresh');
    assert.equal(result.checks.disk.ok, true);

    fs.utimesSync(bin, new Date(now - 10000), new Date(now - 10000));
    const stale = probeHost({
      now, tsDir, diskPath: root, statusPath, tsMaxAgeMs: 5000,
      runnerMaxAgeMs: 5000, minFreeBytes: 0, minFreePercent: 0,
    });
    assert.equal(stale.ok, false);
    assert.equal(stale.checks.canonical_data.reason, 'stale');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('probeHost defaults disk usage to the mounted storage filesystem', () => {
  assert.equal(DEFAULT_DISK_PATH, STORAGE_DATA_DIR);
  const root = tempDir();
  try {
    const tsDir = path.join(root, 'ts');
    fs.mkdirSync(tsDir);
    fs.writeFileSync(path.join(tsDir, 'BTCUSDT_1m.bin'), 'bars');
    const result = probeHost({
      tsDir,
      checkRunner: false,
      tsMaxAgeMs: Number.MAX_SAFE_INTEGER,
      minFreeBytes: 0,
      minFreePercent: 0,
    });
    assert.equal(result.checks.disk.path, STORAGE_DATA_DIR);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('probeHost ignores fresh temp, metadata, and unrelated files for canonical freshness', () => {
  const root = tempDir();
  try {
    const tsDir = path.join(root, 'ts');
    fs.mkdirSync(tsDir);
    const now = Date.now();
    const staleBin = path.join(tsDir, 'BTCUSDT_1m.bin');
    fs.writeFileSync(staleBin, 'bars');
    fs.utimesSync(staleBin, new Date(now - 10000), new Date(now - 10000));
    for (const name of ['BTCUSDT_1m.bin.123.tmp', 'BTCUSDT_1m.meta.json', 'heartbeat.txt']) {
      const filePath = path.join(tsDir, name);
      fs.writeFileSync(filePath, 'fresh-but-not-canonical');
      fs.utimesSync(filePath, new Date(now - 1000), new Date(now - 1000));
    }

    const stale = probeHost({
      now,
      tsDir,
      diskPath: root,
      checkRunner: false,
      tsMaxAgeMs: 5000,
      minFreeBytes: 0,
      minFreePercent: 0,
    });
    assert.equal(stale.checks.canonical_data.reason, 'stale');
    assert.equal(stale.checks.canonical_data.newest_mtime, new Date(now - 10000).toISOString());

    fs.rmSync(staleBin);
    const missing = probeHost({
      now,
      tsDir,
      diskPath: root,
      checkRunner: false,
      minFreeBytes: 0,
      minFreePercent: 0,
    });
    assert.equal(missing.checks.canonical_data.reason, 'no_canonical_data');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('createHostBackup publishes an immutable snapshot with checksums and no secrets', async () => {
  const root = tempDir();
  try {
    fs.mkdirSync(path.join(root, 'storage', 'data', 'ts'), { recursive: true });
    fs.mkdirSync(path.join(root, 'storage', 'data', 'cache'), { recursive: true });
    fs.mkdirSync(path.join(root, 'config', 'system'), { recursive: true });
    fs.writeFileSync(path.join(root, 'storage', 'data', 'ts', 'BTCUSDT_1m.bin'), 'canonical-bars');
    fs.writeFileSync(path.join(root, 'storage', 'data', 'portfolio.json'), '{"cash":100}');
    fs.writeFileSync(path.join(root, 'config', 'system', 'app.yaml'), 'mode: paper\n');
    fs.writeFileSync(path.join(root, '.env'), 'SECRET=must-not-copy\n');
    fs.writeFileSync(path.join(root, 'storage', 'data', 'cache', 'provider.json'), 'disposable');

    const backupRoot = path.join(root, 'backups');
    const sources = [
      path.join(root, 'storage', 'data', 'ts'),
      path.join(root, 'config'),
      path.join(root, 'storage', 'data', 'portfolio.json'),
    ];
    const result = await createHostBackup({
      repoRoot: root, backupRoot, sources, timestamp: 'fixed', now: 0,
    });

    assert.equal(result.file_count, 3);
    assert.equal(fs.existsSync(path.join(result.backup_path, '.env')), false);
    assert.equal(fs.existsSync(path.join(result.backup_path, 'storage', 'data', 'cache', 'provider.json')), false);
    const manifest = JSON.parse(fs.readFileSync(path.join(result.backup_path, 'manifest.json'), 'utf8'));
    assert.equal(manifest.kind, HOST_BACKUP_MANIFEST_KIND);
    const bars = manifest.files.find((file) => file.path.endsWith('BTCUSDT_1m.bin'));
    assert.equal(bars.sha256, crypto.createHash('sha256').update('canonical-bars').digest('hex'));
    assert.equal(fs.readFileSync(path.join(result.backup_path, bars.path), 'utf8'), 'canonical-bars');

    await assert.rejects(
      createHostBackup({ repoRoot: root, backupRoot, sources, timestamp: 'fixed' }),
      /already exists/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('createHostBackup rejects symlinks instead of following external data', async (t) => {
  const root = tempDir();
  try {
    const target = path.join(root, 'target.txt');
    const linked = path.join(root, 'config-link');
    fs.writeFileSync(target, 'outside');
    try { fs.symlinkSync(target, linked); } catch (error) {
      if (error.code === 'EPERM') return t.skip('symlinks unavailable');
      throw error;
    }
    await assert.rejects(
      createHostBackup({ repoRoot: root, backupRoot: path.join(root, 'backups'), sources: [linked], timestamp: 'link' }),
      /Refusing symlink/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('createHostBackup rejects a backup destination nested inside a source before staging', async () => {
  const root = tempDir();
  try {
    const source = path.join(root, 'storage');
    const backupRoot = path.join(source, 'backups');
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'portfolio.json'), '{}');
    await assert.rejects(createHostBackup({
      repoRoot: root,
      backupRoot,
      sources: [source],
      timestamp: 'recursive',
    }), /destination and source must not overlap/);
    assert.equal(fs.existsSync(backupRoot), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('createHostBackup rejects a source nested inside the backup destination without deleting it', async () => {
  const root = tempDir();
  try {
    const backupRoot = path.join(root, 'backups');
    const source = path.join(backupRoot, 'operator-source');
    const sourceFile = path.join(source, 'keep.txt');
    fs.mkdirSync(source, { recursive: true });
    fs.writeFileSync(sourceFile, 'keep');
    await assert.rejects(createHostBackup({
      repoRoot: root,
      backupRoot,
      sources: [source],
      timestamp: 'dangerous',
      retentionMaxCount: 1,
    }), /destination and source must not overlap/);
    assert.equal(fs.readFileSync(sourceFile, 'utf8'), 'keep');
    assert.equal(fs.existsSync(path.join(backupRoot, 'dangerous')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function writeCompletedBackup(backupRoot, name, createdAt, sourceRoot = null) {
  const backupPath = path.join(backupRoot, name);
  fs.mkdirSync(backupPath, { recursive: true });
  const manifest = {
    kind: HOST_BACKUP_MANIFEST_KIND,
    version: 1,
    created_at: new Date(createdAt).toISOString(),
  };
  if (sourceRoot) manifest.source_root = sourceRoot;
  fs.writeFileSync(path.join(backupPath, 'manifest.json'), JSON.stringify(manifest));
  return backupPath;
}

test('createHostBackup applies max-age and max-count retention only after publishing a new backup', async () => {
  const root = tempDir();
  try {
    const source = path.join(root, 'config');
    const backupRoot = path.join(root, 'backups');
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'app.json'), '{}');
    const now = Date.parse('2026-07-10T12:00:00.000Z');
    const expired = writeCompletedBackup(backupRoot, 'expired', now - 10 * 86400000, root);
    const older = writeCompletedBackup(backupRoot, 'older', now - 2 * 86400000, root);
    const recent = writeCompletedBackup(backupRoot, 'recent', now - 86400000, root);
    const unknown = path.join(backupRoot, 'operator-notes');
    fs.mkdirSync(unknown);
    fs.writeFileSync(path.join(unknown, 'README'), 'do not delete');
    const foreign = path.join(backupRoot, 'foreign-manifest');
    fs.mkdirSync(foreign);
    fs.writeFileSync(path.join(foreign, 'manifest.json'), JSON.stringify({
      version: 1,
      created_at: new Date(now - 30 * 86400000).toISOString(),
    }));

    const result = await createHostBackup({
      repoRoot: root,
      backupRoot,
      sources: [source],
      timestamp: 'new',
      now,
      retentionMaxAgeMs: 7 * 86400000,
      retentionMaxCount: 2,
    });

    assert.equal(fs.existsSync(result.backup_path), true);
    assert.equal(fs.existsSync(expired), false);
    assert.equal(fs.existsSync(older), false);
    assert.equal(fs.existsSync(recent), true);
    assert.equal(fs.existsSync(unknown), true);
    assert.equal(fs.existsSync(foreign), true);
    assert.deepEqual(result.retention.pruned.sort(), [expired, older].sort());
    assert.equal(result.retention.eligible_count, 4);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('createHostBackup only prunes backups with matching source_root provenance', async () => {
  const root = tempDir();
  try {
    const source = path.join(root, 'config');
    const backupRoot = path.join(root, 'backups');
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'app.json'), '{}');
    const now = Date.parse('2026-07-10T12:00:00.000Z');
    const matchingOld = writeCompletedBackup(backupRoot, 'matching-old', now - 10 * 86400000, root);
    const foreignOld = writeCompletedBackup(backupRoot, 'foreign-old', now - 10 * 86400000, path.join(root, 'elsewhere'));
    const legacyOld = writeCompletedBackup(backupRoot, 'legacy-old', now - 10 * 86400000);

    const result = await createHostBackup({
      repoRoot: root,
      backupRoot,
      sources: [source],
      timestamp: 'new-source-root',
      now,
      retentionMaxAgeMs: 7 * 86400000,
      retentionMaxCount: 1,
    });

    assert.equal(fs.existsSync(matchingOld), false);
    assert.equal(fs.existsSync(foreignOld), true);
    assert.equal(fs.existsSync(legacyOld), true);
    assert.deepEqual(result.retention.pruned, [matchingOld]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('createHostBackup does not apply retention when the new backup fails', async () => {
  const root = tempDir();
  try {
    const backupRoot = path.join(root, 'backups');
    const existing = writeCompletedBackup(backupRoot, 'existing', 0);
    const outside = path.join(os.tmpdir(), `outside-${process.pid}-${Date.now()}.txt`);
    fs.writeFileSync(outside, 'outside');
    try {
      const failure = createHostBackup({
        repoRoot: root,
        backupRoot,
        sources: [outside],
        timestamp: 'failed',
        now: Date.parse('2026-07-10T12:00:00.000Z'),
        retentionMaxAgeMs: 0,
        retentionMaxCount: 1,
      });
      await assert.rejects(failure, /must be inside repository/);
    } finally {
      fs.rmSync(outside, { force: true });
    }
    assert.equal(fs.existsSync(existing), true);
    assert.equal(fs.existsSync(path.join(backupRoot, `failed.${process.pid}.tmp`)), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('createHostBackup reports retention deletion failures without removing the published backup', async () => {
  const root = tempDir();
  try {
    const source = path.join(root, 'config');
    const backupRoot = path.join(root, 'backups');
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'app.json'), '{}');
    const oldBackup = writeCompletedBackup(backupRoot, 'old', 0, root);
    const result = await createHostBackup({
      repoRoot: root,
      backupRoot,
      sources: [source],
      timestamp: 'published',
      now: Date.parse('2026-07-10T12:00:00.000Z'),
      retentionMaxCount: 1,
      retentionRemoveBackup: () => { throw new Error('simulated delete denial'); },
    });

    assert.equal(result.ok, false);
    assert.equal(result.backup_ok, true);
    assert.equal(result.retention.ok, false);
    assert.deepEqual(result.retention.errors, [{ path: oldBackup, error: 'simulated delete denial' }]);
    assert.equal(fs.existsSync(result.backup_path), true);
    assert.equal(fs.existsSync(oldBackup), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('createHostBackup rejects an invalid retention policy before publishing', async () => {
  const root = tempDir();
  try {
    const source = path.join(root, 'config');
    const backupRoot = path.join(root, 'backups');
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'app.json'), '{}');
    await assert.rejects(createHostBackup({
      repoRoot: root,
      backupRoot,
      sources: [source],
      timestamp: 'not-published',
      retentionMaxCount: 0,
    }), /positive integer/);
    assert.equal(fs.existsSync(path.join(backupRoot, 'not-published')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
