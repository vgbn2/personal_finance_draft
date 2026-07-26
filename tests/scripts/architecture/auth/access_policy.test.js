'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ALL_CAPABILITIES,
  CAPABILITIES,
  CLIENT_ROUTE_CAPABILITIES,
  MUTATION_CAPABILITIES,
  PROTECTED_GET_CAPABILITIES,
  PUBLIC_GET_ROUTES,
  ROLE_CAPABILITIES,
  VALID_ROLES,
  authorize,
  buildPrincipal,
  requiredCapabilities,
} = require('../../../../shared/lib/auth/access_policy');
const ROUTES = require('../../../../backend/api/server/routes');
const botCycleRoute = require('../../../../backend/api/server/routes/bot/bot_cycle');

test('role capabilities are monotonic and live execution remains owner-only', () => {
  assert.deepEqual(VALID_ROLES, ['viewer', 'analyst', 'operator', 'owner', 'service']);
  for (const [lower, higher] of [
    ['viewer', 'analyst'],
    ['analyst', 'operator'],
    ['operator', 'owner'],
  ]) {
    const higherCapabilities = new Set(ROLE_CAPABILITIES[higher]);
    for (const capability of ROLE_CAPABILITIES[lower]) {
      assert.equal(higherCapabilities.has(capability), true, `${higher} must include ${lower}:${capability}`);
    }
  }
  assert.equal(ROLE_CAPABILITIES.owner.length, ALL_CAPABILITIES.length);
  assert.equal(ROLE_CAPABILITIES.owner.includes(CAPABILITIES.LIVE_EXECUTE), true);
  assert.equal(ROLE_CAPABILITIES.operator.includes(CAPABILITIES.LIVE_EXECUTE), false);
  assert.deepEqual(ROLE_CAPABILITIES.service, []);
});

test('service principals receive only explicit capabilities', () => {
  const client = buildPrincipal({
    id: 'remote-client',
    identityType: 'service',
    role: 'service',
    capabilities: [CAPABILITIES.STATUS_READ, CAPABILITIES.DATA_READ, 'unknown.capability'],
    authenticated: true,
    source: 'client_token',
  });
  assert.deepEqual(client.capabilities, [CAPABILITIES.STATUS_READ, CAPABILITIES.DATA_READ]);
  assert.equal(authorize(client, [CAPABILITIES.DATA_READ]).allowed, true);
  const denied = authorize(client, [CAPABILITIES.HOST_MANAGE]);
  assert.equal(denied.allowed, false);
  assert.equal(denied.reason, 'insufficient_capability');
});

test('policy distinguishes public, authenticated, and unauthorized requests', () => {
  const anonymous = buildPrincipal();
  const publicDecision = authorize(
    anonymous,
    requiredCapabilities({ method: 'GET', pathname: '/health' }),
  );
  assert.equal(publicDecision.allowed, true);
  assert.equal(publicDecision.reason, 'public');

  const missing = authorize(
    anonymous,
    requiredCapabilities({ method: 'GET', pathname: '/api/client/status' }),
  );
  assert.equal(missing.allowed, false);
  assert.equal(missing.reason, 'authentication_required');

  const viewer = buildPrincipal({
    id: 'viewer-1',
    identityType: 'human',
    role: 'viewer',
    authenticated: true,
    source: 'supabase',
  });
  assert.equal(authorize(
    viewer,
    requiredCapabilities({ method: 'GET', pathname: '/api/client/status' }),
  ).allowed, true);
  assert.equal(authorize(
    viewer,
    requiredCapabilities({ method: 'POST', pathname: '/api/bot/cycle' }),
  ).reason, 'insufficient_capability');
});

test('privileged file overrides and kill-switch mutations require elevated capabilities', () => {
  assert.deepEqual(
    requiredCapabilities({
      method: 'GET',
      pathname: '/api/data/summary',
      hasPrivilegedOverride: true,
    }),
    [CAPABILITIES.LOCAL_FILE_OVERRIDE],
  );
  assert.deepEqual(
    requiredCapabilities({
      method: 'GET',
      pathname: '/api/kill-switch',
      query: { command: 'status' },
    }),
    [CAPABILITIES.STATUS_READ],
  );
  assert.deepEqual(
    requiredCapabilities({
      method: 'GET',
      pathname: '/api/kill-switch',
      query: { command: 'activate' },
    }),
    [CAPABILITIES.SAFETY_CONTROL],
  );
  assert.deepEqual(
    requiredCapabilities({ method: 'POST', pathname: '/api/kill-switch' }),
    [CAPABILITIES.SAFETY_CONTROL],
  );
});

test('live bot cycles require execution authority before a child process can be spawned', () => {
  assert.deepEqual(
    requiredCapabilities({ method: 'POST', pathname: '/api/bot/cycle', query: { live: 'true' } }),
    [CAPABILITIES.PAPER_OPERATE, CAPABILITIES.LIVE_EXECUTE],
  );
  const operator = buildPrincipal({
    id: 'operator-1', identityType: 'human', role: 'operator', authenticated: true,
  });
  assert.equal(authorize(operator, requiredCapabilities({
    method: 'POST', pathname: '/api/bot/cycle', query: { live: 'true' },
  })).allowed, false);
  assert.equal(botCycleRoute.handle({ live: 'true' }, {
    req: { method: 'POST', sovereignPrincipal: operator },
  }).error, 'insufficient_live_execution_capability');
});

test('unknown mutations fail closed behind host management', () => {
  assert.deepEqual(
    requiredCapabilities({ method: 'POST', pathname: '/api/new-operation' }),
    [CAPABILITIES.HOST_MANAGE],
  );
});

test('unknown capability names fail closed instead of becoming public', () => {
  const principal = buildPrincipal({
    id: 'owner-1',
    identityType: 'human',
    role: 'owner',
    authenticated: true,
  });
  assert.deepEqual(authorize(principal, ['typo.capability']), {
    allowed: false,
    authenticated: true,
    reason: 'invalid_capability_policy',
    required: [],
    missing: ['typo.capability'],
  });
});

test('every registered API route has an explicit policy classification', () => {
  const classified = new Set([
    ...PUBLIC_GET_ROUTES,
    ...Object.keys(CLIENT_ROUTE_CAPABILITIES),
    ...Object.keys(PROTECTED_GET_CAPABILITIES),
    ...Object.keys(MUTATION_CAPABILITIES),
  ]);
  assert.deepEqual(
    Object.keys(ROUTES).filter((route) => !classified.has(route)),
    [],
  );
});
