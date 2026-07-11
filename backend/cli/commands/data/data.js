const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const {
  ingestMarketData,
  getIngestFamilyAvailability,
} = require('../../../scripts/data_ops/ingest_market_data.js');
const {
  loadHistoricalSources,
  loadPredictionMarketHistory,
} = require('../research/research.js');
const { backfill20Years } = require('../../../../scripts/data_ops/backfill_20_years.js');
const { runMaintenance } = require('../../../../shared/lib/data/db_pruning.js');
const { validateSnapshot, writeJson, readSnapshot, mergeSnapshots, writePartitionedSnapshot, writeTsIndex, readTsIndex, recordKey } = require('../../../../shared/lib/market/validation.js');
const utils = require('../../lib/utils.js');
const { featureGate } = require('../../../../shared/lib/settings/runtime');
const {
  printPayload,
  optionValue,
  numericOption,
  hasFlag,
  pageText,
  withLoadingAnimation,
  shouldAnimate,
  DEFAULT_SNAPSHOT,
  DEFAULT_QUALITY_REPORT,
  DEFAULT_HISTORY
} = utils;

const API_CACHE_DIR = path.join(utils.REPO_ROOT, 'storage', 'data', 'cache', 'api_responses');
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

const { DEFAULT_TS_DIR, rollupFromBase, rollupTargetsAboveBase, writeDeadSymbolMarker, listDeepSymbols, listDeepFiveMinSymbols, readBinFamily, readFiveMinBinFamily, rollupFiveMinForSymbol, commandIntradayRollup, INTRADAY_TF_ORDER, FULL_TF_ORDER, FAMILY_BASE_TF } = require('./data_rollup.js');
const { equityUniverseEntries, alpacaEquity5mSkipReason, buildEquityDeepBackfillPlan, estimateEquity5mApiCalls, commandCryptoDeepBackfill, commandEquityDeepBackfill } = require('./data_deep_backfill.js');
const { buildFiveMinAccumulatePlan, commandFiveMinAccumulate, buildIntradayAccumulatePlan, commandIntradayAccumulate, commandUniverse } = require('./data_accumulate.js');

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

function backtestHistoryFiles(inputPath) {
  if (!inputPath || !fs.existsSync(inputPath)) return [];
  const stat = fs.statSync(inputPath);
  if (stat.isFile()) return [inputPath];
  const files = [];
  const scan = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'quarantine') continue;
        scan(full);
      } else if (entry.isFile() && (entry.name === 'backtest_history.json' || entry.name === 'last_fetch.json')) {
        files.push(full);
      }
    }
  };
  scan(inputPath);
  return files;
}

function compactIssueCodes(issues) {
  return [...new Set((issues || []).map((issue) => issue.code).filter(Boolean))];
}

function quarantinePathFor(inputPath, filePath, rootPath, stamp) {
  const root = fs.existsSync(inputPath) && fs.statSync(inputPath).isDirectory()
    ? inputPath
    : path.dirname(inputPath);
  const relative = path.relative(rootPath, filePath).replace(/[^a-zA-Z0-9._-]+/g, '__');
  return path.join(root, 'quarantine', `${stamp}__${relative}`);
}

/**
 * Handles the 'cache-clean' command.
 */
