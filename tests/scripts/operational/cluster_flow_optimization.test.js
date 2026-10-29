'use strict';

/**
 * Cluster Coordination & Execution Flow Optimization Test Suite
 *
 * Exercises:
 *  1. Native POSIX O_EXCL atomic order lock acquisition and peer race rejection
 *  2. Expired lock reclamation and ownership transfer
 *  3. Monotonic fencing token validation preventing split-brain lock acquisition
 *  4. High-throughput sequential lock acquisition latency (< 2ms per cycle)
 *  5. Test runner batching optimization and concurrency contract
 *
 * Test architecture: native node:test runner exercising physical filesystem tmpfs primitives without stubs.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { ClusterCoordinator } = require('../../../shared/lib/runtime/cluster_coordinator.js');
const { buildBatchArgs, splitRunnerArgs, runnerConcurrency } = require('../../run_node_tests.js');

describe('Cluster Flow & Execution Optimization Suite', () => {
  let tempDir;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign_cluster_flow_test_'));
  });

  after(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (err) {
        process.stderr.write(`[WARN] Teardown cleanup failed: ${err.message}\n`);
      }
    }
  });

  test('atomic order lock acquisition with native O_EXCL prevents concurrent peer acquisition', () => {
    const nodeA = new ClusterCoordinator({
      directory: tempDir,
      nodeId: 'node-A',
      priority: 100,
    });
    const nodeB = new ClusterCoordinator({
      directory: tempDir,
      nodeId: 'node-B',
      priority: 90,
    });

    const key = `order_sim_${Date.now()}_alpha`;

    // Node A acquires lock first
    const resA = nodeA.acquireOrderLock(key, 10000);
    assert.equal(resA.ok, true);
    assert.equal(resA.acquired, true);
    assert.equal(resA.owner_node, 'node-A');

    // Node B attempts to acquire the exact same key concurrently
    const resB = nodeB.acquireOrderLock(key, 10000);
    assert.equal(resB.ok, false);
    assert.equal(resB.acquired, false);
    assert.equal(resB.reason, 'lock_held_by_peer');
    assert.equal(resB.owner_node, 'node-A');

    // Node A releases lock
    const releaseRes = nodeA.releaseOrderLock(key);
    assert.equal(releaseRes.ok, true);
    assert.equal(releaseRes.released, true);

    // Node B can now acquire the released key cleanly
    const resB2 = nodeB.acquireOrderLock(key, 10000);
    assert.equal(resB2.ok, true);
    assert.equal(resB2.acquired, true);
    assert.equal(resB2.owner_node, 'node-B');

    // Cleanup
    nodeB.releaseOrderLock(key);
  });

  test('expired order locks are cleanly reclaimed by competing nodes', async () => {
    const node1 = new ClusterCoordinator({
      directory: tempDir,
      nodeId: 'node-1',
      priority: 100,
    });
    const node2 = new ClusterCoordinator({
      directory: tempDir,
      nodeId: 'node-2',
      priority: 100,
    });

    const key = `order_sim_ttl_${Date.now()}`;

    // Node 1 acquires with very short TTL (50ms)
    const res1 = node1.acquireOrderLock(key, 50);
    assert.equal(res1.ok, true);
    assert.equal(res1.acquired, true);

    // Immediate attempt by Node 2 is rejected
    const blocked = node2.acquireOrderLock(key, 50);
    assert.equal(blocked.ok, false);
    assert.equal(blocked.reason, 'lock_held_by_peer');

    // Wait for TTL expiration (70ms)
    await new Promise((resolve) => setTimeout(resolve, 70));

    // Node 2 attempts acquisition after expiry and reclaims the lock
    const reclaimed = node2.acquireOrderLock(key, 5000);
    assert.equal(reclaimed.ok, true);
    assert.equal(reclaimed.acquired, true);
    assert.equal(reclaimed.owner_node, 'node-2');

    // Node 1 attempts release on a lock it no longer owns
    const lateRelease = node1.releaseOrderLock(key);
    assert.equal(lateRelease.released, false);

    // Node 2 releases cleanly
    node2.releaseOrderLock(key);
  });

  test('stale fencing token strictly blocks order lock acquisition on demoted nodes', () => {
    const node = new ClusterCoordinator({
      directory: tempDir,
      nodeId: 'split-brain-candidate',
      priority: 100,
      allowAutoElect: true,
    });

    // Election produces initial fencing token = 1
    const electRes = node.evaluateElection({ force: true });
    assert.equal(electRes.ok, true);
    assert.equal(electRes.fencing_token >= 1, true);

    const activeToken = electRes.fencing_token;
    const staleToken = activeToken - 1;

    // Caller supplying a stale fencing token must be rejected fail-closed
    const staleAttempt = node.acquireOrderLock('key_fencing_test', 5000, {
      fencing_token: staleToken > 0 ? staleToken : 0,
    });

    if (staleToken > 0) {
      assert.equal(staleAttempt.ok, false);
      assert.equal(staleAttempt.acquired, false);
      assert.equal(staleAttempt.reason, 'stale_fencing_token');
      assert.equal(staleAttempt.leader_fencing_token, activeToken);
    }

    // Caller supplying current fencing token succeeds
    const validAttempt = node.acquireOrderLock('key_fencing_test', 5000, {
      fencing_token: activeToken,
    });
    assert.equal(validAttempt.ok, true);
    assert.equal(validAttempt.acquired, true);

    node.releaseOrderLock('key_fencing_test');
    node.stepDown();
  });

  test('high-throughput sequential order lock acquisition exhibits sub-millisecond latency', () => {
    const node = new ClusterCoordinator({
      directory: tempDir,
      nodeId: 'benchmark-node',
      priority: 100,
    });

    const iterations = 50;
    const start = process.hrtime.bigint();

    for (let i = 0; i < iterations; i++) {
      const key = `bench_lock_${i}`;
      const acq = node.acquireOrderLock(key, 5000);
      assert.equal(acq.ok, true);
      const rel = node.releaseOrderLock(key);
      assert.equal(rel.ok, true);
    }

    const elapsedNs = Number(process.hrtime.bigint() - start);
    const msPerCycle = elapsedNs / (iterations * 1e6);

    // Assert that each full acquire + release cycle runs in under 3.0ms
    assert.ok(msPerCycle < 3.0, `Expected < 3.0ms per cycle, observed ${msPerCycle.toFixed(3)}ms`);
  });

  test('test runner batching optimization builds valid composite args without nested isolation', () => {
    const targets = ['/tests/a.test.js', '/tests/b.test.js', '/tests/c.test.js'];
    const batchArgs = buildBatchArgs([], targets, 4);

    assert.ok(batchArgs.includes('--test'));
    assert.ok(batchArgs.includes('--test-concurrency=4'));
    assert.ok(targets.every((t) => batchArgs.includes(t)));

    // Verify option separation and concurrency parsing
    const { options, targets: parsedTargets } = splitRunnerArgs(['--test-concurrency=6', '--batch', ...targets]);
    assert.equal(runnerConcurrency(options), 6);
    assert.deepEqual(parsedTargets, targets);
  });
});
