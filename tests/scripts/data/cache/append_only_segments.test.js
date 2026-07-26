'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const { writeTsIndex, readTsIndex, readTsIndexSince } = require('../../../../shared/lib/market/validation.js');
const { readCoverage } = require('../../../../shared/lib/market/coverage.js');
const {
  SegmentIntegrityError, appendSegment, compactSegments, readManifest, readSegments, segmentCoverage,
} = require('../../../../shared/lib/market/append_only_segments.js');

function record(timestamp, close, provider = 'binance') {
  return {
    symbol: 'BTCUSDT', family: 'crypto', provider, timeframe: '1m', timestamp,
    open: close, high: close + 1, low: close - 1, close, volume: 1,
  };
}

test('append-only segments preserve published bytes and expose merged reads', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'segments-'));
  const meta = { symbol: 'BTCUSDT', timeframe: '1m', family: 'crypto', provider: 'binance' };
  const first = appendSegment(dir, meta, [record('2026-07-01T00:00:00.000Z', 100)]);
  assert.equal(first.appended, true);
  const firstPath = path.join(dir, '.segments', 'BTCUSDT_1m', first.file);
  const firstHash = crypto.createHash('sha256').update(fs.readFileSync(firstPath)).digest('hex');

  appendSegment(dir, meta, [record('2026-07-01T00:01:00.000Z', 101)]);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(firstPath)).digest('hex'), firstHash);
  assert.equal(readSegments(dir, 'BTCUSDT', '1m').length, 2);
  assert.equal(readTsIndex(dir, 'BTCUSDT', '1m').length, 2, 'validation reader falls back to segments');
  assert.equal(readTsIndexSince(dir, 'BTCUSDT', '1m', Date.parse('2026-07-01T00:01:00Z')).length, 1);
  assert.equal(segmentCoverage(dir, 'BTCUSDT', '1m').count, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('SOVEREIGN_TS_STORAGE=segments routes writes without replacing old segments', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'segments-env-'));
  const prior = process.env.SOVEREIGN_TS_STORAGE;
  process.env.SOVEREIGN_TS_STORAGE = 'segments';
  try {
    writeTsIndex(dir, { sources: [record('2026-07-01T00:00:00.000Z', 100)] });
    writeTsIndex(dir, { sources: [record('2026-07-01T00:01:00.000Z', 101)] });
    assert.equal(fs.existsSync(path.join(dir, 'BTCUSDT_1m.bin')), false, 'segment mode does not rewrite canonical bin');
    assert.equal(readManifest(dir, 'BTCUSDT', '1m').segments.length, 2);
    assert.equal(readTsIndex(dir, 'BTCUSDT', '1m').length, 2);
  } finally {
    if (prior === undefined) delete process.env.SOVEREIGN_TS_STORAGE; else process.env.SOVEREIGN_TS_STORAGE = prior;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('segment mode merges a pre-existing canonical bin and preserves provider precedence', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'segments-mixed-'));
  const prior = process.env.SOVEREIGN_TS_STORAGE;
  try {
    writeTsIndex(dir, { sources: [record('2026-07-01T00:00:00.000Z', 100, 'binance')] });
    process.env.SOVEREIGN_TS_STORAGE = 'segments';
    writeTsIndex(dir, { sources: [record('2026-07-01T00:01:00.000Z', 101, 'binance')] });
    writeTsIndex(dir, { sources: [record('2026-07-01T00:00:00.000Z', 1, 'yahoo')] });

    const merged = readTsIndex(dir, 'BTCUSDT', '1m');
    assert.equal(merged.length, 2);
    assert.equal(merged[0].close, 100, 'lower-priority segment cannot replace canonical Binance bar');
    assert.equal(readCoverage(dir, 'BTCUSDT', '1m').count, 2, 'coverage sees canonical plus active segments');
  } finally {
    if (prior === undefined) delete process.env.SOVEREIGN_TS_STORAGE; else process.env.SOVEREIGN_TS_STORAGE = prior;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('active segment corruption and disappearance fail closed instead of reporting partial coverage', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'segments-integrity-'));
  const meta = { symbol: 'BTCUSDT', timeframe: '1m', family: 'crypto', provider: 'binance' };
  try {
    const first = appendSegment(dir, meta, [record('2026-07-01T00:00:00.000Z', 100)]);
    const file = path.join(dir, '.segments', 'BTCUSDT_1m', first.file);
    fs.appendFileSync(file, Buffer.from([0]));
    assert.throws(() => readSegments(dir, 'BTCUSDT', '1m'), SegmentIntegrityError);
    assert.equal(readCoverage(dir, 'BTCUSDT', '1m').exists, false);

    fs.rmSync(file);
    assert.throws(() => segmentCoverage(dir, 'BTCUSDT', '1m'), SegmentIntegrityError);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('compaction advances the manifest and retains prior generations for recovery', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'segments-compact-'));
  const meta = { symbol: 'BTCUSDT', timeframe: '1m', family: 'crypto', provider: 'binance' };
  const first = appendSegment(dir, meta, [record('2026-07-01T00:00:00.000Z', 100)]);
  appendSegment(dir, meta, [record('2026-07-01T00:01:00.000Z', 101)]);
  const result = compactSegments(dir, 'BTCUSDT', '1m');
  assert.equal(result.ok, true);
  assert.equal(readManifest(dir, 'BTCUSDT', '1m').segments.length, 1);
  assert.equal(readSegments(dir, 'BTCUSDT', '1m').length, 2);
  assert.equal(fs.existsSync(path.join(dir, '.segments', 'BTCUSDT_1m', first.file)), true, 'old segment retained');
  fs.rmSync(dir, { recursive: true, force: true });
});
