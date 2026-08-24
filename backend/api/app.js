const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { URL } = require('node:url');

// --- gemini-work: Anti-crash foundation ---
process.on('uncaughtException', (err) => {
  console.error('CRITICAL: Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
});
// ------------------------------------------

const { requestLogger } = require('./server/middleware/logger');
const {
  backendUniverse,
  backendDataSummary,
  backendStatus,
} = require('./server/services/cli_executor');
const ROUTES = require('./server/routes');
const {
  hasValidMcpGateToken,
  isMcpRequest,
  isMcpAllowed,
  redactDeep,
} = require('../../shared/lib/mcp/gate');
const {
  CLIENT_ROUTE_CAPABILITIES,
  CAPABILITIES,
  PROTECTED_GET_CAPABILITIES,
  authorize,
  requiredCapabilities,
} = require('../../shared/lib/auth/access_policy');
const {
  resolvePrincipal,
  resolveSocketPrincipal,
} = require('./server/services/access_control');
const {
  authSessionRegistry,
  requestNetworkContext,
} = require('./server/services/auth_session_registry');

const REPO_ROOT = path.resolve(__dirname, '../..');
const WEB_PUBLIC_ROOT = path.join(REPO_ROOT, 'Frontend', 'dashboard', 'dist');
const INDEX_PATH = path.join(WEB_PUBLIC_ROOT, 'index.html');
const PORT = Number.parseInt(process.env.SOVEREIGN_WEB_PORT || process.env.PORT || '8787', 10);
const HOST = process.env.SOVEREIGN_WEB_HOST || '127.0.0.1';
const MAX_BODY_BYTES = Number.parseInt(process.env.SOVEREIGN_API_MAX_BODY_BYTES || '1048576', 10);

// --- SECURITY MEASURES ---
const CLIENT_TOKEN = process.env.SOVEREIGN_CLIENT_TOKEN || '';
const CONFIGURED_ORIGINS = String(process.env.SOVEREIGN_ALLOWED_ORIGINS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const ALLOWED_ORIGINS = [
  `http://${HOST}:${PORT}`, 
  `http://localhost:${PORT}`,
  'http://localhost:3000', // Dev server
  'http://127.0.0.1:3000',
  ...CONFIGURED_ORIGINS,
];

const RATE_LIMITS = new Map(); // Simple IP-based rate limiting
const LIMIT_WINDOW_MS = 60000;
const MAX_REQ_PER_WINDOW = 600; // Increased to 600/min (10 req/s) for heavy dashboard use

// Purge stale entries every 5 min to prevent unbounded Map growth under diverse IPs
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of RATE_LIMITS) {
    if (now - data.start > LIMIT_WINDOW_MS) {
      RATE_LIMITS.delete(ip);
    }
  }
}, 5 * 60 * 1000).unref();

const CLIENT_GET_ROUTES = new Set(Object.keys(CLIENT_ROUTE_CAPABILITIES));
const STRICT_CLIENT_GET_ROUTES = new Set([
  '/api/bias',
  '/api/client/status',
]);

// GET routes that require a token even though they are read-only.
const PROTECTED_GET_ROUTES = new Set(Object.keys(PROTECTED_GET_CAPABILITIES));
if (CLIENT_TOKEN) {
  for (const route of CLIENT_GET_ROUTES) PROTECTED_GET_ROUTES.add(route);
}

function isAllowedOrigin(origin, req) {
  if (!origin || ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    const parsed = new URL(origin);
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.host === req.headers.host;
  } catch (_) {
    return false;
  }
}

