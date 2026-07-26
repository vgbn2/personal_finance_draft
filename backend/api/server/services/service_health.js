'use strict';

const { readServiceHeartbeats } = require('../../../../shared/lib/runtime/service_heartbeat.js');

function buildServiceHealth(options = {}) {
  return {
    ok: true,
    type: 'service_health',
    ...readServiceHeartbeats(options),
  };
}

module.exports = { buildServiceHealth };
