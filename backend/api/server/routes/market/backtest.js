const fs = require('node:fs');
const { backendStats, backtestSummary, DEFAULT_BACKTEST_REPORT } = require('../../services/cli_executor');

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return null;
  }
}

module.exports = {
  path: '/api/backtest',
  status: (payload) => (payload && payload.ok !== false ? 200 : 503),
  handle: (query = {}) => ({
    ok: true,
    type: 'backtest_summary',
    hint: 'Use the CLI backtest command for the authoritative result; this route exposes the latest stats snapshot.',
    stats: backendStats(query),
    summary: backtestSummary(readJsonFile(DEFAULT_BACKTEST_REPORT)),
  }),
};

