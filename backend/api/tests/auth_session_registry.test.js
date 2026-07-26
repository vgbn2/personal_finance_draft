'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  AuthSessionRegistry,
  evaluateIpRisk,
  normalizeIp,
  requestNetworkContext,
} = require('../server/services/auth_session_registry');

const PRINCIPAL = Object.freeze({
  id: 'user-1',
  identity_type: 'human',
  role: 'owner',
  authenticated: true,
  session_id: 'session-fingerprint',
});

test('network context ignores forwarded headers unless proxy trust is explicit', () => {
  const req = {
    socket: { remoteAddress: '::ffff:127.0.0.1' },
    headers: { 'x-forwarded-for': '203.0.113.20, 127.0.0.1' },
  };
  assert.equal(normalizeIp(req.socket.remoteAddress), '127.0.0.1');
  assert.deepEqual(requestNetworkContext(req), {
    source_ip: '127.0.0.1',
    socket_ip: '127.0.0.1',
    source: 'socket',
    trust_proxy: false,
    tunnel_opaque: true,
  });
  assert.equal(requestNetworkContext(req, { trustProxy: true }).source_ip, '203.0.113.20');
});

test('IP risk treats SSH loopback as opaque and public changes as elevated', () => {
  assert.equal(evaluateIpRisk(null, '198.51.100.1').reason, 'first_seen');
  assert.equal(evaluateIpRisk('198.51.100.1', '198.51.100.1').reason, 'unchanged');
  assert.deepEqual(
    evaluateIpRisk('198.51.100.1', '198.51.100.2'),
    { level: 'elevated', reason: 'source_ip_changed', changed: true },
  );
  assert.equal(
    evaluateIpRisk('127.0.0.1', '127.0.0.2', { tunnelOpaque: true }).reason,
    'tunnel_endpoint_changed',
  );
});

test('registry stores no token, audits IP changes, and can require reauthentication', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-auth-registry-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const registryPath = path.join(root, 'auth_sessions.json');
  let now = Date.parse('2026-07-26T00:00:00.000Z');
  const registry = new AuthSessionRegistry({
    enabled: true,
    registryPath,
    policy: 'reauth',
    now: () => now,
  });

  const first = registry.record(PRINCIPAL, {
    source_ip: '198.51.100.1',
    tunnel_opaque: false,
  });
  assert.equal(first.allowed, true);
  assert.equal(first.risk.reason, 'first_seen');
  now += 1000;
  const changed = registry.record(PRINCIPAL, {
    source_ip: '198.51.100.2',
    tunnel_opaque: false,
  });
  assert.equal(changed.allowed, false);
  assert.equal(changed.action, 'reauth');
  now += 1000;
  const stillBlocked = registry.record(PRINCIPAL, {
    source_ip: '198.51.100.2',
    tunnel_opaque: false,
  });
  assert.equal(stillBlocked.allowed, false);
  assert.equal(stillBlocked.action, 'reauth');

  const raw = fs.readFileSync(registryPath, 'utf8');
  assert.doesNotMatch(raw, /Bearer|X-Sovereign-Token|token-value/);
  const stored = JSON.parse(raw);
  assert.equal(stored.sessions['session-fingerprint'].first_ip, '198.51.100.1');
  assert.equal(stored.sessions['session-fingerprint'].last_ip, '198.51.100.1');
  assert.equal(stored.sessions['session-fingerprint'].pending_ip, '198.51.100.2');
  assert.equal(stored.sessions['session-fingerprint'].ip_change_count, 1);
  assert.equal(fs.statSync(registryPath).mode & 0o777, 0o600);
});

test('reauthentication explicitly approves only the pending IP for the stable principal', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-auth-registry-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let now = Date.parse('2026-07-26T00:00:00.000Z');
  const registry = new AuthSessionRegistry({
    enabled: true,
    registryPath: path.join(root, 'auth_sessions.json'),
    policy: 'reauth',
    now: () => now,
  });
  const oldNetwork = { source_ip: '198.51.100.1', tunnel_opaque: false };
  const newNetwork = { source_ip: '198.51.100.2', tunnel_opaque: false };
  assert.equal(registry.record(PRINCIPAL, oldNetwork).allowed, true);
  now += 1000;
  assert.equal(registry.record(PRINCIPAL, newNetwork).allowed, false);
  now += 1000;
  assert.equal(registry.approvePending(PRINCIPAL, oldNetwork).allowed, false, 'old IP cannot approve a new-IP challenge');
  const approved = registry.approvePending(PRINCIPAL, newNetwork);
  assert.equal(approved.allowed, true);
  assert.equal(approved.action, 'reauth_approved');
  assert.equal(registry.record(PRINCIPAL, newNetwork).allowed, true);
});

test('disabled tracking never writes or blocks', () => {
  const registry = new AuthSessionRegistry({
    enabled: false,
    registryPath: '/not/used/auth_sessions.json',
    policy: 'reauth',
  });
  assert.deepEqual(registry.record(PRINCIPAL, {
    source_ip: '198.51.100.1',
    tunnel_opaque: false,
  }), {
    tracked: false,
    allowed: true,
    action: 'none',
    risk: { level: 'none', reason: 'tracking_disabled', changed: false },
  });
});

test('enabled tracking tolerates unavailable network metadata', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-auth-registry-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const registryPath = path.join(root, 'auth_sessions.json');
  const registry = new AuthSessionRegistry({
    enabled: true,
    registryPath,
    policy: 'audit',
    now: () => Date.parse('2026-07-26T00:00:00.000Z'),
  });

  const result = registry.record(PRINCIPAL, null);
  assert.equal(result.allowed, true);
  assert.equal(result.risk.reason, 'source_ip_unavailable');
  const stored = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  assert.equal(stored.sessions['session-fingerprint'].first_ip, null);
  assert.equal(stored.sessions['session-fingerprint'].last_ip, null);
});

test('reauth policy stays fail closed after repeated registry write failures', () => {
  const registry = new AuthSessionRegistry({
    enabled: true,
    registryPath: '/not/writable/auth_sessions.json',
    policy: 'reauth',
    now: () => Date.parse('2026-07-26T00:00:00.000Z'),
  });
  registry.persist = () => {
    throw new Error('simulated write failure');
  };
  const network = { source_ip: '198.51.100.1', tunnel_opaque: false };

  const first = registry.record(PRINCIPAL, network);
  const second = registry.record(PRINCIPAL, network);

  assert.equal(first.allowed, false);
  assert.equal(second.allowed, false);
  assert.equal(first.error, 'auth_session_registry_write_failed');
  assert.equal(second.error, 'auth_session_registry_write_failed');
  assert.equal(registry.sessions['session-fingerprint'], undefined);
});
