'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { CAPABILITIES } = require('../../../shared/lib/auth/access_policy');
const {
  CLIENT_CAPABILITIES,
  humanSessionId,
  parseUserRoleMap,
  resolveHumanRole,
  resolvePrincipal,
  resolveSocketPrincipal,
  isLoopbackRequest,
} = require('../server/services/access_control');

function request(headers = {}, remoteAddress = '127.0.0.1') {
  return { headers, socket: { remoteAddress } };
}

test('admin and client tokens become distinct service principals', async () => {
  const env = {
    SOVEREIGN_API_TOKEN: 'admin-token-value',
    SOVEREIGN_CLIENT_TOKEN: 'client-token-value',
  };
  const owner = await resolvePrincipal(request({
    'x-sovereign-token': env.SOVEREIGN_API_TOKEN,
  }), { env });
  assert.equal(owner.authenticated, true);
  assert.equal(owner.role, 'owner');
  assert.equal(owner.source, 'api_token');
  assert.equal(owner.capabilities.includes(CAPABILITIES.LIVE_EXECUTE), true);
  assert.equal(owner.session_id.length, 24);

  const client = await resolvePrincipal(request({
    authorization: `Bearer ${env.SOVEREIGN_CLIENT_TOKEN}`,
  }), { env });
  assert.equal(client.authenticated, true);
  assert.equal(client.role, 'service');
  assert.equal(client.source, 'client_token');
  assert.deepEqual(client.capabilities, CLIENT_CAPABILITIES);
  assert.equal(client.capabilities.includes(CAPABILITIES.PAPER_OPERATE), false);
});

test('human roles come only from server role map, app metadata, or safe default', async () => {
  const baseRequest = request({ authorization: 'Bearer user-session-token' });
  const mapped = await resolvePrincipal(baseRequest, {
    env: {
      SOVEREIGN_USER_ROLE_MAP: JSON.stringify({ 'user-1': 'owner' }),
      SOVEREIGN_DEFAULT_USER_ROLE: 'viewer',
    },
    getAuthStatusFn: async () => ({
      authenticated: true,
      user: { id: 'user-1', access_role: 'analyst' },
    }),
  });
  assert.equal(mapped.role, 'owner');

  const claimed = await resolvePrincipal(baseRequest, {
    env: { SOVEREIGN_DEFAULT_USER_ROLE: 'viewer' },
    getAuthStatusFn: async () => ({
      authenticated: true,
      user: { id: 'user-2', app_metadata: { sovereign_role: 'operator' } },
    }),
  });
  assert.equal(claimed.role, 'operator');

  const fallback = await resolvePrincipal(baseRequest, {
    env: { SOVEREIGN_DEFAULT_USER_ROLE: 'not-a-role' },
    getAuthStatusFn: async () => ({
      authenticated: true,
      user: { id: 'user-3' },
    }),
  });
  assert.equal(fallback.role, 'viewer');
});

test('human session risk identity survives ordinary bearer-token rotation', async () => {
  const env = { SOVEREIGN_DEFAULT_USER_ROLE: 'viewer' };
  const getAuthStatusFn = async () => ({ authenticated: true, user: { id: 'rotating-user' } });
  const first = await resolvePrincipal(request({ authorization: 'Bearer token-a' }), { env, getAuthStatusFn });
  const rotated = await resolvePrincipal(request({ authorization: 'Bearer token-b' }), { env, getAuthStatusFn });
  assert.equal(first.session_id, rotated.session_id);
  assert.equal(first.session_id, humanSessionId('rotating-user'));
  assert.notEqual(first.session_id, 'token-a');
});

test('malformed role maps fail closed and service cannot be assigned to a human', () => {
  assert.deepEqual(parseUserRoleMap('{broken'), {});
  assert.deepEqual(parseUserRoleMap(JSON.stringify({
    user1: 'analyst',
    user2: 'service',
    user3: 'unknown',
  })), { user1: 'analyst' });
  assert.equal(resolveHumanRole(
    { id: 'user2', access_role: 'service' },
    { SOVEREIGN_DEFAULT_USER_ROLE: 'viewer' },
  ), 'viewer');
});

test('invalid credentials stay anonymous without exposing token material', async () => {
  const principal = await resolvePrincipal(request({
    'x-sovereign-token': 'wrong-token',
  }), {
    env: {
      SOVEREIGN_API_TOKEN: 'admin-token-value',
      SOVEREIGN_CLIENT_TOKEN: 'client-token-value',
    },
  });
  assert.equal(principal.authenticated, false);
  assert.equal(principal.id, null);
  assert.equal(principal.session_id, null);
  assert.equal(principal.source, 'invalid_credentials');
});

test('legacy owner and client tokens are loopback-only', async () => {
  const env = {
    SOVEREIGN_API_TOKEN: 'admin-token-value',
    SOVEREIGN_CLIENT_TOKEN: 'client-token-value',
  };
  const remote = request({ 'x-sovereign-token': env.SOVEREIGN_API_TOKEN }, '192.0.2.40');
  assert.equal(isLoopbackRequest(remote), false);
  assert.equal((await resolvePrincipal(remote, { env })).authenticated, false);
  assert.equal(isLoopbackRequest(request({}, '::ffff:127.0.0.1')), true);
});