function commandCacheClean(args) {
  const input = optionValue(args, '--input', DEFAULT_HISTORY);
  const dryRun = hasFlag(args, '--dry-run');
  const files = backtestHistoryFiles(input);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const cleanedFiles = [];
  const quarantineFiles = [];
  const issueCodes = new Set();
  let totalRecords = 0;
  let usableRecords = 0;
  let rejectedRecords = 0;

  for (const file of files) {
    let snapshot;
    try {
      snapshot = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      issueCodes.add('unreadable_cache_file');
      continue;
    }

    const rejectStale = path.basename(file) === 'last_fetch.json';
    const { report, usableSources } = validateSnapshot(snapshot, { rejectStale });
    totalRecords += report.total_records || 0;
    usableRecords += usableSources.length;
    rejectedRecords += report.rejected_records || 0;
    for (const code of compactIssueCodes(report.issues)) issueCodes.add(code);

    if (report.rejected_records <= 0) continue;

    const rejectedKeys = new Set(report.rejected_keys || []);
    const rejectedSources = (snapshot.sources || []).filter((record, index) => {
      return rejectedKeys.has(recordKey(record, index));
    });

    const quarantinePath = quarantinePathFor(input, file, fs.existsSync(input) && fs.statSync(input).isDirectory() ? input : path.dirname(input), stamp);
    quarantineFiles.push(quarantinePath);
    cleanedFiles.push(file);

    if (!dryRun) {
      writeJson(quarantinePath, {
        mode: 'cache_quarantine',
        quarantined_at: new Date().toISOString(),
        source_file: file,
        rejected_records: rejectedSources.length,
        issues: (report.issues || []).filter((issue) => issue.severity === 'error'),
        sources: rejectedSources,
      });
      writeJson(file, {
        ...snapshot,
        cleaned_at: new Date().toISOString(),
        sources: usableSources,
      });
    }
  }

  const payload = {
    ok: true,
    dry_run: dryRun,
    input,
    files_scanned: files.length,
    files_cleaned: cleanedFiles.length,
    total_records: totalRecords,
    usable_records: usableRecords,
    rejected_records: rejectedRecords,
    issue_codes: Array.from(issueCodes),
    cleaned_files: cleanedFiles,
    quarantine_files: dryRun ? [] : quarantineFiles,
    message: dryRun
      ? 'Dry run only. Re-run without --dry-run to quarantine rejected records.'
      : 'Rejected cache records quarantined. Backfill can rebuild removed history.',
  };

  printPayload(payload, args);
  return 0;
}

/**
 * Handles the 'ingest' command.
 */
function ingestOptionsFromArgs(args) {
  const family = optionValue(args, '--family', 'all');
  const symbol = optionValue(args, '--symbol', null);
  const timeframe = optionValue(args, '--timeframe', null);
  const provider = optionValue(args, '--provider', null);
  const historyDays = numericOption(args, '--history-days', null) ?? numericOption(args, '--days', null);
  const options = {};
  if (family && family !== 'all') options.family = family;
  if (symbol) options.symbol = symbol;
  if (timeframe) options.timeframe = timeframe;
  // Pin a single provider for the fetch (e.g. deep daily must hit Yahoo/Frankfurter, not the
  // intraday-finest provider whose daily is shallow). ingestMarketData honors options.provider.
  if (provider) options.provider = provider;
  if (hasFlag(args, '--force')) options.force = true;
  if (hasFlag(args, '--dry-run')) options.dryRun = true;
  if (Number.isFinite(historyDays) && historyDays > 0) {
    options.historyDays = historyDays;
  }
  return options;
}

async function commandIngest(args) {
  const ingestOptions = ingestOptionsFromArgs(args);
  const unavailable = getIngestFamilyAvailability(ingestOptions.family);
  if (ingestOptions.family && ['onchain', 'crypto_tx', 'holdings', 'reserves'].includes(ingestOptions.family)) {
    const gate = featureGate('onchain_data', { surface: `Ingest family '${ingestOptions.family}'` });
    if (!gate.ok) {
      printPayload({ ok: false, type: 'feature_gate', feature_flag: gate.flag, reason: gate.reason, hint: gate.hint }, args);
      return 1;
    }
  }
  if (unavailable && !ingestOptions.dryRun) {
    printPayload({
      ok: false,
      type: unavailable.status,
      family: unavailable.family,
      provider: unavailable.provider,
      reason: `${unavailable.provider} ${unavailable.family} provider is not implemented`,
    }, args);
    return 1;
  }
  // withLoadingAnimation silently skips its spinner on a non-TTY stdout (the
  // case when this runs piped from the dashboard, not given a real TTY) --
  // that's correct (a raw \r-spinner would just dump garbage into a piped
  // stream), but it means zero output appears for the whole fetch duration,
  // which reads as a hang. Print one explicit line first so there's visible
  // progress in that case.
  if (!shouldAnimate(args) && !hasFlag(args, '--json')) {
    const verb = ingestOptions.dryRun ? 'Planning market cache refresh' : 'Refreshing market cache';
    console.log(`${verb} (family=${ingestOptions.family || 'all'}, this can take a while)...`);
  }
  const loadingLabel = ingestOptions.dryRun ? 'Planning market cache refresh' : 'Refreshing market cache';
  const snapshot = await withLoadingAnimation(loadingLabel, () => ingestMarketData(ingestOptions), args);
  if (hasFlag(args, '--full')) {
    console.log(JSON.stringify(snapshot, null, 2));
    return 0;
  }
  printPayload({
    dry_run: Boolean(snapshot.dry_run),
    mode: snapshot.mode,
    fetched_at: snapshot.fetched_at,
    sources: snapshot.sources.length,
    errors: snapshot.errors.length,
    planned_fetches: snapshot.dry_run_plan ? snapshot.dry_run_plan.planned_fetches : undefined,
    provider_checks: (snapshot.provider_checks || []).length,
  }, args);
  return snapshot.errors.length === 0 ? 0 : 1;
}

