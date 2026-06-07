const { backendStats } = require('../../services/cli_executor');

module.exports = {
  path: '/api/backend/stats',
  status: (payload) => (payload && payload.available !== false && payload.ok !== false ? 200 : 503),
  handle: (query = {}) => backendStats(query),
};

