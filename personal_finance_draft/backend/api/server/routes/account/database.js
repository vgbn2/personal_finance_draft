const { getDatabaseStatus } = require('../../services/supabase_client');

module.exports = {
  path: '/api/database/status',
  status: (payload) => (payload.ok ? 200 : payload.configured ? 401 : 503),
  handle: (_query, context) => getDatabaseStatus(context.req),
};

