const { botStatus } = require('../../services/cli_executor');

module.exports = {
  path: '/api/bot/status',
  status: (payload) => (payload && payload.ok !== false ? 200 : 503),
  handle: (query = {}) => botStatus(query),
};

