'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');

const { REPO_ROOT, STORAGE_DATA_DIR, STORAGE_TS_DIR } = require('./paths');

const HOST_BACKUP_MANIFEST_KIND = 'sovereign-host-backup';
const DEFAULT_BACKUP_ROOT = path.join(REPO_ROOT, 'storage', 'backups', 'host');
const DEFAULT_DISK_PATH = STORAGE_DATA_DIR;
const DEFAULT_DAEMON_STATUS = path.join(STORAGE_DATA_DIR, 'cache', 'backfill_daemon_status.json');
const DEFAULT_STATE_FILES = [
  path.join(STORAGE_DATA_DIR, 'portfolio.json'),
  path.join(STORAGE_DATA_DIR, 'user_settings.json'),
  path.join(STORAGE_DATA_DIR, 'run_status.json'),
  path.join(STORAGE_DATA_DIR, 'cache', 'backfill_daemon_status.json'),
  path.join(STORAGE_DATA_DIR, 'cache', 'bot_state.json'),
  path.join(STORAGE_DATA_DIR, 'cache', 'alpaca_bot_state.json'),
];

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function newestCanonicalBinMtime(root) {
  if (!fs.existsSync(root)) return null;
  let newest = null;
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(fullPath);
      else if (entry.isFile() && entry.name.endsWith('.bin')) {
        const mtimeMs = fs.statSync(fullPath).mtimeMs;
        if (newest === null || mtimeMs > newest) newest = mtimeMs;
      }
    }
  }
  return newest;
}

function diskUsage(targetPath) {
  const stats = fs.statfsSync(targetPath);
  const blockSize = Number(stats.bsize);
  const totalBytes = Number(stats.blocks) * blockSize;
  const freeBytes = Number(stats.bavail) * blockSize;
  return {
    total_bytes: totalBytes,
    free_bytes: freeBytes,
    free_percent: totalBytes > 0 ? (freeBytes / totalBytes) * 100 : 0,
  };
}

function probeRunner(statusPath, now, maxAgeMs) {
  const status = readJson(statusPath);
  if (!status) return { ok: false, reason: 'missing_or_invalid_status', status_path: statusPath };

  const updatedAt = Date.parse(status.updated_at || status.healthyAt || status.lastRunAt || '');
  const ageMs = Number.isFinite(updatedAt) ? Math.max(0, now - updatedAt) : null;
  const continuousState = status.status === 'running' || status.status === 'sleeping';
  const fresh = ageMs !== null && ageMs <= maxAgeMs;

  let reason = 'healthy';
  if (!continuousState) reason = `not_continuous:${status.status || 'unknown'}`;
  else if (!fresh) reason = ageMs === null ? 'missing_timestamp' : 'stale_status';

  return {
    ok: continuousState && fresh,
    reason,
    status: status.status || null,
    age_seconds: ageMs === null ? null : Math.round(ageMs / 1000),
    status_path: statusPath,
  };
}

function probeHost(options = {}) {
  const now = options.now ?? Date.now();
  const tsDir = options.tsDir || STORAGE_TS_DIR;
  const diskPath = options.diskPath || DEFAULT_DISK_PATH;
  const statusPath = options.statusPath || DEFAULT_DAEMON_STATUS;
  const tsMaxAgeMs = options.tsMaxAgeMs ?? 2 * 60 * 60 * 1000;
  const runnerMaxAgeMs = options.runnerMaxAgeMs ?? 75 * 60 * 1000;
  const minFreeBytes = options.minFreeBytes ?? 10 * 1024 ** 3;
  const minFreePercent = options.minFreePercent ?? 10;
  const newestMtime = newestCanonicalBinMtime(tsDir);
  const tsAgeMs = newestMtime === null ? null : Math.max(0, now - newestMtime);
  const data = {
    ok: newestMtime !== null && tsAgeMs <= tsMaxAgeMs,
    reason: newestMtime === null ? 'no_canonical_data' : (tsAgeMs <= tsMaxAgeMs ? 'fresh' : 'stale'),
    newest_mtime: newestMtime === null ? null : new Date(newestMtime).toISOString(),
    age_seconds: tsAgeMs === null ? null : Math.round(tsAgeMs / 1000),
    path: tsDir,
  };

  let disk;
  try {
    const usage = diskUsage(diskPath);
    disk = {
      ok: usage.free_bytes >= minFreeBytes && usage.free_percent >= minFreePercent,
      reason: usage.free_bytes < minFreeBytes ? 'free_bytes_below_threshold'
        : (usage.free_percent < minFreePercent ? 'free_percent_below_threshold' : 'healthy'),
      ...usage,
      path: diskPath,
    };
  } catch (error) {
    disk = { ok: false, reason: 'statfs_failed', error: error.message, path: diskPath };
  }

  const runner = options.checkRunner === false ? { ok: true, reason: 'disabled' }
    : probeRunner(statusPath, now, runnerMaxAgeMs);
  const checks = { canonical_data: data, disk, runner };
  return {
    ok: Object.values(checks).every((check) => check.ok),
    checked_at: new Date(now).toISOString(),
    checks,
  };
}

