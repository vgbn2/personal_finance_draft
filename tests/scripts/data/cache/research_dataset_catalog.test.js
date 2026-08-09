'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  buildResearchDatasetCatalog,
  hashRegularFile,
} = require('../../../../shared/lib/market/research_dataset_catalog.js');
const { appendSegment } = require('../../../../shared/lib/market/append_only_segments.js');

const DAY_MS = 86_400_000;
const NOW = Date.parse('2026-08-09T00:00:00.000Z');

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'research-catalog-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeBin(tsDir, symbol, timeframe, records, meta = {}) {
  const safe = symbol.replace(/[^a-zA-Z0-9_]/g, '_');
  const bin = path.join(tsDir, `${safe}_${timeframe}.bin`);
  const sidecar = path.join(tsDir, `${safe}_${timeframe}.meta.json`);
  const buffer = Buffer.allocUnsafe(8 + records.length * 48);
  buffer.write('SOVT', 0, 'ascii');
  buffer.writeUInt32LE(records.length, 4);
  records.forEach((record, index) => {
    const offset = 8 + index * 48;
    buffer.writeDoubleLE(record.timestamp, offset);
    buffer.writeDoubleLE(record.open, offset + 8);
    buffer.writeDoubleLE(record.high, offset + 16);
    buffer.writeDoubleLE(record.low, offset + 24);
    buffer.writeDoubleLE(record.close, offset + 32);
    buffer.writeDoubleLE(record.volume, offset + 40);
  });
  fs.writeFileSync(bin, buffer);
  fs.writeFileSync(sidecar, JSON.stringify({
    family: meta.family || 'equities',
    provider: meta.provider || 'test',
    symbol,
    timeframe,
    derived_from: meta.derived_from || null,
  }));
  return bin;
}

function dailyRecords(count, lastMs = NOW - DAY_MS) {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + index * 0.1;
    return {
      timestamp: lastMs - (count - 1 - index) * DAY_MS,
      open: close - 0.2,
      high: close + 0.5,
      low: close - 0.5,
      close,
      volume: 1000 + index,
    };
  });
}

function config() {
  return {
    equities: {
      enabled: true,
      symbols: ['AAPL', 'MISSING'],
      timeframes: ['1d'],
      universe_matrix: { grid: { USA: { technology: ['AAPL', 'MISSING'] } } },
    },
    quality: { reject_stale: true, reject_lookahead: true },
  };
}

test('dataset catalog returns exact eligible identity and deterministic fingerprint', async (t) => {
  const tsDir = tempDir(t);
  const bin = writeBin(tsDir, 'AAPL', '1d', dailyRecords(120));
  const expected = hashRegularFile(bin);
  assert.equal(expected.ok, true);

  const catalog = await buildResearchDatasetCatalog({
    config: config(),
    tsDir,
    symbols: 'AAPL',
    timeframes: '1d',
    now: NOW,
    generatedAt: '2026-08-09T00:00:00.000Z',
  });

  assert.equal(catalog.research_only, true);
  assert.equal(catalog.promotion_eligible, false);
  assert.equal(catalog.counts.eligible, 1);
  assert.equal(catalog.counts.rejected, 0);
  assert.equal(catalog.datasets[0].dataset_id, 'equities:AAPL:1d');
  assert.equal(catalog.datasets[0].instrument_id, 'equities:AAPL');
  assert.equal(catalog.datasets[0].fingerprint, expected.sha256);
  assert.equal(catalog.datasets[0].records, 120);
});

test('dataset catalog rejects missing, stale, and derived datasets', async (t) => {
  const tsDir = tempDir(t);
  writeBin(tsDir, 'AAPL', '1d', dailyRecords(120, NOW - 30 * DAY_MS), {
    derived_from: '1w',
  });

  const derived = await buildResearchDatasetCatalog({
    config: config(),
    tsDir,
    symbols: 'AAPL',
    timeframes: '1d',
    now: NOW,
  });
  assert.equal(derived.counts.eligible, 0);
  assert.equal(derived.rejected[0].reason, 'freshness_stale');

  const allowStale = await buildResearchDatasetCatalog({
    config: config(),
    tsDir,
    symbols: 'AAPL',
    timeframes: '1d',
    now: NOW,
    allowStale: true,
  });
  assert.equal(allowStale.rejected[0].reason, 'derived_dataset_not_allowed');

  const missing = await buildResearchDatasetCatalog({
    config: config(),
    tsDir,
    symbols: 'MISSING',
    timeframes: '1d',
    now: NOW,
  });
  assert.equal(missing.rejected[0].reason, 'dataset_missing');
});

test('dataset catalog rejects active append-only segments until snapshotted', async (t) => {
  const tsDir = tempDir(t);
  writeBin(tsDir, 'AAPL', '1d', dailyRecords(120));
  appendSegment(tsDir, {
    family: 'equities',
    provider: 'test',
    symbol: 'AAPL',
    timeframe: '1d',
  }, [{
    family: 'equities',
    provider: 'test',
    symbol: 'AAPL',
    timeframe: '1d',
    timestamp: new Date(NOW).toISOString(),
    open: 112,
    high: 113,
    low: 111,
    close: 112.5,
    volume: 2000,
  }]);

  const catalog = await buildResearchDatasetCatalog({
    config: config(),
    tsDir,
    symbols: 'AAPL',
    timeframes: '1d',
    now: NOW,
  });
  assert.equal(catalog.counts.eligible, 0);
  assert.equal(catalog.rejected[0].reason, 'active_segments_require_immutable_snapshot');
  assert.equal(catalog.rejected[0].active_segments, 1);
});

test('file fingerprint rejects symlinks and size limits', (t) => {
  const dir = tempDir(t);
  const source = path.join(dir, 'source.bin');
  const link = path.join(dir, 'link.bin');
  fs.writeFileSync(source, Buffer.alloc(32));
  fs.symlinkSync(source, link);
  assert.equal(hashRegularFile(link).reason, 'dataset_symlink_rejected');
  assert.equal(hashRegularFile(source, 16).reason, 'dataset_exceeds_fingerprint_limit');
});
