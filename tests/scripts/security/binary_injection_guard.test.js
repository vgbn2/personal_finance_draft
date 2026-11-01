const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');

const {
  REPO_ROOT,
  STORAGE_DATA_DIR,
} = require('../../../shared/lib/runtime/paths');
const {
  isPathWithinAllowedRoots,
  isValidSymbol,
  isValidTimeframe,
  sanitizeSymbol,
} = require('../../../backend/api/server/services/input_validator');
const {
  backendStatus,
  backendDataSummary,
  backendCorrelation,
  backendUniverse,
  backendStats,
  signalStatus,
} = require('../../../backend/api/server/services/cli_executor');

test('security: isPathWithinAllowedRoots strictly confines paths to allowed trees', () => {
  // Allowed roots
  assert.equal(isPathWithinAllowedRoots(path.join(REPO_ROOT, 'tests', 'fixtures', 'backend_history_sample.json')), true);
  assert.equal(isPathWithinAllowedRoots(path.join(STORAGE_DATA_DIR, 'cache', 'last_fetch.json')), true);
  assert.equal(isPathWithinAllowedRoots(path.join(os.tmpdir(), 'test_model.json')), true);

  // Escaping roots
  assert.equal(isPathWithinAllowedRoots('/etc/passwd'), false);
  assert.equal(isPathWithinAllowedRoots('/var/log/syslog'), false);
  assert.equal(isPathWithinAllowedRoots(path.resolve(REPO_ROOT, '../../../../etc/shadow')), false);
  assert.equal(isPathWithinAllowedRoots(''), false);
  assert.equal(isPathWithinAllowedRoots(null), false);
  assert.equal(isPathWithinAllowedRoots(undefined), false);
});

test('security: input token validation rejects option injection and shell metacharacters', () => {
  assert.equal(isValidSymbol('AAPL'), true);
  assert.equal(isValidSymbol('BTC-USDT'), true);
  assert.equal(isValidSymbol('BTC_USDT'), true);
  assert.equal(isValidSymbol('ETH/USDT'), false); // Slash must be rejected to prevent path segment splitting
  assert.equal(isValidSymbol('SPY; rm -rf /'), false);
  assert.equal(isValidSymbol('AAPL`whoami`'), false);
  assert.equal(isValidSymbol('AAPL$HOME'), false);
  assert.equal(isValidSymbol('--option-injection'), false);

  assert.equal(isValidTimeframe('1m'), true);
  assert.equal(isValidTimeframe('1h'), true);
  assert.equal(isValidTimeframe('1d'), true);
  assert.equal(isValidTimeframe('1w'), true);
  assert.equal(isValidTimeframe('1mo'), true);
  assert.equal(isValidTimeframe('1d; id'), false);
  assert.equal(isValidTimeframe('../1d'), false);
  assert.equal(isValidTimeframe('--evil'), false);
});

test('security: cli_executor rejects path traversal attempts across all report & data queries', () => {
  const traversalTarget = '../../../../etc/passwd';

  // backendStatus
  const statusRes = backendStatus({ input: traversalTarget });
  assert.equal(statusRes.ok, false);
  assert.match(statusRes.error, /Path traversal denied/);

  // backendDataSummary
  const summaryRes = backendDataSummary({ input: traversalTarget });
  assert.equal(summaryRes.ok, false);
  assert.match(summaryRes.error, /Path traversal denied/);

  // backendCorrelation
  const corrRes = backendCorrelation({ input: traversalTarget });
  assert.equal(corrRes.ok, false);
  assert.match(corrRes.error, /Path traversal denied/);

  // backendUniverse
  const universeRes = backendUniverse({ input: traversalTarget });
  assert.equal(universeRes.ok, false);
  assert.match(universeRes.error, /Path traversal denied/);

  // backendStats
  const statsRes = backendStats({ input: traversalTarget });
  assert.equal(statsRes.ok, false);
  assert.match(statsRes.error, /Path traversal denied/);

  // signalStatus
  const signalInputRes = signalStatus({ input: traversalTarget });
  assert.equal(signalInputRes.ok, false);
  assert.match(signalInputRes.error, /Path traversal denied/);

  const signalModelRes = signalStatus({ model_report: traversalTarget });
  assert.equal(signalModelRes.ok, false);
  assert.match(signalModelRes.error, /Path traversal denied/);

  const signalBacktestRes = signalStatus({ backtest_report: traversalTarget });
  assert.equal(signalBacktestRes.ok, false);
  assert.match(signalBacktestRes.error, /Path traversal denied/);
});