function setSecurityHeaders(res, origin, req) {
  let authOrigin = '';
  let wsOrigin = '';
  try {
    const rawUrl = process.env.SOVEREIGN_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
    if (rawUrl) {
      const parsed = new URL(rawUrl);
      authOrigin = parsed.origin;
      wsOrigin = parsed.origin.replace(/^http/, 'ws');
    }
  } catch (_) {
    authOrigin = '';
    wsOrigin = '';
  }
  const connectSources = ["'self'", 'ws:', 'wss:', ...(authOrigin ? [authOrigin, wsOrigin] : [])].filter(Boolean).join(' ');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', `default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src ${connectSources};`);
  if (origin && isAllowedOrigin(origin, req)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Sovereign-Token, Authorization');
  res.setHeader('Access-Control-Max-Age', '600');
}

async function checkSecurity(req, res) {
  const origin = req.headers.origin;
  if (!isAllowedOrigin(origin, req)) {
    console.warn(`[SECURITY] Blocked origin: ${origin}`);
    res.writeHead(403);
    res.end('Forbidden: Origin not allowed');
    return false;
  }

  // Rate Limiting
  const ip = req.socket.remoteAddress;
  const now = Date.now();
  const userData = RATE_LIMITS.get(ip) || { count: 0, start: now };
  if (now - userData.start > LIMIT_WINDOW_MS) {
    userData.count = 1;
    userData.start = now;
  } else {
    userData.count += 1;
  }
  RATE_LIMITS.set(ip, userData);

  if (userData.count > MAX_REQ_PER_WINDOW) {
    console.warn(`[SECURITY] Rate limit exceeded for IP: ${ip}`);
    res.writeHead(429);
    res.end('Too Many Requests');
    return false;
  }

  // Browser preflights do not include the protected request's API token.
  if (req.method === 'OPTIONS') {
    setSecurityHeaders(res, origin, req);
    res.writeHead(204);
    res.end();
    return false;
  }

  // MCP headers opt a request into stricter route policy. When an MCP gate token is
  // configured, header-detected requests must also prove that token; headers alone
  // are never an authority signal.
  const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
  const mcpRequest = isMcpRequest(req);
  if (mcpRequest && process.env.MCP_GATE_TOKEN && !hasValidMcpGateToken(req)) {
    console.warn(`[MCP-GATE] Rejected unverified agent request to: ${pathname}`);
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'MCP agent authentication required' }));
    return false;
  }
  if (mcpRequest && !isMcpAllowed(pathname)) {
    console.warn(`[MCP-GATE] Blocked agent access to: ${pathname}`);
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'MCP agent access not permitted for this route' }));
    return false;
  }

  // API Token check for data-modifying or sensitive routes
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const privilegedQueryFields = ['input', 'quality_report', 'model_report', 'backtest_report', 'equity'];
  const hasPrivilegedOverride = privilegedQueryFields.some((field) => requestUrl.searchParams.has(field));
  const query = Object.fromEntries(requestUrl.searchParams.entries());
  const required = requiredCapabilities({
    method: req.method,
    pathname,
    hasClientToken: Boolean(CLIENT_TOKEN),
    hasPrivilegedOverride,
    query,
  });
  const principal = await resolvePrincipal(req);
  const decision = authorize(principal, required);
  const network = requestNetworkContext(req);
  const sessionDecision = req.method === 'POST' && pathname === '/api/auth/session/reauth'
    ? authSessionRegistry.approvePending(principal, network)
    : authSessionRegistry.record(principal, network);
  req.sovereignPrincipal = principal;
  req.sovereignAuthorization = decision;
  req.sovereignNetwork = network;
  req.sovereignSessionRisk = sessionDecision;
  if (!sessionDecision.allowed) {
    console.warn(
      `[SECURITY] ip_reauthentication_required principal=${principal.id || 'anonymous'}`
      + ` risk=${sessionDecision.risk.reason}`,
    );
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: false,
      error: 'ip_reauthentication_required',
    }));
    return false;
  }
  if (!decision.allowed) {
    const status = decision.authenticated ? 403 : 401;
    console.warn(
      `[SECURITY] ${decision.reason} from ${ip}`
      + ` principal=${principal.id || 'anonymous'}`
      + ` required=${decision.required.join(',') || 'none'}`,
    );
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: false,
      error: decision.reason,
      required_capabilities: decision.required,
    }));
    return false;
  }

  // Add response hardening and scoped CORS headers
  setSecurityHeaders(res, origin, req);

  return true;
}

function sendJson(res, status, payload, req = null) {
  const safe = req && isMcpRequest(req) ? redactDeep(payload) : payload;
  const body = JSON.stringify(safe, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(body);
}

function sendHtml(res, status, body) {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(body);
}

function contentTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
      return 'application/javascript; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.html':
    default:
      return 'text/html; charset=utf-8';
  }
}

