'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildPaperRunArgs, resolvePaperBotInterval, runPaperBotLoop } = require('../../../../backend/cli/commands/runner/run.js');

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

test('persistent paper runner forwards explicit sizing without live flags', () => {
  const args = buildPaperRunArgs({
    strategy: 'low_prob_dip',
    sizingMode: 'risk_budget',
    size: 2,
    stopPrice: 0.08,
    maxPositionUsd: 10,
  });
  assert.deepEqual(args, [
    'paper-run',
    '--strategy', 'low_prob_dip',
    '--json',
    '--sizing-mode', 'risk_budget',
    '--size', '2',
    '--stop-price', '0.08',
    '--max-position-usd', '10',
  ]);
  assert.equal(args.includes('--live'), false);
});
