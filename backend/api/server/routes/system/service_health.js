'use strict';

const { buildServiceHealth } = require('../../services/service_health.js');

module.exports = {
  path: '/api/system/service-health',
  status: (payload) => (payload && payload.ok === true ? 200 : 503),
  handle: () => buildServiceHealth(),
};
