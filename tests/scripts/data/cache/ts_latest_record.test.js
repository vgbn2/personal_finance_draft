'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  TsIndexIntegrityError,
  readLatestTsRecord,
} = require('../../../../shared/lib/market/validation.js');
const {
  SegmentIntegrityError,
  appendSegment,
} = require('../../../../shared/lib/market/append_only_segments.js');

const HEADER_BYTES = 8;
const RECORD_BYTES = 48;

function tempDir(tag) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `ts-latest-${tag}-`));
}

function record(timestamp, close, provider = 'binance') {
  return {
    symbol: 'BTCUSDT',
    timeframe: '1m',
    family: 'crypto',
    provider,
    timestamp,
    open: close - 0.5,
    high: close + 1,
    low: close - 1,
    close,
    volume: 10,
  };
}

function encodeRecord(buffer, offset, item) {
  buffer.writeDoubleLE(Date.parse(item.timestamp), offset);
  buffer.writeDoubleLE(item.open, offset + 8);
  buffer.writeDoubleLE(item.high, offset + 16);
  buffer.writeDoubleLE(item.low, offset + 24);
  buffer.writeDoubleLE(item.close, offset + 32);
  buffer.writeDoubleLE(item.volume, offset + 40);
}

function paths(dir) {
  return {
    bin: path.join(dir, 'BTCUSDT_1m.bin'),
    meta: path.join(dir, 'BTCUSDT_1m.meta.json'),
  };
}

function writeCanonical(dir, items, metaOverrides = {}) {
  const output = paths(dir);
  const buffer = Buffer.allocUnsafe(HEADER_BYTES + items.length * RECORD_BYTES);
  buffer.write('SOVT', 0, 'ascii');
  buffer.writeUInt32LE(items.length, 4);
  items.forEach((item, index) => encodeRecord(buffer, HEADER_BYTES + index * RECORD_BYTES, item));
  fs.writeFileSync(output.bin, buffer);
  fs.writeFileSync(output.meta, JSON.stringify({
    symbol: 'BTCUSDT',
    timeframe: '1m',
    family: 'crypto',
    provider: 'binance',
    count: items.length,
    ...metaOverrides,
  }));
  return output;
}

function writeLargeCanonical(dir, count) {
  const output = paths(dir);
  const buffer = Buffer.allocUnsafe(HEADER_BYTES + count * RECORD_BYTES);
  buffer.write('SOVT', 0, 'ascii');
  buffer.writeUInt32LE(count, 4);
  const start = Date.parse('2020-01-01T00:00:00.000Z');
  for (let index = 0; index < count; index += 1) {
    const offset = HEADER_BYTES + index * RECORD_BYTES;
    const close = 100 + index / 1000;
    buffer.writeDoubleLE(start + index * 60000, offset);
    buffer.writeDoubleLE(close - 0.5, offset + 8);
    buffer.writeDoubleLE(close + 1, offset + 16);
    buffer.writeDoubleLE(close - 1, offset + 24);
    buffer.writeDoubleLE(close, offset + 32);
    buffer.writeDoubleLE(10, offset + 40);
  }
  fs.writeFileSync(output.bin, buffer);
  fs.writeFileSync(output.meta, JSON.stringify({
    symbol: 'BTCUSDT',
    timeframe: '1m',
    family: 'crypto',
    provider: 'binance',
    count,
  }));
  return output;
}

