#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { createHostBackup } = require('../../../shared/lib/runtime/host_maintenance');
const { writeServiceHeartbeat } = require('../../../shared/lib/runtime/service_heartbeat');

function valueArg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

function optionalNumber(cliName, envName, { integer = false, positive = false } = {}) {
  const raw = valueArg(cliName) ?? process.env[envName];
  if (raw === undefined || raw === null || raw === '') return undefined;
  const value = Number(raw);
  const valid = Number.isFinite(value) && (!integer || Number.isInteger(value))
    && (positive ? value > 0 : value >= 0);
  if (!valid) {
    const expectation = integer
      ? `${positive ? 'a positive' : 'a non-negative'} integer`
      : `${positive ? 'a positive' : 'a non-negative'} number`;
    throw new Error(`${cliName} / ${envName} requires ${expectation}`);
  }
  return value;
}

async function main() {
  const destination = valueArg('--destination');
  const retentionDays = optionalNumber('--retention-days', 'HOST_BACKUP_RETENTION_DAYS');
  const retentionMaxCount = optionalNumber('--max-count', 'HOST_BACKUP_MAX_COUNT', { integer: true, positive: true });
  const result = await createHostBackup({
    ...(destination ? { backupRoot: path.resolve(destination) } : {}),
    ...(retentionDays === undefined ? {} : { retentionMaxAgeMs: retentionDays * 24 * 60 * 60 * 1000 }),
    ...(retentionMaxCount === undefined ? {} : { retentionMaxCount }),
  });
  try {
    writeServiceHeartbeat('host_backup', {
      state: result.ok ? 'healthy' : 'degraded',
      success: result.ok,
      error_code: result.ok ? null : (result.backup_ok === false ? 'backup_failed' : 'backup_retention_failed'),
      next_run_at: new Date(Date.now() + Number(process.env.HOST_BACKUP_INTERVAL_SECS || 86400) * 1000).toISOString(),
    });
  } catch (_) {}
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = exitCodeForResult(result);
}

function exitCodeForResult(result) {
  if (result.ok) return 0;
  return result.backup_ok ? 3 : 1;
}

if (require.main === module) {
  main().catch((error) => {
    try { writeServiceHeartbeat('host_backup', { state: 'degraded', error: error.message }); } catch (_) {}
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message, staging_path: error.stagingPath || null })}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  exitCodeForResult,
};
