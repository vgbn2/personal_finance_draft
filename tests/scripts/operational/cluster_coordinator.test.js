'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  ClusterCoordinator,
} = require('../../../shared/lib/runtime/cluster_coordinator.js');

function makeTempDir(prefix = 'sovereign-cluster-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('ClusterCoordinator: Node registers heartbeat and appears in cluster list', () => {
  const tempDir = makeTempDir();
  try {
    const node1 = new ClusterCoordinator({
      directory: tempDir,
      nodeId: 'node-alpha',
      priority: 100,
    });

    const hb = node1.registerHeartbeat({ version: '1.0.0' });
    assert.strictEqual(hb.node_id, 'node-alpha');
    assert.strictEqual(hb.priority, 100);
    assert.strictEqual(hb.role, 'follower');

    const nodes = node1.getClusterNodes();
    assert.strictEqual(nodes.length, 1);
    assert.strictEqual(nodes[0].node_id, 'node-alpha');
    assert.strictEqual(nodes[0].status, 'healthy');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('ClusterCoordinator: Leader election elects highest priority node', () => {
  const tempDir = makeTempDir();
  try {
    const node1 = new ClusterCoordinator({
      directory: tempDir,
      nodeId: 'node-primary',
      priority: 100,
      allowAutoElect: true,
    });

    const node2 = new ClusterCoordinator({
      directory: tempDir,
      nodeId: 'node-standby',
      priority: 50,
      allowAutoElect: true,
    });

    node1.registerHeartbeat();
    node2.registerHeartbeat();

    // Node 2 evaluates election first, but sees node1 has higher priority
    const res2 = node2.evaluateElection();
    assert.strictEqual(res2.role, 'follower');

    // Node 1 evaluates election and claims leadership
    const res1 = node1.evaluateElection();
    assert.strictEqual(res1.role, 'leader');
    assert.strictEqual(res1.elected, true);
    assert.strictEqual(node1.isLeader(), true);
    assert.strictEqual(node2.isLeader(), false);

    // Node 2 now confirms node1 is leader
    const leaderInfo = node2.getLeader();
    assert.strictEqual(leaderInfo.leader_id, 'node-primary');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('ClusterCoordinator: Automatic failover upon leader lease expiration', () => {
  const tempDir = makeTempDir();
  try {
    const node1 = new ClusterCoordinator({
      directory: tempDir,
      nodeId: 'node-primary',
      priority: 100,
      leaseTtlMs: 50, // Short lease for fast deterministic testing
      allowAutoElect: true,
    });

    const node2 = new ClusterCoordinator({
      directory: tempDir,
      nodeId: 'node-standby',
      priority: 50,
      leaseTtlMs: 500,
      allowAutoElect: true,
    });

    node1.registerHeartbeat();
    node2.registerHeartbeat();

    const elect1 = node1.evaluateElection();
    assert.strictEqual(elect1.role, 'leader');
    assert.strictEqual(node1.isLeader(), true);

    // Node 1 crashes (stops heartbeating/renewing)
    // Wait for lease to expire (>50ms)
    const start = Date.now();
    while (Date.now() - start < 70) {
      // Busy wait <100ms
    }

    assert.strictEqual(node2.getLeader(), null, 'Leader lease must be expired');

    // Node 2 re-evaluates and steps up as new leader
    const elect2 = node2.evaluateElection();
    assert.strictEqual(elect2.role, 'leader');
    assert.strictEqual(elect2.elected, true);
    assert.strictEqual(node2.isLeader(), true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('ClusterCoordinator: Step down surrenders leadership cleanly', () => {
  const tempDir = makeTempDir();
  try {
    const node1 = new ClusterCoordinator({
      directory: tempDir,
      nodeId: 'node-1',
      priority: 100,
      allowAutoElect: true,
    });

    node1.evaluateElection();
    assert.strictEqual(node1.isLeader(), true);

    const stepDownRes = node1.stepDown();
    assert.strictEqual(stepDownRes.ok, true);
    assert.strictEqual(node1.isLeader(), false);
    assert.strictEqual(node1.getLeader(), null);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('ClusterCoordinator: Distributed order locks enforce idempotency across nodes', () => {
  const tempDir = makeTempDir();
  try {
    const node1 = new ClusterCoordinator({ directory: tempDir, nodeId: 'node-1' });
    const node2 = new ClusterCoordinator({ directory: tempDir, nodeId: 'node-2' });

    const orderKey = 'order:BTCUSDT:buy:1.0:2026-09-24T12:00';

    // Node 1 acquires lock
    const lock1 = node1.acquireOrderLock(orderKey, 10000);
    assert.strictEqual(lock1.ok, true);
    assert.strictEqual(lock1.acquired, true);
    assert.strictEqual(lock1.owner_node, 'node-1');

    // Node 2 attempts same order lock -> Rejected
    const lock2 = node2.acquireOrderLock(orderKey, 10000);
    assert.strictEqual(lock2.ok, false);
    assert.strictEqual(lock2.acquired, false);
    assert.strictEqual(lock2.reason, 'lock_held_by_peer');
    assert.strictEqual(lock2.owner_node, 'node-1');

    // Node 1 releases lock
    const releaseRes = node1.releaseOrderLock(orderKey);
    assert.strictEqual(releaseRes.ok, true);
    assert.strictEqual(releaseRes.released, true);

    // Node 2 can now acquire lock
    const lock2Retry = node2.acquireOrderLock(orderKey, 10000);
    assert.strictEqual(lock2Retry.ok, true);
    assert.strictEqual(lock2Retry.acquired, true);
    assert.strictEqual(lock2Retry.owner_node, 'node-2');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('ClusterCoordinator: Remote peer parsing and polling', async () => {
  const coord = new ClusterCoordinator({
    peers: 'http://127.0.0.1:8787, http://192.168.1.50:8787',
  });

  assert.deepStrictEqual(coord.peers, ['http://127.0.0.1:8787', 'http://192.168.1.50:8787']);

  // Polling unreachable peers returns structured error with latency instead of crashing
  const pollResults = await coord.pollRemotePeers(50);
  assert.strictEqual(pollResults.length, 2);
  assert.strictEqual(pollResults[0].peer, 'http://127.0.0.1:8787');
  assert.strictEqual(typeof pollResults[0].latency_ms, 'number');
});

test('commandCluster: CLI status and doctor execution', async () => {
  const { commandCluster } = require('../../../backend/cli/commands/operational/cluster.js');

  const statusExit = await commandCluster(['status', '--json']);
  assert.strictEqual(statusExit, 0);

  const electExit = await commandCluster(['elect', '--json']);
  assert.strictEqual(electExit, 0);

  const docExit = await commandCluster(['doctor', '--json']);
  assert.ok(docExit === 0 || docExit === 1);
});

test('ClusterCoordinator: auto-elect disabled by default prevents unilateral self-promotion', () => {
  const tempDir = makeTempDir();
  try {
    const node = new ClusterCoordinator({
      directory: tempDir,
      nodeId: 'node-safe',
      priority: 100,
    });

    node.registerHeartbeat();
    const res = node.evaluateElection();
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.role, 'follower');
    assert.ok(String(res.reason).includes('auto-elect disabled'));
    assert.strictEqual(node.isLeader(), false);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('ClusterCoordinator: explicit election with force=true claims leadership even when auto-elect is disabled', () => {
  const tempDir = makeTempDir();
  try {
    const node = new ClusterCoordinator({
      directory: tempDir,
      nodeId: 'node-forced',
      priority: 100,
      // allowAutoElect: false (default)
    });

    node.registerHeartbeat();
    const res = node.evaluateElection({ force: true });
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.role, 'leader');
    assert.strictEqual(res.elected, true);
    assert.strictEqual(node.isLeader(), true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('ClusterCoordinator: Monotonic fencing tokens increment on election and protect order locks', () => {
  const tempDir = makeTempDir();
  try {
    const node1 = new ClusterCoordinator({
      directory: tempDir,
      nodeId: 'node-1',
      priority: 100,
      leaseTtlMs: 50,
      allowAutoElect: true,
    });

    const node2 = new ClusterCoordinator({
      directory: tempDir,
      nodeId: 'node-2',
      priority: 50,
      leaseTtlMs: 500,
      allowAutoElect: true,
    });

    node1.registerHeartbeat();
    node2.registerHeartbeat();

    // 1. Initial election of node1 generates fencing_token = 1
    const elect1 = node1.evaluateElection();
    assert.strictEqual(elect1.role, 'leader');
    assert.strictEqual(elect1.fencing_token, 1);
    assert.strictEqual(node1.fencingToken, 1);

    // 2. Renewal keeps fencing_token = 1
    const renew1 = node1.evaluateElection();
    assert.strictEqual(renew1.renewed, true);
    assert.strictEqual(renew1.fencing_token, 1);

    // 3. Acquire order lock with active fencing token
    const lock1 = node1.acquireOrderLock('order:fencing:test', 10000);
    assert.strictEqual(lock1.ok, true);
    assert.strictEqual(lock1.fencing_token, 1);

    // 4. Node 1 lease expires -> Node 2 takes over
    const start = Date.now();
    while (Date.now() - start < 70) {}

    const elect2 = node2.evaluateElection();
    assert.strictEqual(elect2.role, 'leader');
    assert.strictEqual(elect2.fencing_token, 2, 'Next leader must receive monotonic fencing_token increment');
    assert.strictEqual(node2.fencingToken, 2);

    // 5. Stale leader node1 tries to acquire a new order lock with stale token 1 -> Rejected
    const staleLock = node1.acquireOrderLock('order:fencing:stale', 10000, { fencing_token: 1 });
    assert.strictEqual(staleLock.ok, false);
    assert.strictEqual(staleLock.reason, 'stale_fencing_token');
    assert.strictEqual(staleLock.leader_fencing_token, 2);

    // 6. Active leader node2 acquires order lock with token 2 -> Accepted
    const validLock = node2.acquireOrderLock('order:fencing:stale', 10000);
    assert.strictEqual(validLock.ok, true);
    assert.strictEqual(validLock.fencing_token, 2);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

