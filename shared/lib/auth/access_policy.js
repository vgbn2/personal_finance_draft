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
  '/api/status',
  '/api/data/summary',
  '/api/analytics',
  '/api/auth/status',
  '/api/backtest',
  '/api/correlation',
  '/api/backend/stats',
  '/api/universe',
  '/api/cache/universe',
  '/api/indicators',
  '/api/quotes/status',
  '/api/signal',
  '/api/supabase/config',
  '/api/system/status',
  '/api/strategies',
  '/api/sigma-band',
  '/api/run/status',
]);

const CLIENT_ROUTE_CAPABILITIES = Object.freeze({
  '/api/bias': CAPABILITIES.RESEARCH_READ,
  '/api/bot/status': CAPABILITIES.STATUS_READ,
  '/api/client/status': CAPABILITIES.STATUS_READ,
  '/api/data/summary': CAPABILITIES.DATA_READ,
  '/api/market/monitor': CAPABILITIES.DATA_READ,
  '/api/scorecard': CAPABILITIES.RESEARCH_READ,
  '/api/signal': CAPABILITIES.RESEARCH_READ,
  '/api/universe': CAPABILITIES.DATA_READ,
});

const PROTECTED_GET_CAPABILITIES = Object.freeze({
  '/api/backend/portfolio': CAPABILITIES.PORTFOLIO_READ,
  '/api/cache/list': CAPABILITIES.HOST_INSPECT,
  '/api/config': CAPABILITIES.USER_CONFIG_READ,
  '/api/database/status': CAPABILITIES.USER_CONFIG_READ,
  '/api/bot/status': CAPABILITIES.STATUS_READ,
  '/api/bias': CAPABILITIES.RESEARCH_READ,
  '/api/client/status': CAPABILITIES.STATUS_READ,
  '/api/kill-switch': CAPABILITIES.STATUS_READ,
  '/api/market/monitor': CAPABILITIES.DATA_READ,
  '/api/scorecard': CAPABILITIES.RESEARCH_READ,
});

const MUTATION_CAPABILITIES = Object.freeze({
  '/api/config': CAPABILITIES.USER_CONFIG_WRITE,
  '/api/signal/promote': CAPABILITIES.SIGNAL_PROMOTE,
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

  if (hasClientToken && CLIENT_ROUTE_CAPABILITIES[route]) {
    return [CLIENT_ROUTE_CAPABILITIES[route]];
  }

  if (PUBLIC_GET_ROUTES.has(route)) return [];

  // Static assets and unknown GET routes retain the current public/404 behavior.
  // Registered API routes are contract-tested so a new route cannot silently
  // bypass classification.
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
