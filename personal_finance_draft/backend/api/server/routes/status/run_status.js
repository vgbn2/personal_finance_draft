'use strict';

const { getStatus } = require('../../../../../shared/lib/runtime/run_loop.js');

module.exports = {
  path: '/api/run/status',
  status: (payload) => (payload && payload.ok !== false ? 200 : 503),
  handle: () => {
    const loops = getStatus();
    return { ok: true, loops };
  },
};

