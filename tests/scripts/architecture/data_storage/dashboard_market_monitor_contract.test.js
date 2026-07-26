'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

function counts(total = 2) {
  return {
    configured_price_bearing_total: total,
    price_bearing_total: total,
    excluded_price_bearing_total: 0,
    not_price_bearing_total: 0,
    exclusion_entries: 0,
    freshness: { fresh: total, delayed: 0, stale: 0, missing: 0, invalid: 0 },
    provider: { reachable: total, degraded: 0, unreachable: 0, unknown: 0 },
    update: { idle: total, queued: 0, running: 0, succeeded: 0, failed: 0 },
  };
}

function row(symbol, index = 0) {
  return {
    instrument_id: `crypto:${symbol}`,
    symbol,
    display_name: `${symbol} display`,
    family: 'crypto',
    market: 'global',
    base_timeframe: '1m',
    value: 100 + index,
    value_kind: 'price',
    currency_or_unit: 'USD',
    provider: 'binance',
    observed_at: `2026-07-27T00:0${index}:00.000Z`,
    age_ms: index * 60_000,
    freshness_threshold_ms: 3_600_000,
    expected_next_at: null,
    freshness_state: 'fresh',
    provider_state: 'reachable',
    update_state: 'idle',
    last_update_attempt_at: null,
    last_update_error: null,
    record_count: 10,
    source_mode: 'canonical',
  };
}

function payload(rows = [row('BTCUSDT'), row('ETHUSDT', 1)]) {
  return {
    ok: true,
    type: 'market_monitor',
    schema_version: 1,
    degraded: false,
    degradation_reasons: [],
    refresh_error_code: null,
    policy_version: 'global-market-monitor-v1',
    universe_policy_version: 'configured-market-universe-v1',
    generated_at: '2026-07-27T00:02:00.000Z',
    snapshot_duration_ms: 2,
    storage_mode: 'canonical',
    counts: counts(rows.length),
    filters: {},
    pagination: {
      offset: 0,
      limit: 1,
      returned: Math.min(1, rows.length),
      filtered_total: rows.length,
      has_more: rows.length > 1,
    },
    rows: rows.slice(0, 1),
    exclusions: [],
  };
}

