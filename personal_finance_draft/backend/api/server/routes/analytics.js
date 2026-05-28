const { backendStats } = require('../services/cli_executor');

module.exports = {
  path: '/api/analytics',
  status: (payload) => (payload && payload.ok !== false ? 200 : 503),
  handle: (query = {}) => {
    const stats = backendStats(query);
    return {
      ok: stats.ok !== false,
      type: 'analytics_summary',
      stats,
    };
  },
};
