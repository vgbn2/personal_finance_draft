'use strict';

const { dockerImages, dockerPs, dockerLogs } = require('../../services/infra_service');

module.exports = {
  path: '/api/system/infra',
  status: (payload) => (payload?.error ? 500 : 200),
  handle: (query = {}) => {
    const resource = query.resource || 'images';

    if (resource === 'images') {
      return { ok: true, images: dockerImages(), containers: dockerPs() };
    }
    if (resource === 'logs') {
      return { ok: true, logs: dockerLogs(query.container, query.lines) };
    }
    return { error: `unknown resource: ${resource}` };
  },
};
