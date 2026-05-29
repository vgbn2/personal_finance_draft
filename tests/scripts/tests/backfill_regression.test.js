const test = require('node:test');
const assert = require('node:assert/strict');
const fsPromises = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const realBtcFixture = require('../../fixtures/real_bars_btc.json');

function fixtureCandles(provider = 'binance') {
  return realBtcFixture.sources
    .filter((bar) => bar.provider === provider && bar.symbol === 'BTCUSDT')
    .map((bar) => ({
      openTime: Date.parse(bar.timestamp),
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
    }));
}

function displayOhlcvBars(label, candles) {
  const rows = candles.map((candle) => ({
    timestamp: new Date(candle.openTime).toISOString(),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
  }));
  console.log(`[OHLCV:${label}] ${rows.length} bars`);
  console.log(JSON.stringify(rows, null, 2));
}

function assertCanonicalOhlcv(candles) {
  assert.ok(candles.length > 0, 'expected recorded OHLCV candles');
  for (const candle of candles) {
    assert.equal(Number.isFinite(candle.openTime), true);
    assert.equal(Number.isFinite(candle.open), true);
    assert.equal(Number.isFinite(candle.high), true);
    assert.equal(Number.isFinite(candle.low), true);
    assert.equal(Number.isFinite(candle.close), true);
    assert.equal(Number.isFinite(candle.volume), true);
  }
}

function withModuleOverrides(overrides, run) {
  const snapshots = [];

  for (const [moduleId, exports] of Object.entries(overrides)) {
    const resolved = require.resolve(moduleId);
    snapshots.push({ resolved, original: require.cache[resolved] });
    require.cache[resolved] = {
      id: resolved,
      filename: resolved,
      loaded: true,
      exports,
    };
  }

  return Promise.resolve()
    .then(run)
    .finally(() => {
      for (const { resolved, original } of snapshots.reverse()) {
        if (original) {
          require.cache[resolved] = original;
        } else {
          delete require.cache[resolved];
        }
      }
    });
}

test('parallel backfill does not route mixed crypto providers through yahoo', async () => {
  let binanceCalls = 0;
  let yahooCalls = 0;
  let alpacaCalls = 0;
  const binanceCandles = fixtureCandles('binance');

  await withModuleOverrides({
    '../lib/providers/binance': {
      fetchBinanceBaseCandles: async () => {
        binanceCalls += 1;
        return binanceCandles;
      },
    },
    '../lib/providers/yahoo': {
      fetchYahooBaseCandles: async () => {
        yahooCalls += 1;
        throw new Error('yahoo should not be used for mixed crypto backfill');
      },
    },
    '../lib/providers/alpaca': {
      fetchAlpacaBaseCandles: async () => {
        alpacaCalls += 1;
        return fixtureCandles('binance');
      },
    },
  }, async () => {
    delete require.cache[require.resolve('../lib/backfill')];
    const { fetchParallelBackfill } = require('../lib/backfill');

    const candles = await fetchParallelBackfill(
      'BTCUSDT',
      '5m',
      2,
      'crypto',
      ['binance', 'coinbase', 'alpaca'],
    );

    displayOhlcvBars('parallel-backfill-btcusdt', candles);
    assertCanonicalOhlcv(candles);
    assert.equal(candles.length, binanceCandles.length);
    assert.equal(candles[0].openTime, binanceCandles[0].openTime);
    assert.equal(candles[candles.length - 1].openTime, binanceCandles[binanceCandles.length - 1].openTime);
    assert.equal(candles.backfillMeta.provider, 'binance');
    assert.match(candles.backfillMeta.requested_window, /^\[.+ - .+\]$/);
    assert.equal(candles.backfillMeta.provider_max_bars, 1000);
    assert.equal(candles.backfillMeta.workers, 4);
    assert.equal(binanceCalls > 0, true);
    assert.equal(yahooCalls, 0);
    assert.equal(alpacaCalls, 0);
  });
});

