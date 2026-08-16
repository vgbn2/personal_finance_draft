'use strict';

const CAPABILITIES = Object.freeze({
  STATUS_READ: 'status.read',
  DATA_READ: 'data.read',
  RESEARCH_READ: 'research.read',
  RESEARCH_RUN: 'research.run',
  PORTFOLIO_READ: 'portfolio.read',
  USER_CONFIG_READ: 'user_config.read',
  USER_CONFIG_WRITE: 'user_config.write',
  SIGNAL_PROMOTE: 'signal.promote',
  PAPER_OPERATE: 'paper.operate',
  DATA_WRITE: 'data.write',
  HOST_INSPECT: 'host.inspect',
  HOST_MANAGE: 'host.manage',
  SAFETY_CONTROL: 'safety.control',
  LOCAL_FILE_OVERRIDE: 'local_file_override.read',
  LIVE_EXECUTE: 'live.execute',
});

const ALL_CAPABILITIES = Object.freeze(Object.values(CAPABILITIES));

const ROLE_CAPABILITIES = Object.freeze({
  viewer: Object.freeze([
    CAPABILITIES.STATUS_READ,
    CAPABILITIES.DATA_READ,
    CAPABILITIES.RESEARCH_READ,
  ]),
  analyst: Object.freeze([
    CAPABILITIES.STATUS_READ,
    CAPABILITIES.DATA_READ,
    CAPABILITIES.RESEARCH_READ,
    CAPABILITIES.RESEARCH_RUN,
    CAPABILITIES.PORTFOLIO_READ,
    CAPABILITIES.USER_CONFIG_READ,
    CAPABILITIES.USER_CONFIG_WRITE,
    CAPABILITIES.SIGNAL_PROMOTE,
  ]),
  operator: Object.freeze([
    CAPABILITIES.STATUS_READ,
    CAPABILITIES.DATA_READ,
    CAPABILITIES.RESEARCH_READ,
    CAPABILITIES.RESEARCH_RUN,
    CAPABILITIES.PORTFOLIO_READ,
    CAPABILITIES.USER_CONFIG_READ,
    CAPABILITIES.USER_CONFIG_WRITE,
    CAPABILITIES.SIGNAL_PROMOTE,
    CAPABILITIES.PAPER_OPERATE,
    CAPABILITIES.DATA_WRITE,
    CAPABILITIES.HOST_INSPECT,
    CAPABILITIES.SAFETY_CONTROL,
  ]),
  owner: ALL_CAPABILITIES,
  service: Object.freeze([]),
});

const VALID_ROLES = Object.freeze(Object.keys(ROLE_CAPABILITIES));

const PUBLIC_GET_ROUTES = new Set([
  '/health',
  '/api/auth/status',
  '/api/supabase/config',
  '/api/public/market-summary',
  '/api/public/freshness',
  '/api/public/research-summary',
]);

const CLIENT_ROUTE_CAPABILITIES = Object.freeze({
  '/api/bias': CAPABILITIES.RESEARCH_READ,
  '/api/bot/status': CAPABILITIES.STATUS_READ,
  '/api/client/status': CAPABILITIES.STATUS_READ,
  '/api/data/summary': CAPABILITIES.DATA_READ,
  '/api/market/monitor': CAPABILITIES.DATA_READ,
  '/api/system/service-health': CAPABILITIES.DATA_READ,
  '/api/scorecard': CAPABILITIES.RESEARCH_READ,
  '/api/signal': CAPABILITIES.RESEARCH_READ,
  '/api/universe': CAPABILITIES.DATA_READ,
});

const PROTECTED_GET_CAPABILITIES = Object.freeze({
  '/api/status': CAPABILITIES.STATUS_READ,
  '/api/data/summary': CAPABILITIES.DATA_READ,
  '/api/analytics': CAPABILITIES.RESEARCH_READ,
  '/api/backtest': CAPABILITIES.RESEARCH_READ,
  '/api/correlation': CAPABILITIES.RESEARCH_READ,
  '/api/backend/stats': CAPABILITIES.STATUS_READ,
  '/api/universe': CAPABILITIES.DATA_READ,
  '/api/cache/universe': CAPABILITIES.DATA_READ,
  '/api/indicators': CAPABILITIES.RESEARCH_READ,
  '/api/quotes/status': CAPABILITIES.DATA_READ,
  '/api/signal': CAPABILITIES.RESEARCH_READ,
  '/api/system/status': CAPABILITIES.STATUS_READ,
  '/api/strategies': CAPABILITIES.RESEARCH_READ,
  '/api/sigma-band': CAPABILITIES.RESEARCH_READ,
  '/api/run/status': CAPABILITIES.STATUS_READ,
  '/api/backend/portfolio': CAPABILITIES.PORTFOLIO_READ,
  '/api/cache/list': CAPABILITIES.HOST_INSPECT,
  '/api/config': CAPABILITIES.USER_CONFIG_READ,
  '/api/database/status': CAPABILITIES.USER_CONFIG_READ,
  '/api/bot/status': CAPABILITIES.STATUS_READ,
  '/api/bias': CAPABILITIES.RESEARCH_READ,
  '/api/client/status': CAPABILITIES.STATUS_READ,
  '/api/kill-switch': CAPABILITIES.STATUS_READ,
  '/api/market/monitor': CAPABILITIES.DATA_READ,
  '/api/system/service-health': CAPABILITIES.DATA_READ,
  '/api/scorecard': CAPABILITIES.RESEARCH_READ,
  '/api/combined-analysis': CAPABILITIES.RESEARCH_READ,
});

