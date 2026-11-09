'use strict';

const { dockerImages, dockerPs, dockerLogs } = require('../../services/infra_service');

module.exports = {
  path: '/api/system/infra',
  status: (payload) => (payload?.error && payload?.error !== 'docker_unavailable' ? 500 : 200),
  handle: (query = {}) => {
    const resource = query.resource || 'images';

    if (resource === 'images') {
      const images = dockerImages();
      if (images && images.error) {
        return {
          ok: false,
          images: [],
          containers: [],
          error: images.error,
          containerized: images.containerized || false,
        };
      }
      return { ok: true, images, containers: dockerPs() };
    }
    if (resource === 'logs') {
      const logs = dockerLogs(query.container, query.lines);
      if (logs && logs.error) {
        return { ok: false, error: logs.error };
      }
      return { ok: true, logs };
    }
    return { error: `unknown resource: ${resource}` };
  },
};
