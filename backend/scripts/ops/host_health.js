#!/usr/bin/env node
'use strict';

const { probeHost } = require('../../../shared/lib/runtime/host_maintenance');
const { errorCode, writeServiceHeartbeat } = require('../../../shared/lib/runtime/service_heartbeat');

function numericArg(args, name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = Number(args[index + 1]);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} requires a non-negative number`);
  return value;
}

function parseHostHealthOptions(args = [], env = process.env) {
  const intervalSecs = numericArg(
    args,
    '--interval-secs',
    Number(env.HOST_HEALTH_INTERVAL_SECS || 300),
  );
  if (intervalSecs <= 0) throw new Error('--interval-secs requires a positive number');
  return {
    watch: args.includes('--watch'),
    intervalSecs,
    probeOptions: {
      tsMaxAgeMs: numericArg(args, '--ts-max-age-min', 120) * 60 * 1000,
      runnerMaxAgeMs: numericArg(args, '--runner-max-age-min', 75) * 60 * 1000,
      minFreeBytes: numericArg(args, '--min-free-gb', 10) * 1024 ** 3,
      minFreePercent: numericArg(args, '--min-free-percent', 10),
      checkRunner: !args.includes('--no-runner'),
    },
  };
}

function waitForInterval(milliseconds, signal) {
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', stopWaiting);
      resolve(true);
    }, milliseconds);
    function stopWaiting() {
      clearTimeout(timer);
      resolve(false);
    }
    signal?.addEventListener('abort', stopWaiting, { once: true });
  });
}

async function runHostHealthLoop(options = {}) {
  const watch = options.watch === true;
  const intervalSecs = options.intervalSecs;
  const nowMs = options.nowMs || (() => Date.now());
  const wait = options.sleep || waitForInterval;
  const inspectHost = options.probeHost || probeHost;
  const publishHeartbeat = options.writeHeartbeat || writeServiceHeartbeat;
  const output = options.output || (() => {});
  const maxCycles = Number.isInteger(options.maxCycles) && options.maxCycles > 0
    ? options.maxCycles
    : null;
  let cycles = 0;
  let lastResult = null;

  /* eslint-disable no-await-in-loop */
  for (;;) {
    cycles += 1;
    try {
      lastResult = inspectHost(options.probeOptions);
    } catch (error) {
      lastResult = { ok: false, error_code: errorCode(error.message) };
    }
    const reason = lastResult.checks?.runner?.reason
      || lastResult.checks?.disk?.reason
      || lastResult.checks?.canonical_data?.reason
      || lastResult.error_code;
    const nextRunAt = new Date(nowMs() + intervalSecs * 1000).toISOString();
    publishHeartbeat('host_health', {
      state: lastResult.ok ? 'healthy' : 'degraded',
      success: lastResult.ok,
      error_code: lastResult.ok ? null : errorCode(reason),
      next_run_at: nextRunAt,
    });
    output(lastResult);
    if (!watch || (maxCycles !== null && cycles >= maxCycles)) break;
    const completedInterval = await wait(intervalSecs * 1000, options.signal);
    if (completedInterval === false || options.signal?.aborted) {
      publishHeartbeat('host_health', {
        state: 'stopped',
        attempted: false,
        next_run_at: null,
      });
      break;
    }
  }
  /* eslint-enable no-await-in-loop */

  return { cycles, result: lastResult, exitCode: watch ? 0 : (lastResult.ok ? 0 : 1) };
}

async function main(args = process.argv.slice(2), dependencies = {}) {
  const options = parseHostHealthOptions(args, dependencies.env || process.env);
  const controller = dependencies.signal ? null : new AbortController();
  const signal = dependencies.signal || controller.signal;
  const stop = () => controller?.abort();
  if (options.watch && controller) {
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  }
  try {
    const result = await runHostHealthLoop({
      ...options,
      ...dependencies,
      signal,
      output: dependencies.output || ((payload) => {
        process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
      }),
    });
    return result.exitCode;
  } finally {
    if (controller) {
      process.removeListener('SIGINT', stop);
      process.removeListener('SIGTERM', stop);
    }
  }
}

if (require.main === module) {
  main().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    try { writeServiceHeartbeat('host_health', { state: 'degraded', error: error.message }); } catch (_) {}
    process.stderr.write(`${JSON.stringify({ ok: false, error_code: errorCode(error.message) })}\n`);
    process.exitCode = 2;
  });
}

module.exports = {
  main,
  parseHostHealthOptions,
  runHostHealthLoop,
  waitForInterval,
};
