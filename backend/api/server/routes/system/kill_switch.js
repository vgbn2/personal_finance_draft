const { backendKillSwitch } = require('../../services/cli_executor');
const { verifyPin } = require('../../../../cli/lib/auth.js');

module.exports = {
  path: '/api/kill-switch',
  status: (payload) => (payload && payload.ok !== false ? 200 : 503),
  handle: (query = {}, ctx = {}) => {
    const cmd = String(query.command || 'status').toLowerCase();
    if (cmd !== 'status') {
      if (ctx.req && ctx.req.method !== 'POST') {
        return { ok: false, error: 'POST required for kill switch mutations' };
      }
      const expectedPin = process.env.SOVEREIGN_TRADE_PIN;
      if (expectedPin) {
        const pin = String(query.pin || (ctx.body && ctx.body.pin) || (ctx.req && ctx.req.headers && ctx.req.headers['x-trade-pin']) || '');
        if (!verifyPin(pin, expectedPin)) {
          return { ok: false, error: 'Unauthorized: valid Trade PIN required for kill switch mutations' };
        }
      }
    }
    return backendKillSwitch(query.command || 'status');
  },
};

