#!/usr/bin/env node
'use strict';

const { probeHost } = require('../../../shared/lib/runtime/host_maintenance');

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
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
  process.exitCode = 2;
}