function safeRelative(repoRoot, sourcePath) {
  const relative = path.relative(repoRoot, sourcePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Backup source must be inside repository: ${sourcePath}`);
  }
  return relative;
}

function canonicalPath(targetPath) {
  let existing = path.resolve(targetPath);
  const missing = [];
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    missing.unshift(path.basename(existing));
    existing = parent;
  }
  const canonicalExisting = fs.existsSync(existing) ? fs.realpathSync.native(existing) : existing;
  return path.resolve(canonicalExisting, ...missing);
}

function pathsOverlap(leftPath, rightPath) {
  const relative = path.relative(leftPath, rightPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function validateBackupTopology(backupRoot, sources) {
  const canonicalBackupRoot = canonicalPath(backupRoot);
  for (const source of sources) {
    const canonicalSource = canonicalPath(source);
    if (pathsOverlap(canonicalBackupRoot, canonicalSource)
      || pathsOverlap(canonicalSource, canonicalBackupRoot)) {
      throw new Error(`Backup destination and source must not overlap: ${backupRoot} <-> ${source}`);
    }
  }
}

function isTransientFile(name) {
  return name.endsWith('.tmp') || name.endsWith('.lock') || name.startsWith('.tmp');
}

function pruneOrphanedTempFiles(tsDir, maxAgeMs = 60 * 60 * 1000, now = Date.now()) {
  if (!fs.existsSync(tsDir)) return 0;
  let deleted = 0;
  try {
    for (const entry of fs.readdirSync(tsDir, { withFileTypes: true })) {
      if (entry.isFile() && isTransientFile(entry.name)) {
        const fullPath = path.join(tsDir, entry.name);
        try {
          const stat = fs.statSync(fullPath);
          if (now - stat.mtimeMs > maxAgeMs) {
            fs.unlinkSync(fullPath);
            deleted += 1;
          }
        } catch (_) {}
      }
    }
  } catch (_) {}
  return deleted;
}

function listFiles(sourcePath) {
  if (!fs.existsSync(sourcePath)) return [];
  const stat = fs.lstatSync(sourcePath);
  if (stat.isSymbolicLink()) throw new Error(`Refusing symlink backup source: ${sourcePath}`);
  if (stat.isFile()) {
    if (isTransientFile(path.basename(sourcePath))) return [];
    return [sourcePath];
  }
  if (!stat.isDirectory()) return [];

  const files = [];
  for (const entry of fs.readdirSync(sourcePath, { withFileTypes: true })) {
    if (isTransientFile(entry.name)) continue;
    const child = path.join(sourcePath, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Refusing symlink in backup source: ${child}`);
    if (entry.isDirectory()) files.push(...listFiles(child));
    else if (entry.isFile()) files.push(child);
  }
  return files;
}

async function copyAndHash(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const hash = crypto.createHash('sha256');
  const input = fs.createReadStream(source);
  input.on('data', (chunk) => hash.update(chunk));
  await pipeline(input, fs.createWriteStream(destination, { flags: 'wx' }));
  const stat = fs.statSync(destination);
  return { bytes: stat.size, sha256: hash.digest('hex') };
}

function completedBackups(backupRoot, sourceRoot) {
  if (!fs.existsSync(backupRoot)) return [];
  const expectedSourceRoot = sourceRoot ? path.resolve(sourceRoot) : null;
  const backups = [];
  for (const entry of fs.readdirSync(backupRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.endsWith('.tmp')) continue;
    const backupPath = path.join(backupRoot, entry.name);
    const manifest = readJson(path.join(backupPath, 'manifest.json'));
    const createdAt = Date.parse(manifest?.created_at || '');
    if (manifest?.kind !== HOST_BACKUP_MANIFEST_KIND
      || manifest?.version !== 1
      || !Number.isFinite(createdAt)) continue;
    if (expectedSourceRoot && path.resolve(manifest.source_root || '') !== expectedSourceRoot) continue;
    backups.push({ path: backupPath, createdAt });
  }
  return backups;
}

function validateRetentionPolicy(maxAgeMs, maxCount) {
  if (maxAgeMs !== undefined && (!Number.isFinite(maxAgeMs) || maxAgeMs < 0)) {
    throw new Error('Backup retention maxAgeMs must be a non-negative number');
  }
  if (maxCount !== undefined && (!Number.isInteger(maxCount) || maxCount < 1)) {
    throw new Error('Backup retention maxCount must be a positive integer');
  }
}

