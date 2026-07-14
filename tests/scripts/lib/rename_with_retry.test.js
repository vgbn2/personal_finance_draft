const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { renameWithRetry, writeJson } = require('../../../shared/lib/market/validation');

/**
 * TEST: renameWithRetry (cross-process EPERM/EBUSY safety + real sleep)
 *
 * renameWithRetry sits on the hot path for every writeJson and every
 * mergeWriteBin call (every JSON cache write + every ts-index bin write in the
 * pipeline). It replaced a bare fs.renameSync that prior sessions documented as
 * a real cross-process EPERM crash risk on Windows. These tests pin both halves
 * of its contract: (1) a transient rename failure is retried and ultimately
 * succeeds, and (2) the retry delay is an actual sleep (the Atomics.wait fix),
 * not a zero-cost no-op and not an infinite spin.
 */

test('renameWithRetry retries a transient EPERM failure then succeeds', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rwr-'));
  const src = path.join(dir, 'src.txt');
  const dest = path.join(dir, 'dest.txt');
  fs.writeFileSync(src, 'payload', 'utf8');

  const realRename = fs.renameSync;
  let calls = 0;
  fs.renameSync = (from, to) => {
    calls += 1;
    if (calls === 1) {
      const err = new Error('EPERM: operation not permitted, rename');
      err.code = 'EPERM';
      throw err;
    }
    return realRename(from, to);
  };

  try {
    renameWithRetry(src, dest, 5, 10);
  } finally {
    fs.renameSync = realRename;
  }

  assert.equal(calls, 2, 'should fail once then succeed on the retry');
  assert.equal(fs.readFileSync(dest, 'utf8'), 'payload', 'file landed at dest');
  assert.ok(!fs.existsSync(src), 'src consumed by the successful rename');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('renameWithRetry actually sleeps delayMs between retries (no busy-spin, no no-op)', () => {
  const realRename = fs.renameSync;
  let calls = 0;
  fs.renameSync = () => {
    calls += 1;
    if (calls < 3) {
      const err = new Error('EBUSY: resource busy or locked, rename');
      err.code = 'EBUSY';
      throw err;
    }
    // 3rd attempt: succeed (no-op; we never assert on the moved file here)
  };

  const delayMs = 40;
  const start = Date.now();
  try {
    // src/dest are never touched because the mock short-circuits fs.renameSync
    renameWithRetry('ignored-src', 'ignored-dest', 5, delayMs);
  } finally {
    fs.renameSync = realRename;
  }
  const elapsed = Date.now() - start;

  assert.equal(calls, 3, 'two failures then success = three calls');
  // Two failed attempts => two sleeps of delayMs each. Assert the lower bound
  // (proves it sleeps at all, ruling out the old zero-time risk) with slack for
  // timer granularity; an unbounded busy-spin would also be caught upstream by
  // the suite's per-test timeout.
  assert.ok(
    elapsed >= delayMs,
    `expected at least one delayMs (${delayMs}ms) of real sleep, got ${elapsed}ms`,
  );
});

test('renameWithRetry rethrows after exhausting all retries', () => {
  const realRename = fs.renameSync;
  let calls = 0;
  fs.renameSync = () => {
    calls += 1;
    const err = new Error('EPERM: operation not permitted, rename');
    err.code = 'EPERM';
    throw err;
  };

  try {
    assert.throws(
      () => renameWithRetry('src', 'dest', 3, 5),
      /EPERM/,
      'should rethrow the last error once retries are exhausted',
    );
  } finally {
    fs.renameSync = realRename;
  }
  assert.equal(calls, 3, 'attempted exactly `retries` times before giving up');
});

test('writeJson uses a unique temp path per call to avoid sibling process rename races', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wj-'));
  const dest = path.join(dir, 'report.json');
  const realRename = fs.renameSync;
  const tempPaths = [];

  fs.renameSync = (from, to) => {
    tempPaths.push(from);
    return realRename(from, to);
  };

  try {
    writeJson(dest, { sources: [{ symbol: 'AAPL', close: 1 }] });
    writeJson(dest, { sources: [{ symbol: 'MSFT', close: 2 }] });
  } finally {
    fs.renameSync = realRename;
  }

  assert.equal(tempPaths.length, 2);
  assert.equal(new Set(tempPaths).size, 2, 'successive writes must not share report.json.tmp');
  assert.ok(tempPaths.every((tempPath) => tempPath.startsWith(`${dest}.`)));
  assert.ok(tempPaths.every((tempPath) => tempPath.endsWith('.tmp')));
  assert.equal(JSON.parse(fs.readFileSync(dest, 'utf8')).sources[0].symbol, 'MSFT');

  fs.rmSync(dir, { recursive: true, force: true });
});
