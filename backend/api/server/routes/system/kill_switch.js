const { backendKillSwitch } = require('../../services/cli_executor');

module.exports = {
  path: '/api/kill-switch',
  status: (payload) => (payload && payload.ok !== false ? 200 : 503),
  handle: (query = {}, ctx = {}) => {
    const cmd = String(query.command || 'status').toLowerCase();
    if (cmd !== 'status' && ctx.req && ctx.req.method !== 'POST') {
      return { ok: false, error: 'POST required for kill switch mutations' };
    }
    return backendKillSwitch(query.command || 'status');
  },
};

