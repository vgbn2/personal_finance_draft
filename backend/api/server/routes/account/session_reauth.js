'use strict';

module.exports = {
  path: '/api/auth/session/reauth',
  status: (payload) => (payload && payload.ok ? 200 : 401),
  handle: (_query = {}, { req } = {}) => {
    const decision = req && req.sovereignSessionRisk;
    return {
      ok: Boolean(decision && decision.allowed),
      type: 'session_reauthentication',
      action: decision ? decision.action : 'reauth',
      risk: decision ? decision.risk : { level: 'elevated', reason: 'missing_session_decision', changed: false },
    };
  },
};
