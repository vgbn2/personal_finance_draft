const { backendKillSwitch } = require('../services/cli_executor');

module.exports = {
  path: '/api/kill-switch',
  status: (payload) => (payload && payload.ok !== false ? 200 : 503),
  handle: (query = {}) => backendKillSwitch(query.command || 'status'),
};
