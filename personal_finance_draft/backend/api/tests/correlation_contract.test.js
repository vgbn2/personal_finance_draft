const test = require('node:test');
const assert = require('node:assert/strict');

const { DEFAULT_SNAPSHOT } = require('../../../shared/lib/runtime/paths');
const { buildCorrelationMatrix } = require('../server/services/cli_executor');

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

test('backend correlation fallback uses the canonical snapshot for weekly and monthly frames', () => {
  const weekly = buildCorrelationMatrix({
    input: DEFAULT_SNAPSHOT,
    symbols: 'AAPL,MSFT,SPY',
    timeframe: '1w',
    max_bars: '252',
  });
  validateMatrix(weekly, '1w');

  const monthly = buildCorrelationMatrix({
    input: DEFAULT_SNAPSHOT,
    symbols: 'AAPL,MSFT,SPY',
    timeframe: '1mo',
    max_bars: '252',
  });
  validateMatrix(monthly, '1mo');
});
