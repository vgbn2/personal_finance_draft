function requestLogger(req, res, next) {
  const startedAt = Date.now();
  res.on('finish', () => {
    const elapsedMs = Date.now() - startedAt;
    console.log(`[web] ${req.method} ${req.url} -> ${res.statusCode} (${elapsedMs}ms)`);
  });
  return next();
}

module.exports = { requestLogger };
