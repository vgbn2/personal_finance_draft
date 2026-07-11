const { backendScorecard } = require('../../services/cli_executor');

module.exports = {
  path: '/api/scorecard',
  status: (payload) => {
    if (payload && payload.ok !== false) return 200;
    return payload && String(payload.error_code || '').startsWith('invalid_') ? 400 : 503;
  },
  handle: (query = {}) => backendScorecard(query),
};
