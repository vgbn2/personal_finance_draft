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
  isExperimentalSynthetic5mRecord,
} = require('../../../shared/lib/ml/dataset');
const { writeTsIndex } = require('../../../shared/lib/market/validation');

// Build a temp binary ts index for a symbol (mirrors the storage/data/ts layout).
function makeTempTs(symbol, family, timeframe, closes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlts-'));
  const sources = closes.map((c, i) => {
    const day = String(i + 1).padStart(2, '0');
    return {
      symbol, family, timeframe, provider: 'test',
      timestamp: `2026-03-${day}T00:00:00.000Z`,
      open: c, high: c + 1, low: c - 1, close: c, volume: 7,
    };
  });
  writeTsIndex(dir, { sources });
  return dir;
}

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

function writeFamilyCache(root, family, sources) {
  const fam = path.join(root, family);
  fs.mkdirSync(fam, { recursive: true });
  fs.writeFileSync(path.join(fam, 'backtest_history.json'), JSON.stringify({ sources }), 'utf8');
}

test('loadAssetSourcesFromCache drops pre/post-market equity intraday bars (session guard on the real consumer path)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mlsess-'));
  // ET hours → UTC (June EDT = UTC-4). 04:00 ET pre-market, 12:00 ET in-session, 17:00 ET post-market.
  const bar = (etHour, label) => ({
    symbol: 'EQ', family: 'equities', timeframe: '15m', provider: 'alpaca',
    timestamp: `2026-06-12T${String(etHour + 4).padStart(2, '0')}:00:00.000Z`,
    open: 10, high: 11, low: 9, close: 10, volume: 5, label,
  });
  writeFamilyCache(root, 'equities', [bar(4, 'pre'), bar(12, 'in'), bar(17, 'post')]);

  const out = loadAssetSourcesFromCache(['EQ'], '15m', { cacheRoot: root });
  assert.strictEqual(out.length, 1, 'only the in-session 15m bar survives the loader');
  assert.strictEqual(out[0].label, 'in');
  console.log(JSON.stringify({ type: 'ml_dataset_test', case: 'session_guard_loader', kept: out.length }));
});

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

test('loadAssetSourcesFromCache reads ts-index symbols absent from the JSON cache', () => {
  const cacheRoot = makeTempCache();        // has AAA only
  const tsDir = makeTempTs('TSONLY', 'crypto', '1d', [10, 11, 12, 13]);
  const recs = loadAssetSourcesFromCache(['TSONLY'], '1d', { cacheRoot, tsDir });
  assert.strictEqual(recs.length, 4, 'all 4 ts bars surfaced');
  assert.ok(recs.every((r) => r.symbol === 'TSONLY' && r.timeframe === '1d'));
  assert.strictEqual(recs[recs.length - 1].close, 13);
});

test('loadAssetSourcesFromCache dedupes JSON+ts on symbol+timestamp (JSON wins)', () => {
  // ts index carries an overlapping AAA day plus one ts-only day.
  const cacheRoot = makeTempCache();        // AAA: 2026-02-01..10
  const tsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlts-'));
  writeTsIndex(tsDir, { sources: [
    { symbol: 'AAA', family: 'equities', timeframe: '1d', provider: 'test',
      timestamp: '2026-02-01T00:00:00.000Z', open: 999, high: 999, low: 999, close: 999, volume: 1 },
    { symbol: 'AAA', family: 'equities', timeframe: '1d', provider: 'test',
      timestamp: '2026-02-20T00:00:00.000Z', open: 200, high: 201, low: 199, close: 200, volume: 1 },
  ] });
  const recs = loadAssetSourcesFromCache(['AAA'], '1d', { cacheRoot, tsDir });
  assert.strictEqual(recs.length, 11, '10 JSON + 1 ts-only (overlap deduped)');
  const feb01 = recs.find((r) => r.timestamp.startsWith('2026-02-01'));
  assert.strictEqual(feb01.close, 100, 'JSON close wins on overlap, not the ts 999');
});

