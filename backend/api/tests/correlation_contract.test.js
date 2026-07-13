const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { buildCorrelationMatrix } = require('../server/services/cli_executor');

const HISTORY_FIXTURE = path.join(__dirname, '../../..', 'tests', 'fixtures', 'backend_history_sample.json');

function validateMatrix(payload, expectedTimeframe) {
  assert.equal(payload.ok, true);
  assert.equal(payload.type, 'correlation_matrix');
  assert.equal(payload.source, 'local_fixture');
  assert.equal(payload.timeframe, expectedTimeframe);
  assert.deepEqual(payload.labels, ['AAPL', 'MSFT', 'SPY']);
  assert.equal(payload.values.length, 3);
  assert.equal(payload.values[0].length, 3);
  assert.ok(payload.sample_size > 0);
  for (const row of payload.values) {
    for (const value of row) {
      assert.equal(Number.isFinite(value), true);
    }
  }
}

test('backend correlation fallback derives weekly and monthly frames from stable daily history', () => {
  const weekly = buildCorrelationMatrix({
    input: HISTORY_FIXTURE,
    symbols: 'AAPL,MSFT,SPY',
    timeframe: '1w',
    max_bars: '252',
  });
  validateMatrix(weekly, '1w');

  const monthly = buildCorrelationMatrix({
    input: HISTORY_FIXTURE,
    symbols: 'AAPL,MSFT,SPY',
    timeframe: '1mo',
    max_bars: '252',
  });
  validateMatrix(monthly, '1mo');
});

test('backend correlation fallback fails closed without aligned observations', () => {
  const payload = buildCorrelationMatrix({
    input: HISTORY_FIXTURE,
    symbols: 'UNKNOWN_A,UNKNOWN_B',
    timeframe: '1d',
    max_bars: '252',
  });

  assert.equal(payload.ok, false);
  assert.equal(payload.available, false);
  assert.equal(payload.sample_size, 0);
  assert.equal(payload.error, 'insufficient_aligned_observations');
});