function serveStatic(req, res, url) {
  const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const normalized = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(WEB_PUBLIC_ROOT, normalized);
  if (!filePath.startsWith(WEB_PUBLIC_ROOT)) {
    sendJson(res, 403, { ok: false, error: 'forbidden' });
    return true;
  }
  if (!fs.existsSync(filePath)) {
    return false;
  }
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    return false;
  }
  res.writeHead(200, {
    'content-type': contentTypeFor(filePath),
    'cache-control': 'no-store',
  });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

function queryObject(url) {
  return Object.fromEntries(url.searchParams.entries());
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let bytes = 0;
    let exceeded = false;
    req.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        exceeded = true;
        return;
      }
      raw += chunk;
    });
    req.on('end', () => {
      if (exceeded) {
        const error = new Error('request_body_too_large');
        error.statusCode = 413;
        reject(error);
        return;
      }
      try { resolve(JSON.parse(raw)); } catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

async function handleApi(req, res, url) {
  const query = queryObject(url);
  // Merge JSON body into query for POST routes
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    const body = await readBody(req);
    Object.assign(query, body);
  }
  const route = ROUTES[url.pathname];
  if (route) {
    const payload = await route.handle(query, { req, res, url });
    sendJson(res, route.status(payload), payload, req);
    return true;
  }
  return false;
}

const server = http.createServer(async (req, res) => {
  requestLogger(req, res);
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  
  if (!(await checkSecurity(req, res))) {
    return;
  }

  handleApi(req, res, url)
    .then((handled) => {
      if (handled) {
        return;
      }
      if (serveStatic(req, res, url)) {
        return;
      }
      sendJson(res, 404, { ok: false, error: 'not_found' });
    })
    .catch((error) => {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    });
});

let io = {
  emit: () => {},
  use: () => {},
  on: () => {},
};

try {
  const { Server } = require('socket.io');

  io = new Server(server, {
    cors: {
      origin: true,
      methods: ['GET', 'POST']
    },
    allowRequest: (req, callback) => callback(null, isAllowedOrigin(req.headers.origin, req)),
  });

  io.use(async (socket, next) => {
    try {
      const principal = await resolveSocketPrincipal(socket);
      const decision = authorize(principal, [CAPABILITIES.STATUS_READ]);
      if (!decision.allowed) {
        const error = new Error(decision.reason);
        error.data = {
          code: decision.reason,
          required_capabilities: decision.required,
        };
        next(error);
        return;
      }
      const network = requestNetworkContext(socket.request);
      const sessionDecision = authSessionRegistry.record(principal, network);
      if (!sessionDecision.allowed) {
        const error = new Error('ip_reauthentication_required');
        error.data = { code: 'ip_reauthentication_required' };
        next(error);
        return;
      }
      socket.data.sovereignPrincipal = principal;
      socket.data.sovereignNetwork = network;
      next();
    } catch (_) {
      const error = new Error('authentication_required');
      error.data = { code: 'authentication_required' };
      next(error);
    }
  });

  io.on('connection', (socket) => {
    console.log(`[TELEMETRY] Client connected: ${socket.id}`);
    socket.emit('status', { msg: 'Connected to Sovereign Telemetry', timestamp: new Date().toISOString() });

    socket.on('disconnect', () => {
      console.log(`[TELEMETRY] Client disconnected: ${socket.id}`);
    });
  });
} catch (_) {}

// Watch snapshot for real-time market data streaming
const { DEFAULT_SNAPSHOT } = require('./server/services/cli_executor');
if (fs.existsSync(DEFAULT_SNAPSHOT)) {
  fs.watchFile(DEFAULT_SNAPSHOT, { interval: 1000 }, (curr, prev) => {
    if (curr.mtime > prev.mtime) {
      console.log('[TELEMETRY] Emitting real-time market data update');
      const universe = backendUniverse({});
      const dataSummary = backendDataSummary({});
      const status = backendStatus({});
      io.emit('market_data', { universe, dataSummary, status });
    }
  });
}

// Global emitter helper
global.sovereignIo = io;

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`Sovereign web API listening on http://${HOST}:${PORT}`);
    console.log(`[TELEMETRY] WebSocket server active`);
  });
}

module.exports = {
  server,
  io,
  CLIENT_GET_ROUTES,
  DEFAULT_SNAPSHOT,
  PROTECTED_GET_ROUTES,
  STRICT_CLIENT_GET_ROUTES,
  checkSecurity,
};
