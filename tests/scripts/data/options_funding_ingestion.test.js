'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SqliteAnalyticsEngine } = require('../../../shared/lib/storage/sqlite_analytics.js');
const {
  fetchBinanceFundingRates,
  fetchBinancePremiumIndex,
  fetchBybitFundingRates,
  fetchDeribitOptionsSummary,
  syncDerivativesToDb,
  parseDeribitInstrument,
} = require('../../../shared/lib/market/derivatives_ingest.js');

test('SqliteAnalyticsEngine: initializes tables and executes queries', () => {
  const engine = new SqliteAnalyticsEngine(':memory:');
  try {
    const inserted = engine.insertFundingRates([
      { symbol: 'BTCUSDT', funding_rate: 0.0001, funding_time_ms: 1700000000000, mark_price: 60000 },
      { symbol: 'BTCUSDT', funding_rate: 0.00015, funding_time_ms: 1700028800000, mark_price: 60500 },
    ]);
    assert.strictEqual(inserted, 2);

    const dup = engine.insertFundingRates([
      { symbol: 'BTCUSDT', funding_rate: 0.0001, funding_time_ms: 1700000000000, mark_price: 60000 },
    ]);
    assert.strictEqual(dup, 0);

    const rows = engine.getFundingRates('BTCUSDT', 10);
    assert.strictEqual(rows.length, 2);
    assert.strictEqual(rows[0].funding_time_ms, 1700028800000);
    assert.strictEqual(rows[0].funding_rate, 0.00015);

    const optInserted = engine.insertOptionsSummary([
      {
        currency: 'BTC',
        instrument_name: 'BTC-27SEP26-60000-C',
        strike: 60000,
        option_type: 'C',
        expiration_ms: 1790318400000,
        mark_price: 2500,
        mark_iv: 55.2,
        delta: 0.52,
        gamma: 0.00003,
        vega: 42.1,
        theta: -12.5,
      },
    ]);
    assert.strictEqual(optInserted, 1);

    const optRows = engine.getOptionsSummary('BTC', 10);
    assert.strictEqual(optRows.length, 1);
    assert.strictEqual(optRows[0].instrument_name, 'BTC-27SEP26-60000-C');
    assert.strictEqual(optRows[0].strike, 60000);
    assert.strictEqual(optRows[0].delta, 0.52);
  } finally {
    engine.close();
  }
});

test('Derivatives Ingest: parses Deribit instrument names', () => {
  const resCall = parseDeribitInstrument('BTC-27SEP26-60000-C');
  assert.strictEqual(resCall.strike, 60000);
  assert.strictEqual(resCall.option_type, 'C');

  const resPut = parseDeribitInstrument('ETH-25DEC26-3000-P');
  assert.strictEqual(resPut.strike, 3000);
  assert.strictEqual(resPut.option_type, 'P');

  const invalid = parseDeribitInstrument('INVALID_NAME');
  assert.deepStrictEqual(invalid, {});
});

test('Derivatives Ingest: fetches and normalizes Binance funding rates (fixture mock)', async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => [
      { symbol: 'BTCUSDT', fundingRate: '0.00010000', fundingTime: 1700000000000, markPrice: '62000.50' },
      { symbol: 'BTCUSDT', fundingRate: '0.00012000', fundingTime: 1700028800000, markPrice: '62500.00' },
    ],
  });

  const rates = await fetchBinanceFundingRates('BTCUSDT', 2, { fetchImpl: mockFetch });
  assert.strictEqual(rates.length, 2);
  assert.strictEqual(rates[0].symbol, 'BTCUSDT');
  assert.strictEqual(rates[0].funding_rate, 0.0001);
  assert.strictEqual(rates[0].mark_price, 62000.5);
});

test('Derivatives Ingest: fetches and normalizes Deribit options summary (fixture mock)', async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      result: [
        {
          instrument_name: 'BTC-27SEP26-65000-C',
          mark_price: 1800.5,
          mark_iv: 52.4,
          creation_timestamp: 1790318400000,
          volume_usd: 1200000,
          open_interest: 450,
          greeks: { delta: 0.48, gamma: 0.000025, vega: 38.2, theta: -10.1 },
        },
      ],
    }),
  });

  const options = await fetchDeribitOptionsSummary('BTC', { fetchImpl: mockFetch });
  assert.strictEqual(options.length, 1);
  assert.strictEqual(options[0].instrument_name, 'BTC-27SEP26-65000-C');
  assert.strictEqual(options[0].strike, 65000);
  assert.strictEqual(options[0].option_type, 'C');
  assert.strictEqual(options[0].delta, 0.48);
});

test('Derivatives Ingest: end-to-end syncs rates and options into SqliteAnalyticsEngine', async () => {
  const engine = new SqliteAnalyticsEngine(':memory:');
  const mockFetch = async (url) => {
    if (url.includes('binance')) {
      return {
        ok: true,
        json: async () => [
          { symbol: 'BTCUSDT', fundingRate: '0.00010000', fundingTime: 1700000000000, markPrice: '62000.50' },
        ],
      };
    }
    return {
      ok: true,
      json: async () => ({
        result: [
          {
            instrument_name: 'BTC-27SEP26-70000-C',
            mark_price: 1200.0,
            mark_iv: 50.0,
            creation_timestamp: 1790318400000,
            greeks: { delta: 0.35, gamma: 0.00002, vega: 30.0, theta: -8.0 },
          },
        ],
      }),
    };
  };

  try {
    const summary = await syncDerivativesToDb(engine, { fetchImpl: mockFetch });
    assert.strictEqual(summary.funding_inserted, 1);
    assert.strictEqual(summary.options_inserted, 1);

    const fundingRows = engine.getFundingRates('BTCUSDT');
    assert.strictEqual(fundingRows.length, 1);
    assert.strictEqual(fundingRows[0].funding_rate, 0.0001);

    const optRows = engine.getOptionsSummary('BTC');
    assert.strictEqual(optRows.length, 1);
    assert.strictEqual(optRows[0].strike, 70000);
  } finally {
    engine.close();
  }
});

