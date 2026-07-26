'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  createMarketMonitorService,
} = require('../../../../shared/lib/market/monitor_service.js');
const {
  buildMarketMonitorSnapshot,
} = require('../../../../shared/lib/market/monitor_snapshot.js');
const {
  writeTsIndex,
} = require('../../../../shared/lib/market/validation.js');
const {
  commandMarketMonitor,
  renderMarketMonitor,
  runMarketMonitorQuery,
} = require('../../../../backend/cli/commands/operational/market_monitor.js');
const {
  createMarketMonitorRoute,
} = require('../../../../backend/api/server/routes/market/market_monitor.js');

function fixtureSnapshot() {
  return {
    schema_version: 1,
    policy_version: 'global-market-monitor-v1',
    universe_policy_version: 'configured-market-universe-v1',
    generated_at: '2026-07-27T00:00:00.000Z',
    snapshot_duration_ms: 2,
    storage_mode: 'canonical',
    counts: {
      configured_price_bearing_total: 3,
      price_bearing_total: 3,
      excluded_price_bearing_total: 0,
      not_price_bearing_total: 0,
      exclusion_entries: 0,
      freshness: { fresh: 1, delayed: 1, stale: 1, missing: 0, invalid: 0 },
      provider: { reachable: 1, degraded: 0, unreachable: 0, unknown: 2 },
      update: { idle: 2, queued: 0, running: 1, succeeded: 0, failed: 0 },
    },
    rows: [
      {
        instrument_id: 'crypto:BTCUSDT', symbol: 'BTCUSDT', family: 'crypto',
        freshness_state: 'fresh', provider_state: 'reachable', update_state: 'idle',
      },
      {
        instrument_id: 'crypto:ETHUSDT', symbol: 'ETHUSDT', family: 'crypto',
        freshness_state: 'delayed', provider_state: 'unknown', update_state: 'running',
      },
      {
        instrument_id: 'equities:AAPL', symbol: 'AAPL', family: 'equities',
        freshness_state: 'stale', provider_state: 'unknown', update_state: 'idle',
      },
    ],
    exclusions: [],
  };
}

test('filters and pagination preserve exact global counters and reject malformed input', async () => {
  let builds = 0;
  const service = createMarketMonitorService({
    loadConfig: async () => ({}),
    buildSnapshot: async () => {
      builds += 1;
      return fixtureSnapshot();
    },
  });

  const first = await service.query({ family: 'crypto', limit: '1', offset: '0' });
  const second = await service.query({ family: 'crypto', limit: '1', offset: '1' });
  assert.equal(first.ok, true);
  assert.equal(first.rows.length, 1);
  assert.equal(first.pagination.filtered_total, 2);
  assert.equal(first.pagination.has_more, true);
  assert.equal(second.rows[0].symbol, 'ETHUSDT');
  assert.deepEqual(first.counts, fixtureSnapshot().counts);
  assert.deepEqual(second.counts, fixtureSnapshot().counts);
  assert.equal(builds, 1, 'filter-varied requests reuse one unfiltered snapshot');

  for (const [query, code] of [
    [{ limit: '0' }, 'invalid_limit'],
    [{ limit: '101' }, 'invalid_limit'],
    [{ offset: '-1' }, 'invalid_offset'],
    [{ freshness_state: 'healthy' }, 'invalid_freshness_state'],
    [{ input: '/tmp/not-accepted.json' }, 'invalid_query_field'],
  ]) {
    const payload = await service.query(query);
    assert.equal(payload.ok, false);
    assert.equal(payload.error_code, code);
    assert.deepEqual(payload.rows, []);
  }
});

test('concurrent requests deduplicate snapshot work and refresh failure keeps last-known rows degraded', async () => {
  let now = 1000;
  let builds = 0;
  let failRefresh = false;
  const service = createMarketMonitorService({
    clockMs: () => now,
    loadConfig: async () => {
      await new Promise((resolve) => setImmediate(resolve));
      return {};
    },
    buildSnapshot: async () => {
      builds += 1;
      if (failRefresh) throw new Error('/private/path token=secret');
      return fixtureSnapshot();
    },
  });

  const concurrent = await Promise.all([
    service.query({ limit: '1' }),
    service.query({ family: 'crypto', limit: '2' }),
    service.query({ symbol: 'AAPL' }),
  ]);
  assert.equal(builds, 1);
  assert.ok(concurrent.every((payload) => payload.ok));

  now += 5001;
  failRefresh = true;
  const fallback = await service.query({ symbol: 'BTCUSDT' });
  assert.equal(builds, 2);
  assert.equal(fallback.ok, true);
  assert.equal(fallback.degraded, true);
  assert.equal(fallback.refresh_error_code, 'snapshot_refresh_failed');
  assert.equal(fallback.rows[0].symbol, 'BTCUSDT');
  assert.ok(!JSON.stringify(fallback).includes('/private/path'));
  assert.ok(!JSON.stringify(fallback).includes('token=secret'));
  const throttled = await service.query({ symbol: 'ETHUSDT' });
  assert.equal(builds, 2, 'failed refresh is throttled by the same bounded cache window');
  assert.equal(throttled.refresh_error_code, 'snapshot_refresh_failed');
});