test('dashboard monitor fetches bounded authenticated pages and rejects changing snapshots', async () => {
  const {
    fetchCompleteMarketMonitor,
    MarketMonitorRequestError,
  } = await import('../../../../Frontend/dashboard/src/lib/market_monitor.js');
  const rows = [row('BTCUSDT'), row('ETHUSDT', 1)];
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const parsed = new URL(url);
    const offset = Number(parsed.searchParams.get('offset'));
    const limit = Number(parsed.searchParams.get('limit'));
    const pageRows = rows.slice(offset, offset + limit);
    return new Response(JSON.stringify({
      ...payload(rows),
      pagination: {
        offset,
        limit,
        returned: pageRows.length,
        filtered_total: rows.length,
        has_more: offset + pageRows.length < rows.length,
      },
      rows: pageRows,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const result = await fetchCompleteMarketMonitor({
    fetchImpl,
    url: 'http://127.0.0.1:8787/api/market/monitor',
    headers: { Authorization: 'Bearer current-session-token' },
    pageSize: 1,
  });
  assert.deepEqual(result.rows.map((entry) => entry.symbol), ['BTCUSDT', 'ETHUSDT']);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.options.headers.Authorization === 'Bearer current-session-token'));
  assert.ok(calls.every((call) => new URL(call.url).searchParams.get('limit') === '1'));

  let generation = 0;
  const changingFetch = async (url) => {
    const parsed = new URL(url);
    const offset = Number(parsed.searchParams.get('offset'));
    generation += 1;
    const pageRows = rows.slice(offset, offset + 1);
    return new Response(JSON.stringify({
      ...payload(rows),
      generated_at: `2026-07-27T00:02:0${generation}.000Z`,
      pagination: {
        offset,
        limit: 1,
        returned: pageRows.length,
        filtered_total: rows.length,
        has_more: offset + pageRows.length < rows.length,
      },
      rows: pageRows,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  await assert.rejects(
    fetchCompleteMarketMonitor({
      fetchImpl: changingFetch,
      url: 'http://127.0.0.1:8787/api/market/monitor',
      pageSize: 1,
    }),
    (error) => error instanceof MarketMonitorRequestError
      && error.code === 'snapshot_changed_during_pagination',
  );
});

test('dashboard model degrades stale, malformed, empty, and counter-mismatched payloads', async () => {
  const {
    normalizeMarketMonitorPayload,
  } = await import('../../../../Frontend/dashboard/src/lib/market_monitor.js');
  const base = payload([row('BTCUSDT')]);
  const stale = normalizeMarketMonitorPayload(base, Date.parse('2026-07-27T00:02:31.000Z'));
  assert.equal(stale.staleSnapshot, true);
  assert.equal(stale.degraded, true);
  assert.ok(stale.diagnostics.includes('stale_snapshot'));

  const malformed = normalizeMarketMonitorPayload({
    ...base,
    rows: [{ ...row('BTCUSDT'), freshness_state: 'live' }],
  }, Date.parse('2026-07-27T00:02:01.000Z'));
  assert.equal(malformed.rows.length, 0);
  assert.equal(malformed.malformedRows, 1);
  assert.ok(malformed.diagnostics.includes('malformed_rows'));

  const mismatch = normalizeMarketMonitorPayload({
    ...base,
    counts: {
      ...base.counts,
      freshness: { ...base.counts.freshness, fresh: 0 },
    },
  }, Date.parse('2026-07-27T00:02:01.000Z'));
  assert.ok(mismatch.diagnostics.includes('counter_mismatch'));
  assert.equal(mismatch.degraded, true);

  const duplicate = normalizeMarketMonitorPayload({
    ...payload([row('BTCUSDT'), row('ETHUSDT', 1)]),
    rows: [row('BTCUSDT'), row('BTCUSDT')],
  }, Date.parse('2026-07-27T00:02:01.000Z'));
  assert.equal(duplicate.rows.length, 1);
  assert.equal(duplicate.duplicateRows, 1);
  assert.ok(duplicate.diagnostics.includes('duplicate_rows'));

  const providerMismatch = normalizeMarketMonitorPayload({
    ...base,
    counts: {
      ...base.counts,
      provider: { ...base.counts.provider, reachable: 0 },
    },
  }, Date.parse('2026-07-27T00:02:01.000Z'));
  assert.ok(providerMismatch.diagnostics.includes('provider_counter_mismatch'));
  assert.equal(providerMismatch.degraded, true);

  const empty = normalizeMarketMonitorPayload({
    ...base,
    counts: counts(0),
    rows: [],
    pagination: { offset: 0, limit: 100, returned: 0, filtered_total: 0, has_more: false },
  }, Date.parse('2026-07-27T00:02:01.000Z'));
  assert.ok(empty.diagnostics.includes('empty_universe'));
  assert.equal(empty.degraded, true);
});

test('dashboard filters and sorts verified rows without mutating the source payload', async () => {
  const {
    filterAndSortMarketRows,
  } = await import('../../../../Frontend/dashboard/src/lib/market_monitor.js');
  const source = [
    { ...row('ETHUSDT', 1), freshness_state: 'stale', value: null },
    { ...row('BTCUSDT'), freshness_state: 'fresh', value: 64000 },
    { ...row('AAPL'), instrument_id: 'equities:AAPL', family: 'equities', provider: 'alpaca', value: 210 },
  ];
  const original = structuredClone(source);
  assert.deepEqual(
    filterAndSortMarketRows(source, { family: 'crypto', sortKey: 'value', sortDirection: 'desc' })
      .map((entry) => entry.symbol),
    ['BTCUSDT', 'ETHUSDT'],
  );
  assert.deepEqual(
    filterAndSortMarketRows(source, { query: 'alpaca' }).map((entry) => entry.symbol),
    ['AAPL'],
  );
  assert.deepEqual(source, original);
});

test('dashboard source uses current browser auth and contains no privileged token fallback', () => {
  const apiSource = fs.readFileSync(
    path.join(REPO_ROOT, 'Frontend/dashboard/src/lib/api.ts'),
    'utf8',
  );
  const panelSource = fs.readFileSync(
    path.join(REPO_ROOT, 'Frontend/dashboard/src/components/panels/QuoteHealthPanel.tsx'),
    'utf8',
  );
  const modelSource = fs.readFileSync(
    path.join(REPO_ROOT, 'Frontend/dashboard/src/lib/market_monitor.js'),
    'utf8',
  );
  assert.match(apiSource, /MARKET_MONITOR:.*\/api\/market\/monitor/);
  assert.match(panelSource, /getAuthHeaders\(\)/);
  assert.match(panelSource, /document\.visibilityState === 'visible'/);
  assert.match(panelSource, /REFRESH_INTERVAL_MS = 10_000/);
  assert.doesNotMatch(`${apiSource}\n${panelSource}\n${modelSource}`, /VITE_API_TOKEN|SOVEREIGN_API_TOKEN/);
  assert.doesNotMatch(panelSource, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(modelSource, /\b(?:writeFile|appendFile|unlink|rename|spawn|exec)\s*\(/);
});
