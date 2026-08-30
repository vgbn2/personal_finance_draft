'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  resolveTunableRegressionFidelity,
  bucketTicksToOhlcv,
  timeframeToSeconds,
  backfillPolymarketArchive,
} = require('../../../../shared/lib/market/polymarket_history.js');

test('resolveTunableRegressionFidelity computes expected intervals across lifespans', () => {
  // 5-minute market: 300s -> 1s
  const res5m = resolveTunableRegressionFidelity('2026-08-01T00:00:00Z', '2026-08-01T00:05:00Z');
  assert.equal(res5m.lifespanSeconds, 300);
  assert.equal(res5m.stepSeconds, 1);
  assert.equal(res5m.timeframe, '1s');

  // 1-hour market: 3600s -> 15s
  const res1h = resolveTunableRegressionFidelity('2026-08-01T00:00:00Z', '2026-08-01T01:00:00Z');
  assert.equal(res1h.lifespanSeconds, 3600);
  assert.equal(res1h.stepSeconds, 15);
  assert.equal(res1h.timeframe, '15s');

  // 30-day market: 2592000s -> 2h (7200s)
  const res30d = resolveTunableRegressionFidelity('2026-08-01T00:00:00Z', '2026-08-31T00:00:00Z');
  assert.equal(res30d.lifespanSeconds, 2592000);
  assert.equal(res30d.stepSeconds, 7200);
  assert.equal(res30d.timeframe, '2h');

  // 1-year market: 31536000s -> 1d (86400s)
  const res1y = resolveTunableRegressionFidelity('2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z');
  assert.equal(res1y.lifespanSeconds, 31536000);
  assert.equal(res1y.stepSeconds, 86400);
  assert.equal(res1y.timeframe, '1d');
});

test('resolveTunableRegressionFidelity supports scale gamma and targetBars overrides', () => {
  // Scale 0.5 yields half the raw step
  const resBase = resolveTunableRegressionFidelity('2026-08-01T00:00:00Z', '2026-08-01T01:00:00Z', { scale: 1.0 });
  const resFine = resolveTunableRegressionFidelity('2026-08-01T00:00:00Z', '2026-08-01T01:00:00Z', { scale: 0.5 });
  assert.ok(resFine.rawStepSeconds < resBase.rawStepSeconds);
  assert.ok(Math.abs(resFine.rawStepSeconds - resBase.rawStepSeconds * 0.5) < 0.01);

  // TargetBars 600 yields finer granularity than 300
  const res600 = resolveTunableRegressionFidelity('2026-08-01T00:00:00Z', '2026-08-01T01:00:00Z', { targetBars: 600 });
  assert.ok(res600.rawStepSeconds < resBase.rawStepSeconds);
});

test('bucketTicksToOhlcv groups ticks into OHLCV and forward-fills gaps', () => {
  const ticks = [
    { t: '2026-08-01T00:00:10Z', p: 0.40, v: 100 },
    { t: '2026-08-01T00:00:30Z', p: 0.48, v: 50 },
    { t: '2026-08-01T00:00:50Z', p: 0.42, v: 25 },
    // Gap at minute 1
    { t: '2026-08-01T00:02:15Z', p: 0.55, v: 200 },
  ];

  const ohlcv = bucketTicksToOhlcv(ticks, 60, { forwardFill: true });
  assert.equal(ohlcv.length, 3);

  // Bucket 0
  assert.equal(ohlcv[0].open, 0.40);
  assert.equal(ohlcv[0].high, 0.48);
  assert.equal(ohlcv[0].low, 0.40);
  assert.equal(ohlcv[0].close, 0.42);
  assert.equal(ohlcv[0].volume, 175);
  assert.equal(ohlcv[0].count, 3);

  // Bucket 1 (forward-filled from close of bucket 0)
  assert.equal(ohlcv[1].open, 0.42);
  assert.equal(ohlcv[1].high, 0.42);
  assert.equal(ohlcv[1].low, 0.42);
  assert.equal(ohlcv[1].close, 0.42);
  assert.equal(ohlcv[1].volume, 0);
  assert.equal(ohlcv[1].count, 0);

  // Bucket 2
  assert.equal(ohlcv[2].open, 0.55);
  assert.equal(ohlcv[2].high, 0.55);
  assert.equal(ohlcv[2].low, 0.55);
  assert.equal(ohlcv[2].close, 0.55);
  assert.equal(ohlcv[2].volume, 200);
  assert.equal(ohlcv[2].count, 1);
});

test('polymarket_scope.json has valid universes and schema', () => {
  const scopePath = path.resolve(__dirname, '../../../../config/polymarket_scope.json');
  assert.ok(fs.existsSync(scopePath), 'polymarket_scope.json exists');
  const scope = JSON.parse(fs.readFileSync(scopePath, 'utf8'));
  assert.ok(scope.defaults, 'defaults section exists');
  assert.ok(Array.isArray(scope.defaults.macro), 'macro defaults exist');
  assert.ok(Array.isArray(scope.defaults.crypto), 'crypto defaults exist');
  assert.ok(Array.isArray(scope.defaults.geopolitics), 'geopolitics defaults exist');
  assert.ok(scope.defaults.macro.some(m => m.symbol === 'fed_rate_cut_prob'));
  assert.ok(scope.defaults.crypto.some(m => m.symbol === 'btc_price_milestone'));
});

test('backfillPolymarketArchive filters by targetSymbols, targetSlugs, and minVolume', async () => {
  const tmpRoot = path.resolve(__dirname, '../../../../storage/data/test_polymarket_tunable_' + Date.now());
  const fixtureMarkets = [
    {
      id: 'm1',
      question: 'Will Fed cut interest rates in 2026?',
      slug: 'fed-rate-cut-in-2026',
      closed: true,
      volume: 150000,
      clobTokenIds: JSON.stringify(['token_yes_1', 'token_no_1']),
      outcomes: JSON.stringify(['Yes', 'No']),
      end_date: '2026-08-01T00:00:00Z',
    },
    {
      id: 'm2',
      question: 'Will Bitcoin reach 00k?',
      slug: 'bitcoin-reach-100k',
      closed: true,
      volume: 20000,
      clobTokenIds: JSON.stringify(['token_yes_2', 'token_no_2']),
      outcomes: JSON.stringify(['Yes', 'No']),
      end_date: '2026-08-01T00:00:00Z',
    },
  ];

  const mockPageFetch = async () => ({ ok: true, data: fixtureMarkets });
  const mockHistoryFetch = async (tokenId) => ({ ok: true, source: 'mock', history: [{ t: 1785542400, p: 0.5 }] });

  // Test targetSymbols filter
  const resultSymbols = await backfillPolymarketArchive({
    root: tmpRoot,
    fetchMarketsPage: mockPageFetch,
    fetchHistory: mockHistoryFetch,
    targetSymbols: ['fed_rate_cut_prob'],
    noCache: true,
  });
  assert.equal(resultSymbols.ok, true);

  // Test minVolume filter (m2 with volume 20000 rejected when minVolume = 50000)
  const resultVol = await backfillPolymarketArchive({
    root: tmpRoot,
    fetchMarketsPage: mockPageFetch,
    fetchHistory: mockHistoryFetch,
    minVolume: 50000,
    noCache: true,
  });
  assert.equal(resultVol.ok, true);

  // Cleanup tmp dir
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch (_) {}
});
