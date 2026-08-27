'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { parseTimeframeMs } = require('../../../backend/scripts/data_ops/ingest_market_data/constants.js');
const { rollupFromBase } = require('../../../backend/cli/commands/data/data_rollup.js');
const { writeTsIndex, readTsIndex } = require('../../../shared/lib/market/validation.js');
const { deriveLiveStrategySignal } = require('../../../backend/cli/commands/strategy/strategy.js');

test('timeframe ascending duration sort', () => {
  const timeframes = ['1d', '5m', '1w', '1m', '1h', '15m'];
  const sorted = timeframes.sort((a, b) => {
    const aMs = parseTimeframeMs(a) || Infinity;
    const bMs = parseTimeframeMs(b) || Infinity;
    return aMs - bMs;
  });
  assert.deepEqual(sorted, ['1m', '5m', '15m', '1h', '1d', '1w']);
});

test('base 5m ingestion and local rollup updates binary stores for signal derivation', () => {
  const tmpTsDir = path.join(__dirname, '..', '..', 'tmp', `ts_test_${Date.now()}`);
  fs.mkdirSync(tmpTsDir, { recursive: true });

  try {
    const symbol = 'TEST_SYM';
    const now = Date.now();
    // Generate 50 synthetic 5m bars ending now
    const candles = [];
    for (let i = 49; i >= 0; i--) {
      const ts = new Date(now - i * 5 * 60 * 1000).toISOString();
      candles.push({
        symbol,
        timeframe: '5m',
        timestamp: ts,
        open: 100 + i * 0.1,
        high: 101 + i * 0.1,
        low: 99 + i * 0.1,
        close: 100.5 + i * 0.1,
        volume: 1000,
        provider: 'yahoo',
        family: 'equities',
      });
    }

    // 1. Write base 5m bars
    writeTsIndex(tmpTsDir, { sources: candles });
    const readBase = readTsIndex(tmpTsDir, symbol, '5m');
    assert.equal(readBase.length, 50);

    // 2. Rollup to 15m and 1h locally
    rollupFromBase(tmpTsDir, symbol, '5m', ['15m', '1h']);
    const read15m = readTsIndex(tmpTsDir, symbol, '15m');
    assert.ok(read15m.length > 0, '15m rolled up bars should exist');
  } finally {
    fs.rmSync(tmpTsDir, { recursive: true, force: true });
  }
});
