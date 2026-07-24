'use strict';

const { buildCachedBias } = require('../../services/client_snapshot');

module.exports = {
  path: '/api/bias',
  status: (payload) => {
    if (payload?.error_code === 'invalid_symbol') return 400;
    return payload && payload.ok !== false ? 200 : 503;
  },
  handle: (query = {}) => buildCachedBias(query),
};
