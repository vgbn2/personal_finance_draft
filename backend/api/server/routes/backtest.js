const { backendStats } = require('../services/cli_executor');

module.exports = {
  path: '/api/backtest',
  status: (payload) => (payload && payload.ok !== false ? 200 : 503),
  handle: (query = {}) => ({
    ok: true,
    type: 'backtest_summary',
    hint: 'Use the CLI backtest command for the authoritative result; this route exposes the latest stats snapshot.',
    stats: backendStats(query),
  }),
};
