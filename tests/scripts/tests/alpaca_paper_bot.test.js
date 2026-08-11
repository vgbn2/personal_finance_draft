'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const { runAlpacaPaperLoop } = require('../../../backend/cli/commands/runner/run.js');

const enabledSettings = { feature_flags: { bot_autopilot: true } };

test('alpaca-paper --once runs one paper-provider pass without scheduling', async () => {
  let calls = 0;
  const result = await runAlpacaPaperLoop(15, {
    settings: enabledSettings,
    once: true,
    runAutomatedStrategies: async (args) => {
      calls += 1;
      assert.ok(args.includes('--once'));
      assert.ok(args.includes('--paper-provider'));
      assert.equal(args.includes('--live'), false);
      return 0;
    },
    startLoop: () => assert.fail('one-shot mode must not start a loop'),
  });

  assert.equal(result, 0);
  assert.equal(calls, 1);
});

test('alpaca-paper persistent mode uses the canonical named loop', async () => {
  let scheduled = null;
  let passes = 0;
  const result = await runAlpacaPaperLoop(15, {
    settings: enabledSettings,
    runAutomatedStrategies: async () => { passes += 1; },
    startLoop: (name, fn, intervalMs, options) => {
      scheduled = { name, fn, intervalMs, options };
    },
    waitForShutdown: false,
  });

  assert.equal(result, 0);
  assert.equal(scheduled.name, 'alpaca_paper_bot');
  assert.equal(scheduled.intervalMs, 15 * 60 * 1000);
  assert.deepEqual(scheduled.options, { continueOnError: true });
  await scheduled.fn({ iteration: 1 });
  assert.equal(passes, 1);
});

test('alpaca-paper rejects a duplicate canonical loop name', async () => {
  const duplicateError = new Error("Loop 'alpaca_paper_bot' is already running");
  await assert.rejects(
    runAlpacaPaperLoop(15, {
      settings: enabledSettings,
      runAutomatedStrategies: async () => 0,
      startLoop: (name) => {
        assert.equal(name, 'alpaca_paper_bot');
        throw duplicateError;
      },
      waitForShutdown: false,
    }),
    duplicateError,
  );
});

test('alpaca-paper forwards bounded automation arguments', async () => {
  let capturedArgs = null;
  await runAlpacaPaperLoop(15, {
    settings: enabledSettings,
    once: true,
    minTrustScore: 80,
    paperMaxNotional: 30,
    paperDailyMaxNotional: 100,
    allowedTimeframes: '5m,15m',
    runAutomatedStrategies: async (args) => { capturedArgs = args; },
  });

  assert.deepEqual(capturedArgs, [
    '--once',
    '--paper-provider',
    '--passes', '0',
    '--min-trust-score', '80',
    '--paper-max-notional', '30',
    '--paper-daily-max-notional', '100',
    '--allowed-timeframes', '5m,15m',
  ]);
  assert.equal(capturedArgs.includes('--live'), false);
});

test('alpaca-paper fails closed when bot_autopilot is disabled', async () => {
  const result = await runAlpacaPaperLoop(15, {
    settings: { feature_flags: { bot_autopilot: false } },
    once: true,
    runAutomatedStrategies: async () => assert.fail('feature gate must prevent execution'),
  });

  assert.equal(result, 1);
});
