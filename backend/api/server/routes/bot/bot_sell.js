const { botSell } = require('../../services/cli_executor');

module.exports = {
  path: '/api/bot/sell',
  status: (payload) => (payload && payload.ok !== false ? 200 : 503),
  handle: (query = {}, ctx = {}) => {
    if (ctx.req && ctx.req.method !== 'POST') return { ok: false, error: 'POST only' };
    return botSell(query);
  },
};