test('SqliteAnalyticsEngine: transaction batching, options chain matrix, Greeks & TWAP', () => {
  const engine = new SqliteAnalyticsEngine(':memory:');
  try {
    // 1. Transaction rollback test
    assert.throws(() => {
      engine.transaction(() => {
        engine.db.prepare('INSERT INTO derivatives_funding_rates (symbol, funding_rate, funding_time_ms, ingested_at) VALUES (?, ?, ?, ?)').run('ETHUSDT', 0.0001, 1000, '2026-01-01');
        throw new Error('Simulated failure');
      });
    }, /Simulated failure/);
    const ethRows = engine.getFundingRates('ETHUSDT');
    assert.strictEqual(ethRows.length, 0, 'Rollback should leave zero rows');

    // 2. Funding TWAP calculation
    const baseTime = 1790000000000;
    engine.insertFundingRates([
      { symbol: 'BTCUSDT', funding_rate: 0.0001, funding_time_ms: baseTime, mark_price: 65000 },
      { symbol: 'BTCUSDT', funding_rate: 0.0002, funding_time_ms: baseTime + 28800000, mark_price: 65500 },
      { symbol: 'BTCUSDT', funding_rate: 0.0003, funding_time_ms: baseTime + 57600000, mark_price: 66000 },
    ]);
    const twap = engine.getFundingTwap('BTCUSDT', 86400000);
    assert.strictEqual(twap.symbol, 'BTCUSDT');
    assert.strictEqual(twap.sample_count, 3);
    assert.strictEqual(Number(twap.twap_rate.toFixed(4)), 0.0002);
    assert.ok(twap.apy_percent > 0, 'APY should be positive');

    // 3. Options Chain & Net Greek Exposure
    const expTime = baseTime + 86400000 * 7;
    engine.insertOptionsSummary([
      {
        currency: 'BTC',
        instrument_name: 'BTC-CALL-60K',
        strike: 60000,
        option_type: 'C',
        expiration_ms: expTime,
        mark_price: 6000,
        mark_iv: 50.0,
        delta: 0.70,
        gamma: 0.00002,
        vega: 35.0,
        theta: -15.0,
        open_interest: 100,
        volume_usd: 600000,
      },
      {
        currency: 'BTC',
        instrument_name: 'BTC-PUT-60K',
        strike: 60000,
        option_type: 'P',
        expiration_ms: expTime,
        mark_price: 1000,
        mark_iv: 52.0,
        delta: -0.30,
        gamma: 0.00002,
        vega: 35.0,
        theta: -10.0,
        open_interest: 50,
        volume_usd: 50000,
      },
    ]);

    const chain = engine.getOptionsChain('BTC', expTime);
    assert.strictEqual(chain.length, 1);
    assert.strictEqual(chain[0].strikes.length, 1);
    assert.strictEqual(chain[0].strikes[0].strike, 60000);
    assert.strictEqual(chain[0].strikes[0].call.instrument_name, 'BTC-CALL-60K');
    assert.strictEqual(chain[0].strikes[0].put.instrument_name, 'BTC-PUT-60K');

    const greeks = engine.getNetGreekExposure('BTC');
    assert.strictEqual(greeks.currency, 'BTC');
    // Delta OI: (0.70 * 100) + (-0.30 * 50) = 70 - 15 = 55
    assert.strictEqual(Number(greeks.net_delta_oi.toFixed(2)), 55.0);
    assert.strictEqual(greeks.total_open_interest, 150);

    const smile = engine.getVolatilitySmile('BTC', expTime);
    assert.strictEqual(smile.length, 2);
    assert.strictEqual(smile[0].strike, 60000);
  } finally {
    engine.close();
  }
});

test('Derivatives Ingest: fetches Bybit funding rates and Binance premium index (fixture mock)', async () => {
  const mockBybitFetch = async () => ({
    ok: true,
    json: async () => ({
      result: {
        list: [
          { symbol: 'BTCUSDT', fundingRate: '0.000100', fundingRateTimestamp: '1700000000000' },
          { symbol: 'BTCUSDT', fundingRate: '0.000150', fundingRateTimestamp: '1700028800000' },
        ],
      },
    }),
  });

  const bybitRates = await fetchBybitFundingRates('BTCUSDT', 2, { fetchImpl: mockBybitFetch });
  assert.strictEqual(bybitRates.length, 2);
  assert.strictEqual(bybitRates[0].symbol, 'BTCUSDT');
  assert.strictEqual(bybitRates[0].funding_rate, 0.0001);

  const mockPremiumFetch = async () => ({
    ok: true,
    json: async () => ({
      symbol: 'BTCUSDT',
      markPrice: '64500.50',
      indexPrice: '64480.00',
      estimatedSettlePrice: '64510.00',
      lastFundingRate: '0.000100',
      nextFundingTime: 1700028800000,
      interestRate: '0.000100',
      time: 1700000000000,
    }),
  });

  const premium = await fetchBinancePremiumIndex('BTCUSDT', { fetchImpl: mockPremiumFetch });
  assert.ok(premium);
  assert.strictEqual(premium.symbol, 'BTCUSDT');
  assert.strictEqual(premium.mark_price, 64500.5);
  assert.strictEqual(premium.index_price, 64480.0);
  assert.strictEqual(premium.last_funding_rate, 0.0001);
});
