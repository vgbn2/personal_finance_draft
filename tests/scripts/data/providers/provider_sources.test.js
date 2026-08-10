const test = require('node:test');
const assert = require('node:assert/strict');

const commonPath = require.resolve('../../../../shared/lib/providers/common');
const finnhubPath = require.resolve('../../../../shared/lib/providers/finnhub');
const twelvePath = require.resolve('../../../../shared/lib/providers/twelve');

function withStubbedCommon(fetchJsonImpl, run) {
  const originalCommon = require.cache[commonPath];
  const originalFinnhub = require.cache[finnhubPath];
  const originalTwelve = require.cache[twelvePath];

  // audit-ignore-loader: controlled dependency fixture restored by this test scope

  require.cache[commonPath] = {
    id: commonPath,
    filename: commonPath,
    loaded: true,
    exports: { fetchJson: fetchJsonImpl },
  };

  delete require.cache[finnhubPath];
  delete require.cache[twelvePath];

  try {
    return run({
      finnhub: require(finnhubPath),
      twelve: require(twelvePath),
    });
  } finally {
    if (originalCommon) {
      require.cache[commonPath] = originalCommon;
    } else {
      delete require.cache[commonPath];
    }

    if (originalFinnhub) {
      require.cache[finnhubPath] = originalFinnhub;
    } else {
      delete require.cache[finnhubPath];
    }

    if (originalTwelve) {
      require.cache[twelvePath] = originalTwelve;
    } else {
      delete require.cache[twelvePath];
    }
  }
}

test('Twelve Data maps symbols and parses OHLC rows', async () => {
  process.env.TWELVE_DATA_API_KEY = 'test-key';

  const calls = [];
  await withStubbedCommon(async (url) => {
    calls.push(url);
    assert.match(url, /api\.twelvedata\.com\/time_series/);
    assert.match(url, /symbol=BTC%2FUSD/);
    assert.match(url, /interval=1h/);
    assert.match(url, /timezone=UTC/);
    return {
      status: 'ok',
      values: [
        { datetime: '2026-05-31 09:00:00', open: '1', high: '2', low: '0.5', close: '1.5', volume: '10' },
        { datetime: '2026-05-31 10:00:00', open: '1.5', high: '2.5', low: '1', close: '2', volume: '12' },
      ],
    };
  }, async ({ twelve }) => {
    assert.equal(twelve.normalizeSymbol('crypto', 'BTCUSDT'), 'BTC/USD');
    const rows = await twelve.fetchTwelveDataSnapshot('crypto', 'BTCUSDT', ['1h'], { historyDays: 1 });
    assert.equal(rows.length, 2);
    assert.equal(rows[0].provider, 'twelve');
    assert.equal(rows[0].symbol, 'BTCUSDT');
    assert.equal(rows[0].timeframe, '1h');
    assert.equal(rows[0].timestamp, '2026-05-31T09:00:00.000Z');
    assert.equal(calls.length, 1);
  });

  delete process.env.TWELVE_DATA_API_KEY;
});

test('Finnhub maps FX pairs and parses candle arrays', async () => {
  process.env.FINNHUB_API_KEY = 'test-key';
  process.env.FINHUB_API_KEY = 'test-key';

  const calls = [];
  await withStubbedCommon(async (url) => {
    calls.push(url);
    assert.match(url, /finnhub\.io\/api\/v1\/forex\/candle/);
    assert.match(url, /symbol=OANDA%3AEUR_USD/);
    assert.match(url, /resolution=60/);
    return {
      s: 'ok',
      t: [1717002000, 1717005600],
      o: [1.1, 1.2],
      h: [1.15, 1.25],
      l: [1.05, 1.15],
      c: [1.12, 1.22],
      v: [100, 110],
    };
  }, async ({ finnhub }) => {
    assert.equal(finnhub.normalizeSymbol('fx', 'EURUSD'), 'OANDA:EUR_USD');
    const rows = await finnhub.fetchFinnhubSnapshot('fx', 'EURUSD', ['1h'], { historyDays: 1 });
    assert.equal(rows.length, 2);
    assert.equal(rows[0].provider, 'finnhub');
    assert.equal(rows[0].symbol, 'EURUSD');
    assert.equal(rows[0].timeframe, '1h');
    assert.equal(rows[0].timestamp, new Date(1717002000 * 1000).toISOString());
    assert.equal(calls.length, 1);
  });

  delete process.env.FINNHUB_API_KEY;
  delete process.env.FINHUB_API_KEY;
});