test('CLI and API adapters return the same service payload and classify invalid requests as 400', async () => {
  const service = createMarketMonitorService({
    loadConfig: async () => ({}),
    buildSnapshot: async () => fixtureSnapshot(),
  });
  const route = createMarketMonitorRoute(service);
  const cli = await runMarketMonitorQuery(
    ['--family', 'crypto', '--freshness', 'fresh', '--limit', '10'],
    service,
  );
  const api = await route.handle({
    family: 'crypto',
    freshness_state: 'fresh',
    limit: '10',
  });
  assert.deepEqual(api, cli);
  assert.equal(route.status(api), 200);

  const invalid = await route.handle({ limit: '1000' });
  assert.equal(invalid.error_code, 'invalid_limit');
  assert.equal(route.status(invalid), 400);

  const empty = await route.handle({ symbol: 'SOLUSDT', offset: '25' });
  assert.equal(empty.ok, true);
  assert.equal(empty.pagination.filtered_total, 0);
  assert.equal(empty.pagination.returned, 0);
  assert.match(renderMarketMonitor(empty), /Rows 0-0 of 0 filtered/);
});

test('CLI watch mode bounds interval and iteration work', async () => {
  const calls = [];
  const delays = [];
  const output = [];
  const priorLog = console.log;
  console.log = (line) => output.push(String(line));
  try {
    const code = await commandMarketMonitor([
      '--watch',
      '--iterations', '2',
      '--interval-secs', '5',
      '--limit', '1',
      '--json',
    ], {
      service: {
        async query(query) {
          calls.push(query);
          return {
            ...fixtureSnapshot(),
            ok: true,
            type: 'market_monitor',
            degraded: false,
            degradation_reasons: [],
            refresh_error_code: null,
            filters: {},
            pagination: { offset: 0, limit: 1, returned: 1, filtered_total: 3, has_more: true },
            rows: fixtureSnapshot().rows.slice(0, 1),
          };
        },
      },
      sleep: async (ms) => delays.push(ms),
    });
    assert.equal(code, 0);
    assert.equal(calls.length, 2);
    assert.deepEqual(delays, [5000]);
    assert.equal(output.length, 2);
    assert.equal(JSON.parse(output[0]).type, 'market_monitor');
  } finally {
    console.log = priorLog;
  }
});

test('real snapshot service reads canonical tails without mutating time-series files', async () => {
  const tsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'market-monitor-service-'));
  const now = Date.parse('2026-07-27T00:02:00.000Z');
  try {
    writeTsIndex(tsDir, {
      sources: [{
        symbol: 'BTCUSDT',
        family: 'crypto',
        provider: 'binance',
        timeframe: '1m',
        timestamp: '2026-07-27T00:01:00.000Z',
        open: 100,
        high: 102,
        low: 99,
        close: 101,
        volume: 5,
      }],
    });
    const binPath = path.join(tsDir, 'BTCUSDT_1m.bin');
    const metaPath = path.join(tsDir, 'BTCUSDT_1m.meta.json');
    const before = [fs.statSync(binPath), fs.statSync(metaPath)];
    const service = createMarketMonitorService({
      clockMs: () => now,
      loadConfig: async () => ({ crypto: { enabled: true, symbols: ['BTCUSDT'] } }),
      buildSnapshot: (config, { nowMs }) => buildMarketMonitorSnapshot(config, {
        tsDir,
        nowMs,
        clockMs: () => now,
      }),
    });
    const payload = await service.query({ limit: '1' });
    const after = [fs.statSync(binPath), fs.statSync(metaPath)];
    assert.equal(payload.ok, true);
    assert.equal(payload.rows[0].value, 101);
    assert.equal(payload.rows[0].record_count, 1);
    assert.deepEqual(
      after.map((entry) => [entry.size, entry.mtimeMs, entry.ino]),
      before.map((entry) => [entry.size, entry.mtimeMs, entry.ino]),
    );

    const source = fs.readFileSync(
      path.join(__dirname, '../../../../shared/lib/market/monitor_service.js'),
      'utf8',
    );
    assert.doesNotMatch(
      source,
      /\b(?:fetch|spawn|spawnSync|exec|execFile|writeFile|appendFile|unlink|rename)(?:Sync)?\s*\(/,
    );
  } finally {
    fs.rmSync(tsDir, { recursive: true, force: true });
  }
});
