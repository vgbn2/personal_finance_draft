'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  buildCanonicalDataSummary,
} = require('../../../../backend/cli/commands/tools/backend.js');
const {
  writeTsIndex,
} = require('../../../../shared/lib/market/validation.js');

test('default data summary uses constant-memory canonical coverage and latest data', () => {
  const tsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'canonical-data-summary-'));
  try {
    writeTsIndex(tsDir, {
      sources: [
        {
          symbol: 'BTCUSDT', family: 'crypto', provider: 'binance', timeframe: '1m',
          timestamp: '2026-07-27T00:00:00.000Z', open: 99, high: 101, low: 98, close: 100, volume: 1,
        },
        {
          symbol: 'BTCUSDT', family: 'crypto', provider: 'binance', timeframe: '1m',
          timestamp: '2026-07-27T00:01:00.000Z', open: 100, high: 102, low: 99, close: 101, volume: 2,
        },
      ],
    });
    const binPath = path.join(tsDir, 'BTCUSDT_1m.bin');
    const before = fs.statSync(binPath);
    const payload = buildCanonicalDataSummary('BTCUSDT', '1m', tsDir);
    const after = fs.statSync(binPath);

    assert.equal(payload.ok, true);
    assert.equal(payload.source, 'canonical_ts_index');
    assert.equal(payload.summary.summary_scope, 'coverage_and_latest');
    assert.equal(payload.summary.bars, 2);
    assert.equal(payload.summary.first_timestamp, '2026-07-27T00:00:00.000Z');
    assert.equal(payload.summary.last_timestamp, '2026-07-27T00:01:00.000Z');
    assert.equal(payload.summary.last_close, 101);
    assert.equal(payload.summary.min_close, null);
    assert.equal(payload.records.length, 1);
    assert.equal(after.size, before.size);
    assert.equal(after.mtimeMs, before.mtimeMs);
  } finally {
    fs.rmSync(tsDir, { recursive: true, force: true });
  }
});

test('missing canonical data fails explicitly instead of returning a successful zero summary', () => {
  const tsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'canonical-data-summary-missing-'));
  try {
    const payload = buildCanonicalDataSummary('BTCUSDT', '1m', tsDir);
    assert.equal(payload.ok, false);
    assert.equal(payload.error_code, 'canonical_data_missing');
    assert.equal(payload.summary.bars, 0);
    assert.equal(payload.source, 'canonical_ts_index');
  } finally {
    fs.rmSync(tsDir, { recursive: true, force: true });
  }
});
