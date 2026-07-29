'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { STORAGE_DATA_DIR } = require('./paths');

const HEARTBEAT_SCHEMA_VERSION = 1;
const HEARTBEAT_DIR = path.join(STORAGE_DATA_DIR, 'cache', 'service_heartbeats');
const SERVICE_NAMES = Object.freeze([
  'paper_bot',
  'backfill',
  'portfolio_monitor',
  'host_health',
  'host_backup',
]);
const SERVICE_TTLS_MS = Object.freeze({
  paper_bot: 5 * 60 * 1000,
  backfill: 45 * 60 * 1000,
  portfolio_monitor: 5 * 60 * 1000,
  host_health: 15 * 60 * 1000,
  host_backup: 2 * 24 * 60 * 60 * 1000,
});
const STATES = Object.freeze(['starting', 'running', 'healthy', 'degraded', 'stopped', 'unavailable']);

function safeServiceName(value) {
  const name = String(value || '').trim();
  if (!/^[a-z][a-z0-9_]{1,47}$/.test(name)) throw new TypeError('invalid service heartbeat name');
  return name;
}

function heartbeatPath(service, directory = HEARTBEAT_DIR) {
  const name = safeServiceName(service);
  const root = path.resolve(directory);
  return path.join(root, `${name}.json`);
}

function errorCode(value) {
  const text = String(value == null ? '' : value).toLowerCase();
  if (['authentication_failed', 'upstream_timeout_or_rate_limited', 'dependency_unavailable', 'permission_denied',
    'storage_unavailable', 'service_failed', 'heartbeat_missing', 'heartbeat_invalid', 'heartbeat_expired',
    'backup_failed', 'backup_retention_failed'].includes(text)) return text;
  if (/(401|403|unauthori[sz]ed|authentication|invalid.{0,12}(token|key)|token|credential)/.test(text)) return 'authentication_failed';
  if (/(timeout|timed out|etimedout|rate.?limit|429)/.test(text)) return 'upstream_timeout_or_rate_limited';
  if (/(enoent|not found|missing)/.test(text)) return 'dependency_unavailable';
  if (/(permission|eacces|eperm)/.test(text)) return 'permission_denied';
  if (/(disk|space|enospc)/.test(text)) return 'storage_unavailable';
  return text ? 'service_failed' : null;
}

