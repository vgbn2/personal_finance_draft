'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const TEST_ADMIN_TOKEN = 'test-admin-token-client-api';
const TEST_CLIENT_TOKEN = 'test-read-only-client-token';
process.env.SOVEREIGN_API_TOKEN = TEST_ADMIN_TOKEN;
process.env.SOVEREIGN_CLIENT_TOKEN = TEST_CLIENT_TOKEN;

const supabaseClient = require('../server/services/supabase_client');
supabaseClient.getAuthStatus = async (req) => ({
  authenticated: req.headers.authorization === 'Bearer supabase-session-shaped-token',
});

const {
  server,
  io,
  CLIENT_GET_ROUTES,
  DEFAULT_SNAPSHOT,
  PROTECTED_GET_ROUTES,
  STRICT_CLIENT_GET_ROUTES,
} = require('../app');
const {
  buildCachedBias,
  buildClientStatus,
} = require('../server/services/client_snapshot');

function listen() {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve(`http://127.0.0.1:${server.address().port}`);
    });
  });
}

function close() {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(DEFAULT_SNAPSHOT)) fs.unwatchFile(DEFAULT_SNAPSHOT);
    io.close();
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function request(baseUrl, route, headers = {}) {
  return fetch(`${baseUrl}${route}`, { headers });
}

