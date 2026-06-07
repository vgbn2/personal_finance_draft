const { backendDataSummary } = require('../../services/cli_executor');

module.exports = {
  path: '/api/data/summary',
  status: (payload) => (payload && payload.available !== false && payload.ok !== false ? 200 : 503),
  handle: (query = {}) => backendDataSummary(query),
};

