'use strict';

function requestLogger(req, res, next) {
  const startedAt = Date.now();

  res.on('finish', () => {
    try {
      const elapsedMs = Date.now() - startedAt;
      const url = req.url || '/';
      const isHealthCheck = url === '/health' || url.startsWith('/health?');
      const isDebug = process.env.SOVEREIGN_DEBUG === 'true' || process.env.SOVEREIGN_LOG_HEALTH_CHECKS === 'true';

      // Suppress routine health check logs unless debug mode is enabled or status code indicates error
      if (isHealthCheck && res.statusCode < 400 && !isDebug) {
        return;
      }

      if (res.statusCode >= 400) {
        console.warn(`[web] [ERROR] ${req.method} ${url} -> ${res.statusCode} (${elapsedMs}ms)`);
      } else {
        console.log(`[web] ${req.method} ${url} -> ${res.statusCode} (${elapsedMs}ms)`);
      }
    } catch (err) {
      // Safety guard: logger middleware must never crash server loop
      console.error('[web] [LOGGER ERROR]', err);
    }
  });

  if (typeof next === 'function') {
    return next();
  }
}

module.exports = { requestLogger };
