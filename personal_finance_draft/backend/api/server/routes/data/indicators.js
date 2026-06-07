const { backendIndicators } = require('../../services/cli_executor');

module.exports = {
  path: '/api/indicators',
  status: (payload) => (payload && payload.available !== false && payload.ok !== false ? 200 : 503),
  handle: (query = {}) => backendIndicators(query),
};

