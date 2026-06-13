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

const {
  backendUniverse,
  backendDataSummary,
} = require('./server/services/cli_executor');
const ROUTES = require('./server/routes');
const { isMcpRequest, isMcpAllowed, redactDeep } = require('../../shared/lib/mcp/gate');

const REPO_ROOT = path.resolve(__dirname, '../..');
const WEB_PUBLIC_ROOT = path.join(REPO_ROOT, 'Frontend', 'dashboard', 'dist');
const INDEX_PATH = path.join(WEB_PUBLIC_ROOT, 'index.html');
const PORT = Number.parseInt(process.env.SOVEREIGN_WEB_PORT || process.env.PORT || '8787', 10);
const HOST = process.env.SOVEREIGN_WEB_HOST || '127.0.0.1';

// --- SECURITY MEASURES ---
const API_TOKEN = process.env.SOVEREIGN_API_TOKEN || '';
const ALLOWED_ORIGINS = [
  `http://${HOST}:${PORT}`, 
  `http://localhost:${PORT}`,
  'http://localhost:3000', // Dev server
  'http://127.0.0.1:3000'
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

// GET routes that require a token even though they are read-only
const PROTECTED_GET_ROUTES = new Set([
  '/api/backend/portfolio',
  '/api/cache/list',
  '/api/config',
  '/api/bot/status',
  '/api/kill-switch',
]);

function setSecurityHeaders(res, origin) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' https:;");
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
}

function checkSecurity(req, res) {
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
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

  // MCP agent gate — block sensitive routes before token check
  const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
  if (isMcpRequest(req) && !isMcpAllowed(pathname)) {
    console.warn(`[MCP-GATE] Blocked agent access to: ${pathname}`);
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'MCP agent access not permitted for this route' }));
    return false;
  }

  // API Token check for data-modifying or sensitive routes
  const token = req.headers['x-sovereign-token'];
  const isPublicRoute = [
    '/',
    '/index.html',
    '/health',
    '/api/status',
    '/api/signal',
    '/api/data/summary',
    '/api/correlation',
    '/api/backend/stats',
    '/api/universe',
    '/api/cache/universe', // New public alias
    '/api/indicators',     // New public endpoint
    '/api/quotes/status'
  ].includes(pathname);
  if (!isPublicRoute && (req.method !== 'GET' || PROTECTED_GET_ROUTES.has(pathname))) {
    if (!API_TOKEN || token !== API_TOKEN) {
      console.warn(`[SECURITY] Missing or invalid API token from ${ip}`);
      res.writeHead(401);
      res.end('Unauthorized: API Token Required');
      return false;
    }
  }

  // Add response hardening and scoped CORS headers
  setSecurityHeaders(res, origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Sovereign-Token, Authorization');
  res.setHeader('Access-Control-Max-Age', '600');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return false;
  }

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
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(raw)); } catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
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

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  
  if (!checkSecurity(req, res)) {
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
      sendJson(res, 500, { ok: false, error: error.message });
    });
});

const { Server } = require('socket.io');

const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST']
  }
});

io.on('connection', (socket) => {
  console.log(`[TELEMETRY] Client connected: ${socket.id}`);
  socket.emit('status', { msg: 'Connected to Sovereign Telemetry', timestamp: new Date().toISOString() });
  
  socket.on('disconnect', () => {
    console.log(`[TELEMETRY] Client disconnected: ${socket.id}`);
  });
});

// Watch snapshot for real-time market data streaming
const { DEFAULT_SNAPSHOT } = require('./server/services/cli_executor');
if (fs.existsSync(DEFAULT_SNAPSHOT)) {
  fs.watchFile(DEFAULT_SNAPSHOT, { interval: 1000 }, (curr, prev) => {
    if (curr.mtime > prev.mtime) {
      console.log('[TELEMETRY] Emitting real-time market data update');
      const universe = backendUniverse({});
      const dataSummary = backendDataSummary({});
      io.emit('market_data', { universe, dataSummary });
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

module.exports = { server, io, DEFAULT_SNAPSHOT };
