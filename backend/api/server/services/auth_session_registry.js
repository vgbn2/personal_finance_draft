'use strict';

const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { REPO_ROOT } = require('../../../../shared/lib/runtime/paths');

const VALID_IP_CHANGE_POLICIES = Object.freeze(['audit', 'reauth']);
const DEFAULT_MAX_ENTRIES = 1000;
const DEFAULT_TTL_DAYS = 30;
const WRITE_INTERVAL_MS = 5 * 60 * 1000;

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return fallback;
}

function normalizeIp(value) {
  let normalized = String(value || '').trim();
  if (!normalized) return null;
  if (normalized.startsWith('::ffff:')) normalized = normalized.slice(7);
  const scopeIndex = normalized.indexOf('%');
  if (scopeIndex >= 0) normalized = normalized.slice(0, scopeIndex);
  return net.isIP(normalized) ? normalized.toLowerCase() : null;
}

function isLoopbackIp(value) {
  const ip = normalizeIp(value);
  return Boolean(ip && (
    ip === '::1'
    || ip.startsWith('127.')
  ));
}

function requestNetworkContext(req, {
  trustProxy = parseBoolean(process.env.SOVEREIGN_TRUST_PROXY, false),
} = {}) {
  const socketIp = normalizeIp(req && req.socket ? req.socket.remoteAddress : null);
  let sourceIp = socketIp;
  let source = 'socket';
  if (trustProxy && req && req.headers && typeof req.headers['x-forwarded-for'] === 'string') {
    const forwarded = normalizeIp(req.headers['x-forwarded-for'].split(',')[0]);
    if (forwarded) {
      sourceIp = forwarded;
      source = 'trusted_proxy';
    }
  }
  return {
    source_ip: sourceIp,
    socket_ip: socketIp,
    source,
    trust_proxy: trustProxy,
    tunnel_opaque: isLoopbackIp(sourceIp),
  };
}

function evaluateIpRisk(previousIp, currentIp, { tunnelOpaque = false } = {}) {
  const previous = normalizeIp(previousIp);
  const current = normalizeIp(currentIp);
  if (!current) return { level: 'unknown', reason: 'source_ip_unavailable', changed: false };
  if (!previous) return { level: 'none', reason: 'first_seen', changed: false };
  if (previous === current) return { level: 'none', reason: 'unchanged', changed: false };
  if (tunnelOpaque || isLoopbackIp(previous) || isLoopbackIp(current)) {
    return { level: 'info', reason: 'tunnel_endpoint_changed', changed: true };
  }
  return { level: 'elevated', reason: 'source_ip_changed', changed: true };
}

function finiteInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback;
}

class AuthSessionRegistry {
  constructor({
    enabled = parseBoolean(process.env.SOVEREIGN_AUTH_SESSION_TRACKING, false),
    registryPath = process.env.SOVEREIGN_AUTH_SESSION_REGISTRY
      || path.join(REPO_ROOT, 'storage', 'runtime', 'auth_sessions.json'),
    policy = process.env.SOVEREIGN_IP_CHANGE_POLICY || 'audit',
    maxEntries = process.env.SOVEREIGN_AUTH_SESSION_MAX_ENTRIES,
    ttlDays = process.env.SOVEREIGN_AUTH_SESSION_TTL_DAYS,
    now = () => Date.now(),
  } = {}) {
    this.enabled = enabled === true;
    this.registryPath = path.resolve(registryPath);
    this.policy = VALID_IP_CHANGE_POLICIES.includes(String(policy).trim().toLowerCase())
      ? String(policy).trim().toLowerCase()
      : 'audit';
    this.maxEntries = finiteInteger(maxEntries, DEFAULT_MAX_ENTRIES, 10, 10000);
    this.ttlMs = finiteInteger(ttlDays, DEFAULT_TTL_DAYS, 1, 365) * 24 * 60 * 60 * 1000;
    this.now = now;
    this.loaded = false;
    this.sessions = {};
    this.loadError = null;
  }

  load() {
    if (this.loaded || !this.enabled) return;
    this.loaded = true;
    if (!fs.existsSync(this.registryPath)) return;
    try {
      const parsed = JSON.parse(fs.readFileSync(this.registryPath, 'utf8'));
      if (!parsed || parsed.schema_version !== 1 || typeof parsed.sessions !== 'object') {
        throw new Error('unsupported_auth_session_registry');
      }
      this.sessions = parsed.sessions;
    } catch (error) {
      this.loadError = error.message;
      this.sessions = {};
    }
  }

  prune(nowMs) {
    const entries = Object.entries(this.sessions)
      .filter(([, entry]) => (
        entry
        && Number.isFinite(Date.parse(entry.last_seen_at))
        && nowMs - Date.parse(entry.last_seen_at) <= this.ttlMs
      ))
      .sort((left, right) => Date.parse(right[1].last_seen_at) - Date.parse(left[1].last_seen_at))
      .slice(0, this.maxEntries);
    this.sessions = Object.fromEntries(entries);
  }

