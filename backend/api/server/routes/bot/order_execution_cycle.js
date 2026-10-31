const { botCycle } = require('../../services/cli_executor');
const { CAPABILITIES, authorize } = require('../../../../../shared/lib/auth/access_policy');
const { verifyPin } = require('../../../../cli/lib/auth.js');

module.exports = {
  path: '/api/bot/cycle',
  status: (payload) => {
    if (payload && payload.error === 'insufficient_live_execution_capability') return 403;
    if (payload && payload.error && payload.error.startsWith('Unauthorized:')) return 401;
    return payload && payload.ok !== false ? 200 : 503;
  },
  handle: (query = {}, ctx = {}) => {
    if (ctx.req && ctx.req.method !== 'POST') return { ok: false, error: 'POST only' };
    if (String(query.live || '').toLowerCase() === 'true') {
      const decision = authorize(ctx.req && ctx.req.sovereignPrincipal, [CAPABILITIES.LIVE_EXECUTE]);
      if (!decision.allowed) {
        return {
          ok: false,
          error: 'insufficient_live_execution_capability',
          required_capabilities: [CAPABILITIES.LIVE_EXECUTE],
        };
      }
      const expectedPin = process.env.SOVEREIGN_TRADE_PIN;
      if (expectedPin) {
        const pin = String(query.pin || (ctx.body && ctx.body.pin) || (ctx.req && ctx.req.headers && ctx.req.headers['x-trade-pin']) || '');
        if (!verifyPin(pin, expectedPin)) {
          return { ok: false, error: 'Unauthorized: valid Trade PIN required for live bot cycle execution' };
        }
      }
    }
    return botCycle(query);
  },
};
