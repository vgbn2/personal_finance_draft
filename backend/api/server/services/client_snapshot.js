'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  DEFAULT_QUALITY_REPORT,
  DEFAULT_SNAPSHOT,
  REPO_ROOT,
  STORAGE_DATA_DIR,
  STORAGE_TS_DIR,
} = require('../../../../shared/lib/runtime/paths');
const {
  familyFreshnessThresholdMs,
} = require('../../../../shared/lib/market/validation');
const {
  computeCachedBias,
} = require('../../../cli/commands/research/bias');
const {
  resolveRuntimePolicy,
} = require('../../../../shared/lib/settings/runtime_policy');

const CACHE_DIR = path.join(STORAGE_DATA_DIR, 'cache');
const DEFAULT_CLIENT_PATHS = Object.freeze({
  snapshot: DEFAULT_SNAPSHOT,
  quality: DEFAULT_QUALITY_REPORT,
  poller: path.join(CACHE_DIR, 'backfill_daemon_status.json'),
  runStatus: path.join(STORAGE_DATA_DIR, 'run_status.json'),
  botState: path.join(CACHE_DIR, 'bot_state.json'),
});
const SYMBOL_PATTERN = /^[A-Z0-9._:-]{1,32}$/;
const RUNNING_POLLER_STALE_MS = 10 * 60 * 1000;
const SLEEPING_POLLER_GRACE_MS = 2 * 60 * 1000;

function isoOrNull(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function ageMs(value, now) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, now - timestamp) : null;
}

function sourcePath(filePath) {
  return path.relative(REPO_ROOT, filePath).split(path.sep).join('/');
}

function readJsonSnapshot(filePath) {
  try {
    const stat = fs.statSync(filePath);
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      available: true,
      value,
      modified_at: stat.mtime.toISOString(),
      error: null,
    };
  } catch (error) {
    return {
      available: false,
      value: null,
      modified_at: null,
      error: error && error.code === 'ENOENT' ? 'not_found' : 'unreadable',
    };
  }
}

function summarizeData(snapshotFile, qualityFile, now, freshnessThreshold) {
  const snapshot = snapshotFile.value;
  const records = Array.isArray(snapshot?.sources) ? snapshot.sources : [];
  let latestRecordAt = null;
  let freshnessKnown = 0;
  let staleRecords = 0;

  for (const record of records) {
    const timestamp = isoOrNull(record?.timestamp || record?.time || record?.date);
    if (timestamp && (!latestRecordAt || timestamp > latestRecordAt)) {
      latestRecordAt = timestamp;
    }
    const threshold = freshnessThreshold(record || {});
    const recordAge = timestamp ? ageMs(timestamp, now) : null;
    if (Number.isFinite(threshold) && Number.isFinite(recordAge)) {
      freshnessKnown += 1;
      if (recordAge > threshold) staleRecords += 1;
    }
  }

  const available = Boolean(snapshotFile.available && snapshot && typeof snapshot === 'object');
  const stale = !available
    ? null
    : (!latestRecordAt || (freshnessKnown > 0 ? staleRecords > 0 : null));
  const quality = qualityFile.available ? qualityFile.value : null;

  return {
    available,
    mode: snapshot?.mode || null,
    fetched_at: isoOrNull(snapshot?.fetched_at),
    fetched_age_ms: ageMs(snapshot?.fetched_at, now),
    latest_record_at: latestRecordAt,
    latest_record_age_ms: ageMs(latestRecordAt, now),
    records: records.length,
    usable_records: Number.isFinite(quality?.usable_records) ? quality.usable_records : null,
    rejected_records: Number.isFinite(quality?.rejected_records) ? quality.rejected_records : null,
    provider_errors: Array.isArray(quality?.provider_errors)
      ? quality.provider_errors.length
      : (Array.isArray(snapshot?.errors) ? snapshot.errors.length : null),
    freshness_known_records: freshnessKnown,
    stale_records: freshnessKnown > 0 ? staleRecords : null,
    stale,
    provenance: {
      snapshot: sourcePath(DEFAULT_CLIENT_PATHS.snapshot),
      quality: qualityFile.available ? sourcePath(DEFAULT_CLIENT_PATHS.quality) : null,
      cache_only: true,
    },
  };
}

