const path = require('node:path');
const {
  loadConfig,
} = require('../../../scripts/data_ops/ingest_market_data.js');
const {
  loadHistoricalSources,
} = require('../research/research.js');
const {
  readTsIndex,
  readSnapshot,
  mergeSnapshots,
  writePartitionedSnapshot,
  writeJson,
  validateSnapshot,
} = require('../../../../shared/lib/market/validation.js');
const {
  STORAGE_TS_DIR,
} = require('../../../../shared/lib/runtime/paths.js');
const utils = require('../../lib/utils.js');
const {
  printPayload,
  optionValue,
  numericOption,
  hasFlag,
  DEFAULT_HISTORY,
  DEFAULT_QUALITY_REPORT,
} = utils;

const { equityUniverseEntries } = require('./data_deep_backfill.js');

const DEFAULT_TS_DIR = STORAGE_TS_DIR;
const MASS_BACKFILL_STALE_MS = {
  '5m': 6 * 60 * 60 * 1000,
  '15m': 12 * 60 * 60 * 1000,
  '30m': 12 * 60 * 60 * 1000,
  '1h': 24 * 60 * 60 * 1000,
  '4h': 48 * 60 * 60 * 1000,
  '1d': 96 * 60 * 60 * 1000,
  '1w': 14 * 24 * 60 * 60 * 1000,
  '1mo': 60 * 24 * 60 * 60 * 1000,
};
const WEEKEND_EXEMPT_FAMILIES = new Set(['equities', 'indices', 'commodities']);

