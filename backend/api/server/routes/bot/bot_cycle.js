const { botCycle } = require('../../services/cli_executor');
const { CAPABILITIES, authorize } = require('../../../../../shared/lib/auth/access_policy');

module.exports = {
  path: '/api/bot/cycle',
  status: (payload) => {
    if (payload && payload.error === 'insufficient_live_execution_capability') return 403;
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
    }
    return botCycle(query);
  },
};
