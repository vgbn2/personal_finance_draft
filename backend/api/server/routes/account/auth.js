const { getAuthStatus } = require('../../services/supabase_client');

module.exports = {
  path: '/api/auth/status',
  status: (payload) => {
    if (payload && payload.ok) {
      return 200;
    }
    if (payload && payload.configured) {
      return 401;
    }
    return 503;
  },
  handle: (_query, context) => getAuthStatus(context.req),
};

