const { backendCacheList } = require('../../services/cli_executor');

module.exports = {
  path: '/api/cache/list',
  status: (payload) => (payload.ok ? 200 : 500),
  handle: () => backendCacheList(),
};