test('latest canonical read is depth-independent and does not materialize the bin', () => {
  const dir = tempDir('bounded');
  const count = 200000;
  const output = writeLargeCanonical(dir, count);
  const originalReadSync = fs.readSync;
  const originalReadFileSync = fs.readFileSync;
  let requestedBytes = 0;
  fs.readSync = function countedReadSync(fd, buffer, offset, length, position) {
    requestedBytes += length;
    return originalReadSync.call(this, fd, buffer, offset, length, position);
  };
  fs.readFileSync = function guardedReadFileSync(filePath, ...args) {
    if (path.resolve(String(filePath)) === path.resolve(output.bin)) {
      throw new Error('latest reader attempted full-bin materialization');
    }
    return originalReadFileSync.call(this, filePath, ...args);
  };
  try {
    const latest = readLatestTsRecord(dir, 'BTCUSDT', '1m');
    assert.equal(latest.sourceMode, 'canonical');
    assert.equal(latest.recordCount, count);
    assert.equal(latest.record.close, 100 + (count - 1) / 1000);
    assert.ok(requestedBytes < 4096, `expected bounded reads, requested ${requestedBytes} bytes`);
  } finally {
    fs.readSync = originalReadSync;
    fs.readFileSync = originalReadFileSync;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('missing, empty, and dead-marker states return null without fabricating a zero', () => {
  const missing = tempDir('missing');
  const empty = tempDir('empty');
  const dead = tempDir('dead');
  try {
    assert.equal(readLatestTsRecord(missing, 'BTCUSDT', '1m'), null);
    writeCanonical(empty, []);
    assert.equal(readLatestTsRecord(empty, 'BTCUSDT', '1m'), null);
    fs.writeFileSync(paths(dead).meta, JSON.stringify({
      symbol: 'BTCUSDT',
      timeframe: '1m',
      family: 'crypto',
      provider: 'binance',
      count: 0,
      last_checked: Date.now(),
    }));
    assert.equal(readLatestTsRecord(dead, 'BTCUSDT', '1m'), null);
  } finally {
    for (const dir of [missing, empty, dead]) fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('truncated, identity-mismatched, non-finite, and non-monotonic tails fail closed', () => {
  const truncated = tempDir('truncated');
  const identity = tempDir('identity');
  const nonFinite = tempDir('nonfinite');
  const nonMonotonic = tempDir('nonmonotonic');
  try {
    const first = record('2026-07-01T00:00:00.000Z', 100);
    const truncatedPaths = writeCanonical(truncated, [first]);
    const header = Buffer.allocUnsafe(HEADER_BYTES);
    header.write('SOVT', 0, 'ascii');
    header.writeUInt32LE(2, 4);
    const truncatedFd = fs.openSync(truncatedPaths.bin, 'r+');
    fs.writeSync(truncatedFd, header, 0, header.length, 0);
    fs.closeSync(truncatedFd);
    fs.writeFileSync(truncatedPaths.meta, JSON.stringify({
      symbol: 'BTCUSDT', timeframe: '1m', family: 'crypto', provider: 'binance', count: 2,
    }));
    assert.throws(
      () => readLatestTsRecord(truncated, 'BTCUSDT', '1m'),
      (error) => error instanceof TsIndexIntegrityError && error.reason === 'canonical_length_mismatch',
    );

    writeCanonical(identity, [first], { symbol: 'ETHUSDT' });
    assert.throws(
      () => readLatestTsRecord(identity, 'BTCUSDT', '1m'),
      (error) => error instanceof TsIndexIntegrityError && error.reason === 'canonical_identity_mismatch',
    );

    const nonFinitePaths = writeCanonical(nonFinite, [first]);
    const nonFiniteFd = fs.openSync(nonFinitePaths.bin, 'r+');
    fs.writeSync(nonFiniteFd, Buffer.from('000000000000f87f', 'hex'), 0, 8, HEADER_BYTES + 32);
    fs.closeSync(nonFiniteFd);
    assert.throws(
      () => readLatestTsRecord(nonFinite, 'BTCUSDT', '1m'),
      (error) => error instanceof TsIndexIntegrityError && error.reason === 'invalid_record_values',
    );

    writeCanonical(nonMonotonic, [
      record('2026-07-01T00:01:00.000Z', 101),
      record('2026-07-01T00:00:00.000Z', 100),
    ]);
    assert.throws(
      () => readLatestTsRecord(nonMonotonic, 'BTCUSDT', '1m'),
      (error) => error instanceof TsIndexIntegrityError && error.reason === 'non_monotonic_canonical_tail',
    );
  } finally {
    for (const dir of [truncated, identity, nonFinite, nonMonotonic]) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('unsafe timeframe and symlinked canonical bins are rejected', (t) => {
  const dir = tempDir('path-security');
  const target = path.join(dir, 'target.bin');
  let targetDir;
  try {
    assert.throws(
      () => readLatestTsRecord(dir, 'BTCUSDT', '../1m'),
      (error) => error instanceof TsIndexIntegrityError && error.reason === 'invalid_read_identity',
    );
    targetDir = tempDir('symlink-target');
    const targetPaths = writeCanonical(targetDir, [record('2026-07-01T00:00:00.000Z', 100)]);
    fs.copyFileSync(targetPaths.bin, target);
    fs.copyFileSync(targetPaths.meta, paths(dir).meta);
    try {
      fs.symlinkSync(target, paths(dir).bin);
    } catch (error) {
      return t.skip(`symlink creation unavailable: ${error.code || error.message}`);
    }
    assert.throws(
      () => readLatestTsRecord(dir, 'BTCUSDT', '1m'),
      (error) => error instanceof TsIndexIntegrityError
        && ['canonical_bin_symlink_rejected', 'canonical_bin_not_regular_file'].includes(error.reason),
    );
  } finally {
    if (targetDir) fs.rmSync(targetDir, { recursive: true, force: true });
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('symlinked active-segment manifests are rejected', (t) => {
  const dir = tempDir('manifest-symlink');
  const external = path.join(dir, 'external-manifest.json');
  const segmentDir = path.join(dir, '.segments', 'BTCUSDT_1m');
  try {
    fs.mkdirSync(segmentDir, { recursive: true });
    fs.writeFileSync(external, JSON.stringify({
      version: 1,
      symbol: 'BTCUSDT',
      timeframe: '1m',
      segments: [],
    }));
    try {
      fs.symlinkSync(external, path.join(segmentDir, 'manifest.json'));
    } catch (error) {
      return t.skip(`symlink creation unavailable: ${error.code || error.message}`);
    }
    assert.throws(
      () => readLatestTsRecord(dir, 'BTCUSDT', '1m'),
      (error) => error instanceof SegmentIntegrityError && error.reason === 'segment_symlink_rejected',
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a canonical append racing the first read retries to a stable complete tail', () => {
  const dir = tempDir('append-race');
  const first = record('2026-07-01T00:00:00.000Z', 100);
  const second = record('2026-07-01T00:01:00.000Z', 101);
  const output = writeCanonical(dir, [first]);
  const originalReadSync = fs.readSync;
  let mutated = false;
  fs.readSync = function racingReadSync(fd, buffer, offset, length, position) {
    const bytesRead = originalReadSync.call(this, fd, buffer, offset, length, position);
    if (!mutated && position === 0 && length === HEADER_BYTES
      && buffer.toString('ascii', 0, 4) === 'SOVT') {
      mutated = true;
      const appendFd = fs.openSync(output.bin, 'r+');
      const encoded = Buffer.allocUnsafe(RECORD_BYTES);
      encodeRecord(encoded, 0, second);
      fs.writeSync(appendFd, encoded, 0, encoded.length, HEADER_BYTES + RECORD_BYTES);
      fs.ftruncateSync(appendFd, HEADER_BYTES + 2 * RECORD_BYTES);
      const count = Buffer.allocUnsafe(4);
      count.writeUInt32LE(2, 0);
      fs.writeSync(appendFd, count, 0, count.length, 4);
      fs.closeSync(appendFd);
      fs.writeFileSync(output.meta, JSON.stringify({
        symbol: 'BTCUSDT', timeframe: '1m', family: 'crypto', provider: 'binance', count: 2,
      }));
    }
    return bytesRead;
  };
  try {
    const latest = readLatestTsRecord(dir, 'BTCUSDT', '1m');
    assert.equal(mutated, true);
    assert.equal(latest.record.timestamp, second.timestamp);
    assert.equal(latest.record.close, second.close);
  } finally {
    fs.readSync = originalReadSync;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('latest active-segment reads use bounded buffers while verifying the full checksum', () => {
  const dir = tempDir('segment-bounded');
  const meta = { symbol: 'BTCUSDT', timeframe: '1m', family: 'crypto', provider: 'binance' };
  const start = Date.parse('2026-01-01T00:00:00.000Z');
  const records = Array.from({ length: 10000 }, (_, index) => (
    record(new Date(start + index * 60000).toISOString(), 100 + index / 1000)
  ));
  try {
    const result = appendSegment(dir, meta, records);
    const segmentPath = path.join(dir, '.segments', 'BTCUSDT_1m', result.file);
    const originalReadSync = fs.readSync;
    const originalReadFileSync = fs.readFileSync;
    let maxRequestedBytes = 0;
    fs.readSync = function countedReadSync(fd, buffer, offset, length, position) {
      maxRequestedBytes = Math.max(maxRequestedBytes, length);
      return originalReadSync.call(this, fd, buffer, offset, length, position);
    };
    fs.readFileSync = function guardedReadFileSync(filePath, ...args) {
      if (path.resolve(String(filePath)) === path.resolve(segmentPath)) {
        throw new Error('latest segment reader attempted full-file materialization');
      }
      return originalReadFileSync.call(this, filePath, ...args);
    };
    try {
      const latest = readLatestTsRecord(dir, 'BTCUSDT', '1m');
      assert.equal(latest.sourceMode, 'segments');
      assert.equal(latest.recordCount, null, 'overlapping segment ranges have no cheap exact unique count');
      assert.equal(latest.record.timestamp, records[records.length - 1].timestamp);
      assert.ok(maxRequestedBytes <= 64 * 1024, `largest read was ${maxRequestedBytes} bytes`);
    } finally {
      fs.readSync = originalReadSync;
      fs.readFileSync = originalReadFileSync;
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('mixed canonical and active segments preserve timestamp and provider precedence', () => {
  const dir = tempDir('mixed');
  const meta = { symbol: 'BTCUSDT', timeframe: '1m', family: 'crypto', provider: 'yahoo' };
  try {
    const timestamp = '2026-07-01T00:00:00.000Z';
    writeCanonical(dir, [record(timestamp, 100, 'binance')]);
    appendSegment(dir, meta, [record(timestamp, 1, 'yahoo')]);
    let latest = readLatestTsRecord(dir, 'BTCUSDT', '1m');
    assert.equal(latest.sourceMode, 'merged');
    assert.equal(latest.record.close, 100, 'lower-priority segment cannot replace canonical Binance data');

    appendSegment(dir, meta, [record('2026-07-01T00:01:00.000Z', 2, 'yahoo')]);
    latest = readLatestTsRecord(dir, 'BTCUSDT', '1m');
    assert.equal(latest.record.close, 2, 'a strictly newer segment record is the latest value');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('active segment corruption fails closed in the latest-record path', () => {
  const dir = tempDir('segment-corrupt');
  const meta = { symbol: 'BTCUSDT', timeframe: '1m', family: 'crypto', provider: 'binance' };
  try {
    const result = appendSegment(dir, meta, [record('2026-07-01T00:00:00.000Z', 100)]);
    const file = path.join(dir, '.segments', 'BTCUSDT_1m', result.file);
    fs.appendFileSync(file, Buffer.from([0]));
    assert.throws(
      () => readLatestTsRecord(dir, 'BTCUSDT', '1m'),
      (error) => error instanceof SegmentIntegrityError && error.reason === 'segment_length_mismatch',
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
