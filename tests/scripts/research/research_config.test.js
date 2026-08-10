'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const { loadResearchConfig } = require('../../../backend/cli/lib/research_config.js');
const { historicalWindowFromArgs } = require('../../../backend/cli/commands/research/research.js');

const EXPECTED_DEFAULT_DAYS = 1825;
const EXPECTED_DEFAULT_SECONDS = EXPECTED_DEFAULT_DAYS * 24 * 60 * 60;
const RESEARCH_SOURCES_PATH = require.resolve('../../../backend/cli/commands/research/research_sources.js');
const INGEST_PATH = require.resolve('../../../backend/scripts/data_ops/ingest_market_data.js');

const TEST_CONFIG = {
  equities: { symbols: [] },
  indices: { symbols: [] },
  commodities: { symbols: [] },
  fx: { symbols: [] },
  crypto: { symbols: ['BTCUSDT'], timeframes: ['1d'] },
  macro: { series: [] },
  pmi: { series: [] },
  prediction_market: { events: ['fed_rate_cut_prob'] },
};

function assertDefaultWindow(window) {
  assert.equal(window.days, EXPECTED_DEFAULT_DAYS);
  assert.equal(window.endTs - window.startTs, EXPECTED_DEFAULT_SECONDS);
}

async function withIngestStub(stub, run) {
  const originalLoad = Module._load;
  delete require.cache[RESEARCH_SOURCES_PATH];

  // audit-ignore-loader: controlled dependency fixture restored by this test scope

  Module._load = function(request, parent, isMain) {
    const resolved = Module._resolveFilename(request, parent, isMain);
    if (resolved === INGEST_PATH) return stub;
    return originalLoad.apply(this, arguments);
  };

  try {
    return await run(require(RESEARCH_SOURCES_PATH));
  } finally {
    Module._load = originalLoad;
    delete require.cache[RESEARCH_SOURCES_PATH];
  }
}

test('configured research history default remains aligned with the five-year backfill target', () => {
  const config = loadResearchConfig();
  assert.equal(config.historical_defaults?.fallback_days, EXPECTED_DEFAULT_DAYS);
});

test('research command windows use the configured five-year default', () => {
  assertDefaultWindow(historicalWindowFromArgs([]));
});

test('provider history forwards the configured five-year default to ingestion', async () => {
  const calls = [];
  const ingestStub = {
    loadConfig: async () => TEST_CONFIG,
    ingestMarketData: async (options) => {
      calls.push(options);
      return {
        fetched_at: '2026-07-22T00:00:00.000Z',
        sources: [{
          family: options.family,
          provider: 'test',
          symbol: options.symbol,
          timeframe: options.timeframe,
          timestamp: '2026-07-21T00:00:00.000Z',
          open: 1,
          high: 1,
          low: 1,
          close: 1,
          volume: 1,
        }],
      };
    },
  };

  await withIngestStub(ingestStub, async ({ loadHistoricalSources }) => {
    await loadHistoricalSources(['--family', 'crypto', '--symbol', 'BTCUSDT']);
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].historyDays, EXPECTED_DEFAULT_DAYS);
});

test('prediction history forwards the configured window and records interest evidence', async () => {
  const priceCalls = [];
  let interestCalls = 0;
  const ingestStub = {
    loadConfig: async () => TEST_CONFIG,
    fetchKalshiHistoricalMarkets: async () => ({ records: [] }),
    fetchKalshiHistoricalCandlesticks: async () => [],
    fetchPolymarketHistoricalPrices: async (eventName, options) => {
      priceCalls.push({ eventName, ...options });
      return [];
    },
    fetchPredictionInterestSignal: async (eventName) => {
      interestCalls += 1;
      return { family: 'sentiment', provider: 'test', symbol: eventName, value: 1 };
    },
  };

  const result = await withIngestStub(ingestStub, ({ loadPredictionMarketHistory }) => (
    loadPredictionMarketHistory(['--prediction-provider', 'polymarket'])
  ));

  assert.equal(priceCalls.length, 1);
  assert.equal(priceCalls[0].eventName, 'fed_rate_cut_prob');
  assert.equal(priceCalls[0].endTs - priceCalls[0].startTs, EXPECTED_DEFAULT_SECONDS);
  assert.equal(interestCalls, 1);
  assert.equal(result.errors.length, 0);
  assert.equal(result.sources.length, 1);
});
