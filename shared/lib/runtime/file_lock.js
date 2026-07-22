'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_LOCK_TIMEOUT_MS = 30_000;
const DEFAULT_LOCK_RETRY_MS = 25;
const DEFAULT_LOCK_STALE_MS = 5 * 60_000;
const SLEEP_BUFFER = new Int32Array(new SharedArrayBuffer(4));

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readLockOwner(lockPath) {
  try {
    return JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch {
    return null;
  }
}

function sleepSync(delayMs) {
  Atomics.wait(SLEEP_BUFFER, 0, 0, delayMs);
}

function staleLockCanBeRemoved(lockPath, staleMs, now) {
  try {
    const before = fs.statSync(lockPath);
    if (now - before.mtimeMs < staleMs) return false;
    const after = fs.statSync(lockPath);
    if (before.dev !== after.dev || before.ino !== after.ino || before.mtimeMs !== after.mtimeMs) {
      return false;
    }
    fs.unlinkSync(lockPath);
    return true;
  } catch (error) {
    return error.code === 'ENOENT';
  }
}

function acquireFileLockSync(lockPath, options = {}) {
  const resolvedPath = path.resolve(lockPath);
  const timeoutMs = positiveInteger(options.timeoutMs, DEFAULT_LOCK_TIMEOUT_MS);
  const retryMs = positiveInteger(options.retryMs, DEFAULT_LOCK_RETRY_MS);
  const staleMs = positiveInteger(options.staleMs, DEFAULT_LOCK_STALE_MS);
  const token = crypto.randomUUID();
  const startedAt = Date.now();
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

  for (;;) {
    let fd;
    try {
      fd = fs.openSync(resolvedPath, 'wx', 0o600);
      fs.writeFileSync(fd, JSON.stringify({
        version: 1,
        token,
        pid: process.pid,
        created_at: new Date().toISOString(),
      }), 'utf8');
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      return { path: resolvedPath, token, acquired_at_ms: Date.now() };
    } catch (error) {
      if (fd !== undefined) {
        try { fs.closeSync(fd); } catch { /* best effort */ }
      }
      if (error.code !== 'EEXIST') throw error;

      const now = Date.now();
      if (staleLockCanBeRemoved(resolvedPath, staleMs, now)) continue;
      if (now - startedAt >= timeoutMs) {
        const lockError = new Error(`Timed out waiting for file lock: ${resolvedPath}`);
        lockError.code = 'ELOCKED';
        lockError.lock_path = resolvedPath;
        lockError.owner = readLockOwner(resolvedPath);
        throw lockError;
      }
      sleepSync(Math.min(retryMs, Math.max(1, timeoutMs - (now - startedAt))));
    }
  }
}

function refreshFileLockSync(handle) {
  if (!handle || !handle.path || !handle.token) return false;
  const owner = readLockOwner(handle.path);
  if (!owner || owner.token !== handle.token) return false;
  const now = new Date();
  fs.utimesSync(handle.path, now, now);
  return true;
}

function releaseFileLockSync(handle) {
  if (!handle || !handle.path || !handle.token) return false;
  try {
    const owner = readLockOwner(handle.path);
    if (!owner || owner.token !== handle.token) return false;
    fs.unlinkSync(handle.path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function withFileLockSync(lockPath, fn, options = {}) {
  const handle = acquireFileLockSync(lockPath, options);
  try {
    return fn(handle);
  } finally {
    releaseFileLockSync(handle);
  }
}

module.exports = {
  DEFAULT_LOCK_RETRY_MS,
  DEFAULT_LOCK_STALE_MS,
  DEFAULT_LOCK_TIMEOUT_MS,
  acquireFileLockSync,
  readLockOwner,
  refreshFileLockSync,
  releaseFileLockSync,
  withFileLockSync,
};
