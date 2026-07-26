'use strict';

const crypto = require('node:crypto');
const {
  CAPABILITIES,
  buildPrincipal,
  capabilitiesForRole,
  normalizeRole,
} = require('../../../../shared/lib/auth/access_policy');
const { getAuthStatus } = require('./supabase_client');

const CLIENT_CAPABILITIES = Object.freeze([
  CAPABILITIES.STATUS_READ,
  CAPABILITIES.DATA_READ,
  CAPABILITIES.RESEARCH_READ,
]);

function constantTimeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  if (leftBuffer.length !== rightBuffer.length || leftBuffer.length === 0) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function requestTokens(req) {
  const tokens = [];
  const sovereignToken = req && req.headers
    ? req.headers['x-sovereign-token']
    : null;
  if (typeof sovereignToken === 'string' && sovereignToken) {
    tokens.push({ value: sovereignToken, source: 'sovereign_header' });
  }
  const authorization = req && req.headers
    ? req.headers.authorization
    : null;
  if (typeof authorization === 'string') {
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (match && match[1]) tokens.push({ value: match[1], source: 'bearer' });
  }
  return tokens;
}

function tokenSessionId(token) {
  if (!token) return null;
  return crypto.createHash('sha256').update(String(token)).digest('hex').slice(0, 24);
}

function humanSessionId(userId) {
  if (!userId) return null;
  // Supabase access tokens rotate routinely. Bind network-risk history to the
  // verified subject rather than a bearer-token fingerprint so rotation cannot
  // turn an IP change into a new first-seen session.
  return crypto.createHash('sha256').update(`human:${String(userId)}`).digest('hex').slice(0, 24);
}

function parseUserRoleMap(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const roles = {};
    for (const [userId, role] of Object.entries(parsed)) {
      const normalized = normalizeRole(role);
      if (userId && normalized && normalized !== 'service') roles[String(userId)] = normalized;
    }
    return roles;
  } catch (_) {
    return {};
  }
}

function resolveHumanRole(user, env = process.env) {
  const roleMap = parseUserRoleMap(env.SOVEREIGN_USER_ROLE_MAP);
  if (user && user.id && roleMap[user.id]) return roleMap[user.id];
  const trustedClaim = user && (
    user.access_role
    || user.sovereign_role
    || (user.app_metadata && user.app_metadata.sovereign_role)
  );
  const claimedRole = normalizeRole(trustedClaim);
  if (claimedRole && claimedRole !== 'service') return claimedRole;
  const fallback = normalizeRole(env.SOVEREIGN_DEFAULT_USER_ROLE, 'viewer');
  return fallback === 'service' ? 'viewer' : fallback;
}

async function resolvePrincipal(req, {
  env = process.env,
  getAuthStatusFn = getAuthStatus,
} = {}) {
  const apiToken = String(env.SOVEREIGN_API_TOKEN || '');
  const clientToken = String(env.SOVEREIGN_CLIENT_TOKEN || '');
  const tokens = requestTokens(req);

  for (const token of tokens) {
    if (apiToken && constantTimeEqual(token.value, apiToken)) {
      return buildPrincipal({
        id: 'host-api',
        identityType: 'service',
        role: 'owner',
        authenticated: true,
        source: 'api_token',
        sessionId: tokenSessionId(token.value),
      });
    }
  }

  for (const token of tokens) {
    if (clientToken && constantTimeEqual(token.value, clientToken)) {
      return buildPrincipal({
        id: 'remote-client',
        identityType: 'service',
        role: 'service',
        capabilities: CLIENT_CAPABILITIES,
        authenticated: true,
        source: 'client_token',
        sessionId: tokenSessionId(token.value),
      });
    }
  }

  const bearer = tokens.find((token) => token.source === 'bearer');
  if (bearer) {
    const auth = await getAuthStatusFn(req);
    if (auth && auth.authenticated === true) {
      const user = auth.user || {};
      const role = resolveHumanRole(user, env);
      return buildPrincipal({
        id: user.id || 'supabase-user',
        identityType: 'human',
        role,
        capabilities: capabilitiesForRole(role),
        authenticated: true,
        source: 'supabase',
        sessionId: humanSessionId(user.id || 'supabase-user'),
      });
    }
  }

  return buildPrincipal({
    source: tokens.length > 0 ? 'invalid_credentials' : 'none',
  });
}

async function resolveSocketPrincipal(socket, options = {}) {
  const token = socket
    && socket.handshake
    && socket.handshake.auth
    && typeof socket.handshake.auth.token === 'string'
    ? socket.handshake.auth.token
    : '';
  const request = {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    socket: socket && socket.request ? socket.request.socket : null,
  };
  return resolvePrincipal(request, options);
}

module.exports = {
  CLIENT_CAPABILITIES,
  constantTimeEqual,
  parseUserRoleMap,
  requestTokens,
  resolveHumanRole,
  resolvePrincipal,
  resolveSocketPrincipal,
  humanSessionId,
  tokenSessionId,
};
