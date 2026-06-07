'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  loadAssetSourcesFromCache,
  cacheCloseSeriesAnchor,
  frameToCsv,
} = require('../../../shared/lib/ml_dataset');

function makeTempCache() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mlcache-'));
  const fam = path.join(root, 'equities');
  fs.mkdirSync(fam, { recursive: true });
  const sources = [];
  for (let i = 0; i < 10; i += 1) {
    const day = String(i + 1).padStart(2, '0');
    sources.push({
      symbol: 'AAA', family: 'equities', timeframe: '1d',
      timestamp: `2026-02-${day}T00:00:00.000Z`, close: 100 + i, open: 100 + i,
      high: 101 + i, low: 99 + i, volume: 10,
    });
  }
  // a different timeframe + symbol that should be filtered out
  sources.push({ symbol: 'BBB', family: 'equities', timeframe: '1h', timestamp: '2026-02-01T00:00:00.000Z', close: 5 });
  fs.writeFileSync(path.join(fam, 'backtest_history.json'), JSON.stringify({ sources }), 'utf8');
  return root;
}

test('loadAssetSourcesFromCache filters by symbol+timeframe and caps bars', () => {
  const root = makeTempCache();
  const all = loadAssetSourcesFromCache(['AAA'], '1d', { cacheRoot: root });
  assert.strictEqual(all.length, 10, 'all 10 daily AAA bars');
  assert.ok(all.every((r) => r.symbol === 'AAA' && r.timeframe === '1d'));

  const capped = loadAssetSourcesFromCache(['AAA'], '1d', { cacheRoot: root, maxBarsPerSymbol: 3 });
  assert.strictEqual(capped.length, 3, 'capped to last 3 bars');
  assert.strictEqual(capped[capped.length - 1].close, 109, 'kept the most recent bars');

  const none = loadAssetSourcesFromCache(['BBB'], '1d', { cacheRoot: root });
  assert.strictEqual(none.length, 0, 'BBB has no 1d bars');
});

test('cacheCloseSeriesAnchor returns sorted daily {date,value} closes', () => {
  const root = makeTempCache();
  const series = cacheCloseSeriesAnchor('AAA', '1d', { cacheRoot: root });
  assert.strictEqual(series.length, 10);
  assert.strictEqual(series[0].date, '2026-02-01');
  assert.strictEqual(series[0].value, 100);
  assert.strictEqual(series[9].value, 109);
});

test('frameToCsv emits header + numeric cells, blanks for null', () => {
  const frame = {
    features: [
      { symbol: 'X', as_of: '2026-01-01T00:00:00.000Z', rsi: 55.5, xf_corr_GOLD: 0.3, label_class: 2, label_fwd_return: 0.05, smc_bias: 'bull' },
      { symbol: 'X', as_of: '2026-01-02T00:00:00.000Z', rsi: 60, xf_corr_GOLD: null, label_class: 0, label_fwd_return: -0.02, smc_bias: 'bear' },
    ],
  };
  const { csv, columns, rows } = frameToCsv(frame);
  assert.strictEqual(rows, 2);
  assert.ok(columns.includes('rsi') && columns.includes('xf_corr_GOLD'));
  assert.ok(columns.includes('label_class') && columns.includes('label_fwd_return'));
  assert.ok(!columns.includes('smc_bias'), 'string non-feature excluded');
  const lines = csv.trim().split('\n');
  assert.strictEqual(lines[0], columns.join(','));
  // second data row has null xf_corr_GOLD -> blank cell
  const goldIdx = columns.indexOf('xf_corr_GOLD');
  assert.strictEqual(lines[2].split(',')[goldIdx], '', 'null renders as empty cell');
});