test('macro ingest stays wired to latest-only fred fetches', async () => {
  const repoRoot = path.join(os.tmpdir(), 'sovereign-backfill-regression-' + process.pid);
  const configYaml = [
    '  macro:',
    '    enabled: true',
    '    provider: [fred]',
    '    series: [CPI]',
    'fred_mappings:',
    '  macro:',
    '    CPI: CPIAUCSL',
  ].join('\n');
  const optionsYaml = 'prediction_market:\n  enabled: false\n';

  const originalReadFile = fsPromises.readFile;
  fsPromises.readFile = async (filePath) => {
    const normalized = String(filePath).replace(/\\/g, '/');
    if (normalized.endsWith('/config/data_sources.yaml')) {
      return configYaml;
    }
    if (normalized.endsWith('/config/options_data.yaml')) {
      return optionsYaml;
    }
    throw new Error(`Unexpected config read: ${filePath}`);
  };

  let fredLatestCalls = 0;

  try {
  await withModuleOverrides({
      '../lib/providers': {
        REPO_ROOT: repoRoot,
        API_CACHE_DIR: path.join(repoRoot, 'data', 'cache'),
        fetchBinanceBaseCandles: async () => { throw new Error('unexpected binance call'); },
        fetchYahooBaseCandles: async () => { throw new Error('unexpected yahoo call'); },
        fetchCoinbaseBaseCandles: async () => { throw new Error('unexpected coinbase call'); },
        fetchFrankfurterFx: async () => { throw new Error('unexpected fx call'); },
        fetchFredLatest: async (seriesId) => {
          fredLatestCalls += 1;
          return {
            provider: 'fred',
            series_id: seriesId,
            timestamp: '2026-05-22T00:00:00.000Z',
            value: 42,
            source: 'fred-latest-sample',
          };
        },
        fetchWorldBankLatest: async () => { throw new Error('unexpected world bank call'); },
        fetchKalshiPredictionEvent: async () => { throw new Error('unexpected kalshi call'); },
        fetchAlternativeMeFearGreed: async () => { throw new Error('unexpected sentiment call'); },
        fetchNasaPowerWeather: async () => { throw new Error('unexpected weather call'); },
        fetchAlpacaBaseCandles: async () => { throw new Error('unexpected alpaca call'); },
        cachedFetch: async () => { throw new Error('unexpected cachedFetch call'); },
        fetchJson: async () => { throw new Error('unexpected fetchJson call'); },
      },
    }, async () => {
      delete require.cache[require.resolve('../data_ops/ingest_market_data')];
      const { ingestMarketData } = require('../data_ops/ingest_market_data');
      const snapshot = await ingestMarketData({ family: 'macro' });

      assert.equal(fredLatestCalls, 2);
      assert.equal(snapshot.sources.length, 1);
      assert.equal(snapshot.sources[0].family, 'macro');
      assert.equal(snapshot.sources[0].series, 'CPI');
      assert.equal(snapshot.sources[0].source, 'fred-latest-sample');
      assert.equal(snapshot.provider_checks.some((check) => check.family === 'macro' && check.provider === 'fred'), true);
      assert.equal(snapshot.errors.length, 0);
    });
  } finally {
    fsPromises.readFile = originalReadFile;
  }
});

test('live ingest resolves configured FRED and World Bank mappings', async () => {
  const repoRoot = path.join(os.tmpdir(), 'sovereign-mapping-regression-' + process.pid);
  const configYaml = [
    '  macro:',
    '    enabled: true',
    '    provider: [fred]',
    '    series: [US02YIELD]',
    '  reserves:',
    '    enabled: true',
    '    provider: [world_bank]',
    '    countries: [USA]',
    '    metrics: [total_reserves_usd]',
    'fred_mappings:',
    '  macro:',
    '    US02YIELD: DGS2',
    'world_bank_mappings:',
    '  total_reserves_usd: FI.RES.TOTL.CD',
  ].join('\n');
  const optionsYaml = 'prediction_market:\n  enabled: false\n';

  const originalReadFile = fsPromises.readFile;
  fsPromises.readFile = async (filePath) => {
    const normalized = String(filePath).replace(/\\/g, '/');
    if (normalized.endsWith('/config/data_sources.yaml')) {
      return configYaml;
    }
    if (normalized.endsWith('/config/options_data.yaml')) {
      return optionsYaml;
    }
    throw new Error(`Unexpected config read: ${filePath}`);
  };

  const fredIds = [];
  const worldBankIndicators = [];

  try {
    await withModuleOverrides({
      '../lib/providers': {
        REPO_ROOT: repoRoot,
        API_CACHE_DIR: path.join(repoRoot, 'data', 'cache'),
        fetchBinanceBaseCandles: async () => { throw new Error('unexpected binance call'); },
        fetchYahooBaseCandles: async () => { throw new Error('unexpected yahoo call'); },
        fetchCoinbaseBaseCandles: async () => { throw new Error('unexpected coinbase call'); },
        fetchFrankfurterFx: async () => { throw new Error('unexpected fx call'); },
        fetchFredLatest: async (seriesId) => {
          fredIds.push(seriesId);
          return {
            provider: 'fred',
            timestamp: '2026-05-22T00:00:00.000Z',
            value: 3.9,
            source: 'fred-latest-sample',
          };
        },
        fetchWorldBankLatest: async (country, indicator) => {
          worldBankIndicators.push(`${country}:${indicator}`);
          return {
            provider: 'world_bank',
            country,
            indicator,
            timestamp: '2025-01-01T00:00:00.000Z',
            value: 100,
            source: 'worldbank-sample',
          };
        },
        fetchKalshiPredictionEvent: async () => { throw new Error('unexpected kalshi call'); },
        fetchAlternativeMeFearGreed: async () => { throw new Error('unexpected sentiment call'); },
        fetchNasaPowerWeather: async () => { throw new Error('unexpected weather call'); },
        fetchAlpacaBaseCandles: async () => { throw new Error('unexpected alpaca call'); },
        cachedFetch: async () => { throw new Error('unexpected cachedFetch call'); },
        fetchJson: async () => { throw new Error('unexpected fetchJson call'); },
      },
    }, async () => {
      delete require.cache[require.resolve('../data_ops/ingest_market_data')];
      const { ingestMarketData } = require('../data_ops/ingest_market_data');

      const macro = await ingestMarketData({ family: 'macro' });
      assert.deepEqual(fredIds, ['DGS2', 'DGS2']);
      assert.equal(macro.errors.length, 0);
      assert.equal(macro.sources[0].series, 'US02YIELD');

      const reserves = await ingestMarketData({ family: 'reserves' });
      assert.deepEqual(worldBankIndicators, ['USA:FI.RES.TOTL.CD', 'USA:FI.RES.TOTL.CD']);
      assert.equal(reserves.errors.length, 0);
      assert.equal(reserves.sources[0].family, 'reserves');
      assert.equal(reserves.sources[0].metric, 'total_reserves_usd');
    });
  } finally {
    fsPromises.readFile = originalReadFile;
  }
});

