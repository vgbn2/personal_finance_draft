const { backendPortfolio } = require('../../services/cli_executor');

module.exports = {
  path: '/api/backend/portfolio',
  status: (payload) => (payload && payload.ok !== false ? 200 : 503),
  handle: (query = {}) => backendPortfolio(query),
};

