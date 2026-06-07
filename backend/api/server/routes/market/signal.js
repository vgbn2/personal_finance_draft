const { signalStatus } = require('../../services/cli_executor');

module.exports = {
  path: '/api/signal',
  status: (payload) => (payload && payload.ok !== false ? 200 : 503),
  handle: (query = {}) => signalStatus(query),
};