test('prediction market ingest skips unmatched semantic buckets without provider errors', async () => {
  const repoRoot = path.join(os.tmpdir(), 'sovereign-kalshi-regression-' + process.pid);
  const configYaml = [
    '  prediction_market:',
    '    enabled: true',
    '    provider: [kalshi]',
    '    events: [fed_rate_cut_prob, us_recession_prob]',
    'prediction_market_keywords:',
    '  fed_rate_cut_prob: [fed, rate, cut]',
    '  us_recession_prob: [recession]',
  ].join('\n');
  const optionsYaml = 'prediction_market:\n  enabled: false\n';

  const originalReadFile = fsPromises.readFile;
  fsPromises.readFile = async (filePath) => {
    const normalized = String(filePath).replace(/\\/g, '/');
    if (normalized.endsWith('/config/data_sources.yaml')) {
      return configYaml;
    }
    if (normalized.endsWith('/config/options_data.yaml')) {
      return optionsYaml;
    }
    throw new Error(`Unexpected config read: ${filePath}`);
  };

  try {
    await withModuleOverrides({
      '../lib/providers': {
        REPO_ROOT: repoRoot,
        API_CACHE_DIR: path.join(repoRoot, 'data', 'cache'),
        fetchBinanceBaseCandles: async () => { throw new Error('unexpected binance call'); },
        fetchYahooBaseCandles: async () => { throw new Error('unexpected yahoo call'); },
        fetchCoinbaseBaseCandles: async () => { throw new Error('unexpected coinbase call'); },
        fetchFrankfurterFx: async () => { throw new Error('unexpected fx call'); },
        fetchFredLatest: async () => { throw new Error('unexpected fred call'); },
        fetchWorldBankLatest: async () => { throw new Error('unexpected world bank call'); },
        fetchKalshiPredictionEvent: async () => { throw new Error('unexpected direct kalshi event call'); },
        fetchAlternativeMeFearGreed: async () => { throw new Error('unexpected sentiment call'); },
        fetchNasaPowerWeather: async () => { throw new Error('unexpected weather call'); },
        fetchAlpacaBaseCandles: async () => { throw new Error('unexpected alpaca call'); },
        cachedFetch: async () => { throw new Error('unexpected cachedFetch call'); },
        fetchJson: async () => ({
          markets: [
            {
              ticker: 'KXFEDCUT-26',
              event_ticker: 'KXFEDCUT',
              title: 'Fed rate cut in 2026',
              yes_bid: 42,
              yes_ask: 44,
              status: 'open',
              updated_time: '2026-05-22T00:00:00.000Z',
            },
          ],
        }),
      },
    }, async () => {
      delete require.cache[require.resolve('../data_ops/ingest_market_data')];
      const { ingestMarketData } = require('../data_ops/ingest_market_data');
      const snapshot = await ingestMarketData({ family: 'prediction_market' });

      assert.equal(snapshot.errors.length, 0);
      assert.equal(snapshot.sources.length, 1);
      assert.equal(snapshot.sources[0].symbol, 'fed_rate_cut_prob');
      assert.equal(snapshot.sources[0].provider, 'kalshi');
    });
  } finally {
    fsPromises.readFile = originalReadFile;
  }
});
