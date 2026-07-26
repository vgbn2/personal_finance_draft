'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  heartbeatPath,
  readServiceHeartbeats,
  writeServiceHeartbeat,
} = require('../../../shared/lib/runtime/service_heartbeat');
const { buildClientStatus } = require('../../../backend/api/server/services/client_snapshot');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'service-heartbeat-'));
}

test('heartbeat publication is atomic, bounded, and sanitizes authentication failures', () => {
  const directory = tempDir();
  try {
    const nowMs = Date.parse('2026-07-27T12:00:00.000Z');
    const payload = writeServiceHeartbeat('backfill', {
      state: 'degraded',
      error: 'Alpaca returned 401 with bearer token=secret-value',
    }, { directory, nowMs });
    assert.equal(payload.error_code, 'authentication_failed');
    const persisted = JSON.parse(fs.readFileSync(heartbeatPath('backfill', directory), 'utf8'));
    assert.equal(persisted.error_code, 'authentication_failed');
    assert.equal(Object.hasOwn(persisted, 'error'), false);
    assert.doesNotMatch(JSON.stringify(persisted), /secret-value|bearer/i);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('heartbeat reader distinguishes missing, expired, healthy, and malformed records', () => {
  const directory = tempDir();
  try {
    const nowMs = Date.parse('2026-07-27T12:00:00.000Z');
    writeServiceHeartbeat('paper_bot', { state: 'healthy', success: true }, { directory, nowMs: nowMs - 60_000 });
    fs.writeFileSync(heartbeatPath('backfill', directory), '{broken');
    const result = readServiceHeartbeats({ directory, nowMs, services: ['paper_bot', 'backfill', 'host_health'] });
    assert.equal(result.services.find((service) => service.service === 'paper_bot').state, 'healthy');
    assert.equal(result.services.find((service) => service.service === 'backfill').reason, 'heartbeat_invalid');
    assert.equal(result.services.find((service) => service.service === 'host_health').reason, 'heartbeat_missing');
    const expired = readServiceHeartbeats({ directory, nowMs: nowMs + 6 * 60 * 1000, services: ['paper_bot'] });
    assert.equal(expired.services[0].state, 'unavailable');
    assert.equal(expired.services[0].reason, 'heartbeat_expired');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('failed atomic publication leaves the previous heartbeat readable', () => {
  const directory = tempDir();
  try {
    const nowMs = Date.parse('2026-07-27T12:00:00.000Z');
    writeServiceHeartbeat('host_health', { state: 'healthy', success: true }, { directory, nowMs });
    const failingFs = { ...fs, renameSync() { throw new Error('simulated interruption'); } };
    assert.throws(() => writeServiceHeartbeat('host_health', { state: 'degraded', error: '401 token=secret' }, { directory, nowMs: nowMs + 1, fsImpl: failingFs }), /simulated interruption/);
    const persisted = JSON.parse(fs.readFileSync(heartbeatPath('host_health', directory), 'utf8'));
    assert.equal(persisted.state, 'healthy');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('legacy client status projects old raw backfill outcomes to safe fields', () => {
  const payloads = new Map([
    ['poller', { status: 'sleeping', updated_at: '2026-07-27T11:59:00.000Z', last_outcome: { ok: false, error: '401 token=secret-value', nested: { secret: 'secret-value' } } }],
  ]);
  const result = buildClientStatus({}, {
    now: Date.parse('2026-07-27T12:00:00.000Z'),
    paths: { snapshot: 'snapshot', quality: 'quality', poller: 'poller', runStatus: 'run', botState: 'bot' },
    readJsonSnapshot: (filePath) => ({
      available: payloads.has(filePath),
      value: payloads.get(filePath) || {},
      modified_at: null,
      error: null,
    }),
    resolveRuntimePolicy: () => null,
  });
  assert.deepEqual(result.poller.last_outcome, {
    ok: false,
    symbol: null,
    family: null,
    action: null,
    error_code: 'authentication_failed',
  });
  assert.doesNotMatch(JSON.stringify(result), /secret-value/);
});
