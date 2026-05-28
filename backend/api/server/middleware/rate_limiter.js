function createRateLimiter({ limit = 60, windowMs = 60_000 } = {}) {
  const hits = new Map();
  return function rateLimiter(req, res, next) {
    const key = req.socket?.remoteAddress || 'local';
    const now = Date.now();
    const entry = hits.get(key) || { count: 0, windowStart: now };
    if (now - entry.windowStart > windowMs) {
      entry.count = 0;
      entry.windowStart = now;
    }
    entry.count += 1;
    hits.set(key, entry);
    if (entry.count > limit) {
      res.statusCode = 429;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: false, error: 'rate_limited' }));
      return;
    }
    return next();
  };
}

module.exports = { createRateLimiter };
