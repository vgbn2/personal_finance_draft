const { quoteSources } = require('../../services/cli_executor');

module.exports = {
  path: '/api/quotes/status',
  status: (payload) => (payload && payload.type === 'quote_sources' ? 200 : (payload && payload.available !== false && payload.ok !== false ? 200 : 503)),
  handle: (query = {}) => quoteSources(query),
};

