'use strict';

const {
  createDefaultMarketMonitorService,
} = require('../../../../../shared/lib/market/monitor_service.js');

const defaultService = createDefaultMarketMonitorService();

function createMarketMonitorRoute(service = defaultService) {
  return {
    path: '/api/market/monitor',
    status(payload) {
      if (payload && payload.ok === true) return 200;
      return payload && String(payload.error_code || '').startsWith('invalid_') ? 400 : 503;
    },
    handle(query = {}) {
      return service.query(query);
    },
  };
}

module.exports = Object.assign(createMarketMonitorRoute(), {
  createMarketMonitorRoute,
});
