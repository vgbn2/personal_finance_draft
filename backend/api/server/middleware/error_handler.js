function errorHandler(err, req, res, next) {
  if (!err) {
    return next();
  }
  if (res.headersSent) {
    return next(err);
  }
  res.statusCode = 500;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({
    ok: false,
    error: err.message || 'internal_error',
    path: req?.url || null,
  }));
}

module.exports = { errorHandler };
