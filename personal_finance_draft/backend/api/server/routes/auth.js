const { getAuthStatus } = require('../services/supabase_client');

module.exports = {
  path: '/api/auth/status',
  status: (payload) => (payload.ok ? 200 : payload.configured ? 401 : 503),
  handle: (_query, context) => getAuthStatus(context.req),
};