/**
 * Handles the 'backfill' command.
 */
async function commandBackfill(args) {
  const symbol = optionValue(args, '--symbol', 'SPY');
  let snapshotResult = null;

  if (hasFlag(args, '--20-years')) {
      snapshotResult = await withLoadingAnimation(`Backfilling 20 years for ${symbol}`, () => backfill20Years(symbol), args);
      if (!snapshotResult) return 1;
  }

  const output = optionValue(args, '--output', DEFAULT_HISTORY);
  const relevanceFloor = numericOption(args, '--relevance-floor', 0);
  const force = hasFlag(args, '--force');
  let marketHistory = null;

  // If we already have a snapshot from 20-year backfill, we can use it or augment it
  if (snapshotResult) {
      marketHistory = { snapshot: snapshotResult, quality: null };
  } else {
      try {
        marketHistory = await withLoadingAnimation('Loading historical sources', () => loadHistoricalSources(args), args);
      } catch (error) {
        console.error(`[BACKFILL] Critical Failure: ${error.stack || error.message}`);
        marketHistory = {
          snapshot: {
            mode: 'provider_history',
            fetched_at: new Date().toISOString(),
            sources: [],
            errors: [{ family: 'market_history', provider: 'mixed', symbol: 'configured_universe', message: error.message }],
          },
          quality: null,
        };
      }
  }

  const predictionHistory = hasFlag(args, '--include-prediction')
    ? await withLoadingAnimation('Loading prediction history', () => loadPredictionMarketHistory(args), args)
    : { sources: [], errors: [] };

  const snapshot = {
    mode: 'backtest_history',
    fetched_at: new Date().toISOString(),
    sources: [...(marketHistory.snapshot.sources || []), ...(predictionHistory.sources || [])],
    errors: [...(marketHistory.snapshot.errors || []), ...(predictionHistory.errors || [])],
    backfill_windows: [...(marketHistory.snapshot.backfill_windows || [])],
  };

  const { report } = validateSnapshot(snapshot, { rejectStale: false });
  const byKeyScore = new Map((report.reliability?.samples || []).map((sample) => [sample.key, sample.score]));

  const filteredSources = relevanceFloor > 0
    ? snapshot.sources.filter((record, index) => {
      const key = `${record.family || 'unknown'}:${record.provider || 'unknown'}:${record.symbol || record.underlying || record.series || record.location || record.region || record.country || record.chain || record.metric || 'unknown'}:${record.timeframe || record.component || record.metric || record.option_type || 'point'}:${record.timestamp || `index_${index}`}`;
      const score = byKeyScore.get(key);
      return Number.isFinite(score) ? score >= relevanceFloor : true;
    })
    : snapshot.sources;

  const filteredSnapshot = { ...snapshot, sources: filteredSources };
  const filteredReport = validateSnapshot(filteredSnapshot, { rejectStale: false }).report;

  // For backfill, we use the root directory if output is default,
  // and writePartitionedSnapshot will handle the subdirectory logic.
  const existing = readSnapshot(output);
  const preservedSnapshot = mergeSnapshots(existing, filteredSnapshot);

  if (output === DEFAULT_HISTORY) {
    writePartitionedSnapshot(output, preservedSnapshot);
  } else {
    writeJson(output, preservedSnapshot);
  }
  writeTsIndex(DEFAULT_TS_DIR, preservedSnapshot);

  writeJson(DEFAULT_QUALITY_REPORT, filteredReport);

  printPayload({
    mode: filteredSnapshot.mode,
    records: filteredSnapshot.sources.length,
    errors: filteredSnapshot.errors.length,
    stale_records: filteredReport.freshness.stale_records,
    reliability_samples: (filteredReport.reliability?.samples || []).length,
    relevance_floor: relevanceFloor,
    backfill_windows: filteredSnapshot.backfill_windows || [],
    output,
    quality_report: DEFAULT_QUALITY_REPORT,
  }, args);
  return filteredSnapshot.errors.length === 0 ? 0 : 1;
}

/**
 * Handles the 'mass-backfill' command: all symbols × all timeframes with a concurrency cap.
 */
