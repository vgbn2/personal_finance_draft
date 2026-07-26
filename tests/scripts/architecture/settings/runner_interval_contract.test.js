'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { resolvePaperBotInterval, runPaperBotLoop } = require('../../../../backend/cli/commands/runner/run.js');

test('persistent paper runner resolves the shared interval policy before scheduler setup', () => {
  const interval = resolvePaperBotInterval(null, {
    trading: { bot_interval_min: 5 },
  });
  assert.equal(interval.effective_interval_min, 5);
  assert.equal(interval.personal_interval_min, 5);
});

test('persistent paper runner reaches scheduler setup with the effective policy interval', async () => {
  let scheduled = null;
  const result = await runPaperBotLoop(null, {
    settings: { feature_flags: { bot_autopilot: true }, trading: { bot_interval_min: 5 } },
    startLoop: (name, _fn, intervalMs, options) => { scheduled = { name, intervalMs, options }; },
    waitForShutdown: false,
  });
  assert.equal(result, 0);
  assert.deepEqual(scheduled, { name: 'paper_bot', intervalMs: 5 * 60 * 1000, options: { continueOnError: true } });
});