function finiteNonNegative(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function isoOrNull(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function writeAtomic(filePath, payload, fsImpl = fs) {
  const directory = path.dirname(filePath);
  fsImpl.mkdirSync(directory, { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  try {
    fsImpl.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    fsImpl.renameSync(tempPath, filePath);
  } catch (error) {
    try { fsImpl.unlinkSync(tempPath); } catch (_) { /* best effort cleanup */ }
    throw error;
  }
}

function readExisting(service, directory = HEARTBEAT_DIR, fsImpl = fs) {
  try {
    const value = JSON.parse(fsImpl.readFileSync(heartbeatPath(service, directory), 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch (_) {
    return {};
  }
}

function writeServiceHeartbeat(service, patch = {}, options = {}) {
  const name = safeServiceName(service);
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const directory = options.directory || HEARTBEAT_DIR;
  const fsImpl = options.fsImpl || fs;
  const previous = readExisting(name, directory, fsImpl);
  const state = STATES.includes(patch.state) ? patch.state : (previous.state || 'running');
  const attemptedAt = isoOrNull(patch.last_attempt_at || previous.last_attempt_at) || new Date(nowMs).toISOString();
  const successful = patch.success === true || patch.last_success_at != null;
  const payload = {
    schema_version: HEARTBEAT_SCHEMA_VERSION,
    service: name,
    instance_id: String(patch.instance_id || previous.instance_id || `pid-${process.pid}`),
    state,
    heartbeat_at: new Date(nowMs).toISOString(),
    last_attempt_at: attemptedAt,
    last_success_at: successful
      ? (isoOrNull(patch.last_success_at) || new Date(nowMs).toISOString())
      : isoOrNull(previous.last_success_at),
    next_run_at: Object.hasOwn(patch, 'next_run_at')
      ? isoOrNull(patch.next_run_at)
      : isoOrNull(previous.next_run_at),
    attempt_count: finiteNonNegative(patch.attempt_count, finiteNonNegative(previous.attempt_count)) + (patch.attempted === false ? 0 : 1),
    success_count: finiteNonNegative(patch.success_count, finiteNonNegative(previous.success_count)) + (successful ? 1 : 0),
    ttl_ms: finiteNonNegative(patch.ttl_ms, SERVICE_TTLS_MS[name] || 15 * 60 * 1000),
    error_code: patch.error_code || errorCode(patch.error) || (state === 'degraded' ? 'service_failed' : null),
  };
  writeAtomic(heartbeatPath(name, directory), payload, fsImpl);
  return payload;
}

function normalizeHeartbeat(service, value, nowMs, ttlMs) {
  if (value === null) {
    return { service, state: 'unavailable', reason: 'heartbeat_missing', heartbeat_at: null, age_ms: null, last_success_at: null, error_code: 'heartbeat_missing' };
  }
  if (!value || typeof value !== 'object' || value.service !== service || value.schema_version !== HEARTBEAT_SCHEMA_VERSION) {
    return { service, state: 'unavailable', reason: 'heartbeat_invalid', heartbeat_at: null, age_ms: null, last_success_at: null, error_code: 'heartbeat_invalid' };
  }
  const heartbeatMs = Date.parse(value.heartbeat_at || '');
  const ageMs = Number.isFinite(heartbeatMs) ? Math.max(0, nowMs - heartbeatMs) : null;
  const expired = ageMs === null || ageMs > ttlMs;
  return {
    service,
    state: expired ? 'unavailable' : (STATES.includes(value.state) ? value.state : 'degraded'),
    reason: expired ? (ageMs === null ? 'heartbeat_missing_timestamp' : 'heartbeat_expired') : null,
    heartbeat_at: Number.isFinite(heartbeatMs) ? new Date(heartbeatMs).toISOString() : null,
    age_ms: ageMs,
    last_attempt_at: isoOrNull(value.last_attempt_at),
    last_success_at: isoOrNull(value.last_success_at),
    next_run_at: isoOrNull(value.next_run_at),
    attempt_count: finiteNonNegative(value.attempt_count),
    success_count: finiteNonNegative(value.success_count),
    ttl_ms: ttlMs,
    error_code: value.error_code ? errorCode(value.error_code) : null,
  };
}

function readServiceHeartbeats(options = {}) {
  const directory = options.directory || HEARTBEAT_DIR;
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const fsImpl = options.fsImpl || fs;
  const names = Array.isArray(options.services) && options.services.length > 0
    ? options.services.map(safeServiceName)
    : SERVICE_NAMES;
  const services = names.map((service) => {
    let value = null;
    try { value = JSON.parse(fsImpl.readFileSync(heartbeatPath(service, directory), 'utf8')); } catch (error) {
      if (error && error.code !== 'ENOENT') value = {};
    }
    return normalizeHeartbeat(service, value, nowMs, SERVICE_TTLS_MS[service] || 15 * 60 * 1000);
  });
  return {
    schema_version: HEARTBEAT_SCHEMA_VERSION,
    generated_at: new Date(nowMs).toISOString(),
    counts: {
      total: services.length,
      healthy: services.filter((service) => service.state === 'healthy').length,
      running: services.filter((service) => service.state === 'running' || service.state === 'starting').length,
      degraded: services.filter((service) => service.state === 'degraded').length,
      unavailable: services.filter((service) => service.state === 'unavailable').length,
    },
    services,
  };
}

function readServiceHeartbeat(service, options = {}) {
  const result = readServiceHeartbeats({
    ...options,
    services: [safeServiceName(service)],
  });
  return result.services[0];
}

module.exports = {
  HEARTBEAT_DIR,
  HEARTBEAT_SCHEMA_VERSION,
  SERVICE_NAMES,
  SERVICE_TTLS_MS,
  STATES,
  errorCode,
  heartbeatPath,
  readServiceHeartbeat,
  readServiceHeartbeats,
  safeServiceName,
  writeServiceHeartbeat,
};
