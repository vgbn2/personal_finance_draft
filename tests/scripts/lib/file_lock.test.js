'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  acquireFileLockSync,
  readLockOwner,
  releaseFileLockSync,
} = require('../../../shared/lib/runtime/file_lock.js');

function tempLock() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-file-lock-'));
  return { dir, lockPath: path.join(dir, 'resource.write.lock') };
}

test('file lock is exclusive and only its ownership token can release it', () => {
  const { dir, lockPath } = tempLock();
  try {
    const handle = acquireFileLockSync(lockPath, { timeoutMs: 100, retryMs: 5, staleMs: 60_000 });
    assert.equal(readLockOwner(lockPath).token, handle.token);
    assert.throws(
      () => acquireFileLockSync(lockPath, { timeoutMs: 30, retryMs: 5, staleMs: 60_000 }),
      (error) => error.code === 'ELOCKED' && error.lock_path === lockPath,
    );
    assert.equal(releaseFileLockSync({ ...handle, token: 'not-the-owner' }), false);
    assert.equal(fs.existsSync(lockPath), true, 'non-owner cannot remove the active lock');
    assert.equal(releaseFileLockSync(handle), true);
    assert.equal(fs.existsSync(lockPath), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('file lock reclaims an unchanged stale sidecar and leaves no residue', () => {
  const { dir, lockPath } = tempLock();
  try {
    fs.writeFileSync(lockPath, JSON.stringify({ version: 1, token: 'crashed-writer' }));
    const staleTime = new Date(Date.now() - 60_000);
    fs.utimesSync(lockPath, staleTime, staleTime);

    const handle = acquireFileLockSync(lockPath, { timeoutMs: 100, retryMs: 5, staleMs: 1_000 });
    assert.notEqual(handle.token, 'crashed-writer');
    assert.equal(readLockOwner(lockPath).token, handle.token);
    assert.equal(releaseFileLockSync(handle), true);
    assert.equal(fs.existsSync(lockPath), false);
    console.log(JSON.stringify({ type: 'file_lock', stale_reclaimed: true, lock_residue: false }));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
