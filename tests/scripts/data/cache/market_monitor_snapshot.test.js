'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  resolveConfiguredMarketUniverse,
  buildWriterJobUniverse,
} = require('../../../../shared/lib/market/configured_universe.js');
const {
  buildMarketMonitorSnapshot,
} = require('../../../../shared/lib/market/monitor_snapshot.js');
const {
  writeTsIndex,
} = require('../../../../shared/lib/market/validation.js');
const {
  buildJobUniverse,
} = require('../../../../backend/cli/commands/data/backfill_daemon.js');

function record(instrument, timestamp, close, provider) {
  return {
    record: {
      symbol: instrument.symbol,
      family: instrument.family,
      timeframe: instrument.base_timeframe,
      timestamp,
      close,
      open: close,
      high: close,
      low: close,
      volume: 1,
      provider,
    },
    recordCount: 12,
    sourceMode: 'canonical',
  };
}

test('configured universe deduplicates exact identities and reports unsupported/non-price entries', () => {
  const config = {
    crypto: { enabled: true, symbols: ['btcusdt', 'BTCUSDT'] },
    equities: {
      enabled: true,
      symbols: ['SPX', 'VCB'],
      universe_matrix: {
        grid: {
          USA: { indices: ['SPX'], malformed: ['../unsafe'] },
          VN: { financials: ['VCB'] },
        },
      },
    },
    indices: { enabled: true, symbols: ['SPX'] },
    commodities: { enabled: true, symbols: ['NO_PROVIDER_MAPPING'] },
    fx: { enabled: false, symbols: ['EURUSD'] },
    pmi: { enabled: true, series: ['manufacturing', 'services'] },
    weather: { enabled: true, locations: ['north', 'south'], metrics: ['temp', 'rain'] },
  };
  const universe = resolveConfiguredMarketUniverse(config);

  assert.deepEqual(
    universe.instruments.map((item) => item.instrument_id),
    ['crypto:BTCUSDT', 'equities:SPX', 'indices:SPX'],
  );
  assert.equal(universe.counts.price_bearing_total, 3);
  assert.equal(universe.counts.configured_price_bearing_total, 6);
  assert.equal(universe.counts.excluded_price_bearing_total, 3);
  assert.equal(universe.counts.not_price_bearing_total, 6);
  assert.ok(universe.exclusions.some((item) => item.reason === 'unsafe_or_malformed_symbol'));
  assert.ok(universe.exclusions.some((item) => item.reason === 'unsupported_writer_market'));
  assert.ok(universe.exclusions.some((item) => item.reason === 'missing_provider_symbol_mapping'));
});

test('backfill writer and monitor resolve the same supported configured universe', () => {
  const config = {
    crypto: { enabled: true, symbols: ['BTCUSDT', 'ETHUSDT'] },
    equities: {
      enabled: true,
      symbols: ['AAPL', 'VCB'],
      universe_matrix: { grid: { USA: { technology: ['AAPL'] }, VN: { financials: ['VCB'] } } },
    },
    indices: { enabled: true, symbols: ['SPX'] },
    commodities: { enabled: true, symbols: ['XAUUSD'] },
    fx: { enabled: true, symbols: ['EURUSD'] },
  };
  assert.deepEqual(buildJobUniverse(config), buildWriterJobUniverse(config));
  assert.deepEqual(
    buildJobUniverse(config).map((job) => `${job.family}:${job.symbol}:${job.baseTf}`),
    [
      'crypto:BTCUSDT:1m',
      'crypto:ETHUSDT:1m',
      'equities:AAPL:1m',
      'indices:SPX:5m',
      'commodities:XAUUSD:5m',
      'fx:EURUSD:5m',
    ],
  );
});

test('snapshot keeps freshness, provider, update, and schedule states independent', () => {
  const now = Date.parse('2026-07-04T14:00:00.000Z'); // Saturday, 10:00 New York
  const config = {
    crypto: { enabled: true, symbols: ['BTCUSDT'] },
    equities: {
      enabled: true,
      symbols: ['AAPL'],
      universe_matrix: { grid: { USA: { technology: ['AAPL'] } } },
    },
  };
  const universe = resolveConfiguredMarketUniverse(config);
  const byId = new Map(universe.instruments.map((item) => [item.instrument_id, item]));
  const latest = new Map([
    ['BTCUSDT', record(byId.get('crypto:BTCUSDT'), new Date(now - 30 * 60 * 1000).toISOString(), 64000, 'binance')],
    ['AAPL', record(byId.get('equities:AAPL'), new Date(now - 100 * 60 * 60 * 1000).toISOString(), 210, 'alpaca')],
  ]);
  const snapshot = buildMarketMonitorSnapshot(config, {
    tsDir: '/unused/injected-reader',
    nowMs: now,
    clockMs: () => now,
    latestReader: (_dir, symbol) => latest.get(symbol),
    providerStates: { binance: 'reachable', alpaca: 'degraded' },
    updateStates: {
      'equities:AAPL': {
        state: 'running',
        last_update_attempt_at: '2026-07-04T13:59:00.000Z',
      },
    },
  });

  const btc = snapshot.rows.find((row) => row.instrument_id === 'crypto:BTCUSDT');
  const aapl = snapshot.rows.find((row) => row.instrument_id === 'equities:AAPL');
  assert.equal(btc.freshness_state, 'fresh');
  assert.equal(btc.market_state, 'open');
  assert.equal(btc.expected_next_at, '2026-07-04T13:31:00.000Z');
  assert.equal(aapl.freshness_state, 'stale');
  assert.equal(aapl.update_state, 'running');
  assert.equal(aapl.provider_state, 'degraded');
  assert.equal(aapl.market_state, 'closed');
  assert.equal(aapl.schedule_basis, 'nyse_regular_weekdays_no_holiday_calendar');
  assert.equal(aapl.expected_next_at, null);
  assert.deepEqual(snapshot.counts.freshness, {
    fresh: 1,
    delayed: 0,
    stale: 1,
    missing: 0,
    invalid: 0,
  });
  assert.equal(
    Object.values(snapshot.counts.freshness).reduce((sum, count) => sum + count, 0),
    snapshot.counts.price_bearing_total,
  );
});