test('loadAssetSourcesFromCache excludes experimental 5m records unless opted in', () => {
  const cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mlcache-'));
  writeFamilyCache(cacheRoot, 'equities', [
    {
      symbol: 'SPY', family: 'equities', provider: 'twelve', timeframe: '5m',
      // 15:00Z = 10:00 ET (Feb EST), in NYSE session so the session guard keeps it;
      // this case is about experimental-5m inclusion, not session timing.
      timestamp: '2026-02-01T15:00:00.000Z', open: 100, high: 101, low: 99, close: 100, volume: 10,
      source: 'twelve-rollup-from-1d', derived_from_timeframe: '1d',
    },
  ]);
  writeFamilyCache(cacheRoot, 'crypto', [
    {
      symbol: 'BTCUSDT', family: 'crypto', provider: 'binance', timeframe: '5m',
      timestamp: '2026-02-01T00:00:00.000Z', open: 10, high: 11, low: 9, close: 10, volume: 7,
    },
  ]);

  const tsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlts-'));
  writeTsIndex(tsDir, { sources: [
    {
      symbol: 'SPY', family: 'equities', provider: 'twelve', timeframe: '5m',
      timestamp: '2026-02-02T15:00:00.000Z', open: 101, high: 102, low: 100, close: 101, volume: 10,
    },
    {
      symbol: 'POLUSDT', family: 'crypto', provider: 'coingecko', timeframe: '5m',
      timestamp: '2026-02-02T00:00:00.000Z', open: 1, high: 2, low: 1, close: 1.5, volume: 1,
    },
    {
      symbol: 'ETHUSDT', family: 'crypto', provider: 'binance', timeframe: '5m',
      timestamp: '2026-02-02T00:00:00.000Z', open: 20, high: 21, low: 19, close: 20, volume: 7,
    },
  ] });

  const defaultRows = loadAssetSourcesFromCache([], '5m', { cacheRoot, tsDir });
  assert.deepStrictEqual(defaultRows.map((r) => r.symbol).sort(), ['BTCUSDT', 'ETHUSDT']);
  assert.equal(cacheCloseSeriesAnchor('SPY', '5m', { cacheRoot, tsDir }).length, 0);

  const experimentalRows = loadAssetSourcesFromCache([], '5m', {
    cacheRoot,
    tsDir,
    includeExperimentalSynthetic5m: true,
  });
  assert.deepStrictEqual(experimentalRows.map((r) => r.symbol).sort(), ['BTCUSDT', 'ETHUSDT', 'POLUSDT', 'SPY', 'SPY']);
});

test('isExperimentalSynthetic5mRecord classifies non-native and daily-derived 5m', () => {
  assert.equal(isExperimentalSynthetic5mRecord({ family: 'crypto', provider: 'binance', timeframe: '5m' }), false);
  assert.equal(isExperimentalSynthetic5mRecord({ family: 'crypto', provider: 'coingecko', timeframe: '5m' }), true);
  assert.equal(isExperimentalSynthetic5mRecord({ family: 'equities', provider: 'twelve', timeframe: '5m' }), true);
  assert.equal(isExperimentalSynthetic5mRecord({ family: 'crypto', provider: 'binance', timeframe: '5m', source: 'binance-rollup-from-1d', derived_from_timeframe: '1d' }), true);
  // Native Phase-3 Yahoo 5m for fx and indices stays experimental for ML (deliberate decision)
  assert.equal(isExperimentalSynthetic5mRecord({ family: 'fx', provider: 'yahoo', timeframe: '5m' }), true);
  assert.equal(isExperimentalSynthetic5mRecord({ family: 'indices', provider: 'yahoo', timeframe: '5m' }), true);
});

test('cacheCloseSeriesAnchor resolves a ts-only anchor symbol', () => {
  const cacheRoot = makeTempCache();
  const tsDir = makeTempTs('XANCHOR', 'commodities', '1d', [50, 51, 52]);
  const series = cacheCloseSeriesAnchor('XANCHOR', '1d', { cacheRoot, tsDir });
  assert.strictEqual(series.length, 3);
  assert.strictEqual(series[0].value, 50);
  assert.strictEqual(series[2].value, 52);
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

test('commandFeaturesDump parses --max-bars-per-symbol and uses safe defaults', async () => {
  const mlCmdPath = path.resolve(__dirname, '../../../backend/cli/commands/research/ml');
  const datasetPath = path.resolve(__dirname, '../../../shared/lib/ml/dataset.js');

  let passedMaxBars = null;
  const mockLoadAssetSourcesFromCache = (symbols, timeframe, opts) => {
    passedMaxBars = opts.maxBarsPerSymbol;
    return []; // Return empty array so features dump exits early
  };

  const realDataset = require(datasetPath);
  const Module = require('node:module');
  const orig = Module._load;
  Module._load = function(request, parent, isMain) {
    const resolved = (() => { try { return Module._resolveFilename(request, parent, isMain); } catch (_) { return null; } })();
    if (resolved && path.normalize(resolved) === path.normalize(datasetPath)) {
      return {
        ...realDataset,
        loadAssetSourcesFromCache: mockLoadAssetSourcesFromCache,
      };
    }
    return orig.apply(this, arguments);
  };

  try {
    delete require.cache[mlCmdPath];
    delete require.cache[datasetPath];
    const { commandFeaturesDump } = require(mlCmdPath);

    // Test 1: explicit --max-bars-per-symbol 100
    await commandFeaturesDump(['--max-bars-per-symbol', '100', '--symbols', 'AAA', '--json']);
    assert.strictEqual(passedMaxBars, 100, 'should parse explicit --max-bars-per-symbol');

    // Test 2: default for 1d timeframe is days (default 1095)
    await commandFeaturesDump(['--symbols', 'AAA', '--json', '--days', '365']);
    assert.strictEqual(passedMaxBars, 365, 'default for 1d should be the --days value');

    // Test 3: default for 5m intraday is 100000 (explicit cap, raised from 50k to handle 525k-row crypto bins)
    await commandFeaturesDump(['--symbols', 'AAA', '--json', '--timeframe', '5m']);
    assert.strictEqual(passedMaxBars, 100000, 'default for 5m should be the 100000 safe cap');
  } finally {
    Module._load = orig;
    delete require.cache[mlCmdPath];
  }
});

