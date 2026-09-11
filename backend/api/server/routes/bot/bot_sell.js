const { botSell } = require('../../services/cli_executor');
const { verifyPin } = require('../../../../cli/lib/auth.js');

module.exports = {
  path: '/api/bot/sell',
  status: (payload) => (payload && payload.ok !== false ? 200 : 503),
  handle: (query = {}, ctx = {}) => {
    if (ctx.req && ctx.req.method !== 'POST') return { ok: false, error: 'POST only' };
    const expectedPin = process.env.SOVEREIGN_TRADE_PIN;
    if (expectedPin) {
      const pin = String(query.pin || (ctx.body && ctx.body.pin) || (ctx.req && ctx.req.headers && ctx.req.headers['x-trade-pin']) || '');
      if (!verifyPin(pin, expectedPin)) {
        return { ok: false, error: 'Unauthorized: valid Trade PIN required for bot sell execution' };
      }
    }
    return botSell(query);
  },
};

