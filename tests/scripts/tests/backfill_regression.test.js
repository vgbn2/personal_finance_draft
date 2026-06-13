const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');

const researchPath = path.resolve(__dirname, '../../../backend/cli/commands/research/research.js');
const ingestPath = path.resolve(__dirname, '../../../backend/scripts/data_ops/ingest_market_data.js');
const configLoaderPath = path.resolve(__dirname, '../../../shared/lib/runtime/config_loader.js');
const researchConfigPath = path.resolve(__dirname, '../../../backend/cli/lib/research_config.js');
const validationPath = path.resolve(__dirname, '../../../shared/lib/market/validation.js');

function freshRequire(filePath) {
  delete require.cache[filePath];
  return require(filePath);
}

async function withModuleStubs(stubs, run) {
  const originalLoad = Module._load;
  const purge = [researchPath, ingestPath, configLoaderPath, researchConfigPath];
  const purgeSet = new Set(purge);

  for (const filePath of purge) {
    delete require.cache[filePath];
  }

  Module._load = function(request, parent, isMain) {
    const resolved = Module._resolveFilename(request, parent, isMain);
    if (Object.prototype.hasOwnProperty.call(stubs, resolved)) {
      return stubs[resolved];
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    return await run();
  } finally {
    Module._load = originalLoad;
    for (const filePath of purgeSet) {
      delete require.cache[filePath];
    }
  }
}

function makeHistoricalBar(symbol, timeframe) {
  return [{
    symbol,
    timeframe,
    time: '2026-06-01T00:00:00.000Z',
    open: 1,
    high: 1,
    low: 1,
    close: 1,
    volume: 1,
  }];
}

test('historical backfill uses every configured timeframe when none is pinned', async () => {
  const calls = [];
  const timeframes = ['5m', '15m', '30m', '1h', '4h', '1d'];
  const fakeConfig = {
    equities: { symbols: [] },
    indices: { symbols: [] },
    commodities: { symbols: [] },
    fx: { symbols: [] },
    crypto: { symbols: ['BTCUSDT'], timeframes },
    macro: { series: [] },
    pmi: { series: [] },
  };
  const loadResearchConfigStub = () => fakeConfig;
  loadResearchConfigStub.loadResearchConfig = loadResearchConfigStub;
  loadResearchConfigStub.loadConfig = loadResearchConfigStub;
  const ingestMarketDataStub = async (opts) => {
    calls.push({ ...opts });
    return { fetched_at: '2026-06-01T00:00:00.000Z', sources: makeHistoricalBar(opts.symbol, opts.timeframe) };
  };
  ingestMarketDataStub.loadConfig = () => fakeConfig;
  ingestMarketDataStub.ingestMarketData = ingestMarketDataStub;

  await withModuleStubs(
    {
      [ingestPath]: ingestMarketDataStub,
    },
    async () => {
      const { loadHistoricalSources } = freshRequire(researchPath);
      await loadHistoricalSources(['--family', 'crypto', '--symbol', 'BTCUSDT', '--days', '2']);

      assert.deepEqual(calls.map((call) => call.timeframe), timeframes);
    },
  );
});

test('historical backfill stays pinned when a timeframe is explicit', async () => {
  const calls = [];
  const fakeConfig = {
    equities: { symbols: [] },
    indices: { symbols: [] },
    commodities: { symbols: [] },
    fx: { symbols: [] },
    crypto: { symbols: ['BTCUSDT'], timeframes: ['5m', '15m', '30m', '1h', '4h', '1d'] },
    macro: { series: [] },
    pmi: { series: [] },
  };
  const loadResearchConfigStub = () => fakeConfig;
  loadResearchConfigStub.loadResearchConfig = loadResearchConfigStub;
  loadResearchConfigStub.loadConfig = loadResearchConfigStub;
  const ingestMarketDataStub = async (opts) => {
    calls.push({ ...opts });
    return { fetched_at: '2026-06-01T00:00:00.000Z', sources: makeHistoricalBar(opts.symbol, opts.timeframe) };
  };
  ingestMarketDataStub.loadConfig = () => fakeConfig;
  ingestMarketDataStub.ingestMarketData = ingestMarketDataStub;

  await withModuleStubs(
    {
      [ingestPath]: ingestMarketDataStub,
    },
    async () => {
      const { loadHistoricalSources } = freshRequire(researchPath);
      await loadHistoricalSources(['--family', 'crypto', '--symbol', 'BTCUSDT', '--days', '2', '--timeframe', '1h']);

      assert.deepEqual(calls.map((call) => call.timeframe), ['1h']);
    },
  );
});

test('ts-index writer uses process-unique temp files', () => {
  const { writeTsIndex, readTsIndex } = require(validationPath);
  const tsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-ts-index-'));
  const fixedTmp = path.join(tsDir, 'BTCUSDT_1d.bin.tmp');
  fs.writeFileSync(fixedTmp, 'foreign-writer-temp', 'utf8');

  try {
    writeTsIndex(tsDir, {
      sources: [{
        family: 'crypto',
        symbol: 'BTCUSDT',
        timeframe: '1d',
        timestamp: '2026-06-13T00:00:00.000Z',
        open: 100,
        high: 110,
        low: 90,
        close: 105,
        volume: 12,
        provider: 'test',
      }],
    });

    const rows = readTsIndex(tsDir, 'BTCUSDT', '1d');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].close, 105);
    assert.equal(fs.readFileSync(fixedTmp, 'utf8'), 'foreign-writer-temp');
  } finally {
    fs.rmSync(tsDir, { recursive: true, force: true });
  }
});
