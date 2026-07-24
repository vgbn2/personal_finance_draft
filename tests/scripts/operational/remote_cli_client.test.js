'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  loadRemoteConfig,
  normalizeBaseUrl,
  requestRemote,
} = require('../../../backend/cli/lib/remote_client');
const {
  endpointFor,
  requestView,
} = require('../../../backend/cli/commands/operational/remote');
const {
  computeCachedBias,
} = require('../../../backend/cli/commands/research/bias');

test('remote config reads token from a file without requiring argv secrets', () => {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-client-'));
  const token = 'read-only-client-token-1234567890';
  fs.writeFileSync(path.join(configDir, 'client.token'), `${token}\n`, { mode: 0o600 });
  fs.writeFileSync(path.join(configDir, 'client.json'), JSON.stringify({
    base_url: 'http://127.0.0.1:9123/',
    refresh_seconds: 7,
  }));

  const config = loadRemoteConfig({ configDir, env: {} });
  assert.equal(config.baseUrl, 'http://127.0.0.1:9123');
  assert.equal(config.token, token);
  assert.equal(config.refreshSeconds, 7);
});

test('remote URL allows cleartext only through a loopback tunnel', () => {
  assert.equal(normalizeBaseUrl('http://127.0.0.1:8788/'), 'http://127.0.0.1:8788');
  assert.equal(normalizeBaseUrl('http://[::1]:8788/'), 'http://[::1]:8788');
  assert.equal(normalizeBaseUrl('https://private-host.example/'), 'https://private-host.example');
  assert.throws(() => normalizeBaseUrl('http://private-host.example:8788'), /loopback/);
  assert.throws(() => normalizeBaseUrl('file:///tmp/client.json'), /http or https/);
  assert.throws(() => normalizeBaseUrl('http://secret@127.0.0.1:8788'), /must not contain credentials/);
});

test('remote config replaces non-finite refresh intervals with a safe default', () => {
  const token = 'read-only-client-token-1234567890';
  const invalid = loadRemoteConfig({
    env: { SOVEREIGN_REMOTE_REFRESH_SECONDS: 'not-a-number' },
    token,
  });
  const infinite = loadRemoteConfig({
    env: { SOVEREIGN_REMOTE_REFRESH_SECONDS: 'Infinity' },
    token,
  });
  assert.equal(invalid.refreshSeconds, 10);
  assert.equal(infinite.refreshSeconds, 10);
});

test('remote request sends scoped token and classifies stale response', async () => {
  const calls = [];
  const result = await requestRemote('/api/client/status', {
    config: {
      baseUrl: 'http://127.0.0.1:8788',
      token: 'scoped-client-token-1234567890',
    },
    fetchImpl: async (url, request) => {
      calls.push({ url: String(url), request });
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, stale: true }),
      };
    },
  });

  assert.equal(result.state, 'stale');
  assert.equal(calls[0].request.method, 'GET');
  assert.equal(calls[0].request.headers['X-Sovereign-Token'], 'scoped-client-token-1234567890');
  assert.equal(calls[0].url, 'http://127.0.0.1:8788/api/client/status');
});

test('remote request reports host-declared degraded health', async () => {
  const result = await requestRemote('/api/client/status', {
    config: {
      baseUrl: 'http://127.0.0.1:8788',
      token: 'scoped-client-token-1234567890',
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, health: { degraded: true } }),
    }),
  });
  assert.equal(result.state, 'degraded');
});

test('remote request fails closed when token is missing', async () => {
  let called = false;
  const result = await requestRemote('/api/client/status', {
    config: { baseUrl: 'http://127.0.0.1:8788', token: '' },
    fetchImpl: async () => { called = true; },
  });
  assert.equal(result.state, 'unauthorized');
  assert.equal(called, false);
});

test('remote request rejects malformed short tokens before network access', async () => {
  let called = false;
  const result = await requestRemote('/api/client/status', {
    config: { baseUrl: 'http://127.0.0.1:8788', token: 'short' },
    fetchImpl: async () => { called = true; },
  });
  assert.equal(result.state, 'unauthorized');
  assert.match(result.error, /missing or invalid/);
  assert.equal(called, false);
});

test('remote bias view is read-only and symbol-addressed', async () => {
  assert.deepEqual(endpointFor(['bias', 'ethusdt']), {
    view: 'bias',
    endpoint: '/api/bias?symbol=ETHUSDT',
  });
  const requested = [];
  const response = await requestView(['bias', 'BTCUSDT'], {
    config: { baseUrl: 'http://127.0.0.1:8788', token: 'bias-client-token-1234567890' },
    fetchImpl: async (url, request) => {
      requested.push({ url: String(url), method: request.method });
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, aggregate: { bias: 'neutral', confidence: 0 } }),
      };
    },
  });
  assert.equal(response.result.ok, true);
  assert.deepEqual(requested, [{
    url: 'http://127.0.0.1:8788/api/bias?symbol=BTCUSDT',
    method: 'GET',
  }]);
});

test('cached bias computation reports provenance without invoking a backfill', async () => {
  const tsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-empty-ts-'));
  const result = await computeCachedBias('btcusdt', {
    tsDir,
    now: Date.parse('2026-07-24T00:00:00.000Z'),
    includeMl: false,
  });

  assert.equal(result.symbol, 'BTCUSDT');
  assert.equal(result.stale, true);
  assert.deepEqual(result.provenance, {
    source: 'central_host_cached_ts_index',
    cached_only: true,
    provider_poll_triggered: false,
  });
  assert.equal(result.timeframes.length, 7);
  assert.ok(result.timeframes.every((timeframe) => timeframe.error === 'insufficient data'));
});

test('cached bias remains stale when only part of the required timeframe set is fresh', async () => {
  const result = await computeCachedBias('BTCUSDT', {
    now: Date.parse('2026-07-24T00:00:00.000Z'),
    includeMl: false,
    timeframeConfig: [{ tf: '1h' }, { tf: '1d' }],
    analyzeTimeframe: ({ tf }) => (
      tf === '1h'
        ? {
          tf,
          bias: 'long',
          score: 0.5,
          fresh: true,
          last_bar_at: '2026-07-23T23:00:00.000Z',
        }
        : { tf, error: 'stale data', fresh: false }
    ),
  });

  assert.equal(result.aggregate.bias, 'long');
  assert.equal(result.stale, true);
  assert.equal(result.data_as_of, '2026-07-23T23:00:00.000Z');
});
