const test = require('node:test');
const assert = require('node:assert/strict');

const route = require('../../../../backend/api/server/routes/market/scorecard');

test('scorecard route separates validation failures from runtime availability failures', () => {
  assert.equal(route.status({ ok: true, rows: [] }), 200);
  assert.equal(route.status({ ok: false, error_code: 'invalid_timeframe' }), 400);
  assert.equal(route.status({ ok: false, error_code: 'scorecard_worker_error' }), 503);
  assert.equal(route.status(null), 503);
});
