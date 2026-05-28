module.exports = {
  path: '/health',
  status: () => 200,
  handle: () => ({ ok: true, service: 'sovereign-web' }),
};
