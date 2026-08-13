const crypto = require('node:crypto');

const BLOCKED_ROUTES = [
  '/api/auth',
  '/api/supabase/config',
  '/api/kill-switch',
  '/api/config',
  '/api/cache/list',
  '/api/database/status',
];

// MCP use is intentionally limited to bounded, non-mutating research/data reads.
const ALLOWED_ROUTES = [
  '/api/system/status',
  '/api/data/summary',
  '/api/market/monitor',
  '/api/quotes/status',
  '/api/backtest',
  '/api/correlation',
  '/api/indicators',
  '/api/scorecard',
  '/api/universe',
  '/api/analytics',
];

const REDACT_KEYS = /(password|token|secret|credential|api_key|auth|private|seed|vault)/i;

function matchesRoute(pathname, route) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

function constantTimeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length > 0
    && leftBuffer.length === rightBuffer.length
    && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

// Headers are only a compatibility hint that opts a request into stricter MCP policy.
// They never create an authenticated principal or grant any capabilities.
function isMcpRequest(req) {
  if (!req || !req.headers) return false;
  return hasValidMcpGateToken(req)
    || req.headers['x-mcp-agent'] === '1'
    || req.headers['x-mcp-client'] != null
    || String(req.headers['user-agent'] || '').toLowerCase().includes('mcp-');
}

function hasValidMcpGateToken(req, token = process.env.MCP_GATE_TOKEN || '') {
  if (!token || !req || !req.headers) return false;
  return constantTimeEqual(req.headers['x-mcp-token'], token);
}

function isMcpAllowed(pathname = '') {
  if (BLOCKED_ROUTES.some((route) => matchesRoute(pathname, route))) return false;
  return ALLOWED_ROUTES.some((route) => matchesRoute(pathname, route));
}

function redactDeep(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => redactDeep(entry));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  const output = {};
  for (const [key, entry] of Object.entries(value)) {
    output[key] = REDACT_KEYS.test(key) ? '[REDACTED]' : redactDeep(entry);
  }
  return output;
}

module.exports = {
  ALLOWED_ROUTES,
  BLOCKED_ROUTES,
  hasValidMcpGateToken,
  isMcpRequest,
  isMcpAllowed,
  redactDeep,
};
