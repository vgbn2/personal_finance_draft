'use strict';

const test = require('node:test');
const assert = require('node:assert');
const Module = require('node:module');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const alpacaPath = path.resolve(REPO_ROOT, 'shared/lib/providers/alpaca.js');
const commonPath = path.resolve(REPO_ROOT, 'shared/lib/providers/common.js');
const backfillPath = path.resolve(REPO_ROOT, 'shared/lib/data/backfill.js');
const ingestIndexPath = path.resolve(REPO_ROOT, 'backend/scripts/data_ops/ingest_market_data/index.js');

// ingest_market_data/index.js is split across sibling files (candle_utils.js,
// manifests.js, providers/prediction.js, snapshot_fetchers.js). Those siblings bind
// their own top-level provider imports at require-time, so purging only filePath's
// cache entry leaves a stale (possibly differently-stubbed) sibling cached from a
// previous test. Purge filePath's whole directory tree alongside it.
function purgeModuleDirCache(filePath) {
  const dirPrefix = path.dirname(filePath) + path.sep;
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(dirPrefix)) delete require.cache[key];
  }
}

function freshRequire(filePath, stubs = {}) {
  delete require.cache[filePath];
  purgeModuleDirCache(filePath);
  for (const k of Object.keys(stubs)) delete require.cache[k];

  const orig = Module._load;
  Module._load = function(request, parent, isMain) {
    const resolved = (() => {
      try { return Module._resolveFilename(request, parent, isMain); } catch (_) { return null; }
    })();
    if (resolved && Object.prototype.hasOwnProperty.call(stubs, resolved)) {
      return stubs[resolved];
    }
    return orig.apply(this, arguments);
  };
  try {
    return require(filePath);
  } finally {
    Module._load = orig;
    delete require.cache[filePath];
    purgeModuleDirCache(filePath);
    for (const k of Object.keys(stubs)) delete require.cache[k];
  }
}