test('snapshot isolates missing, corrupt, future, and malformed status states', () => {
  const now = Date.parse('2026-07-05T00:00:00.000Z');
  const symbols = ['MISSUSDT', 'CORRUPTUSDT', 'FUTUREUSDT', 'IDENTITYUSDT'];
  const config = { crypto: { enabled: true, symbols } };
  const universe = resolveConfiguredMarketUniverse(config);
  const bySymbol = new Map(universe.instruments.map((item) => [item.symbol, item]));
  const snapshot = buildMarketMonitorSnapshot(config, {
    tsDir: '/unused/injected-reader',
    nowMs: now,
    clockMs: () => now,
    latestReader: (_dir, symbol) => {
      if (symbol === 'MISSUSDT') return null;
      if (symbol === 'CORRUPTUSDT') throw Object.assign(new Error('secret path must not leak'), { reason: 'checksum_mismatch' });
      if (symbol === 'FUTUREUSDT') {
        return record(bySymbol.get(symbol), new Date(now + 10 * 60 * 1000).toISOString(), 1, 'binance');
      }
      const latest = record(bySymbol.get(symbol), new Date(now - 1000).toISOString(), 1, 'binance');
      latest.record.family = 'equities';
      return latest;
    },
    providerStates: { binance: 'definitely_online' },
    updateStates: { 'crypto:MISSUSDT': { state: 'surprise', last_update_error: 'token=secret' } },
  });

  assert.equal(snapshot.counts.freshness.missing, 1);
  assert.equal(snapshot.counts.freshness.invalid, 3);
  assert.ok(snapshot.rows.every((row) => row.provider_state === 'unknown'));
  assert.equal(snapshot.rows.find((row) => row.symbol === 'MISSUSDT').update_state, 'failed');
  assert.equal(snapshot.rows.find((row) => row.symbol === 'MISSUSDT').last_update_error, 'invalid_update_state');
  assert.equal(snapshot.rows.find((row) => row.symbol === 'CORRUPTUSDT').last_update_error, 'checksum_mismatch');
  assert.ok(!JSON.stringify(snapshot).includes('secret path'));
  assert.ok(!JSON.stringify(snapshot).includes('token=secret'));
});

test('snapshot reads the verified canonical tail and reports its exact count without mutation', () => {
  const tsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'market-monitor-snapshot-'));
  const now = Date.parse('2026-07-05T00:02:00.000Z');
  const config = { crypto: { enabled: true, symbols: ['BTCUSDT'] } };
  const sources = [
    {
      symbol: 'BTCUSDT', family: 'crypto', provider: 'binance', timeframe: '1m',
      timestamp: '2026-07-05T00:00:00.000Z', open: 100, high: 101, low: 99, close: 100, volume: 1,
    },
    {
      symbol: 'BTCUSDT', family: 'crypto', provider: 'binance', timeframe: '1m',
      timestamp: '2026-07-05T00:01:00.000Z', open: 100, high: 102, low: 100, close: 101, volume: 2,
    },
  ];
  try {
    writeTsIndex(tsDir, { sources });
    const binPath = path.join(tsDir, 'BTCUSDT_1m.bin');
    const before = fs.statSync(binPath);
    const snapshot = buildMarketMonitorSnapshot(config, {
      tsDir,
      nowMs: now,
      clockMs: () => now,
    });
    const after = fs.statSync(binPath);
    assert.equal(snapshot.rows[0].value, 101);
    assert.equal(snapshot.rows[0].record_count, 2);
    assert.equal(snapshot.rows[0].source_mode, 'canonical');
    assert.equal(snapshot.rows[0].freshness_state, 'fresh');
    assert.equal(after.size, before.size);
    assert.equal(after.mtimeMs, before.mtimeMs);
  } finally {
    fs.rmSync(tsDir, { recursive: true, force: true });
  }
});
