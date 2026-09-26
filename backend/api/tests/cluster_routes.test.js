'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const clusterRoutes = require('../server/routes/system/cluster_routes.js');

test('Cluster API Routes: exposes /api/cluster/status and returns node status', async () => {
  assert.strictEqual(clusterRoutes.path, '/api/cluster/status');

  const res = await clusterRoutes.handle({ action: 'status' });
  assert.strictEqual(res.ok, true);
  assert.ok(res.node_id, 'Must contain node_id');
  assert.ok(Number.isFinite(res.priority), 'Must contain numeric priority');
  assert.ok(Array.isArray(res.nodes), 'Must contain nodes list');
  assert.strictEqual(clusterRoutes.status(res), 200);
});

test('Cluster API Routes: handles heartbeat action', async () => {
  const res = await clusterRoutes.handle({
    action: 'heartbeat',
    metadata: { version: '1.0.0', role_label: 'primary' },
  });

  assert.strictEqual(res.ok, true);
  assert.ok(res.heartbeat, 'Must return heartbeat object');
  assert.strictEqual(res.heartbeat.metadata.role_label, 'primary');
});

test('Cluster API Routes: handles election action', async () => {
  const res = await clusterRoutes.handle({ action: 'elect' });
  assert.strictEqual(res.ok, true);
  assert.ok(res.election, 'Must return election result');
  assert.ok(['leader', 'follower'].includes(res.election.role));
});

test('Cluster API Routes: handles order lock acquisition and release', async () => {
  const lockKey = `order:test:api:${Date.now()}`;

  // 1. Acquire lock
  const lockRes = await clusterRoutes.handle({
    action: 'lock',
    idempotency_key: lockKey,
    lock_ttl_ms: 10000,
  });
  assert.strictEqual(lockRes.ok, true);
  assert.strictEqual(lockRes.acquired, true);

  // 2. Release lock
  const unlockRes = await clusterRoutes.handle({
    action: 'unlock',
    idempotency_key: lockKey,
  });
  assert.strictEqual(unlockRes.ok, true);
  assert.strictEqual(unlockRes.released, true);
});

test('Cluster API Routes: rejects mutating action when invoked via HTTP GET', async () => {
  const res = await clusterRoutes.handle(
    { action: 'elect' },
    { req: { method: 'GET' } },
  );
  assert.strictEqual(res.ok, false);
  assert.ok(String(res.error).includes('requires POST'), 'Must require POST');
  assert.strictEqual(clusterRoutes.status(res), 405, 'Status code must be 405 Method Not Allowed');
});

test('Cluster API Routes: accepts mutating action when invoked via HTTP POST', async () => {
  const res = await clusterRoutes.handle(
    { action: 'elect' },
    { req: { method: 'POST' } },
  );
  assert.strictEqual(res.ok, true);
  assert.strictEqual(clusterRoutes.status(res), 200);
});

