'use strict';

/**
 * commandMassBackfill (backend/cli/commands/data/data.js) used to accumulate every
 * job's records into one run-wide array and write the JSON cache + ts-index exactly
 * once after all jobs settled -- the confirmed OOM-risk pattern for large universes.
 * It now flushes the ts-index per job (writeTsIndex's symbol+timeframe-scoped
 * merge-protected bin writes are already safe at that grain) and the JSON cache per
 * family (writePartitionedSnapshot/readSnapshot are already family-partitioned on
 * disk, so buffering one family at a time bounds peak memory without changing what
 * ends up on disk).
 *
 * commandMassBackfill itself calls real providers/config, so it isn't exercised
 * directly here. Instead these tests prove the core invariant the refactor depends
 * on: flushing incrementally (several small writes) is byte-equivalent to flushing
 * once at the end (one big write), using the exact same exported primitives the
 * refactored runJob/flushFamily call.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  validateSnapshot,
  readSnapshot,
  mergeSnapshots,
  writePartitionedSnapshot,
  writeTsIndex,
  readTsIndex,
} = require('../../../../shared/lib/market/validation.js');

function makeTmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function bar(symbol, family, timeframe, tsMs, value) {
  return {
    timestamp: new Date(tsMs).toISOString(),
    open: value, high: value, low: value, close: value, volume: value,
    symbol, family, timeframe, provider: 'test',
  };
}

test('writeTsIndex: N small incremental writes equal one big write (ts-index side of the flush refactor)', () => {
  const dayMs = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const allBars = Array.from({ length: 6 }, (_, i) => bar('BTCUSDT', 'crypto', '1d', now - i * dayMs, i));

  const incrementalDir = makeTmpDir('mbf-incremental-ts-');
  const oneShotDir = makeTmpDir('mbf-oneshot-ts-');
  try {
    // Mirrors runJob: one writeTsIndex call per job, each with only that job's bars.
    for (const b of allBars) {
      writeTsIndex(incrementalDir, { sources: [b] });
    }
    // Mirrors the old behavior: accumulate everything, write once.
    writeTsIndex(oneShotDir, { sources: allBars });

    const incremental = readTsIndex(incrementalDir, 'BTCUSDT', '1d');
    const oneShot = readTsIndex(oneShotDir, 'BTCUSDT', '1d');

    assert.equal(incremental.length, allBars.length);
    assert.deepEqual(incremental, oneShot, 'per-job incremental writes produce the same bin contents as one full write');
  } finally {
    fs.rmSync(incrementalDir, { recursive: true, force: true });
    fs.rmSync(oneShotDir, { recursive: true, force: true });
  }
});

test('writePartitionedSnapshot: per-family incremental flush equals one whole-run flush (JSON cache side of the flush refactor)', () => {
  const now = Date.now();
  const cryptoBars = [
    bar('BTCUSDT', 'crypto', '1d', now, 1),
    bar('ETHUSDT', 'crypto', '1d', now, 2),
  ];
  const equityBars = [
    bar('AAPL', 'equities', '1d', now, 3),
    bar('MSFT', 'equities', '1d', now, 4),
  ];

  const incrementalRoot = makeTmpDir('mbf-incremental-json-');
  const oneShotRoot = makeTmpDir('mbf-oneshot-json-');
  try {
    // Mirrors flushFamily: one merge+write per family, called as each family's jobs complete.
    for (const [family, sources] of [['crypto', cryptoBars], ['equities', equityBars]]) {
      const snapshot = { mode: 'mass_backfill', fetched_at: new Date(now).toISOString(), sources, errors: [] };
      const existing = readSnapshot(incrementalRoot, { family });
      const merged = mergeSnapshots(existing, snapshot);
      writePartitionedSnapshot(incrementalRoot, merged);
    }

    // Mirrors the old behavior: one combined snapshot across every family, written once.
    const wholeSnapshot = {
      mode: 'mass_backfill',
      fetched_at: new Date(now).toISOString(),
      sources: [...cryptoBars, ...equityBars],
      errors: [],
    };
    const existingWhole = readSnapshot(oneShotRoot);
    const mergedWhole = mergeSnapshots(existingWhole, wholeSnapshot);
    writePartitionedSnapshot(oneShotRoot, mergedWhole);

    for (const family of ['crypto', 'equities']) {
      const incrementalFile = JSON.parse(fs.readFileSync(path.join(incrementalRoot, family, 'backtest_history.json'), 'utf8'));
      const oneShotFile = JSON.parse(fs.readFileSync(path.join(oneShotRoot, family, 'backtest_history.json'), 'utf8'));
      assert.deepEqual(incrementalFile.sources, oneShotFile.sources, `${family} partition has identical sources via incremental vs one-shot flush`);
    }
  } finally {
    fs.rmSync(incrementalRoot, { recursive: true, force: true });
    fs.rmSync(oneShotRoot, { recursive: true, force: true });
  }
});

test('writePartitionedSnapshot: a second incremental flush for the same family merges with what is already on disk (no overwrite of prior jobs)', () => {
  const now = Date.now();
  const root = makeTmpDir('mbf-merge-on-disk-');
  try {
    const firstJobBars = [bar('BTCUSDT', 'crypto', '1d', now - 86400000, 1)];
    const secondJobBars = [bar('ETHUSDT', 'crypto', '1d', now, 2)];

    // First job for the family flushes alone.
    let snapshot = { mode: 'mass_backfill', fetched_at: new Date(now).toISOString(), sources: firstJobBars, errors: [] };
    let merged = mergeSnapshots(readSnapshot(root, { family: 'crypto' }), snapshot);
    writePartitionedSnapshot(root, merged);

    // A later job for the same family (e.g. a different symbol/timeframe combo
    // that happens to finish after the first flush) must not wipe out the first.
    snapshot = { mode: 'mass_backfill', fetched_at: new Date(now).toISOString(), sources: secondJobBars, errors: [] };
    merged = mergeSnapshots(readSnapshot(root, { family: 'crypto' }), snapshot);
    writePartitionedSnapshot(root, merged);

    const onDisk = JSON.parse(fs.readFileSync(path.join(root, 'crypto', 'backtest_history.json'), 'utf8'));
    assert.equal(onDisk.sources.length, 2, 'both jobs survive across two separate flushes of the same family');
    const symbols = onDisk.sources.map((s) => s.symbol).sort();
    assert.deepEqual(symbols, ['BTCUSDT', 'ETHUSDT']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('validateSnapshot: summing per-family reports equals one whole-run report (quality-report aggregation side of the flush refactor)', () => {
  const now = Date.now();
  const cryptoBars = [bar('BTCUSDT', 'crypto', '1d', now, 1)];
  const equityBars = [bar('AAPL', 'equities', '1d', now, 2), { family: 'equities', symbol: 'BAD', timeframe: '1d' }]; // second record is invalid (no timestamp)

  let totalRecords = 0;
  let usableRecords = 0;
  let errorCount = 0;
  for (const sources of [cryptoBars, equityBars]) {
    const { report } = validateSnapshot({ mode: 'mass_backfill', fetched_at: new Date(now).toISOString(), sources, errors: [] }, { rejectStale: false });
    totalRecords += report.total_records;
    usableRecords += report.usable_records;
    errorCount += report.counts.error;
  }

  const { report: wholeReport } = validateSnapshot({
    mode: 'mass_backfill',
    fetched_at: new Date(now).toISOString(),
    sources: [...cryptoBars, ...equityBars],
    errors: [],
  }, { rejectStale: false });

  assert.equal(totalRecords, wholeReport.total_records);
  assert.equal(usableRecords, wholeReport.usable_records);
  assert.equal(errorCount, wholeReport.counts.error);
  assert.ok(errorCount > 0, 'sanity check -- the deliberately-invalid record was actually counted as an error');
});
