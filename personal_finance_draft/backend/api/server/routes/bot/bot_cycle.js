const { botCycle } = require('../../services/cli_executor');

module.exports = {
  path: '/api/bot/cycle',
  status: (payload) => (payload && payload.ok !== false ? 200 : 503),
  handle: (query = {}, ctx = {}) => {
    if (ctx.req && ctx.req.method !== 'POST') return { ok: false, error: 'POST only' };
    return botCycle(query);
  },
};