test('missing or malformed request origins never receive loopback token trust', async () => {
  const env = {
    SOVEREIGN_API_TOKEN: 'admin-token-value',
    SOVEREIGN_CLIENT_TOKEN: 'client-token-value',
  };
  for (const candidate of [
    { headers: { 'x-sovereign-token': env.SOVEREIGN_API_TOKEN } },
    request({ 'x-sovereign-token': env.SOVEREIGN_API_TOKEN }, ''),
    request({ 'x-sovereign-token': env.SOVEREIGN_API_TOKEN }, 'not-an-ip'),
    request({ 'x-sovereign-token': env.SOVEREIGN_API_TOKEN }, '198.51.100.10'),
  ]) {
    assert.equal(isLoopbackRequest(candidate), false);
    assert.equal((await resolvePrincipal(candidate, { env })).authenticated, false);
  }
  assert.equal(isLoopbackRequest(request({}, '127.0.0.1')), true);
  assert.equal(isLoopbackRequest(request({}, '::1')), true);
});

test('socket principals use handshake auth without browser-visible host headers', async () => {
  const principal = await resolveSocketPrincipal({
    handshake: { auth: { token: 'user-session-token' } },
    request: { socket: { remoteAddress: '127.0.0.1' } },
  }, {
    env: { SOVEREIGN_DEFAULT_USER_ROLE: 'viewer' },
    getAuthStatusFn: async (req) => ({
      authenticated: req.headers.authorization === 'Bearer user-session-token',
      user: { id: 'socket-user' },
    }),
  });
  assert.equal(principal.authenticated, true);
  assert.equal(principal.id, 'socket-user');
  assert.equal(principal.role, 'viewer');
  assert.equal(principal.source, 'supabase');
});

test('loopback requests without credentials receive operator principal when local guest is enabled', async () => {
  for (const ip of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
    const principal = await resolvePrincipal(request({}, ip), { env: {} });
    assert.equal(principal.authenticated, true);
    assert.equal(principal.role, 'operator');
    assert.equal(principal.id, 'local-operator');
    assert.equal(principal.source, 'local_guest');
    assert.equal(principal.identity_type, 'human');
    assert.equal(typeof principal.session_id, 'string');
  }

  const localTokenPrincipal = await resolvePrincipal(
    request({ authorization: 'Bearer local-operator-token' }, '127.0.0.1'),
    { env: {} },
  );
  assert.equal(localTokenPrincipal.authenticated, true);
  assert.equal(localTokenPrincipal.role, 'operator');
  assert.equal(localTokenPrincipal.source, 'local_guest');
});

test('loopback requests fail closed when SOVEREIGN_ALLOW_LOCAL_GUEST is false', async () => {
  const env = { SOVEREIGN_ALLOW_LOCAL_GUEST: 'false' };
  const principal = await resolvePrincipal(request({}, '127.0.0.1'), { env });
  assert.equal(principal.authenticated, false);
  assert.equal(principal.role, null);
  assert.equal(principal.source, 'none');

  const localTokenPrincipal = await resolvePrincipal(
    request({ authorization: 'Bearer local-operator-token' }, '127.0.0.1'),
    { env },
  );
  assert.equal(localTokenPrincipal.authenticated, false);
  assert.equal(localTokenPrincipal.source, 'invalid_credentials');
});

test('remote and LAN requests without credentials never receive local guest operator principal', async () => {
  const remoteIps = ['192.168.1.100', '10.0.0.5', '172.16.0.2', '203.0.113.195'];
  for (const ip of remoteIps) {
    const noAuth = await resolvePrincipal(request({}, ip), { env: {} });
    assert.equal(noAuth.authenticated, false);
    assert.equal(noAuth.source, 'none');

    const spoofToken = await resolvePrincipal(
      request({ authorization: 'Bearer local-operator-token' }, ip),
      { env: {} },
    );
    assert.equal(spoofToken.authenticated, false);
    assert.equal(spoofToken.source, 'invalid_credentials');
  }
});

test('loopback operator capabilities include paper and data operations but strictly exclude LIVE_EXECUTE', async () => {
  const principal = await resolvePrincipal(request({}, '127.0.0.1'), { env: {} });
  assert.equal(principal.authenticated, true);
  assert.equal(principal.capabilities.includes(CAPABILITIES.DATA_READ), true);
  assert.equal(principal.capabilities.includes(CAPABILITIES.RESEARCH_READ), true);
  assert.equal(principal.capabilities.includes(CAPABILITIES.PAPER_OPERATE), true);
  assert.equal(principal.capabilities.includes(CAPABILITIES.HOST_INSPECT), true);
  assert.equal(principal.capabilities.includes(CAPABILITIES.SAFETY_CONTROL), true);
  // Strict safety boundary: LIVE_EXECUTE must NEVER be granted to local-guest operator
  assert.equal(principal.capabilities.includes(CAPABILITIES.LIVE_EXECUTE), false);
});

