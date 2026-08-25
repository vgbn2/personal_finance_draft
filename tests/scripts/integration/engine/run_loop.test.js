const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

// Redirect status file to a temp dir so tests don't pollute storage/
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-run-loop-'));
process.env.SOVEREIGN_RUN_STATUS_PATH = path.join(tmpDir, 'run_status.json');

const { startLoop, stopLoop, getStatus, isRunning } = require('../../../../shared/lib/runtime/run_loop');

test('startLoop runs fn immediately and tracks iteration count', async () => {
  const calls = [];
  const loop = startLoop('test_basic', async ({ iteration }) => {
    calls.push(iteration);
  }, 5000); // long interval so only one tick fires during the test

  await new Promise((resolve) => setTimeout(resolve, 50));
  loop.stop();

  assert.equal(calls.length, 1);
  assert.equal(calls[0], 1);
});

test('startLoop throws if same name is started twice', () => {
  const loop = startLoop('test_dupe', async () => {}, 9999);
  try {
    assert.throws(() => startLoop('test_dupe', async () => {}, 9999), /already running/);
  } finally {
    loop.stop();
  }
});

test('stopLoop returns false for unknown loop and true for known', async () => {
  assert.equal(stopLoop('nonexistent_loop_xyz'), false);

  const loop = startLoop('test_stop', async () => {}, 9999);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(isRunning('test_stop'), true);
  loop.stop();
  assert.equal(isRunning('test_stop'), false);
});

test('loop continues after fn throws when continueOnError is true', async () => {
  let iteration = 0;
  const loop = startLoop('test_error', async () => {
    iteration++;
    if (iteration === 1) throw new Error('simulated failure');
  }, 20, { continueOnError: true });

  await new Promise((resolve) => setTimeout(resolve, 80));
  loop.stop();

  assert.ok(iteration >= 2, `Expected >= 2 iterations, got ${iteration}`);
});

test('loop stops after fn throws when continueOnError is false', async () => {
  let calls = 0;
  startLoop('test_crash', async () => {
    calls++;
    throw new Error('fatal');
  }, 20, { continueOnError: false });

  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(isRunning('test_crash'), false);
  assert.equal(calls, 1);
});

test('getStatus returns persisted loop state', async () => {
  const loop = startLoop('test_status', async () => {}, 9999);
  await new Promise((resolve) => setTimeout(resolve, 30));

  const status = getStatus();
  assert.ok(status.test_status, 'Expected test_status in persisted status');
  assert.equal(status.test_status.running, true);
  assert.ok(Number.isInteger(status.test_status.iteration));
  assert.ok(status.test_status.iteration >= 1);

  loop.stop();
  const afterStop = getStatus();
  assert.ok(!afterStop.test_status, 'Expected test_status removed after stop');
});
