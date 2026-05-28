const {
  isConfigured,
} = require('../services/supabase_client');
const { cacheStats } = require('../services/ttl_cache');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.SOVEREIGN_SUPABASE_URL || '';
module.exports = {
  path: '/api/supabase/config',
  status: (payload) => (payload.ok ? 200 : 503),
  handle: () => ({
    ok: isConfigured(),
    type: 'supabase_config',
    configured: isConfigured(),
    url: isConfigured() ? SUPABASE_URL : null,
    auth: {
      provider: 'supabase',
      mode: 'browser_client',
    },
    cache: cacheStats(),
  }),
};