function weekendHoursElapsed(fromTs, toTs) {
  let ms = 0;
  const cursor = new Date(fromTs);
  cursor.setUTCHours(0, 0, 0, 0);
  const end = new Date(toTs);
  while (cursor < end) {
    const day = cursor.getUTCDay();
    if (day === 0 || day === 6) {
      const next = new Date(cursor);
      next.setUTCDate(next.getUTCDate() + 1);
      ms += Math.min(next, end) - cursor;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return ms;
}

function inspectMassBackfillJob(job, options = {}) {
  const tsDir = options.tsDir || DEFAULT_TS_DIR;
  const nowMs = options.nowMs || Date.now();
  const thresholdMs = options.thresholdMs || MASS_BACKFILL_STALE_MS[job.timeframe] || MASS_BACKFILL_STALE_MS['1d'];
  const records = readTsIndex(tsDir, job.symbol, job.timeframe);
  if (!records || records.length === 0) {
    return { skip: false, reason: 'missing', last_timestamp: null, records: 0 };
  }

  const latest = records[records.length - 1];
  const lastTimestamp = latest && latest.timestamp ? Date.parse(latest.timestamp) : NaN;
  if (!Number.isFinite(lastTimestamp)) {
    return { skip: false, reason: 'invalid_timestamp', last_timestamp: latest?.timestamp || null, records: records.length };
  }

  const ageMs = Math.max(0, nowMs - lastTimestamp);
  const effectiveAgeMs = WEEKEND_EXEMPT_FAMILIES.has(job.family) && job.timeframe === '1d'
    ? Math.max(0, ageMs - weekendHoursElapsed(lastTimestamp, nowMs))
    : ageMs;
  const fresh = effectiveAgeMs <= thresholdMs;
  return {
    skip: fresh,
    reason: fresh ? 'fresh' : 'stale',
    last_timestamp: latest.timestamp,
    age_hours: Number((effectiveAgeMs / (60 * 60 * 1000)).toFixed(1)),
    records: records.length,
  };
}

/**
 * Collects the full backfill universe for the given families: the flat
 * `symbols` list UNION the universe_matrix grid (via equityUniverseEntries),
 * so grid-only symbols (e.g. JPM/BAC/GS, which live only in equities'
 * universe_matrix.USA and not the flat list) are not silently skipped by
 * routine mass-backfill the way they were before.
 * Returns { symbols: string[] (deduped), familyBySymbol: Record<string,string> }.
 * First family to claim a symbol wins the familyBySymbol mapping.
 */
function massBackfillUniverse(config, families) {
  const symbols = [];
  const familyBySymbol = {};
  for (const f of families) {
    for (const entry of equityUniverseEntries(config[f] || {})) {
      const s = entry.symbol;
      if (!familyBySymbol[s]) familyBySymbol[s] = f;
      symbols.push(s);
    }
  }
  return { symbols: [...new Set(symbols)], familyBySymbol };
}

function buildMassBackfillExecutionPlan({ symbols, timeframes, familyBySymbol = {}, inspectJob = inspectMassBackfillJob, force = false }) {
  const jobs = [];
  const skipped = [];
  for (const symbol of symbols) {
    for (const timeframe of timeframes) {
      const job = { symbol, timeframe, family: familyBySymbol[symbol] || 'unknown' };
      const inspection = force ? { skip: false, reason: 'forced', last_timestamp: null, records: 0 } : inspectJob(job);
      if (!force && inspection.skip) {
        skipped.push({ ...job, ...inspection });
      } else {
        jobs.push({ ...job, ...inspection });
      }
    }
  }
  return {
    total_jobs: jobs.length + skipped.length,
    jobs,
    skipped,
  };
}

function classifyBackfillError(message = '') {
  const text = String(message || '');
  if (/EPERM/i.test(text) && /rename/i.test(text)) return 'filesystem_rename_eperm';
  if (/ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|fetch failed/i.test(text)) return 'provider_transport';
  if (/rate|429|too many/i.test(text)) return 'provider_rate_limit';
  return 'error';
}

function summarizeMassBackfillByFamily(jobResults = []) {
  const families = {};
  for (const result of jobResults) {
    const family = result.family || 'unknown';
    const timeframe = result.timeframe || 'unknown';
    if (!families[family]) {
      families[family] = {
        jobs: 0,
        ok: 0,
        failed: 0,
        records: 0,
        provider_errors: 0,
        timeframes: {},
      };
    }
    const familySummary = families[family];
    if (!familySummary.timeframes[timeframe]) {
      familySummary.timeframes[timeframe] = { jobs: 0, ok: 0, failed: 0, records: 0, provider_errors: 0 };
    }
    const tfSummary = familySummary.timeframes[timeframe];
    familySummary.jobs++;
    tfSummary.jobs++;
    familySummary.records += result.records || 0;
    tfSummary.records += result.records || 0;
    familySummary.provider_errors += result.provider_errors || 0;
    tfSummary.provider_errors += result.provider_errors || 0;
    if (result.ok) {
      familySummary.ok++;
      tfSummary.ok++;
    } else {
      familySummary.failed++;
      tfSummary.failed++;
    }
  }
  return families;
}

function renderMassBackfillReport(payload) {
  const line = '-'.repeat(72);
  const lines = [];
  const status = payload.ok ? 'OK' : 'WARN';
  lines.push(`\n[MASS BACKFILL REPORT] ${payload.fetched_at || new Date().toISOString()}`);
  lines.push(`Coverage: ${payload.successful}/${payload.jobs} jobs OK | failed: ${payload.errors} | skipped: ${payload.skipped_jobs} | records: ${payload.records}`);
  lines.push(`Policy: timeframes = ${(payload.timeframes || []).join(', ')} | days = ${payload.days} | concurrency = ${payload.concurrency}`);
  lines.push(`Status: ${status}`);
  lines.push(line);

  for (const [family, summary] of Object.entries(payload.families || {})) {
    const pct = summary.jobs > 0 ? Math.round(summary.ok / summary.jobs * 100) : 0;
    const familyStatus = summary.failed === 0 ? 'OK' : summary.ok > 0 ? 'WARN' : 'FAIL';
    lines.push(`\n${family.toUpperCase()}  ${familyStatus}  ${summary.ok}/${summary.jobs} jobs (${pct}%)  records:${summary.records} provider_errors:${summary.provider_errors}`);
    for (const [tf, tfSummary] of Object.entries(summary.timeframes || {})) {
      const tfStatus = tfSummary.failed === 0 ? 'OK' : tfSummary.ok > 0 ? 'WARN' : 'FAIL';
      lines.push(`  ${tf.padEnd(5)} ${tfStatus.padEnd(4)} ${String(tfSummary.ok).padStart(4)}/${String(tfSummary.jobs).padEnd(4)} records:${tfSummary.records} provider_errors:${tfSummary.provider_errors}`);
    }
  }

  if (Array.isArray(payload.failures) && payload.failures.length > 0) {
    lines.push(`\nFailures (${payload.failures.length} shown${payload.failure_count > payload.failures.length ? ` of ${payload.failure_count}` : ''}):`);
    for (const failure of payload.failures) {
      lines.push(`  ${failure.family || 'unknown'}:${failure.symbol}:${failure.timeframe}  ${failure.code || 'error'}  ${failure.message}`);
    }
  }

  if (Array.isArray(payload.skipped_preview) && payload.skipped_preview.length > 0) {
    lines.push(`\nSkipped preview (${payload.skipped_jobs} total):`);
    for (const skipped of payload.skipped_preview) {
      lines.push(`  ${skipped.family || 'unknown'}:${skipped.symbol}:${skipped.timeframe}  ${skipped.reason}`);
    }
  }

  lines.push(`\n${line}`);
  lines.push(`SUMMARY: ${payload.successful}/${payload.jobs} jobs OK | ${payload.errors} failed | ${payload.skipped_jobs} skipped`);
  if ((payload.failure_codes || []).includes('filesystem_rename_eperm')) {
    lines.push('Next step: serialize backfills or add a ts-index/cache write lock; Windows blocked one or more atomic renames.');
  } else if (payload.errors > 0) {
    lines.push('Next step: inspect failures above, then rerun with --force for affected symbols/timeframes.');
  } else {
    lines.push('Next step: run backend integrity to confirm freshness after the backfill.');
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * Handles the 'mass-backfill' command: all symbols × all timeframes with a concurrency cap.
 */
async function commandMassBackfill(args) {
  const timeframesArg = optionValue(args, '--timeframes', '1mo,1w,1d,1h,15m');
  const timeframes = timeframesArg.split(',').map(t => t.trim()).filter(Boolean);
  // 20-year deep defaults: deep-paginated providers handle the volume; mind free-tier rate limits if raising concurrency further.
  const days = optionValue(args, '--days', '7300');
  const concurrency = numericOption(args, '--concurrency', 10);
  const dryRun = hasFlag(args, '--dry-run');
  const force = hasFlag(args, '--force');

  const config = await loadConfig();
  const families = ['equities', 'indices', 'commodities', 'fx', 'crypto'];
  // flat symbols ∪ universe_matrix grid, so grid-only symbols are covered.
  const { symbols: uniqueSymbols, familyBySymbol } = massBackfillUniverse(config, families);
  const plan = buildMassBackfillExecutionPlan({
    symbols: uniqueSymbols,
    timeframes,
    familyBySymbol,
    force,
  });
  const jobs = plan.jobs;

  if (dryRun) {
    printPayload({
      ok: true,
      dry_run: true,
      force,
      total_jobs: plan.total_jobs,
      pending_jobs: jobs.length,
      skipped_jobs: plan.skipped.length,
      symbols: uniqueSymbols.length,
      timeframes,
      days,
      concurrency,
      skipped_preview: plan.skipped.slice(0, 8).map((job) => ({
        symbol: job.symbol,
        timeframe: job.timeframe,
        reason: job.reason,
        age_hours: job.age_hours ?? null,
      })),
      message: `Would backfill ${jobs.length} combinations (${uniqueSymbols.length} symbols × ${timeframes.length} timeframes). Re-run without --dry-run to execute.`,
    }, args);
    return 0;
  }

  if (jobs.length === 0) {
    printPayload({
      ok: true,
      jobs: 0,
      successful: 0,
      errors: 0,
      records: 0,
      skipped_jobs: plan.skipped.length,
      symbols: uniqueSymbols.length,
      timeframes,
      days,
      output: DEFAULT_HISTORY,
      message: 'No pending combinations. Existing cache is already fresh for the requested timeframes.',
    }, args);
    return 0;
  }

  const results = { ok: 0, errors: 0 };
  const allSources = [];
  const allErrors = [];
  const jobResults = [];
  let completed = 0;
  const total = jobs.length;
  const completedBySymbol = new Map();
  const totalBySymbol = new Map();
  jobs.forEach((job) => {
    totalBySymbol.set(job.symbol, (totalBySymbol.get(job.symbol) || 0) + 1);
  });

  async function runJob({ symbol, timeframe, family }) {
    const syntheticArgs = ['--symbol', symbol, '--timeframe', timeframe, '--days', days];
    if (force) syntheticArgs.push('--force');
    try {
      const history = await loadHistoricalSources(syntheticArgs);
      const sources = history.snapshot.sources || [];
      const errors = history.snapshot.errors || [];
      for (let i = 0; i < sources.length; i++) {
        allSources.push(sources[i]);
      }
      for (let i = 0; i < errors.length; i++) {
        allErrors.push(errors[i]);
      }
      jobResults.push({
        ok: true,
        symbol,
        timeframe,
        family,
        records: sources.length,
        provider_errors: errors.length,
      });
      results.ok++;
    } catch (err) {
      const message = err.message || String(err);
      const code = classifyBackfillError(message);
      allErrors.push({ symbol, timeframe, family, code, message });
      jobResults.push({
        ok: false,
        symbol,
        timeframe,
        family,
        records: 0,
        provider_errors: 0,
        code,
        message,
      });
      results.errors++;
    }
    completed++;
    completedBySymbol.set(symbol, (completedBySymbol.get(symbol) || 0) + 1);
    if (process.stdout.isTTY) {
      process.stdout.write(`\r\x1b[K\x1b[90m[${completed}/${total}]\x1b[0m ${symbol}:${timeframe}  \x1b[90m(symbol ${completedBySymbol.get(symbol)}/${totalBySymbol.get(symbol)} | skipped ${plan.skipped.length})\x1b[0m`);
    }
  }

  const queue = [...jobs];
  async function worker() {
    while (queue.length > 0) {
      const job = queue.shift();
      if (job) await runJob(job);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));

  if (process.stdout.isTTY) process.stdout.write('\n');

  const fetchedAt = new Date().toISOString();
  const snapshot = {
    mode: 'mass_backfill',
    fetched_at: fetchedAt,
    sources: allSources,
    errors: allErrors,
  };

  const { report } = validateSnapshot(snapshot, { rejectStale: false });
  const existing = readSnapshot(DEFAULT_HISTORY);
  const merged = mergeSnapshots(existing, snapshot);
  writePartitionedSnapshot(DEFAULT_HISTORY, merged);
  writeTsIndex(DEFAULT_TS_DIR, merged);
  writeJson(DEFAULT_QUALITY_REPORT, report);

  const failures = jobResults
    .filter((result) => !result.ok)
    .map((result) => ({
      family: result.family,
      symbol: result.symbol,
      timeframe: result.timeframe,
      code: result.code || 'error',
      message: result.message || 'unknown error',
    }));
  const payload = {
    ok: results.errors === 0,
    type: 'mass_backfill_report',
    fetched_at: fetchedAt,
    jobs: total,
    successful: results.ok,
    errors: results.errors,
    failure_count: failures.length,
    failure_codes: [...new Set(failures.map((failure) => failure.code))],
    failures: failures.slice(0, 20),
    records: allSources.length,
    skipped_jobs: plan.skipped.length,
    skipped_preview: plan.skipped.slice(0, 12).map((job) => ({
      family: job.family,
      symbol: job.symbol,
      timeframe: job.timeframe,
      reason: job.reason,
      age_hours: job.age_hours ?? null,
    })),
    families: summarizeMassBackfillByFamily(jobResults),
    symbols: uniqueSymbols.length,
    timeframes,
    days,
    concurrency,
    output: DEFAULT_HISTORY,
  };
  if (hasFlag(args, '--json')) {
    printPayload(payload, args);
  } else {
    console.log(renderMassBackfillReport(payload));
  }
  return results.errors === 0 ? 0 : 1;
}

module.exports = {
  DEFAULT_TS_DIR,
  MASS_BACKFILL_STALE_MS,
  WEEKEND_EXEMPT_FAMILIES,
  weekendHoursElapsed,
  inspectMassBackfillJob,
  massBackfillUniverse,
  buildMassBackfillExecutionPlan,
  classifyBackfillError,
  summarizeMassBackfillByFamily,
  renderMassBackfillReport,
  commandMassBackfill,
};
