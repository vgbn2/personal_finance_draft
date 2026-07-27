const { backendCombinedResearch } = require('../../services/cli_executor');

module.exports = {
  path: '/api/combined-analysis',
  status: (payload) => (
    payload && payload.type === 'combined_research'
      ? 200
      : 503
  ),
  handle: (query = {}) => backendCombinedResearch(query),
};
