#!/usr/bin/env node
'use strict';

const { getDefaultClusterCoordinator } = require('../../../shared/lib/runtime/cluster_coordinator');

// Process wrapper: invokes cluster coordinator heartbeat cycle with POSIX signal handlers and optional single-shot verification mode
function runClusterHeartbeat(args = process.argv.slice(2), coordinator = getDefaultClusterCoordinator()) {
  const once = args.includes('--once');
  const intervalMs = Number(process.env.CLUSTER_HEARTBEAT_INTERVAL_MS || 5000);

  function tick() {
    const hb = coordinator.registerHeartbeat({
      pid: process.pid,
      uptime: process.uptime(),
      timestamp: Date.now(),
    });
    let leader = null;
    if (coordinator.allowAutoElect) {
      leader = coordinator.evaluateElection();
    } else {
      leader = coordinator.getLeader();
    }
    return { hb, leader, isLeader: coordinator.isLeader() };
  }

  const initial = tick();
  if (once) {
    return initial;
  }

  const timer = setInterval(() => {
    try {
      tick();
    } catch (err) {
      process.stderr.write(`[WARN] Heartbeat tick failed: ${err.message}\n`);
    }
  }, intervalMs);

  function shutdown() {
    clearInterval(timer);
    try {
      if (coordinator.isLeader()) {
        coordinator.stepDown();
      }
    } catch (err) {
      process.stderr.write(`[WARN] Cluster step down failed on shutdown: ${err.message}\n`);
    }
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return timer;
}

if (require.main === module) {
  const result = runClusterHeartbeat();
  if (process.argv.includes('--once')) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  }
}

module.exports = { runClusterHeartbeat };