  persist(nowMs) {
    this.prune(nowMs);
    fs.mkdirSync(path.dirname(this.registryPath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.registryPath}.tmp.${process.pid}`;
    const payload = {
      schema_version: 1,
      updated_at: new Date(nowMs).toISOString(),
      sessions: this.sessions,
    };
    try {
      fs.writeFileSync(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, {
        mode: 0o600,
        flag: 'wx',
      });
      fs.chmodSync(temporaryPath, 0o600);
      fs.renameSync(temporaryPath, this.registryPath);
    } finally {
      fs.rmSync(temporaryPath, { force: true });
    }
  }

  record(principal, network) {
    if (!this.enabled || !principal || !principal.authenticated || !principal.session_id) {
      return {
        tracked: false,
        allowed: true,
        action: 'none',
        risk: { level: 'none', reason: 'tracking_disabled', changed: false },
      };
    }
    this.load();
    if (this.loadError && this.policy === 'reauth') {
      return {
        tracked: false,
        allowed: false,
        action: 'reauth',
        error: 'auth_session_registry_unavailable',
        risk: { level: 'elevated', reason: 'registry_unavailable', changed: false },
      };
    }

    const nowMs = this.now();
    const nowIso = new Date(nowMs).toISOString();
    const existing = this.sessions[principal.session_id] || null;
    const currentIp = network ? network.source_ip : null;
    const risk = evaluateIpRisk(
      existing ? existing.last_ip : null,
      currentIp,
      { tunnelOpaque: Boolean(network && network.tunnel_opaque) },
    );
    const shouldReauthenticate = this.policy === 'reauth'
      && risk.changed
      && risk.level === 'elevated';
    const newIpChange = risk.changed
      && (!existing || existing.pending_ip !== currentIp);
    const entry = {
      principal_id: principal.id,
      identity_type: principal.identity_type,
      role: principal.role,
      first_ip: existing ? existing.first_ip : currentIp,
      last_ip: shouldReauthenticate && existing
        ? existing.last_ip
        : currentIp,
      pending_ip: shouldReauthenticate
        ? currentIp
        : null,
      first_seen_at: existing ? existing.first_seen_at : nowIso,
      last_seen_at: nowIso,
      ip_change_count: (existing ? existing.ip_change_count || 0 : 0) + (newIpChange ? 1 : 0),
      last_risk_reason: risk.reason,
    };
    this.sessions[principal.session_id] = entry;
    const lastWrittenMs = existing ? Date.parse(existing.last_seen_at) : 0;
    if (!existing || newIpChange || nowMs - lastWrittenMs >= WRITE_INTERVAL_MS) {
      try {
        this.persist(nowMs);
      } catch (error) {
        if (existing) this.sessions[principal.session_id] = existing;
        else delete this.sessions[principal.session_id];
        return {
          tracked: false,
          allowed: this.policy !== 'reauth',
          action: this.policy === 'reauth' ? 'reauth' : 'audit',
          policy: this.policy,
          error: 'auth_session_registry_write_failed',
          risk: {
            level: 'elevated',
            reason: 'registry_write_failed',
            changed: risk.changed,
          },
        };
      }
    }
    return {
      tracked: true,
      allowed: !shouldReauthenticate,
      action: shouldReauthenticate ? 'reauth' : (risk.changed ? 'audit' : 'none'),
      policy: this.policy,
      risk,
    };
  }

  approvePending(principal, network) {
    if (!this.enabled || !principal || !principal.authenticated || !principal.session_id) {
      return {
        tracked: false,
        allowed: true,
        action: 'none',
        risk: { level: 'none', reason: 'tracking_disabled', changed: false },
      };
    }
    this.load();
    if (this.loadError) {
      return {
        tracked: false,
        allowed: false,
        action: 'reauth',
        error: 'auth_session_registry_unavailable',
        risk: { level: 'elevated', reason: 'registry_unavailable', changed: false },
      };
    }
    const currentIp = network ? network.source_ip : null;
    const existing = this.sessions[principal.session_id] || null;
    if (!existing || !currentIp || existing.pending_ip !== currentIp) {
      return {
        tracked: Boolean(existing),
        allowed: false,
        action: 'reauth',
        risk: { level: 'elevated', reason: 'no_matching_pending_ip', changed: false },
      };
    }
    const nowMs = this.now();
    this.sessions[principal.session_id] = {
      ...existing,
      last_ip: currentIp,
      pending_ip: null,
      last_seen_at: new Date(nowMs).toISOString(),
      last_risk_reason: 'reauth_approved',
    };
    try {
      this.persist(nowMs);
    } catch (_) {
      this.sessions[principal.session_id] = existing;
      return {
        tracked: false,
        allowed: false,
        action: 'reauth',
        error: 'auth_session_registry_write_failed',
        risk: { level: 'elevated', reason: 'registry_write_failed', changed: false },
      };
    }
    return {
      tracked: true,
      allowed: true,
      action: 'reauth_approved',
      policy: this.policy,
      risk: { level: 'none', reason: 'reauth_approved', changed: true },
    };
  }
}

const authSessionRegistry = new AuthSessionRegistry();

module.exports = {
  AuthSessionRegistry,
  DEFAULT_MAX_ENTRIES,
  DEFAULT_TTL_DAYS,
  VALID_IP_CHANGE_POLICIES,
  authSessionRegistry,
  evaluateIpRisk,
  isLoopbackIp,
  normalizeIp,
  parseBoolean,
  requestNetworkContext,
};
