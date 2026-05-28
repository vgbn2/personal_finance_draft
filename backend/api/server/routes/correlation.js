const { backendCorrelation } = require('../services/cli_executor');

module.exports = {
  path: '/api/correlation',
  status: (payload) => (payload && payload.ok !== false ? 200 : 503),
  handle: (query = {}) => backendCorrelation(query),
};
