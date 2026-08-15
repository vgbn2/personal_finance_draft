'use strict';

const { readPublicArtifact } = require('../../services/public_artifact_publisher');

module.exports = {
  path: '/api/public/freshness',
  status(res) {
    if (res && res.status_code) return res.status_code;
    if (res && res.ok) return 200;
    return 503;
  },
  async handle() {
    return readPublicArtifact('public_freshness_status');
  },
};
