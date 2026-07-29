'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseHostHealthOptions,
  runHostHealthLoop,
} = require('../../../backend/scripts/ops/host_health');

test('host-health watch mode continues across degraded and healthy cycles', async () => {
  const results = [
    { ok: false, checks: { disk: { reason: 'disk_space_low' } } },
    { ok: true, checks: {} },
  ];
  const heartbeats = [];
  const waits = [];
  const output = [];
  const result = await runHostHealthLoop({
    watch: true,
    intervalSecs: 10,
    probeOptions: {},
    probeHost: () => results.shift(),
    writeHeartbeat: (service, patch) => heartbeats.push({ service, patch }),
    sleep: async (milliseconds) => waits.push(milliseconds),
    output: (payload) => output.push(payload),
    nowMs: () => Date.parse('2026-07-29T00:00:00.000Z'),
    maxCycles: 2,
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.cycles, 2);
  assert.deepEqual(waits, [10000]);
  assert.equal(heartbeats[0].patch.state, 'degraded');
  assert.equal(heartbeats[0].patch.error_code, 'storage_unavailable');
  assert.equal(heartbeats[1].patch.state, 'healthy');
  assert.equal(heartbeats[1].patch.error_code, null);
  assert.equal(output.length, 2);
});

test('host-health watch mode sanitizes probe exceptions and keeps running', async () => {
  let calls = 0;
  const heartbeats = [];
  const result = await runHostHealthLoop({
    watch: true,
    intervalSecs: 10,
    probeOptions: {},
    probeHost: () => {
      calls += 1;
      if (calls === 1) throw new Error('401 bearer token=secret-value');
      return { ok: true, checks: {} };
    },
    writeHeartbeat: (service, patch) => heartbeats.push({ service, patch }),
    sleep: async () => {},
    maxCycles: 2,
  });

  assert.equal(result.exitCode, 0);
  assert.equal(heartbeats[0].patch.error_code, 'authentication_failed');
  assert.doesNotMatch(JSON.stringify(heartbeats), /secret-value|bearer/i);
  assert.equal(heartbeats[1].patch.state, 'healthy');
});

test('host-health one-shot compatibility returns nonzero for degraded state', async () => {
  const result = await runHostHealthLoop({
    watch: false,
    intervalSecs: 300,
    probeOptions: {},
    probeHost: () => ({ ok: false, checks: { canonical_data: { reason: 'stale' } } }),
    writeHeartbeat: () => {},
    output: () => {},
  });

  assert.equal(result.cycles, 1);
  assert.equal(result.exitCode, 1);
});

test('host-health options reject an invalid watch interval before probing', () => {
  assert.throws(
    () => parseHostHealthOptions(['--watch', '--interval-secs', '0'], {}),
    /positive number/,
  );
});

test('host-health watch mode publishes stopped when its wait is interrupted', async () => {
  const controller = new AbortController();
  const heartbeats = [];
  const result = await runHostHealthLoop({
    watch: true,
    intervalSecs: 300,
    probeOptions: {},
    probeHost: () => ({ ok: true, checks: {} }),
    writeHeartbeat: (service, patch) => heartbeats.push({ service, patch }),
    sleep: async (milliseconds, signal) => {
      assert.equal(milliseconds, 300000);
      controller.abort();
      return !signal.aborted;
    },
    signal: controller.signal,
    output: () => {},
  });

  assert.equal(result.cycles, 1);
  assert.equal(heartbeats.at(-1).patch.state, 'stopped');
  assert.equal(heartbeats.at(-1).patch.attempted, false);
});
