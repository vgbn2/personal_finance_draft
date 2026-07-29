#!/usr/bin/env node
'use strict';

const path = require('node:path');
const {
  DEFAULT_BACKUP_ROOT,
  completedBackups,
  createHostBackup,
} = require('../../../shared/lib/runtime/host_maintenance');
const {
  errorCode,
  readServiceHeartbeat,
  writeServiceHeartbeat,
} = require('../../../shared/lib/runtime/service_heartbeat');
const { REPO_ROOT } = require('../../../shared/lib/runtime/paths');

function valueArg(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1];
}

function optionalNumber(args, env, cliName, envName, { integer = false, positive = false } = {}) {
  const raw = valueArg(args, cliName) ?? env[envName];
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

function parseHostBackupOptions(args = [], env = process.env) {
  const destination = valueArg(args, '--destination');
  const intervalSecs = optionalNumber(
    args,
    env,
    '--interval-secs',
    'HOST_BACKUP_INTERVAL_SECS',
    { positive: true },
  ) ?? 86400;
  const retentionDays = optionalNumber(args, env, '--retention-days', 'HOST_BACKUP_RETENTION_DAYS');
  const retentionMaxCount = optionalNumber(
    args,
    env,
    '--max-count',
    'HOST_BACKUP_MAX_COUNT',
    { integer: true, positive: true },
  );
  return {
    watch: args.includes('--watch'),
    intervalSecs,
    backupRoot: destination ? path.resolve(destination) : DEFAULT_BACKUP_ROOT,
    backupOptions: {
      ...(destination ? { backupRoot: path.resolve(destination) } : {}),
      ...(retentionDays === undefined ? {} : { retentionMaxAgeMs: retentionDays * 24 * 60 * 60 * 1000 }),
      ...(retentionMaxCount === undefined ? {} : { retentionMaxCount }),
    },
  };
}

function newestCompletedBackupAt(backupRoot, sourceRoot = REPO_ROOT, listBackups = completedBackups) {
  const backups = listBackups(backupRoot, sourceRoot);
  if (backups.length === 0) return null;
  return Math.max(...backups.map((backup) => backup.createdAt));
}

function resolveInitialBackupDueAt(options = {}) {
  const now = options.nowMs;
  const intervalMs = options.intervalSecs * 1000;
  const heartbeat = options.heartbeat;
  const heartbeatUsable = heartbeat
    && !['heartbeat_missing', 'heartbeat_invalid', 'heartbeat_missing_timestamp'].includes(heartbeat.reason);
  const heartbeatDueAt = heartbeatUsable ? Date.parse(heartbeat.next_run_at || '') : NaN;
  if (Number.isFinite(heartbeatDueAt) && heartbeatDueAt > now) return heartbeatDueAt;
  const completedAt = options.completedBackupAt;
  if (Number.isFinite(completedAt) && completedAt + intervalMs > now) {
    return completedAt + intervalMs;
  }
  return now;
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

async function runBackupAttempt(options) {
  try {
    return await options.createBackup(options.backupOptions);
  } catch (error) {
    return {
      ok: false,
      backup_ok: false,
      error_code: errorCode(error.message) || 'backup_failed',
      staging_path: error.stagingPath || null,
    };
  }
}

async function runHostBackupLoop(options = {}) {
  const nowMs = options.nowMs || (() => Date.now());
  const wait = options.sleep || waitForInterval;
  const createBackup = options.createBackup || createHostBackup;
  const publishHeartbeat = options.writeHeartbeat || writeServiceHeartbeat;
  const output = options.output || (() => {});
  const maxCycles = Number.isInteger(options.maxCycles) && options.maxCycles > 0
    ? options.maxCycles
    : null;
  let cycles = 0;

  if (options.watch) {
    let dueAt;
    for (;;) {
      const scheduleNow = nowMs();
      const heartbeat = (options.readHeartbeat || readServiceHeartbeat)('host_backup', options.heartbeatOptions);
      dueAt = resolveInitialBackupDueAt({
        nowMs: scheduleNow,
        intervalSecs: options.intervalSecs,
        heartbeat,
        completedBackupAt: null,
      });
      if (dueAt > scheduleNow) break;
      try {
        const completedBackupAt = newestCompletedBackupAt(
          options.backupRoot,
          options.sourceRoot || REPO_ROOT,
          options.listBackups || completedBackups,
        );
        dueAt = resolveInitialBackupDueAt({
          nowMs: scheduleNow,
          intervalSecs: options.intervalSecs,
          heartbeat,
          completedBackupAt,
        });
        break;
      } catch (error) {
        const retryAt = scheduleNow + options.intervalSecs * 1000;
        publishHeartbeat('host_backup', {
          state: 'degraded',
          attempted: false,
          error_code: errorCode(error.message),
          next_run_at: new Date(retryAt).toISOString(),
        });
        const completedInterval = await wait(options.intervalSecs * 1000, options.signal);
        if (completedInterval === false || options.signal?.aborted) {
          publishHeartbeat('host_backup', { state: 'stopped', attempted: false, next_run_at: null });
          return { cycles, result: null, exitCode: 0 };
        }
      }
    }
    const delayMs = Math.max(0, dueAt - nowMs());
    if (delayMs > 0) {
      publishHeartbeat('host_backup', {
        state: 'running',
        attempted: false,
        next_run_at: new Date(dueAt).toISOString(),
      });
      const completedInterval = await wait(delayMs, options.signal);
      if (completedInterval === false || options.signal?.aborted) {
        publishHeartbeat('host_backup', { state: 'stopped', attempted: false, next_run_at: null });
        return { cycles, result: null, exitCode: 0 };
      }
    }
  }

  let result = null;
  /* eslint-disable no-await-in-loop */
  for (;;) {
    if (options.signal?.aborted) {
      publishHeartbeat('host_backup', { state: 'stopped', attempted: false, next_run_at: null });
      break;
    }
    cycles += 1;
    result = await runBackupAttempt({ createBackup, backupOptions: options.backupOptions });
    const nextRunAt = new Date(nowMs() + options.intervalSecs * 1000).toISOString();
    publishHeartbeat('host_backup', {
      state: result.ok ? 'healthy' : 'degraded',
      success: result.backup_ok === true,
      error_code: result.ok ? null : (result.backup_ok ? 'backup_retention_failed' : (result.error_code || 'backup_failed')),
      next_run_at: nextRunAt,
    });
    output(result);
    if (!options.watch || (maxCycles !== null && cycles >= maxCycles)) break;
    const completedInterval = await wait(options.intervalSecs * 1000, options.signal);
    if (completedInterval === false || options.signal?.aborted) {
      publishHeartbeat('host_backup', { state: 'stopped', attempted: false, next_run_at: null });
      break;
    }
  }
  /* eslint-enable no-await-in-loop */

  return {
    cycles,
    result,
    exitCode: options.watch ? 0 : exitCodeForResult(result),
  };
}

async function main(args = process.argv.slice(2), dependencies = {}) {
  const parsed = parseHostBackupOptions(args, dependencies.env || process.env);
  const controller = dependencies.signal ? null : new AbortController();
  const signal = dependencies.signal || controller.signal;
  const stop = () => controller?.abort();
  if (parsed.watch && controller) {
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  }
  try {
    const result = await runHostBackupLoop({
      ...parsed,
      ...dependencies,
      signal,
      output: dependencies.output || ((payload) => {
        const stream = payload.backup_ok === false ? process.stderr : process.stdout;
        stream.write(`${JSON.stringify(payload, null, 2)}\n`);
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

function exitCodeForResult(result) {
  if (result.ok) return 0;
  return result.backup_ok ? 3 : 1;
}

if (require.main === module) {
  main().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    try { writeServiceHeartbeat('host_backup', { state: 'degraded', error: error.message }); } catch (_) {}
    process.stderr.write(`${JSON.stringify({ ok: false, error_code: errorCode(error.message) || 'backup_failed' })}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  exitCodeForResult,
  main,
  newestCompletedBackupAt,
  parseHostBackupOptions,
  resolveInitialBackupDueAt,
  runHostBackupLoop,
  waitForInterval,
};