const MUTATION_CAPABILITIES = Object.freeze({
  '/api/config': CAPABILITIES.USER_CONFIG_WRITE,
  '/api/signal/promote': CAPABILITIES.SIGNAL_PROMOTE,
  '/api/combined-analysis/promote': CAPABILITIES.SIGNAL_PROMOTE,
  '/api/combined-analysis/paper-cycle': CAPABILITIES.PAPER_OPERATE,
  '/api/bot/cycle': CAPABILITIES.PAPER_OPERATE,
  '/api/bot/sell': CAPABILITIES.PAPER_OPERATE,
  '/api/kill-switch': CAPABILITIES.SAFETY_CONTROL,
  '/api/auth/session/reauth': CAPABILITIES.STATUS_READ,
});

function normalizeRole(value, fallback = null) {
  const normalized = String(value || '').trim().toLowerCase();
  if (VALID_ROLES.includes(normalized)) return normalized;
  return fallback && VALID_ROLES.includes(fallback) ? fallback : null;
}

function capabilitiesForRole(role) {
  const normalized = normalizeRole(role);
  return normalized ? [...ROLE_CAPABILITIES[normalized]] : [];
}

function normalizeCapabilities(values = []) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values
    .map((value) => String(value || '').trim())
    .filter((value) => ALL_CAPABILITIES.includes(value)))];
}

function buildPrincipal({
  id = null,
  identityType = 'anonymous',
  role = null,
  capabilities = null,
  authenticated = false,
  source = 'none',
  sessionId = null,
  actingUserId = null,
} = {}) {
  const normalizedRole = normalizeRole(role);
  const effectiveCapabilities = capabilities === null
    ? capabilitiesForRole(normalizedRole)
    : normalizeCapabilities(capabilities);
  return Object.freeze({
    id: id ? String(id) : null,
    identity_type: String(identityType || 'anonymous'),
    role: normalizedRole,
    capabilities: Object.freeze(effectiveCapabilities),
    authenticated: authenticated === true,
    source: String(source || 'none'),
    session_id: sessionId ? String(sessionId) : null,
    acting_user_id: actingUserId ? String(actingUserId) : null,
  });
}

function requiredCapabilities({
  method = 'GET',
  pathname = '/',
  hasClientToken = false,
  hasPrivilegedOverride = false,
  query = {},
} = {}) {
  const normalizedMethod = String(method || 'GET').toUpperCase();
  const route = String(pathname || '/');

  if (hasPrivilegedOverride) {
    return [CAPABILITIES.LOCAL_FILE_OVERRIDE];
  }

  if (normalizedMethod !== 'GET' && normalizedMethod !== 'HEAD') {
    if (route === '/api/bot/cycle' && String(query.live || '').toLowerCase() === 'true') {
      return [CAPABILITIES.PAPER_OPERATE, CAPABILITIES.LIVE_EXECUTE];
    }
    return [MUTATION_CAPABILITIES[route] || CAPABILITIES.HOST_MANAGE];
  }

  if (route === '/api/kill-switch') {
    const command = String(query.command || 'status').trim().toLowerCase();
    return [
      command === 'status'
        ? CAPABILITIES.STATUS_READ
        : CAPABILITIES.SAFETY_CONTROL,
    ];
  }

  if (PROTECTED_GET_CAPABILITIES[route]) {
    return [PROTECTED_GET_CAPABILITIES[route]];
  }

  if (PUBLIC_GET_ROUTES.has(route)) return [];

  // Unknown API reads fail closed. Static assets never reach this policy with
  // an /api prefix and remain publicly reachable for the login shell.
  if (route === '/api' || route.startsWith('/api/')) {
    return [CAPABILITIES.STATUS_READ];
  }

  // Non-API static assets retain public behavior.
  return [];
}

function authorize(principal, capabilities = []) {
  const requested = Array.isArray(capabilities)
    ? [...new Set(capabilities.map((value) => String(value || '').trim()).filter(Boolean))]
    : [];
  const required = normalizeCapabilities(capabilities);
  const unknown = requested.filter((capability) => !ALL_CAPABILITIES.includes(capability));
  if (unknown.length > 0) {
    return {
      allowed: false,
      authenticated: Boolean(principal && principal.authenticated),
      reason: 'invalid_capability_policy',
      required,
      missing: unknown,
    };
  }
  if (required.length === 0) {
    return {
      allowed: true,
      authenticated: Boolean(principal && principal.authenticated),
      reason: 'public',
      required,
      missing: [],
    };
  }
  if (!principal || principal.authenticated !== true) {
    return {
      allowed: false,
      authenticated: false,
      reason: 'authentication_required',
      required,
      missing: required,
    };
  }
  const granted = new Set(normalizeCapabilities(principal.capabilities));
  const missing = required.filter((capability) => !granted.has(capability));
  return {
    allowed: missing.length === 0,
    authenticated: true,
    reason: missing.length === 0 ? 'authorized' : 'insufficient_capability',
    required,
    missing,
  };
}

module.exports = {
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
  capabilitiesForRole,
  normalizeCapabilities,
  normalizeRole,
  requiredCapabilities,
};