function summarizePoller(pollerFile, runStatusFile, now) {
  const report = pollerFile.value;
  const status = typeof report?.status === 'string' ? report.status : null;
  const updatedAt = isoOrNull(report?.updated_at);
  const updatedAgeMs = ageMs(updatedAt, now);
  const nextRunAt = isoOrNull(report?.next_run_at);
  const nextRunAgeMs = ageMs(nextRunAt, now);
  const active = status === 'running' || status === 'sleeping';
  let stale = null;
  if (status === 'running') stale = !Number.isFinite(updatedAgeMs) || updatedAgeMs > RUNNING_POLLER_STALE_MS;
  if (status === 'sleeping') stale = Number.isFinite(nextRunAgeMs) && nextRunAgeMs > SLEEPING_POLLER_GRACE_MS;
  if (status === 'idle' || status === 'stopped') stale = false;

  const loops = runStatusFile.available && runStatusFile.value && typeof runStatusFile.value === 'object'
    ? runStatusFile.value
    : null;
  const loopsAvailable = Boolean(loops && Object.keys(loops).length > 0);

  return {
    available: pollerFile.available || loopsAvailable,
    active,
    status,
    stale,
    pid: Number.isInteger(report?.pid) ? report.pid : null,
    cycle: Number.isFinite(report?.cycle) ? report.cycle : null,
    families: Array.isArray(report?.families) ? report.families : [],
    once: typeof report?.once === 'boolean' ? report.once : null,
    last_outcome: report?.last_outcome || null,
    updated_at: updatedAt,
    updated_age_ms: updatedAgeMs,
    next_run_at: nextRunAt,
    loops,
    process_verified: false,
    provenance: {
      poller: pollerFile.available ? sourcePath(DEFAULT_CLIENT_PATHS.poller) : null,
      run_status: runStatusFile.available ? sourcePath(DEFAULT_CLIENT_PATHS.runStatus) : null,
      cache_only: true,
    },
  };
}

function summarizeBot(botFile, now) {
  const state = botFile.value;
  const config = state?.config && typeof state.config === 'object' ? state.config : null;
  const history = Array.isArray(state?.cycleHistory) ? state.cycleHistory : [];
  const latestCycle = history[0] || null;
  const lastCycleAt = isoOrNull(state?.lastCycleAt || latestCycle?.completedAt);
  const lastCycleAgeMs = ageMs(lastCycleAt, now);
  const enabled = typeof config?.enabled === 'boolean' ? config.enabled : null;
  const intervalMs = Number.isFinite(config?.intervalMinutes)
    ? config.intervalMinutes * 60 * 1000
    : null;
  const stale = enabled === true
    ? (!Number.isFinite(lastCycleAgeMs)
      || (Number.isFinite(intervalMs) && lastCycleAgeMs > intervalMs * 2))
    : (enabled === false ? false : null);

  return {
    available: Boolean(botFile.available && state && typeof state === 'object'),
    enabled,
    live_trading_configured: typeof config?.liveTrading === 'boolean' ? config.liveTrading : null,
    positions: Array.isArray(state?.positions) ? state.positions.length : null,
    max_positions: Number.isFinite(config?.maxPositions) ? config.maxPositions : null,
    interval_minutes: Number.isFinite(config?.intervalMinutes) ? config.intervalMinutes : null,
    last_cycle_at: lastCycleAt,
    last_cycle_age_ms: lastCycleAgeMs,
    last_cycle: latestCycle ? {
      completed_at: isoOrNull(latestCycle.completedAt),
      dry_run: typeof latestCycle.dryRun === 'boolean' ? latestCycle.dryRun : null,
      sells_executed: Number.isFinite(latestCycle.sellsExecuted) ? latestCycle.sellsExecuted : null,
      buys_filled: Number.isFinite(latestCycle.buysFilled) ? latestCycle.buysFilled : null,
      errors: Array.isArray(latestCycle.errors) ? latestCycle.errors.length : null,
    } : null,
    locked_at: isoOrNull(state?.lockedAt),
    stale,
    observation_only: true,
    provenance: {
      state: botFile.available ? sourcePath(DEFAULT_CLIENT_PATHS.botState) : null,
      cache_only: true,
    },
  };
}

