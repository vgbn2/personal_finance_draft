const { createTuiSession, keys } = require('./lib/tui_automation');

async function driveTui(sequence, timeoutMs = 5000, options = {}) {
  const session = createTuiSession(options);
  try {
    await session.send(sequence, options.gapMs ?? 35);
    await Promise.race([
      session.waitForExit(timeoutMs),
      new Promise((resolve) => setTimeout(resolve, options.settleMs ?? 1200)),
    ]);
    session.kill();
    return {
      output: session.stdout,
      error: session.stderr,
      success: session.stderr.trim() === '',
      code: 0,
    };
  } catch (error) {
    session.kill();
    return {
      output: session.stdout,
      error: `${session.stderr}${session.stderr ? '\n' : ''}${error.message}`,
      success: false,
      timeout: /Timed out/i.test(error.message),
    };
  }
}

async function runTest() {
  console.log('[AUTOPILOT] Starting TUI smoke test...');
  const result = await driveTui([
    keys.down, keys.enter, // Backend
    keys.down, keys.down, keys.down, keys.enter, // Correlation
    'AAPL,BTC,SPY', keys.enter,
    keys.enter,
  ], 10000);

  if (!result.output.includes('TypeError') && !result.output.includes('ReferenceError') && !result.error) {
    console.log('[PASS] TUI smoke test');
  } else {
    console.log('[FAIL] TUI smoke test');
    console.error(result.error || result.output);
  }
}

if (require.main === module) {
  runTest().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  driveTui,
  keys,
  createTuiSession,
};
