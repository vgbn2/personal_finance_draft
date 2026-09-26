'use strict';

/**
 * HIGH-AVAILABILITY CLUSTER API ROUTES
 *
 * Exposes cluster discovery, heartbeat updates, leader status,
 * election triggers, and distributed order lock endpoints.
 */

const {
  getDefaultClusterCoordinator,
} = require('../../../../../shared/lib/runtime/cluster_coordinator.js');

module.exports = {
  path: '/api/cluster/status',
  status: (payload) => {
    if (payload && payload.ok !== false) return 200;
    if (payload && payload.error && String(payload.error).startsWith('method_not_allowed')) return 405;
    return 500;
  },
  handle: async (query = {}, ctx = {}) => {
    const coordinator = getDefaultClusterCoordinator();
    const action = String(query.action || query.command || 'status').toLowerCase();

    if (action === 'status' || action === 'nodes') {
      const nodes = coordinator.getClusterNodes();
      const leader = coordinator.getLeader();
      return {
        ok: true,
        node_id: coordinator.nodeId,
        priority: coordinator.priority,
        role: coordinator.role,
        is_leader: coordinator.isLeader(),
        leader,
        nodes,
      };
    }

    const isMutationAction = [
      'heartbeat',
      'elect',
      'election',
      'lock',
      'acquire_lock',
      'unlock',
      'release_lock',
      'step_down',
    ].includes(action);

    if (isMutationAction && ctx.req && ctx.req.method && ctx.req.method.toUpperCase() !== 'POST') {
      return {
        ok: false,
        error: `method_not_allowed: mutating cluster action '${action}' requires POST`,
      };
    }

    if (action === 'heartbeat') {
      const metadata = query.metadata && typeof query.metadata === 'object' ? query.metadata : {};
      const hb = coordinator.registerHeartbeat(metadata);
      return {
        ok: true,
        heartbeat: hb,
      };
    }

    if (action === 'elect' || action === 'election') {
      const res = coordinator.evaluateElection({ force: true });
      return {
        ok: true,
        election: res,
      };
    }

    if (action === 'lock' || action === 'acquire_lock') {
      const key = query.idempotency_key || query.key;
      const ttl = Number.parseInt(query.lock_ttl_ms || query.ttl_ms || '60000', 10);
      const res = coordinator.acquireOrderLock(key, ttl);
      return res;
    }

    if (action === 'unlock' || action === 'release_lock') {
      const key = query.idempotency_key || query.key;
      const res = coordinator.releaseOrderLock(key);
      return res;
    }

    if (action === 'step_down') {
      const res = coordinator.stepDown();
      return res;
    }

    return {
      ok: false,
      error: `unrecognized_cluster_action: ${action}`,
    };
  },
};
