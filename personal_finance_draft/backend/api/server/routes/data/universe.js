const { backendUniverse } = require('../../services/cli_executor');

module.exports = {
  status: (payload) => (payload && payload.available !== false && payload.ok !== false ? 200 : 503),
  handle: (query = {}) => backendUniverse(query),
};