function buildClientStatus(_query = {}, options = {}) {
  const now = typeof options.now === 'number' ? options.now : Date.now();
  const paths = { ...DEFAULT_CLIENT_PATHS, ...(options.paths || {}) };
  const readSnapshot = options.readJsonSnapshot || readJsonSnapshot;
  const resolvePolicy = options.resolveRuntimePolicy || resolveRuntimePolicy;
  const freshnessThreshold = options.familyFreshnessThresholdMs || familyFreshnessThresholdMs;
  const snapshotFile = readSnapshot(paths.snapshot);
  const qualityFile = readSnapshot(paths.quality);
  const pollerFile = readSnapshot(paths.poller);
  const runStatusFile = readSnapshot(paths.runStatus);
  const botFile = readSnapshot(paths.botState);
  const data = summarizeData(snapshotFile, qualityFile, now, freshnessThreshold);
  const poller = summarizePoller(pollerFile, runStatusFile, now);
  const bot = summarizeBot(botFile, now);

  let runtimePolicy = null;
  let runtimePolicyAvailable = true;
  try {
    runtimePolicy = resolvePolicy({ now: new Date(now).toISOString() });
  } catch {
    runtimePolicyAvailable = false;
  }

  return {
    ok: true,
    type: 'client_status',
    schema_version: 1,
    generated_at: new Date(now).toISOString(),
    mode: 'cached_only',
    health: {
      service: 'sovereign-web',
      available: true,
      degraded: data.available !== true
        || data.stale === true
        || poller.available !== true
        || runtimePolicyAvailable !== true,
    },
    runtime_policy: {
      available: runtimePolicyAvailable,
      value: runtimePolicy,
    },
    data,
    poller,
    bot,
  };
}

async function buildCachedBias(query = {}, options = {}) {
  const symbol = String(query.symbol || 'BTCUSDT').trim().toUpperCase();
  if (!SYMBOL_PATTERN.test(symbol)) {
    return {
      ok: false,
      type: 'cached_bias',
      error_code: 'invalid_symbol',
      error: 'symbol must contain 1-32 letters, numbers, dots, underscores, colons, or hyphens',
    };
  }

  const now = typeof options.now === 'number' ? options.now : Date.now();
  const tsDir = options.tsDir || STORAGE_TS_DIR;
  const compute = options.computeCachedBias || computeCachedBias;
  let result;
  try {
    result = await compute(symbol, {
      now,
      tsDir,
      includeMl: false,
    });
  } catch {
    return {
      ok: false,
      type: 'cached_bias',
      schema_version: 1,
      symbol,
      error_code: 'cached_bias_unavailable',
      error: 'cached bias could not be computed from local cache',
    };
  }
  const timeframes = Array.isArray(result?.timeframes) ? result.timeframes : [];
  const available = timeframes.some((entry) => !entry.error);

  return {
    ok: true,
    type: 'cached_bias',
    schema_version: 1,
    ...result,
    symbol,
    generated_at: result?.generated_at || new Date(now).toISOString(),
    timestamp: result?.data_as_of || null,
    available,
    stale: typeof result?.stale === 'boolean' ? result.stale : !available,
    timeframes,
    provenance: {
      ...(result?.provenance || {}),
      cache_only: true,
      auto_backfill: false,
      provider_fetch: false,
    },
  };
}

module.exports = {
  DEFAULT_CLIENT_PATHS,
  buildCachedBias,
  buildClientStatus,
  readJsonSnapshot,
  summarizeBot,
  summarizeData,
  summarizePoller,
};
