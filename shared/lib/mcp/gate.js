const BLOCKED_ROUTES = [
  '/api/auth',
  '/api/supabase/config',
  '/api/kill-switch',
  '/api/config',
  '/api/cache/list',
  '/api/database/status',
];

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
  '/api/backend/portfolio',
  '/api/analytics',
];

const REDACT_KEYS = /(password|token|secret|credential|api_key|auth|private|seed|vault)/i;
const MCP_GATE_TOKEN = process.env.MCP_GATE_TOKEN || '';

function matchesRoute(pathname, route) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

function isMcpRequest(req) {
  if (!req || !req.headers) return false;
  if (MCP_GATE_TOKEN && req.headers['x-mcp-token'] === MCP_GATE_TOKEN) return true;

  return req.headers['x-mcp-agent'] === '1' ||
    req.headers['x-mcp-client'] != null ||
    String(req.headers['user-agent'] || '').toLowerCase().includes('mcp-');
}

function isMcpAllowed(pathname = '') {
  if (BLOCKED_ROUTES.some((route) => matchesRoute(pathname, route))) return false;
  if (ALLOWED_ROUTES.some((route) => matchesRoute(pathname, route))) return true;
  return true;
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
  isMcpRequest,
  isMcpAllowed,
  redactDeep,
};
