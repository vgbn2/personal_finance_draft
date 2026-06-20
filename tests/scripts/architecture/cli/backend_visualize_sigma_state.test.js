'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const { computeSigmaState } = require('../../../../backend/cli/commands/tools/backend_visualize.js');
const { writeTsIndex } = require('../../../../shared/lib/market/validation.js');
const { DEFAULT_TS_DIR } = require('../../../../backend/cli/commands/data/data_rollup.js');

const TEST_SYMBOL = '__TEST_SIGMA_VISUALIZE__';
const TEST_TF = '4h';
const binPath = path.join(DEFAULT_TS_DIR, `${TEST_SYMBOL}_${TEST_TF}.bin`);
const metaPath = path.join(DEFAULT_TS_DIR, `${TEST_SYMBOL}_${TEST_TF}.meta.json`);

function cleanup() {
  for (const p of [binPath, metaPath]) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

test('computeSigmaState reads deep history from the ts-index, not just the shallow last-fetch cache', (t) => {
  t.after(cleanup);
  cleanup();

  // 30 bars in the deep ts-index, well beyond what the shallow DEFAULT_HISTORY cache would ever
  // hold for a symbol that was deep-backfilled once and never touched by a recent live fetch -
  // this is exactly the BTCUSDT/4h shape that produced the false "Insufficient data" error.
  const sources = [];
  const baseMs = Date.UTC(2026, 0, 1);
  for (let i = 0; i < 30; i++) {
    sources.push({
      family: 'crypto', provider: 'test', symbol: TEST_SYMBOL, timeframe: TEST_TF,
      timestamp: new Date(baseMs + i * 4 * 3600 * 1000).toISOString(),
      open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i, volume: 1,
    });
  }
  writeTsIndex(DEFAULT_TS_DIR, { sources });

  const state = computeSigmaState(TEST_SYMBOL, TEST_TF, 20);
  assert.ok(state, 'expected a sigma state, not null, when 30 deep bars exist for a 20-bar window');
  assert.equal(state.bars, 30);
});

test('computeSigmaState still returns null for a symbol with no ts-index bin and no cache data', () => {
  cleanup();
  const state = computeSigmaState('__TEST_SIGMA_NEVER_BACKFILLED__', TEST_TF, 20);
  assert.equal(state, null);
});
