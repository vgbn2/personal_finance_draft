'use strict';

const { buildClientStatus } = require('../../services/client_snapshot');

module.exports = {
  path: '/api/client/status',
  status: (payload) => (payload && payload.ok !== false ? 200 : 503),
  handle: (query = {}) => buildClientStatus(query),
};