async function commandMassBackfill(args) {
  const { loadConfig } = require('../../../scripts/data_ops/ingest_market_data.js');
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
  const jobResults = [];
  let completed = 0;
  let recordsWritten = 0;
  const total = jobs.length;
  const completedBySymbol = new Map();
  const totalBySymbol = new Map();
  jobs.forEach((job) => {
    totalBySymbol.set(job.symbol, (totalBySymbol.get(job.symbol) || 0) + 1);
  });

  // Flush per family (not per overall run): writePartitionedSnapshot/readSnapshot are
  // already family-partitioned on disk, so buffering and merging one family at a time
  // (instead of accumulating every job's records into one run-wide array, then merging
  // against a readSnapshot(DEFAULT_HISTORY) that recursively loads ALL families'
  // existing history) bounds peak memory to one family's data instead of the whole
  // universe's. The ts-index write stays per-job: writeTsIndex's merge-protected,
  // symbol+timeframe-scoped bin writes are already safe at that finer grain.
  const fetchedAt = new Date().toISOString();
  const remainingByFamily = new Map();
  jobs.forEach((job) => {
    remainingByFamily.set(job.family, (remainingByFamily.get(job.family) || 0) + 1);
  });
  const sourcesByFamily = new Map();
  const errorsByFamily = new Map();
  const aggregateReport = {
    ok: true,
    mode: 'mass_backfill',
    fetched_at: fetchedAt,
    total_records: 0,
    usable_records: 0,
    rejected_records: 0,
    counts: { error: 0, warning: 0 },
    by_family: {},
    rejected_keys: [],
    issues: [],
    provider_errors: [],
    reject_stale: false,
    freshness: { stale_records: 0, issues: 0 },
    reliability: { samples: [] },
  };

  function flushFamily(family) {
    const sources = sourcesByFamily.get(family) || [];
    const errors = errorsByFamily.get(family) || [];
    const snapshot = { mode: 'mass_backfill', fetched_at: fetchedAt, sources, errors };

    const { report } = validateSnapshot(snapshot, { rejectStale: false });
    aggregateReport.total_records += report.total_records;
    aggregateReport.usable_records += report.usable_records;
    aggregateReport.rejected_records += report.rejected_records;
    aggregateReport.counts.error += report.counts.error;
    aggregateReport.counts.warning += report.counts.warning;
    Object.assign(aggregateReport.by_family, report.by_family);
    aggregateReport.rejected_keys.push(...report.rejected_keys);
    aggregateReport.issues.push(...report.issues);
    aggregateReport.provider_errors.push(...report.provider_errors);
    aggregateReport.freshness.stale_records += report.freshness.stale_records;
    aggregateReport.freshness.issues += report.freshness.issues;
    aggregateReport.ok = aggregateReport.ok && report.ok;

    const existing = readSnapshot(DEFAULT_HISTORY, { family });
    const merged = mergeSnapshots(existing, snapshot);
    writePartitionedSnapshot(DEFAULT_HISTORY, merged);

    recordsWritten += sources.length;
    sourcesByFamily.delete(family);
    errorsByFamily.delete(family);
  }

  async function runJob({ symbol, timeframe, family }) {
    const syntheticArgs = ['--symbol', symbol, '--timeframe', timeframe, '--days', days];
    if (force) syntheticArgs.push('--force');
    if (!sourcesByFamily.has(family)) sourcesByFamily.set(family, []);
    if (!errorsByFamily.has(family)) errorsByFamily.set(family, []);
    try {
      const history = await loadHistoricalSources(syntheticArgs);
      const sources = history.snapshot.sources || [];
      const errors = history.snapshot.errors || [];
      const familySources = sourcesByFamily.get(family);
      const familyErrors = errorsByFamily.get(family);
      for (let i = 0; i < sources.length; i++) {
        familySources.push(sources[i]);
      }
      for (let i = 0; i < errors.length; i++) {
        familyErrors.push(errors[i]);
      }
      if (sources.length > 0) {
        writeTsIndex(DEFAULT_TS_DIR, { sources });
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
      errorsByFamily.get(family).push({ symbol, timeframe, family, code, message });
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
    const remaining = remainingByFamily.get(family) - 1;
    remainingByFamily.set(family, remaining);
    if (remaining === 0) {
      flushFamily(family);
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

  // Any family whose last job errored before producing sources may still have a
  // non-empty error buffer that hasn't been flushed (flushFamily already runs when
  // the last job for a family completes, success or failure, so this is just a
  // defensive catch-all for families left in the maps due to an unexpected throw).
  for (const family of new Set([...sourcesByFamily.keys(), ...errorsByFamily.keys()])) {
    flushFamily(family);
  }

  writeJson(DEFAULT_QUALITY_REPORT, aggregateReport);

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
    records: recordsWritten,
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

/**
 * Handles the 'validate' command.
 */
function commandValidate(args) {
  const input = optionValue(args, '--input', DEFAULT_SNAPSHOT);
  const output = optionValue(args, '--output', DEFAULT_QUALITY_REPORT);
  const snapshot = readSnapshot(input);
  const strict = hasFlag(args, '--strict');
  const { report } = validateSnapshot(snapshot, { strict });
  writeJson(output, report);
  
  const payload = {
    ok: report.ok,
    total_records: report.total_records,
    usable_records: report.usable_records,
    rejected_records: report.rejected_records,
    errors: report.counts.error,
    warnings: report.counts.warning,
    stale_records: report.freshness.stale_records,
    freshness_issues: report.freshness.issues,
    provider_errors: report.provider_errors.length,
    output,
  };

  if (hasFlag(args, '--json')) {
    printPayload(payload, args);
  } else {
    console.log(`\n=== DATA QUALITY CHECK ===`);
    console.log(`Status:  ${report.ok ? 'PASS' : 'FAIL'}`);
    console.log(`Records: ${report.usable_records} usable | ${report.rejected_records} rejected | ${report.total_records} total`);
    console.log(`Issues:  ${report.counts.error} errors | ${report.counts.warning} warnings`);
    if (report.freshness.stale_records > 0) {
      console.log(`Stale:   ${report.freshness.stale_records} records are stale`);
    }
    
    if (report.issues && report.issues.length > 0) {
      console.log(`\nTop Issues (first 10):`);
      const topIssues = report.issues.slice(0, 10);
      topIssues.forEach(i => {
         const parts = (i.key || '').split(':');
         const sym = parts[2] || '?';
         const tf = parts[3] || '?';
         const sev = i.severity === 'error' ? 'FAIL' : 'WARN';
         console.log(`  [${sev}] ${sym.padEnd(8)} | ${tf.padEnd(3)} | ${i.code.padEnd(16)} | ${i.message}`);
      });
      if (report.issues.length > 10) {
         console.log(`  ... and ${report.issues.length - 10} more issues.`);
      }
    }
    console.log(`\nDetailed JSON report written to:\n  ${output}\n`);
  }
  return !report.ok ? 1 : 0;
}

/**
 * Handles the 'prune' command for database maintenance.
 */
async function commandPrune(args) {
  const days = numericOption(args, '--days', 30);
  const archive = optionValue(args, '--archive', null);

  console.log(`[MAINTENANCE] Starting database pruning (Retention: ${days} days)...`);

  try {
    const results = await withLoadingAnimation('Pruning database', () => runMaintenance(days, archive), args);
    printPayload({
      ok: true,
      retention_days: days,
      results
    }, args);
    return 0;
  } catch (error) {
    console.error(`[MAINTENANCE] Pruning failed: ${error.message}`);
    return 1;
  }
}

/**
 * Handles the 'watch' command.
 */
async function commandWatch(args) {
  const family = optionValue(args, '--family', 'all');
  if (['onchain', 'crypto_tx', 'holdings', 'reserves'].includes(family)) {
    const gate = featureGate('onchain_data', { surface: `Watch family '${family}'` });
    if (!gate.ok) {
      printPayload({ ok: false, type: 'feature_gate', feature_flag: gate.flag, reason: gate.reason, hint: gate.hint }, args);
      return 1;
    }
  }
  const intervalMinutes = numericOption(args, '--interval', 15);
  const intervalMs = intervalMinutes * 60 * 1000;

  // Optional live-chart mode: --symbol narrows watch to a single symbol and
  // redraws its price history as an ANSI chart each cycle (reusing the same
  // renderPriceChart() backend_chart.js already uses) instead of the
  // multi-symbol latest-price table, addressing the request to chart `watch`
  // instead of a plain table.
  const chartSymbol = optionValue(args, '--symbol', null);
  const chartTimeframe = optionValue(args, '--timeframe', '1d');

  let showLimit = 10;
  let latestBySymbol = new Map();
  let lastSyncTime = null;
  let lastSyncCount = 0;
  let lastSyncDuration = 0;

  // When launched from the dashboard, this runs as a piped, non-TTY child
  // (the dashboard only gives commands a real inherited TTY for
  // INTERACTIVE_CMDS, and `watch` isn't one). console.clear() and the raw
  // \r\x1b[K cursor-control writes below are meaningless on a pipe -- they
  // land as literal control bytes in the dashboard's captured output text,
  // visibly corrupting the rendered panel. Fall back to plain, append-only
  // log lines in that case.
  const isTTY = !!process.stdout.isTTY;
  const render = () => {
    if (isTTY) console.clear();
    console.log(`\x1b[1;36mSOVEREIGN WATCH MODE\x1b[0m \x1b[90m(Family: ${family}, Interval: ${intervalMinutes}m)\x1b[0m`);
    console.log('\x1b[90mPress Ctrl+C to stop, Ctrl+T to show more.\x1b[0m\n');

    if (lastSyncTime) {
      process.stdout.write(`\x1b[32m✔\x1b[0m Last sync: \x1b[1m${lastSyncTime}\x1b[0m (\x1b[90m${lastSyncCount} records, ${lastSyncDuration}s\x1b[0m)\n\n`);
    }

    if (chartSymbol) {
      const { renderPriceChart } = require('../../tui/visualizations.js');
      const bars = (readTsIndex(DEFAULT_TS_DIR, chartSymbol, chartTimeframe) || [])
        .filter((s) => typeof s.close === 'number' && isFinite(s.close));
      console.log(renderPriceChart(bars, 64));
      return;
    }

    if (latestBySymbol.size > 0) {
      const sortedSymbols = Array.from(latestBySymbol.keys()).sort();
      const visibleSymbols = sortedSymbols.slice(0, showLimit);

      console.log('\x1b[1m  Target       Price        Type      Provider\x1b[0m');
      console.log('\x1b[90m  ───────────  ───────────  ──────── ────────\x1b[0m');

      for (const sym of visibleSymbols) {
        const latest = latestBySymbol.get(sym);
        const price = latest.close || latest.value || 'N/A';
        const type = latest.timeframe || 'point';
        const provider = latest.provider || 'unknown';

        const displaySym = String(sym).slice(0, 11).padEnd(11);
        const displayPrice = String(price).slice(0, 11).padEnd(11);
        const displayType = String(type).slice(0, 8).padEnd(8);

        console.log(`  \x1b[36m${displaySym}\x1b[0m \x1b[32m${displayPrice}\x1b[0m  \x1b[90m${displayType}  ${provider}\x1b[0m`);
      }

      if (latestBySymbol.size > showLimit) {
        console.log(`\x1b[90m  ... and ${latestBySymbol.size - showLimit} more targets (Press Ctrl+T to expand)\x1b[0m`);
      }
      console.log('');
    }
  };

  const runIngest = async () => {
    const start = Date.now();
    const syncLabel = chartSymbol ? chartSymbol : family;
    if (isTTY) {
      process.stdout.write(`\r\x1b[K\x1b[33m⌛\x1b[0m Synchronizing ${syncLabel} data...`);
    } else {
      console.log(`Synchronizing ${syncLabel} data...`);
    }
    try {
      // Chart mode only needs one symbol, not a whole-family ingest -- a
      // huge win for the slow-boot complaint, since the table mode's
      // multi-provider family fetch is exactly what made `watch` feel hung.
      const snapshot = chartSymbol
        ? await ingestMarketData({ symbol: chartSymbol, timeframe: chartTimeframe })
        : await ingestMarketData({ family: family === 'all' ? null : family });
      lastSyncDuration = ((Date.now() - start) / 1000).toFixed(1);
      lastSyncTime = new Date().toLocaleTimeString();

      const lastRecords = snapshot.sources.filter(r => !family || family === 'all' || r.family === family);
      lastSyncCount = lastRecords.length;

      latestBySymbol.clear();
      for (const r of lastRecords) {
        const sym = r.symbol || r.underlying || r.series || 'unknown';
        const existing = latestBySymbol.get(sym);
        if (!existing || new Date(r.timestamp) > new Date(existing.timestamp)) {
          latestBySymbol.set(sym, r);
        }
      }
      render();
    } catch (error) {
      if (isTTY) {
        process.stdout.write(`\r\x1b[K\x1b[31m✘\x1b[0m Sync failed: ${error.message}\n`);
      } else {
        console.log(`Sync failed: ${error.message}`);
      }
    }
  };

  if (process.stdout.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (key) => {
      if (key === '\u0003') { // Ctrl+C
        console.log('\n\x1b[33mWatch mode stopped.\x1b[0m');
        process.exit(0);
      }
      if (key === '\u0014') { // Ctrl+T
        showLimit = (showLimit === 10) ? latestBySymbol.size : 10;
        render();
      }
    });
  }

  await runIngest();

  let nextRun = Date.now() + intervalMs;
  const timer = setInterval(async () => {
    if (global.suppressLogs) return; // Add suppression check
    const now = Date.now();
    const remaining = Math.max(0, nextRun - now);

    // The live countdown is only meaningful on a real TTY that can redraw
    // the same line in place; piped (non-TTY) output would instead get one
    // new line per second forever, flooding the dashboard's captured output.
    if (isTTY) {
      const seconds = Math.floor(remaining / 1000);
      const minutes = Math.floor(seconds / 60);
      const displaySeconds = seconds % 60;

      const progressWidth = 20;
      const progress = Math.min(1, (intervalMs - remaining) / intervalMs);
      const filled = Math.floor(progress * progressWidth);
      const empty = progressWidth - filled;
      const progressBar = `\x1b[90m[\x1b[36m${'█'.repeat(filled)}\x1b[90m${'░'.repeat(empty)}]\x1b[0m`;

      process.stdout.write(`\r\x1b[KNext refresh in: \x1b[1m${minutes}m ${displaySeconds}s\x1b[0m ${progressBar} `);
    }

    if (remaining <= 0) {
      if (isTTY) process.stdout.write('\n');
      await runIngest();
      nextRun = Date.now() + intervalMs;
    }
  }, 1000);

  return new Promise(() => {});
}

async function commandLoc(args) {
  const isJson = hasFlag(args, '--json');
  if (!isJson) console.log('Counting project lines (excluding artifacts)...');

  const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
  const TARGET_DIRS = ['backend', 'Frontend', 'shared', 'tests', 'infra', 'supabase'];
  const EXCLUDED_DIRS = ['node_modules', 'build', 'dist', '.git', '.gemini', '.codex', '.agents'];
  const INCLUDED_EXTS = ['.js', '.ts', '.tsx', '.cpp', '.hpp', '.h', '.yaml', '.yml', '.json', '.md'];

  let totalLines = 0;

  function countLinesSync(filePath) {
    try {
      const buffer = fs.readFileSync(filePath);
      let lines = 0;
      for (let i = 0; i < buffer.length; i++) {
        if (buffer[i] === 10) lines++; // Count \n
      }
      return lines;
    } catch (e) {
      return 0;
    }
  }

  function walkSync(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);

      // Check exclusions early
      if (EXCLUDED_DIRS.some(ex => fullPath.includes(`${path.sep}${ex}`) || fullPath.endsWith(`${path.sep}${ex}`))) {
        continue;
      }

      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        walkSync(fullPath);
      } else if (stat.isFile()) {
        const ext = path.extname(fullPath).toLowerCase();
        if (INCLUDED_EXTS.includes(ext)) {
          totalLines += countLinesSync(fullPath);
        }
      }
    }
  }

  try {
    for (const dir of TARGET_DIRS) {
      const fullDir = path.join(REPO_ROOT, dir);
      if (fs.existsSync(fullDir)) {
        walkSync(fullDir);
      }
    }

    const payload = {
      ok: true,
      type: 'project_scale',
      loc: totalLines,
      timestamp: new Date().toISOString(),
      scope: TARGET_DIRS,
      excluded: EXCLUDED_DIRS
    };

    if (isJson) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.log(`\x1b[32mTotal LOC: ${totalLines.toLocaleString()}\x1b[0m`);
    }
    return 0;
  } catch (err) {
    if (isJson) {
      console.log(JSON.stringify({ ok: false, error: err.message }, null, 2));
    } else {
      console.error(`Failed to count lines: ${err.message}`);
    }
    return 1;
  }
}

