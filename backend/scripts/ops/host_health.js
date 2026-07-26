#!/usr/bin/env node
'use strict';

const { probeHost } = require('../../../shared/lib/runtime/host_maintenance');
const { errorCode, writeServiceHeartbeat } = require('../../../shared/lib/runtime/service_heartbeat');

function numericArg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} requires a non-negative number`);
  return value;
}

try {
  const result = probeHost({
    tsMaxAgeMs: numericArg('--ts-max-age-min', 120) * 60 * 1000,
    runnerMaxAgeMs: numericArg('--runner-max-age-min', 75) * 60 * 1000,
    minFreeBytes: numericArg('--min-free-gb', 10) * 1024 ** 3,
    minFreePercent: numericArg('--min-free-percent', 10),
    checkRunner: !process.argv.includes('--no-runner'),
  });
  writeServiceHeartbeat('host_health', {
    state: result.ok ? 'healthy' : 'degraded',
    success: result.ok,
    error_code: result.ok ? null : errorCode(result.checks?.runner?.reason || result.checks?.disk?.reason || result.checks?.canonical_data?.reason),
    next_run_at: new Date(Date.now() + Number(process.env.HOST_HEALTH_INTERVAL_SECS || 300) * 1000).toISOString(),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
} catch (error) {
  try { writeServiceHeartbeat('host_health', { state: 'degraded', error: error.message }); } catch (_) {}
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
  process.exitCode = 2;
}
