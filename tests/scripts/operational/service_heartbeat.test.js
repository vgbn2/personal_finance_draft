'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  heartbeatPath,
  readServiceHeartbeat,
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

test('single heartbeat reader preserves a valid due time on an expired record', () => {
  const directory = tempDir();
  try {
    const writtenAt = Date.parse('2026-07-27T12:00:00.000Z');
    writeServiceHeartbeat('host_backup', {
      state: 'healthy',
      success: true,
      next_run_at: '2026-07-28T12:00:00.000Z',
    }, { directory, nowMs: writtenAt });
    const result = readServiceHeartbeat('host_backup', {
      directory,
      nowMs: writtenAt + 3 * 24 * 60 * 60 * 1000,
    });

    assert.equal(result.reason, 'heartbeat_expired');
    assert.equal(result.next_run_at, '2026-07-28T12:00:00.000Z');
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

test('heartbeat publication can explicitly clear a scheduled next run without counting an attempt', () => {
  const directory = tempDir();
  try {
    const nowMs = Date.parse('2026-07-27T12:00:00.000Z');
    writeServiceHeartbeat('host_health', {
      state: 'healthy',
      success: true,
      next_run_at: '2026-07-27T12:05:00.000Z',
    }, { directory, nowMs });
    const stopped = writeServiceHeartbeat('host_health', {
      state: 'stopped',
      attempted: false,
      next_run_at: null,
    }, { directory, nowMs: nowMs + 1000 });

    assert.equal(stopped.next_run_at, null);
    assert.equal(stopped.attempt_count, 1);
    assert.equal(stopped.success_count, 1);
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

test('last_attempt_at advances on completed attempts and preserves timestamp when attempted is false', () => {
  const directory = tempDir();
  try {
    const t0 = Date.parse('2026-07-30T10:00:00.000Z');
    const first = writeServiceHeartbeat('portfolio_monitor', {
      state: 'healthy',
      success: true,
      attempted: true,
    }, { directory, nowMs: t0 });
    assert.equal(first.last_attempt_at, '2026-07-30T10:00:00.000Z');
    assert.equal(first.attempt_count, 1);

    const t1 = t0 + 60_000;
    const second = writeServiceHeartbeat('portfolio_monitor', {
      state: 'degraded',
      error_code: 'authentication_failed',
      attempted: true,
    }, { directory, nowMs: t1 });
    assert.equal(second.last_attempt_at, '2026-07-30T10:01:00.000Z');
    assert.equal(second.attempt_count, 2);

    const t2 = t1 + 30_000;
    const stopped = writeServiceHeartbeat('portfolio_monitor', {
      state: 'stopped',
      attempted: false,
    }, { directory, nowMs: t2 });
    assert.equal(stopped.last_attempt_at, '2026-07-30T10:01:00.000Z');
    assert.equal(stopped.attempt_count, 2);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