test('role gate preserves viewer sessions and limits service-client capabilities', async () => {
  const baseUrl = await listen();
  try {
    assert.deepEqual(
      [...CLIENT_GET_ROUTES].sort(),
      [
        '/api/bias',
        '/api/bot/status',
        '/api/client/status',
        '/api/data/summary',
        '/api/market/monitor',
        '/api/scorecard',
        '/api/signal',
        '/api/system/service-health',
        '/api/universe',
      ],
    );
    assert.deepEqual(
      [...STRICT_CLIENT_GET_ROUTES].sort(),
      ['/api/bias', '/api/client/status'],
    );
    for (const route of CLIENT_GET_ROUTES) {
      assert.equal(PROTECTED_GET_ROUTES.has(route), true);
    }

    for (const route of CLIENT_GET_ROUTES) {
      const missing = await request(baseUrl, route);
      assert.equal(missing.status, 401);
      assert.equal((await missing.json()).error, 'authentication_required');
    }
    for (const route of STRICT_CLIENT_GET_ROUTES) {
      const viewerBearer = await request(baseUrl, route, {
        Authorization: 'Bearer supabase-session-shaped-token',
      });
      assert.equal(viewerBearer.status, 200);
    }
    const privilegedOverrideBearer = await request(
      baseUrl,
      '/api/bias?input=/tmp/session-must-not-bypass-strict-auth.json',
      { Authorization: 'Bearer supabase-session-shaped-token' },
    );
    assert.equal(privilegedOverrideBearer.status, 403);
    assert.equal((await privilegedOverrideBearer.json()).error, 'insufficient_capability');

    const clientHeader = await request(baseUrl, '/api/client/status', {
      'X-Sovereign-Token': TEST_CLIENT_TOKEN,
    });
    assert.equal(clientHeader.status, 200);
    assert.equal((await clientHeader.json()).mode, 'cached_only');

    const clientBearer = await request(baseUrl, '/api/bias', {
      Authorization: `Bearer ${TEST_CLIENT_TOKEN}`,
    });
    assert.equal(clientBearer.status, 200);
    const biasPayload = await clientBearer.json();
    assert.equal(biasPayload.type, 'cached_bias');
    assert.equal(biasPayload.provenance.cache_only, true);
    assert.equal(biasPayload.provenance.auto_backfill, false);
    assert.equal(typeof biasPayload.stale, 'boolean');

    const clientDataSummary = await request(baseUrl, '/api/data/summary', {
      'X-Sovereign-Token': TEST_CLIENT_TOKEN,
    });
    assert.notEqual(clientDataSummary.status, 401);

    const sessionDataSummary = await request(baseUrl, '/api/data/summary', {
      Authorization: 'Bearer supabase-session-shaped-token',
    });
    assert.notEqual(sessionDataSummary.status, 401);

    const clientMarketMonitor = await request(baseUrl, '/api/market/monitor?limit=2', {
      'X-Sovereign-Token': TEST_CLIENT_TOKEN,
    });
    assert.equal(clientMarketMonitor.status, 200);
    const marketMonitorPayload = await clientMarketMonitor.json();
    assert.equal(marketMonitorPayload.type, 'market_monitor');
    assert.equal(marketMonitorPayload.pagination.returned, 2);
    assert.equal(marketMonitorPayload.counts.price_bearing_total, 89);

    const invalidMarketMonitor = await request(baseUrl, '/api/market/monitor?limit=101', {
      'X-Sovereign-Token': TEST_CLIENT_TOKEN,
    });
    assert.equal(invalidMarketMonitor.status, 400);
    assert.equal((await invalidMarketMonitor.json()).error_code, 'invalid_limit');

    const clientPathOverride = await request(
      baseUrl,
      '/api/data/summary?input=/tmp/client-must-not-read-this.json',
      { 'X-Sovereign-Token': TEST_CLIENT_TOKEN },
    );
    assert.equal(clientPathOverride.status, 403);
    assert.equal((await clientPathOverride.json()).error, 'insufficient_capability');

    for (const headers of [
      { 'X-Sovereign-Token': TEST_ADMIN_TOKEN },
      { Authorization: `Bearer ${TEST_ADMIN_TOKEN}` },
    ]) {
      const response = await request(baseUrl, '/api/client/status', headers);
      assert.equal(response.status, 200);
    }

    for (const route of [
      '/api/config',
      '/api/backend/portfolio',
      '/api/cache/list',
    ]) {
      const clientTokenOnAdminRoute = await request(baseUrl, route, {
        'X-Sovereign-Token': TEST_CLIENT_TOKEN,
      });
      assert.equal(clientTokenOnAdminRoute.status, 403, route);
      assert.equal((await clientTokenOnAdminRoute.json()).error, 'insufficient_capability');
    }
    const clientKillSwitchStatus = await request(baseUrl, '/api/kill-switch?command=status', {
      'X-Sovereign-Token': TEST_CLIENT_TOKEN,
    });
    assert.equal(clientKillSwitchStatus.status, 200);
    const clientKillSwitchMutation = await request(baseUrl, '/api/kill-switch?command=activate', {
      'X-Sovereign-Token': TEST_CLIENT_TOKEN,
    });
    assert.equal(clientKillSwitchMutation.status, 403);
    assert.equal((await clientKillSwitchMutation.json()).error, 'insufficient_capability');

    for (const route of ['/api/bot/cycle', '/api/signal/promote']) {
      const clientPost = await fetch(`${baseUrl}${route}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Sovereign-Token': TEST_CLIENT_TOKEN,
        },
        body: '{}',
      });
      assert.equal(clientPost.status, 403, route);
      assert.equal((await clientPost.json()).error, 'insufficient_capability');
    }
  } finally {
    await close();
  }
});

test('configured MCP gate rejects spoofed headers and preserves normal API authorization', async () => {
  const priorGateToken = process.env.MCP_GATE_TOKEN;
  process.env.MCP_GATE_TOKEN = 'test-mcp-gate-token';
  const baseUrl = await listen();
  try {
    const spoofed = await request(baseUrl, '/api/data/summary', {
      'X-Mcp-Agent': '1',
    });
    assert.equal(spoofed.status, 403);
    assert.equal((await spoofed.json()).error, 'MCP agent authentication required');

    const tokenOnly = await request(baseUrl, '/api/data/summary', {
      'X-Mcp-Token': 'test-mcp-gate-token',
    });
    assert.equal(tokenOnly.status, 401);
    assert.equal((await tokenOnly.json()).error, 'authentication_required');

    const authenticatedRead = await request(baseUrl, '/api/data/summary', {
      'X-Mcp-Token': 'test-mcp-gate-token',
      'X-Sovereign-Token': TEST_CLIENT_TOKEN,
    });
    assert.notEqual(authenticatedRead.status, 401);

    const blockedRoute = await request(baseUrl, '/api/config', {
      'X-Mcp-Token': 'test-mcp-gate-token',
      'X-Sovereign-Token': TEST_ADMIN_TOKEN,
    });
    assert.equal(blockedRoute.status, 403);
    assert.equal((await blockedRoute.json()).error, 'MCP agent access not permitted for this route');
  } finally {
    if (priorGateToken === undefined) delete process.env.MCP_GATE_TOKEN;
    else process.env.MCP_GATE_TOKEN = priorGateToken;
    await close();
  }
});

test('client snapshot builders use cached readers and no side-effect primitives', async () => {
  const now = Date.parse('2026-07-24T00:00:00.000Z');
  const source = fs.readFileSync(
    path.join(__dirname, '../server/services/client_snapshot.js'),
    'utf8',
  );
  assert.doesNotMatch(source, /\b(?:spawn|spawnSync|exec|execFile|fetch)\s*\(/);
  assert.doesNotMatch(source, /\b(?:writeFile|appendFile|rename|unlink|mkdir)Sync?\s*\(/);
  assert.doesNotMatch(source, /\b(?:runNodeCli|backendStatus|botCycle|botSell)\s*\(/);

  const snapshots = {
    'last_fetch.json': {
      mode: 'live',
      fetched_at: '2026-07-23T23:59:30.000Z',
      sources: [{
        family: 'crypto',
        symbol: 'BTCUSDT',
        timestamp: '2026-07-23T23:59:00.000Z',
      }],
      errors: [],
    },
    'data_quality_report.json': {
      usable_records: 1,
      rejected_records: 0,
      provider_errors: [],
    },
    'backfill_daemon_status.json': {
      status: 'sleeping',
      pid: 42,
      cycle: 3,
      families: ['crypto'],
      updated_at: '2026-07-23T23:59:30.000Z',
      next_run_at: '2026-07-24T00:05:00.000Z',
    },
    'run_status.json': {},
    'bot_state.json': {
      config: {
        enabled: true,
        liveTrading: false,
        intervalMinutes: 15,
        maxPositions: 5,
      },
      positions: [],
      cycleHistory: [{
        completedAt: '2026-07-23T23:55:00.000Z',
        dryRun: true,
        errors: [],
      }],
      lastCycleAt: '2026-07-23T23:55:00.000Z',
      lockedAt: null,
    },
  };
  const readJsonSnapshot = (filePath) => {
    const value = snapshots[path.basename(filePath)];
    return {
      available: value !== undefined,
      value: value ?? null,
      modified_at: null,
      error: value === undefined ? 'not_found' : null,
    };
  };

  const originalWrite = fs.writeFileSync;
  const originalAppend = fs.appendFileSync;
  const originalRename = fs.renameSync;
  const originalSpawn = childProcess.spawnSync;
  const originalFetch = global.fetch;
  const forbidden = () => {
    throw new Error('side effect attempted');
  };
  fs.writeFileSync = forbidden;
  fs.appendFileSync = forbidden;
  fs.renameSync = forbidden;
  childProcess.spawnSync = forbidden;
  global.fetch = forbidden;

  try {
    const status = buildClientStatus({}, {
      now,
      readJsonSnapshot,
      familyFreshnessThresholdMs: () => 5 * 60 * 1000,
      resolveRuntimePolicy: () => ({
        requested_profile: 'private-paper',
        can_execute: false,
      }),
    });
    assert.equal(status.ok, true);
    assert.equal(status.mode, 'cached_only');
    assert.equal(status.data.stale, false);
    assert.equal(status.poller.active, true);
    assert.equal(status.bot.observation_only, true);
    assert.equal(status.bot.last_cycle.dry_run, true);
    assert.equal(status.runtime_policy.value.can_execute, false);

    const bias = await buildCachedBias({ symbol: 'btcusdt' }, {
      now,
      tsDir: '/test/cache/ts',
      computeCachedBias: async (symbol, options) => {
        assert.equal(symbol, 'BTCUSDT');
        assert.equal(options.includeMl, false);
        return {
          symbol,
          generated_at: '2026-07-24T00:00:00.000Z',
          data_as_of: '2026-07-23T23:59:00.000Z',
          stale: false,
          provenance: {
            source: 'central_host_cached_ts_index',
            cached_only: true,
            provider_poll_triggered: false,
          },
          aggregate: {
            bias: 'long',
            confidence: 0.4,
          },
          timeframes: [{
            tf: '1h',
            bars: 100,
            fresh: true,
            last_bar_at: '2026-07-23T23:59:00.000Z',
            bias: 'long',
            score: 0.4,
          }],
          ml: null,
        };
      },
    });
    assert.equal(bias.ok, true);
    assert.equal(bias.symbol, 'BTCUSDT');
    assert.equal(bias.available, true);
    assert.equal(bias.stale, false);
    assert.equal(bias.timestamp, '2026-07-23T23:59:00.000Z');
    assert.equal(bias.provenance.provider_fetch, false);
    assert.equal(bias.provenance.auto_backfill, false);
  } finally {
    fs.writeFileSync = originalWrite;
    fs.appendFileSync = originalAppend;
    fs.renameSync = originalRename;
    childProcess.spawnSync = originalSpawn;
    global.fetch = originalFetch;
  }
});
