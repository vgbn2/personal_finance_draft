'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { STORAGE_DATA_DIR } = require('./paths');

const CLUSTER_DIR = path.join(STORAGE_DATA_DIR, 'cache', 'cluster');
const DEFAULT_LEASE_TTL_MS = 15000;
const DEFAULT_HEARTBEAT_TTL_MS = 15000;

function safeId(str, fallback = 'node-1') {
  const clean = String(str || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  return clean || fallback;
}

function writeAtomicSync(filePath, data, fsImpl = fs) {
  const dir = path.dirname(filePath);
  fsImpl.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    fsImpl.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fsImpl.renameSync(tmp, filePath);
  } catch (err) {
    try { fsImpl.unlinkSync(tmp); } catch (_) {}
    throw err;
  }
}

function readJsonSync(filePath, fsImpl = fs) {
  try {
    const raw = fsImpl.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

class ClusterCoordinator {
  constructor(options = {}) {
    this.directory = path.resolve(options.directory || CLUSTER_DIR);
    this.nodeId = safeId(options.nodeId || process.env.SOVEREIGN_NODE_ID || `${os.hostname()}-${process.pid}`);
    this.priority = Number.isFinite(options.priority)
      ? options.priority
      : Number.parseInt(process.env.SOVEREIGN_NODE_PRIORITY || '100', 10);
    this.leaseTtlMs = options.leaseTtlMs || DEFAULT_LEASE_TTL_MS;
    this.heartbeatTtlMs = options.heartbeatTtlMs || DEFAULT_HEARTBEAT_TTL_MS;
    this.fsImpl = options.fsImpl || fs;

    this.allowAutoElect = options.allowAutoElect ?? (process.env.SOVEREIGN_CLUSTER_AUTO_ELECT === 'true');

    this.nodesDir = path.join(this.directory, 'nodes');
    this.locksDir = path.join(this.directory, 'order_locks');
    this.leasePath = path.join(this.directory, 'leader_lease.json');

    this.role = 'follower';
    this.fencingToken = 0;
    this.peers = this._parsePeers(options.peers || process.env.SOVEREIGN_CLUSTER_PEERS);
  }

  _parsePeers(input) {
    if (!input) return [];
    if (Array.isArray(input)) return input.map((p) => String(p).trim()).filter(Boolean);
    return String(input).split(',').map((p) => p.trim()).filter(Boolean);
  }

  async fetchRemotePeerStatus(peerUrl, timeoutMs = 2000) {
    const cleanUrl = String(peerUrl).replace(/\/+$/, '');
    const target = `${cleanUrl}/api/cluster/status?action=status`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const start = Date.now();
    try {
      const res = await fetch(target, { signal: controller.signal });
      clearTimeout(timer);
      const latencyMs = Date.now() - start;
      if (!res.ok) return { peer: cleanUrl, ok: false, error: `HTTP ${res.status}`, latency_ms: latencyMs };
      const data = await res.json();
      return { peer: cleanUrl, ok: true, data, latency_ms: latencyMs };
    } catch (err) {
      clearTimeout(timer);
      return {
        peer: cleanUrl,
        ok: false,
        error: err.name === 'AbortError' ? 'timeout' : err.message,
        latency_ms: Date.now() - start,
      };
    }
  }

  async pollRemotePeers(timeoutMs = 2000) {
    if (!this.peers.length) return [];
    return Promise.all(this.peers.map((peer) => this.fetchRemotePeerStatus(peer, timeoutMs)));
  }

  getHeartbeatPath(nodeId = this.nodeId) {
    return path.join(this.nodesDir, `${safeId(nodeId)}.json`);
  }

  getOrderLockPath(key) {
    const hash = crypto.createHash('sha256').update(String(key)).digest('hex').slice(0, 32);
    return path.join(this.locksDir, `${hash}.json`);
  }

  registerHeartbeat(metadata = {}) {
    const now = Date.now();
    const payload = {
      node_id: this.nodeId,
      priority: this.priority,
      role: this.role,
      fencing_token: this.fencingToken,
      hostname: os.hostname(),
      pid: process.pid,
      heartbeat_at: new Date(now).toISOString(),
      heartbeat_ms: now,
      metadata: { ...metadata },
    };

    writeAtomicSync(this.getHeartbeatPath(), payload, this.fsImpl);
    return payload;
  }

  getClusterNodes() {
    const now = Date.now();
    const nodes = [];

    try {
      if (!this.fsImpl.existsSync(this.nodesDir)) {
        return nodes;
      }
      const files = this.fsImpl.readdirSync(this.nodesDir);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const filePath = path.join(this.nodesDir, file);
        const data = readJsonSync(filePath, this.fsImpl);
        if (!data || !data.node_id) continue;

        const ageMs = now - (data.heartbeat_ms || Date.parse(data.heartbeat_at) || 0);
        const isAlive = ageMs <= this.heartbeatTtlMs;

        nodes.push({
          ...data,
          age_ms: ageMs,
          status: isAlive ? 'healthy' : 'unresponsive',
        });
      }
    } catch (_) {}

    return nodes.sort((a, b) => (b.priority - a.priority) || a.node_id.localeCompare(b.node_id));
  }

  getLeader() {
    const lease = readJsonSync(this.leasePath, this.fsImpl);
    if (!lease || !lease.leader_id) return null;

    const now = Date.now();
    const expiresMs = lease.expires_ms || Date.parse(lease.expires_at) || 0;
    if (now >= expiresMs) {
      return null;
    }

    if (lease.leader_id === this.nodeId && Number.isFinite(lease.fencing_token)) {
      this.fencingToken = lease.fencing_token;
    }

    return lease;
  }

  isLeader() {
    const leader = this.getLeader();
    return !!(leader && leader.leader_id === this.nodeId);
  }

  evaluateElection(options = {}) {
    const now = Date.now();
    const leader = this.getLeader();

    if (leader && leader.leader_id === this.nodeId) {
      this.role = 'leader';
      const token = (Number.isFinite(leader.fencing_token) && leader.fencing_token > 0)
        ? leader.fencing_token
        : Math.max(1, this.fencingToken);
      this.fencingToken = token;

      const renewedLease = {
        leader_id: this.nodeId,
        priority: this.priority,
        fencing_token: token,
        acquired_at: leader.acquired_at || new Date(now).toISOString(),
        renewed_at: new Date(now).toISOString(),
        expires_at: new Date(now + this.leaseTtlMs).toISOString(),
        expires_ms: now + this.leaseTtlMs,
      };
      writeAtomicSync(this.leasePath, renewedLease, this.fsImpl);
      this.registerHeartbeat();
      return { ok: true, role: 'leader', leader_id: this.nodeId, fencing_token: token, elected: false, renewed: true };
    }

    if (leader && leader.leader_id !== this.nodeId) {
      this.role = 'follower';
      this.fencingToken = Number.isFinite(leader.fencing_token) ? leader.fencing_token : 0;
      this.registerHeartbeat();
      return { ok: true, role: 'follower', leader_id: leader.leader_id, fencing_token: this.fencingToken, elected: false, renewed: false };
    }

    const isForced = options.force === true;
    if (!this.allowAutoElect && !isForced) {
      this.role = 'follower';
      this.registerHeartbeat();
      return {
        ok: false,
        role: 'follower',
        reason: 'auto-elect disabled; use: sovereign cluster elect',
        leader_id: null,
        fencing_token: 0,
        elected: false,
        renewed: false,
      };
    }

    const expiredLease = readJsonSync(this.leasePath, this.fsImpl);
    const expiredLeaderId = (expiredLease && expiredLease.leader_id) ? expiredLease.leader_id : null;
    const lastToken = (expiredLease && Number.isFinite(expiredLease.fencing_token)) ? expiredLease.fencing_token : 0;
    const newFencingToken = lastToken + 1;

    const aliveNodes = this.getClusterNodes().filter((n) => {
      if (n.status !== 'healthy') return false;
      if (expiredLeaderId && n.node_id === expiredLeaderId && n.node_id !== this.nodeId) {
        return false;
      }
      return true;
    });

    const highestPriorityNode = aliveNodes[0] || { node_id: this.nodeId, priority: this.priority };

    if (highestPriorityNode.node_id === this.nodeId || this.priority >= (highestPriorityNode.priority || 0)) {
      this.role = 'leader';
      this.fencingToken = newFencingToken;
      const newLease = {
        leader_id: this.nodeId,
        priority: this.priority,
        fencing_token: newFencingToken,
        acquired_at: new Date(now).toISOString(),
        renewed_at: new Date(now).toISOString(),
        expires_at: new Date(now + this.leaseTtlMs).toISOString(),
        expires_ms: now + this.leaseTtlMs,
      };
      writeAtomicSync(this.leasePath, newLease, this.fsImpl);
      this.registerHeartbeat();
      return { ok: true, role: 'leader', leader_id: this.nodeId, fencing_token: newFencingToken, elected: true, renewed: false };
    }

    this.role = 'follower';
    this.registerHeartbeat();
    return { ok: true, role: 'follower', leader_id: highestPriorityNode.node_id, fencing_token: 0, elected: false, renewed: false };
  }

  stepDown() {
    this.role = 'follower';
    this.fencingToken = 0;
    const leader = this.getLeader();
    if (leader && leader.leader_id === this.nodeId) {
      try {
        this.fsImpl.unlinkSync(this.leasePath);
      } catch (_) {}
    }
    this.registerHeartbeat();
    return { ok: true, role: 'follower' };
  }

  acquireOrderLock(idempotencyKey, lockTtlMs = 60000, options = {}) {
    if (!idempotencyKey) {
      return { ok: false, error: 'idempotency_key_required' };
    }

    const callerToken = Number.isFinite(options.fencing_token)
      ? options.fencing_token
      : this.fencingToken;

    const leader = this.getLeader();
    if (leader && Number.isFinite(leader.fencing_token) && callerToken > 0 && callerToken < leader.fencing_token) {
      return {
        ok: false,
        acquired: false,
        reason: 'stale_fencing_token',
        fencing_token: callerToken,
        leader_fencing_token: leader.fencing_token,
      };
    }

    const lockPath = this.getOrderLockPath(idempotencyKey);
    const now = Date.now();
    const existing = readJsonSync(lockPath, this.fsImpl);

    if (existing) {
      const expiresMs = existing.expires_ms || Date.parse(existing.expires_at) || 0;
      if (now < expiresMs && existing.owner_node !== this.nodeId) {
        return {
          ok: false,
          acquired: false,
          reason: 'lock_held_by_peer',
          owner_node: existing.owner_node,
          expires_at: existing.expires_at,
          fencing_token: existing.fencing_token,
        };
      }
    }

    const lockData = {
      idempotency_key: String(idempotencyKey),
      owner_node: this.nodeId,
      fencing_token: callerToken,
      acquired_at: new Date(now).toISOString(),
      expires_at: new Date(now + lockTtlMs).toISOString(),
      expires_ms: now + lockTtlMs,
    };

    writeAtomicSync(lockPath, lockData, this.fsImpl);
    return {
      ok: true,
      acquired: true,
      owner_node: this.nodeId,
      fencing_token: callerToken,
      expires_at: lockData.expires_at,
    };
  }

  releaseOrderLock(idempotencyKey) {
    const lockPath = this.getOrderLockPath(idempotencyKey);
    const existing = readJsonSync(lockPath, this.fsImpl);
    if (existing && existing.owner_node === this.nodeId) {
      try {
        this.fsImpl.unlinkSync(lockPath);
      } catch (_) {}
      return { ok: true, released: true };
    }
    return { ok: true, released: false };
  }
}

let _defaultCoordinator = null;

function getDefaultClusterCoordinator(options) {
  if (!_defaultCoordinator || options) {
    _defaultCoordinator = new ClusterCoordinator(options);
  }
  return _defaultCoordinator;
}

module.exports = {
  ClusterCoordinator,
  getDefaultClusterCoordinator,
  DEFAULT_LEASE_TTL_MS,
  DEFAULT_HEARTBEAT_TTL_MS,
};
