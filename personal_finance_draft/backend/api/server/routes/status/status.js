const { backendStatus } = require('../../services/cli_executor');

module.exports = {
  path: '/api/status',
  status: (payload) => (payload && payload.available !== false && payload.ok !== false ? 200 : 503),
  handle: (query = {}) => backendStatus(query),
};