function withAlpacaEnv(run) {
  const previous = {
    ALPACA_API_KEY: process.env.ALPACA_API_KEY,
    ALPACA_API_SECRET: process.env.ALPACA_API_SECRET,
    ALPACA_SECRET_KEY: process.env.ALPACA_SECRET_KEY,
    ALPACA_PAPER_API_KEY: process.env.ALPACA_PAPER_API_KEY,
    ALPACA_PAPER_SECRET_KEY: process.env.ALPACA_PAPER_SECRET_KEY,
    ALPACA_PAPER_BASE_URL: process.env.ALPACA_PAPER_BASE_URL,
    ALPACA_DATA_FEED: process.env.ALPACA_DATA_FEED,
    ALPACA_ADJUSTMENT: process.env.ALPACA_ADJUSTMENT,
    SOVEREIGN_SKIP_DOTENV: process.env.SOVEREIGN_SKIP_DOTENV,
  };
  process.env.ALPACA_API_KEY = 'test-key';
  process.env.ALPACA_API_SECRET = 'test-secret';
  delete process.env.ALPACA_SECRET_KEY;
  delete process.env.ALPACA_PAPER_API_KEY;
  delete process.env.ALPACA_PAPER_SECRET_KEY;
  delete process.env.ALPACA_PAPER_BASE_URL;
  delete process.env.ALPACA_DATA_FEED;
  delete process.env.ALPACA_ADJUSTMENT;
  process.env.SOVEREIGN_SKIP_DOTENV = '1';
  return Promise.resolve()
    .then(run)
    .finally(() => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
}

function makeBar(openTime, close = 100) {
  return { openTime, open: close - 1, high: close + 1, low: close - 2, close, volume: 10 };
}

test('fetchAlpacaBaseCandles maps 5m to Alpaca 5Min and follows page tokens', async () => {
  await withAlpacaEnv(async () => {
    const calls = [];
    const start = Date.UTC(2026, 0, 1);
    const end = Date.UTC(2026, 0, 2);
    const responses = [
      {
        bars: { AAPL: [{ t: new Date(start).toISOString(), o: 1, h: 2, l: 0.5, c: 1.5, v: 100 }] },
        next_page_token: 'next-page',
      },
      {
        bars: { AAPL: [{ t: new Date(start + 300000).toISOString(), o: 2, h: 3, l: 1.5, c: 2.5, v: 200 }] },
      },
    ];
    const fetchJson = async (url, options) => {
      calls.push({ url, options });
      return responses.shift();
    };

    const { fetchAlpacaBaseCandles } = freshRequire(alpacaPath, {
      [commonPath]: { fetchJson },
    });

    const bars = await fetchAlpacaBaseCandles('AAPL', '5m', 10000, start, end);

    assert.strictEqual(bars.length, 2);
    assert.strictEqual(calls.length, 2);
    const firstUrl = new URL(calls[0].url);
    const secondUrl = new URL(calls[1].url);
    assert.strictEqual(firstUrl.searchParams.get('timeframe'), '5Min');
    assert.strictEqual(firstUrl.searchParams.get('limit'), '10000');
    assert.strictEqual(firstUrl.searchParams.get('adjustment'), 'split');
    assert.strictEqual(firstUrl.searchParams.get('feed'), 'iex');
    assert.strictEqual(firstUrl.searchParams.get('sort'), 'asc');
    assert.strictEqual(secondUrl.searchParams.get('page_token'), 'next-page');
    assert.strictEqual(calls[0].options.headers['APCA-API-KEY-ID'], 'test-key');
  });
});

test('fetchAlpacaBaseCandles accepts documented ALPACA_SECRET_KEY alias', async () => {
  const previous = {
    ALPACA_API_KEY: process.env.ALPACA_API_KEY,
    ALPACA_API_SECRET: process.env.ALPACA_API_SECRET,
    ALPACA_SECRET_KEY: process.env.ALPACA_SECRET_KEY,
    ALPACA_PAPER_API_KEY: process.env.ALPACA_PAPER_API_KEY,
    ALPACA_PAPER_SECRET_KEY: process.env.ALPACA_PAPER_SECRET_KEY,
    ALPACA_PAPER_BASE_URL: process.env.ALPACA_PAPER_BASE_URL,
    ALPACA_DATA_FEED: process.env.ALPACA_DATA_FEED,
    SOVEREIGN_SKIP_DOTENV: process.env.SOVEREIGN_SKIP_DOTENV,
  };
  process.env.ALPACA_API_KEY = 'doc-key';
  process.env.ALPACA_SECRET_KEY = 'doc-secret';
  delete process.env.ALPACA_API_SECRET;
  delete process.env.ALPACA_PAPER_API_KEY;
  delete process.env.ALPACA_PAPER_SECRET_KEY;
  delete process.env.ALPACA_PAPER_BASE_URL;
  delete process.env.ALPACA_DATA_FEED;
  process.env.SOVEREIGN_SKIP_DOTENV = '1';

  try {
    const calls = [];
    const fetchJson = async (url, options) => {
      calls.push({ url, options });
      return { bars: { AAPL: [{ t: new Date(Date.UTC(2026, 0, 1)).toISOString(), o: 1, h: 2, l: 0.5, c: 1.5, v: 100 }] } };
    };
    const { fetchAlpacaBaseCandles } = freshRequire(alpacaPath, {
      [commonPath]: { fetchJson },
    });

    const bars = await fetchAlpacaBaseCandles('AAPL', 1, '1d');

    assert.strictEqual(bars.length, 1);
    assert.strictEqual(calls[0].options.headers['APCA-API-KEY-ID'], 'doc-key');
    assert.strictEqual(calls[0].options.headers['APCA-API-SECRET-KEY'], 'doc-secret');
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('fetchAlpacaBaseCandles clamps SIP windows away from the recent-data blackout', async () => {
  await withAlpacaEnv(async () => {
    process.env.ALPACA_DATA_FEED = 'sip';
    const calls = [];
    const fetchJson = async (url) => {
      calls.push(url);
      return { bars: { AAPL: [] } };
    };
    const { fetchAlpacaBaseCandles } = freshRequire(alpacaPath, {
      [commonPath]: { fetchJson },
    });

    const now = Date.now();
    await fetchAlpacaBaseCandles('AAPL', '5m', 10000, now - 86400000, now);
    assert.strictEqual(calls.length, 1);
    const end = new Date(new URL(calls[0]).searchParams.get('end')).getTime();
    assert.ok(end <= now - 15 * 60 * 1000, 'sip end must sit behind the ~15min blackout');
    assert.strictEqual(new URL(calls[0]).searchParams.get('feed'), 'sip');

    // Degenerate window entirely inside the blackout: no request at all.
    const bars = await fetchAlpacaBaseCandles('AAPL', '5m', 10000, now - 60 * 1000, now);
    assert.deepStrictEqual(bars, []);
    assert.strictEqual(calls.length, 1);
  });
});

test('fetchAlpacaBaseCandles leaves iex windows unclamped', async () => {
  await withAlpacaEnv(async () => {
    const calls = [];
    const fetchJson = async (url) => {
      calls.push(url);
      return { bars: { AAPL: [] } };
    };
    const { fetchAlpacaBaseCandles } = freshRequire(alpacaPath, {
      [commonPath]: { fetchJson },
    });

    const now = Date.now();
    await fetchAlpacaBaseCandles('AAPL', '5m', 10000, now - 86400000, now);
    const end = new Date(new URL(calls[0]).searchParams.get('end')).getTime();
    assert.strictEqual(end, now);
  });
});

test('fetchPaginated uses 10000-bar chunks for equity 5m windows', async () => {
  const { fetchPaginated, providerMaxBarsFor } = require(backfillPath);
  const calls = [];
  const forcedEnd = Date.UTC(2026, 0, 1);
  const fetchFn = async (symbol, timeframe, limit, startTs, endTs) => {
    calls.push({ symbol, timeframe, limit, startTs, endTs });
    return [makeBar(startTs + 1000)];
  };

  const candles = await fetchPaginated('AAPL', '5m', 365, 'equities', fetchFn, forcedEnd);

  assert.ok(candles.length > 0);
  assert.strictEqual(providerMaxBarsFor('equities'), 10000);
  assert.strictEqual(providerMaxBarsFor('crypto'), 1000);
  assert.strictEqual(calls[0].limit, 10000);
  assert.ok(calls.length <= 3, '365 calendar days at 128 days/chunk should fit in <= 3 chunks');
});

test('fetchEquityOrIndexSnapshot routes Alpaca 5m to native paginated candles', async () => {
  const backfillMod = require(backfillPath);
  const origFetchPaginated = backfillMod.fetchPaginated;
  const calls = [];
  const start = Date.now() - 6 * 5 * 60 * 1000;
  const nativeBars = Array.from({ length: 6 }, (_, i) => makeBar(start + i * 5 * 60 * 1000, 100 + i));

  backfillMod.fetchPaginated = async (symbol, timeframe, days, family, fetchFn, forcedEndTs) => {
    calls.push({ symbol, timeframe, days, family, fetchFn, forcedEndTs });
    return nativeBars;
  };

  try {
    delete require.cache[ingestIndexPath];
    purgeModuleDirCache(ingestIndexPath);
    const ingestMod = require(ingestIndexPath);
    const result = await ingestMod.fetchEquityOrIndexSnapshot(
      'equities',
      'alpaca',
      'AAPL',
      ['5m', '15m'],
      {},
      { historyDays: 30 },
    );

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].symbol, 'AAPL');
    assert.strictEqual(calls[0].timeframe, '5m');
    assert.strictEqual(calls[0].family, 'equities');

    const fiveM = result.filter(r => r.timeframe === '5m');
    const fifteenM = result.filter(r => r.timeframe === '15m');
    assert.strictEqual(fiveM.length, 6);
    assert.ok(fiveM.every(r => r.provider === 'alpaca'));
    assert.ok(fiveM.every(r => !Object.prototype.hasOwnProperty.call(r, 'source')));
    assert.ok(fifteenM.length > 0);
    assert.ok(fifteenM.every(r => r.derived_from_timeframe === '5m'));
  } finally {
    backfillMod.fetchPaginated = origFetchPaginated;
    delete require.cache[ingestIndexPath];
    purgeModuleDirCache(ingestIndexPath);
  }
});

test('fetchEquityOrIndexSnapshot does not synthesize Alpaca 5m from daily data when native bars are absent', async () => {
  const backfillMod = require(backfillPath);
  const origFetchPaginated = backfillMod.fetchPaginated;
  backfillMod.fetchPaginated = async () => [];

  try {
    delete require.cache[ingestIndexPath];
    purgeModuleDirCache(ingestIndexPath);
    const ingestMod = require(ingestIndexPath);
    await assert.rejects(
      () => ingestMod.fetchEquityOrIndexSnapshot('equities', 'alpaca', 'AAPL', ['5m'], {}, { historyDays: 30 }),
      /No native Alpaca 5m candles returned/,
    );
  } finally {
    backfillMod.fetchPaginated = origFetchPaginated;
    delete require.cache[ingestIndexPath];
    purgeModuleDirCache(ingestIndexPath);
  }
});

async function runEquityBackfillWithStubs(cmdArgs, fakeConfig, snapshotFactory = null) {
  const dataPath = path.resolve(REPO_ROOT, 'backend/cli/commands/data/data.js');
  const ingestPath = path.resolve(REPO_ROOT, 'backend/scripts/data_ops/ingest_market_data.js');
  const utilsPath = path.resolve(REPO_ROOT, 'backend/cli/lib/utils.js');

  const ingestStub = async (...args) => (
    snapshotFactory ? snapshotFactory(...args) : { sources: [], errors: [], mode: 'test' }
  );
  ingestStub.loadConfig = async () => fakeConfig;
  ingestStub.ingestMarketData = ingestStub;

  const outputs = [];
  const realUtils = require(utilsPath);
  const utilsStub = { ...realUtils, printPayload: (payload) => outputs.push(payload) };
  const stubs = { [ingestPath]: ingestStub, [utilsPath]: utilsStub };

  const orig = Module._load;
  Module._load = function(request, parent, isMain) {
    const resolved = (() => { try { return Module._resolveFilename(request, parent, isMain); } catch (_) { return null; } })();
    if (resolved && stubs[resolved]) return stubs[resolved];
    return orig.apply(this, arguments);
  };

  delete require.cache[dataPath];
  const dataMod = require(dataPath);

  try {
    await dataMod.commandEquityDeepBackfill(cmdArgs);
  } finally {
    Module._load = orig;
    delete require.cache[dataPath];
    delete require.cache[ingestPath];
  }
  return outputs;
}

test('commandEquityDeepBackfill dry-run includes US equities and skips unsupported markets', async () => {
  const fakeConfig = {
    equities: {
      symbols: ['AAPL', 'VCB', 'BABA'],
      universe_matrix: {
        grid: {
          USA: { technology: ['MSFT'], indices: ['SPY'] },
          VN: { financials: ['VCB'] },
          UK: { energy: ['BP'] },
        },
      },
    },
  };

  const outputs = await runEquityBackfillWithStubs(['--days', '1825', '--dry-run'], fakeConfig);
  const out = outputs[0];

  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.dry_run, true);
  assert.strictEqual(out.provider, 'alpaca');
  assert.deepStrictEqual(out.symbol_list, ['AAPL', 'BABA', 'MSFT', 'SPY']);
  assert.deepStrictEqual(out.skipped_symbols.map(s => s.symbol).sort(), ['BP', 'VCB']);
  assert.ok(out.estimated_api_calls > 0);
});

test('commandEquityDeepBackfill executes ingest with Alpaca provider pin at the 1m base grain', async () => {
  // Mixed-base grain: equities now default to a native 1m base (Alpaca SIP serves deep
  // 1m); 5m/15m/… are derived locally. The fetch therefore requests timeframe '1m'.
  const fakeConfig = { equities: { symbols: ['AAPL'] } };
  const calls = [];
  const outputs = await runEquityBackfillWithStubs(['--symbol', 'AAPL', '--days', '30'], fakeConfig, (opts) => {
    calls.push(opts);
    return { sources: [{ family: 'equities', provider: 'alpaca', symbol: 'AAPL', timeframe: '1m' }], errors: [] };
  });

  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].family, 'equities');
  assert.strictEqual(calls[0].provider, 'alpaca');
  assert.strictEqual(calls[0].timeframe, '1m', 'equity deep backfill fetches the 1m base');
  assert.strictEqual(calls[0].force, true);
  assert.strictEqual(calls[0].chunkDelayMs, 500);
  assert.strictEqual(outputs[0].ok, true);
  assert.strictEqual(outputs[0].timeframe, '1m');
  assert.strictEqual(outputs[0].total_base_bars, 1);
});

test('commandEquityDeepBackfill --base-tf 5m preserves the legacy 5m-native path', async () => {
  const fakeConfig = { equities: { symbols: ['AAPL'] } };
  const calls = [];
  const outputs = await runEquityBackfillWithStubs(['--symbol', 'AAPL', '--days', '30', '--base-tf', '5m'], fakeConfig, (opts) => {
    calls.push(opts);
    return { sources: [{ family: 'equities', provider: 'alpaca', symbol: 'AAPL', timeframe: '5m' }], errors: [] };
  });

  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].timeframe, '5m', '--base-tf 5m fetches native 5m');
  assert.strictEqual(outputs[0].ok, true);
  assert.strictEqual(outputs[0].total_base_bars, 1);
});