/**
 * clear-api-cache: delete provider API response cache and/or ts bins.
 *
 * Flags:
 *   --dry-run          show what would be deleted without deleting
 *   --api              clear storage/data/cache/api_responses/ (default: true unless --ts-only)
 *   --ts               also clear storage/data/ts/ bins
 *   --ts-only          clear only ts bins (skip api_responses)
 *   --symbol SYMBOL    with --ts: restrict to bins for that symbol (e.g. BTCUSDT)
 *   --timeframe TF     with --ts + --symbol: restrict to a single timeframe bin
 *
 * Examples:
 *   sovereign clear-api-cache --dry-run
 *   sovereign clear-api-cache
 *   sovereign clear-api-cache --ts --symbol BTCUSDT
 *   sovereign clear-api-cache --ts-only --symbol AAPL --timeframe 1m
 */
function commandClearApiCache(args) {
  const dryRun = hasFlag(args, '--dry-run');
  const tsOnly = hasFlag(args, '--ts-only');
  const includeTs = tsOnly || hasFlag(args, '--ts');
  const includeApi = !tsOnly;
  const symbolFilter = (optionValue(args, '--symbol', null) || '').toUpperCase() || null;
  const tfFilter = optionValue(args, '--timeframe', null) || null;

  const result = { ok: true, dry_run: dryRun, api_cache: null, ts_cache: null };

  // --- API response cache ---
  if (includeApi) {
    const apiFiles = [];
    let apiBytes = 0;
    try {
      for (const f of fs.readdirSync(API_CACHE_DIR)) {
        if (!f.endsWith('.json')) continue;
        const fp = path.join(API_CACHE_DIR, f);
        try { apiBytes += fs.statSync(fp).size; } catch (_) {}
        apiFiles.push(fp);
      }
    } catch (_) {}
    if (!dryRun) {
      let deleted = 0;
      for (const fp of apiFiles) { try { fs.unlinkSync(fp); deleted++; } catch (_) {} }
      result.api_cache = { deleted, freed_mb: +(apiBytes / 1e6).toFixed(1) };
    } else {
      result.api_cache = { would_delete: apiFiles.length, size_mb: +(apiBytes / 1e6).toFixed(1) };
    }
  }

  // --- ts binary cache ---
  if (includeTs) {
    const tsFiles = [];
    let tsBytes = 0;
    try {
      for (const f of fs.readdirSync(DEFAULT_TS_DIR)) {
        if (!f.endsWith('.bin') && !f.endsWith('.meta.json')) continue;
        // parse SYMBOL_TF.bin or SYMBOL_TF.meta.json
        const base = f.replace(/\.meta\.json$/, '').replace(/\.bin$/, '');
        const lastUnderscore = base.lastIndexOf('_');
        const sym = lastUnderscore >= 0 ? base.slice(0, lastUnderscore).toUpperCase() : '';
        const tf = lastUnderscore >= 0 ? base.slice(lastUnderscore + 1) : '';
        if (symbolFilter && sym !== symbolFilter) continue;
        if (tfFilter && tf !== tfFilter) continue;
        const fp = path.join(DEFAULT_TS_DIR, f);
        try { tsBytes += fs.statSync(fp).size; } catch (_) {}
        tsFiles.push(fp);
      }
    } catch (_) {}
    if (!dryRun) {
      let deleted = 0;
      for (const fp of tsFiles) { try { fs.unlinkSync(fp); deleted++; } catch (_) {} }
      result.ts_cache = { deleted, freed_mb: +(tsBytes / 1e6).toFixed(1), symbol: symbolFilter || 'all', timeframe: tfFilter || 'all' };
    } else {
      result.ts_cache = { would_delete: tsFiles.length, size_mb: +(tsBytes / 1e6).toFixed(1), symbol: symbolFilter || 'all', timeframe: tfFilter || 'all' };
    }
  }

  printPayload(result, args);
  return 0;
}

module.exports = {
  buildMassBackfillExecutionPlan,
  classifyBackfillError,
  massBackfillUniverse,
  renderMassBackfillReport,
  summarizeMassBackfillByFamily,
  ingestOptionsFromArgs,
  commandIngest,
  commandBackfill,
  commandMassBackfill,
  commandCacheClean,
  commandClearApiCache,
  inspectMassBackfillJob,
  commandValidate,
  commandWatch,
  commandPrune,
  commandLoc,
  commandUniverse,
  commandCryptoDeepBackfill,
  commandEquityDeepBackfill,
  buildEquityDeepBackfillPlan,
  estimateEquity5mApiCalls,
  commandFiveMinAccumulate,
  buildFiveMinAccumulatePlan,
  commandIntradayAccumulate,
  buildIntradayAccumulatePlan,
  commandIntradayRollup,
  listDeepFiveMinSymbols,
  listDeepSymbols,
  rollupFromBase,
  rollupFiveMinForSymbol,
  writeDeadSymbolMarker,
  readBinFamily,
  rollupTargetsAboveBase,
  FAMILY_BASE_TF,
  INTRADAY_TF_ORDER,
  DEFAULT_TS_DIR,
};
