const test = require('node:test');
const assert = require('node:assert/strict');

const { formatTableRow, summarizeStatus } = require('../server/services/data_formatter');
const jobQueue = require('../server/services/job_queue');

test('web helpers format rows and queue jobs', () => {
  const row = formatTableRow('Symbol', 'BTCUSDT');
  assert.deepEqual(row, { label: 'Symbol', value: 'BTCUSDT' });

  const status = summarizeStatus({ ok: true, degraded: false, type: 'system_status' });
  assert.deepEqual(status, { ok: true, degraded: false, type: 'system_status' });

  jobQueue.clear();
  const job = jobQueue.enqueue({ id: 'job-1', kind: 'backtest' });
  assert.equal(jobQueue.list().length, 1);
  assert.equal(job.id, 'job-1');
  assert.ok(job.enqueued_at);
});