function pruneHostBackups(options = {}) {
  const backupRoot = path.resolve(options.backupRoot || DEFAULT_BACKUP_ROOT);
  const sourceRoot = options.sourceRoot ? path.resolve(options.sourceRoot) : null;
  const maxAgeMs = options.maxAgeMs;
  const maxCount = options.maxCount;
  validateRetentionPolicy(maxAgeMs, maxCount);

  const preserved = new Set((options.preservePaths || []).map((item) => path.resolve(item)));
  const now = options.now ?? Date.now();
  const backups = completedBackups(backupRoot, sourceRoot)
    .sort((left, right) => right.createdAt - left.createdAt || right.path.localeCompare(left.path));
  const remove = new Set();
  if (maxAgeMs !== undefined) {
    const cutoff = now - maxAgeMs;
    for (const backup of backups) {
      if (backup.createdAt < cutoff && !preserved.has(backup.path)) remove.add(backup.path);
    }
  }
  if (maxCount !== undefined) {
    const preservedCount = backups.filter((backup) => preserved.has(backup.path)).length;
    const nonPreservedSlots = Math.max(0, maxCount - preservedCount);
    const nonPreserved = backups.filter((backup) => !preserved.has(backup.path));
    for (const backup of nonPreserved.slice(nonPreservedSlots)) {
      remove.add(backup.path);
    }
  }

  const pruned = [];
  const errors = [];
  const removeBackup = options.removeBackup || ((backupPath) => fs.rmSync(backupPath, { recursive: true }));
  for (const backupPath of [...remove].sort()) {
    try {
      removeBackup(backupPath);
      pruned.push(backupPath);
    } catch (error) {
      errors.push({ path: backupPath, error: error.message });
    }
  }
  return {
    ok: errors.length === 0,
    max_age_ms: maxAgeMs ?? null,
    max_count: maxCount ?? null,
    eligible_count: backups.length,
    pruned,
    errors,
  };
}

async function createHostBackup(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || REPO_ROOT);
  const backupRoot = path.resolve(options.backupRoot || DEFAULT_BACKUP_ROOT);
  validateRetentionPolicy(options.retentionMaxAgeMs, options.retentionMaxCount);
  pruneOrphanedTempFiles(path.join(repoRoot, 'storage', 'data', 'ts'), options.tempMaxAgeMs, options.now);
  const timestamp = options.timestamp || new Date().toISOString().replace(/[:.]/g, '-');
  const finalDir = path.join(backupRoot, timestamp);
  const stagingDir = `${finalDir}.${process.pid}.tmp`;
  if (fs.existsSync(finalDir) || fs.existsSync(stagingDir)) {
    throw new Error(`Backup destination already exists: ${finalDir}`);
  }

  const sources = options.sources || [
    path.join(repoRoot, 'storage', 'data', 'ts'),
    path.join(repoRoot, 'config'),
    ...DEFAULT_STATE_FILES.map((file) => path.join(repoRoot, path.relative(REPO_ROOT, file))),
  ];
  validateBackupTopology(backupRoot, sources.map((source) => path.resolve(source)));
  const uniqueFiles = [...new Set(sources.flatMap((source) => listFiles(path.resolve(source))))].sort();
  fs.mkdirSync(stagingDir, { recursive: true });

  const manifestFiles = [];
  try {
    for (const source of uniqueFiles) {
      const relative = safeRelative(repoRoot, source);
      const result = await copyAndHash(source, path.join(stagingDir, relative));
      manifestFiles.push({ path: relative.split(path.sep).join('/'), ...result });
    }
    const manifest = {
      kind: HOST_BACKUP_MANIFEST_KIND,
      version: 1,
      created_at: new Date(options.now ?? Date.now()).toISOString(),
      source_root: repoRoot,
      file_count: manifestFiles.length,
      total_bytes: manifestFiles.reduce((sum, file) => sum + file.bytes, 0),
      files: manifestFiles,
    };
    fs.writeFileSync(path.join(stagingDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
    fs.renameSync(stagingDir, finalDir);
    const retention = pruneHostBackups({
      backupRoot,
      sourceRoot: repoRoot,
      now: options.now,
      maxAgeMs: options.retentionMaxAgeMs,
      maxCount: options.retentionMaxCount,
      preservePaths: [finalDir],
      removeBackup: options.retentionRemoveBackup,
    });
    return { ok: retention.ok, backup_ok: true, backup_path: finalDir, retention, ...manifest };
  } catch (error) {
    try {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    } catch (cleanupError) {
      error.cleanupError = cleanupError.message;
    }
    error.stagingPath = fs.existsSync(stagingDir) ? stagingDir : null;
    throw error;
  }
}

module.exports = {
  HOST_BACKUP_MANIFEST_KIND,
  DEFAULT_BACKUP_ROOT,
  DEFAULT_DISK_PATH,
  DEFAULT_DAEMON_STATUS,
  DEFAULT_STATE_FILES,
  newestCanonicalBinMtime,
  diskUsage,
  probeRunner,
  probeHost,
  completedBackups,
  pruneHostBackups,
  pruneOrphanedTempFiles,
  isTransientFile,
  createHostBackup,
};
