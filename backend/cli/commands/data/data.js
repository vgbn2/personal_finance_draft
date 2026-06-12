const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const {
  ingestMarketData,
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
  DEFAULT_SNAPSHOT,
  DEFAULT_QUALITY_REPORT,
  DEFAULT_HISTORY
} = utils;

const DEFAULT_TS_DIR = path.join(utils.REPO_ROOT, 'storage', 'data', 'ts');
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
  const historyDays = numericOption(args, '--history-days', null) ?? numericOption(args, '--days', null);
  const options = {};
  if (family && family !== 'all') options.family = family;
  if (symbol) options.symbol = symbol;
  if (timeframe) options.timeframe = timeframe;
  if (Number.isFinite(historyDays) && historyDays > 0) {
    options.historyDays = historyDays;
  }
  return options;
}

async function commandIngest(args) {
  const ingestOptions = ingestOptionsFromArgs(args);
  if (ingestOptions.family && ['onchain', 'crypto_tx', 'holdings', 'reserves'].includes(ingestOptions.family)) {
    const gate = featureGate('onchain_data', { surface: `Ingest family '${ingestOptions.family}'` });
    if (!gate.ok) {
      printPayload({ ok: false, type: 'feature_gate', feature_flag: gate.flag, reason: gate.reason, hint: gate.hint }, args);
      return 1;
    }
  }
  const snapshot = await withLoadingAnimation('Refreshing market cache', () => ingestMarketData(ingestOptions), args);
  if (hasFlag(args, '--full')) {
    console.log(JSON.stringify(snapshot, null, 2));
    return 0;
  }
  printPayload({
    mode: snapshot.mode,
    fetched_at: snapshot.fetched_at,
    sources: snapshot.sources.length,
    errors: snapshot.errors.length,
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
  const symbols = [];
  const familyBySymbol = {};
  for (const f of families) {
    for (const s of (config[f]?.symbols || [])) {
      if (!familyBySymbol[s]) familyBySymbol[s] = f;
      symbols.push(s);
    }
  }
  const uniqueSymbols = [...new Set(symbols)];
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
      message: `Would backfill ${jobs.length} combinations (${symbols.length} symbols × ${timeframes.length} timeframes). Re-run without --dry-run to execute.`,
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
  let completed = 0;
  const total = jobs.length;
  const completedBySymbol = new Map();
  const totalBySymbol = new Map();
  jobs.forEach((job) => {
    totalBySymbol.set(job.symbol, (totalBySymbol.get(job.symbol) || 0) + 1);
  });

  async function runJob({ symbol, timeframe }) {
    const syntheticArgs = ['--symbol', symbol, '--timeframe', timeframe, '--days', days];
    if (force) syntheticArgs.push('--force');
    try {
      const history = await loadHistoricalSources(syntheticArgs);
      allSources.push(...(history.snapshot.sources || []));
      allErrors.push(...(history.snapshot.errors || []));
      results.ok++;
    } catch (err) {
      allErrors.push({ symbol, timeframe, message: err.message });
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

  const snapshot = {
    mode: 'mass_backfill',
    fetched_at: new Date().toISOString(),
    sources: allSources,
    errors: allErrors,
  };

  const { report } = validateSnapshot(snapshot, { rejectStale: false });
  const existing = readSnapshot(DEFAULT_HISTORY);
  const merged = mergeSnapshots(existing, snapshot);
  writePartitionedSnapshot(DEFAULT_HISTORY, merged);
  writeTsIndex(DEFAULT_TS_DIR, merged);
  writeJson(DEFAULT_QUALITY_REPORT, report);

  printPayload({
    ok: results.errors === 0,
    jobs: total,
    successful: results.ok,
    errors: results.errors,
    records: allSources.length,
    skipped_jobs: plan.skipped.length,
    symbols: uniqueSymbols.length,
    timeframes,
    days,
    output: DEFAULT_HISTORY,
  }, args);
  return results.errors === 0 ? 0 : 1;
}

/**
 * Handles the 'validate' command.
 */
function commandValidate(args) {
  const input = optionValue(args, '--input', DEFAULT_SNAPSHOT);
  const output = optionValue(args, '--output', DEFAULT_QUALITY_REPORT);
  const snapshot = readSnapshot(input);
  const { report } = validateSnapshot(snapshot);
  writeJson(output, report);
  printPayload({
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
  }, args);
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

  let showLimit = 10;
  let latestBySymbol = new Map();
  let lastSyncTime = null;
  let lastSyncCount = 0;
  let lastSyncDuration = 0;

  const render = () => {
    console.clear();
    console.log(`\x1b[1;36mSOVEREIGN WATCH MODE\x1b[0m \x1b[90m(Family: ${family}, Interval: ${intervalMinutes}m)\x1b[0m`);
    console.log('\x1b[90mPress Ctrl+C to stop, Ctrl+T to show more.\x1b[0m\n');

    if (lastSyncTime) {
      process.stdout.write(`\x1b[32m\u2714\x1b[0m Last sync: \x1b[1m${lastSyncTime}\x1b[0m (\x1b[90m${lastSyncCount} records, ${lastSyncDuration}s\x1b[0m)\n\n`);
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
    process.stdout.write(`\r\x1b[K\x1b[33m\u231b\x1b[0m Synchronizing ${family} data...`);
    try {
      const snapshot = await ingestMarketData({ family: family === 'all' ? null : family });
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
      process.stdout.write(`\r\x1b[K\x1b[31m\u2718\x1b[0m Sync failed: ${error.message}\n`);
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
    const seconds = Math.floor(remaining / 1000);
    const minutes = Math.floor(seconds / 60);
    const displaySeconds = seconds % 60;

    const progressWidth = 20;
    const progress = Math.min(1, (intervalMs - remaining) / intervalMs);
    const filled = Math.floor(progress * progressWidth);
    const empty = progressWidth - filled;
    const progressBar = `\x1b[90m[\x1b[36m${'█'.repeat(filled)}\x1b[90m${'░'.repeat(empty)}]\x1b[0m`;

    process.stdout.write(`\r\x1b[KNext refresh in: \x1b[1m${minutes}m ${displaySeconds}s\x1b[0m ${progressBar} `);

    if (remaining <= 0) {
      process.stdout.write('\n');
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
 * Handles the 'crypto-deep-backfill' command.
 *
 * Runs a sequential (one symbol at a time) deep 5m backfill for the crypto family
 * using Binance as the native intraday provider. Sequential processing is required
 * to stay within Binance's 6,000 weight/minute IP budget — parallel workers would
 * exceed it immediately at 5m depth (§5a of the scoping document).
 *
 * Example: sovereign data crypto-deep-backfill --days 1825 --delay-ms 200
 */
async function commandCryptoDeepBackfill(args) {
  const { loadConfig, ingestMarketData } = require('../../../scripts/data_ops/ingest_market_data.js');
  const days = numericOption(args, '--days', 1825); // 5 years default
  const delayMs = numericOption(args, '--delay-ms', 0); // inter-symbol delay; 0 = no sleep
  const dryRun = hasFlag(args, '--dry-run');
  const symbolArg = optionValue(args, '--symbol', null); // single-symbol override

  const config = await loadConfig();
  const cryptoSymbols = config.crypto?.symbols || [];
  const symbols = symbolArg ? cryptoSymbols.filter(s => s === symbolArg) : cryptoSymbols;

  if (symbols.length === 0) {
    printPayload({ ok: false, error: symbolArg ? `Symbol ${symbolArg} not found in crypto universe` : 'No crypto symbols configured' }, args);
    return 1;
  }

  // historyDays <= 5 falls into the legacy daily-aggregation path in
  // fetchCryptoSnapshot and would synthesize fake 5m bars from 1d candles.
  if (days <= 5) {
    printPayload({ ok: false, error: 'crypto-deep-backfill requires --days > 5 (native intraday fetch); use plain ingest for short windows' }, args);
    return 1;
  }

  if (dryRun) {
    printPayload({
      ok: true,
      dry_run: true,
      symbols: symbols.length,
      symbol_list: symbols,
      timeframe: '5m',
      days,
      delay_ms: delayMs,
      // Estimated: 526 calls/symbol × 5 weight = 2,630 weight; 18 symbols = 47,340 weight
      estimated_api_calls: symbols.length * Math.ceil((days / 365.25) * 365.25 * 288 / 1000),
      message: `Would sequentially backfill 5m data for ${symbols.length} crypto symbols over ${days} days. Re-run without --dry-run to execute.`,
    }, args);
    return 0;
  }

  const results = { ok: 0, errors: 0 };
  const allErrors = [];
  const symbolResults = [];

  console.log(`[CRYPTO-DEEP-BACKFILL] Starting sequential 5m backfill: ${symbols.length} symbols, ${days} days, delay=${delayMs}ms`);

  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    const progress = `[${i + 1}/${symbols.length}]`;
    if (process.stdout.isTTY) {
      process.stdout.write(`\r\x1b[K${progress} ${symbol} 5m ...`);
    } else {
      console.log(`${progress} Backfilling ${symbol} 5m (${days} days)`);
    }

    const start = Date.now();
    try {
      const snapshot = await ingestMarketData({
        family: 'crypto',
        symbol,
        timeframe: '5m',
        historyDays: days,
        provider: 'binance', // pin: TwelveData earlier in the chain caps at 5,000 bars
        force: true, // deep backfill always re-fetches; freshness short-circuits don't apply
        // Per-run snapshot only. The merged history can exceed 100k records
        // (spreading it overflows the call stack), and ingestMarketData already
        // persists scoped JSON + partitioned history + ts-index itself.
        returnAttemptSnapshot: true,
      });
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      const fiveMBars = (snapshot.sources || []).filter(r => r.timeframe === '5m' && r.symbol === symbol);
      for (const e of (snapshot.errors || [])) allErrors.push(e);
      results.ok++;
      symbolResults.push({ symbol, ok: true, bars_5m: fiveMBars.length, elapsed_s: Number(elapsed), errors: (snapshot.errors || []).length });
      if (process.stdout.isTTY) {
        process.stdout.write(`\r\x1b[K${progress} \x1b[32m${symbol}\x1b[0m 5m: ${fiveMBars.length} bars (${elapsed}s)\n`);
      }
    } catch (err) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      allErrors.push({ symbol, timeframe: '5m', family: 'crypto', message: err.message });
      results.errors++;
      symbolResults.push({ symbol, ok: false, bars_5m: 0, elapsed_s: Number(elapsed), error: err.message });
      if (process.stdout.isTTY) {
        process.stdout.write(`\r\x1b[K${progress} \x1b[31m${symbol}\x1b[0m 5m: FAILED (${err.message})\n`);
      } else {
        console.error(`${progress} ${symbol} FAILED: ${err.message}`);
      }
    }

    // Inter-symbol delay to avoid Binance rate-limit pressure
    if (delayMs > 0 && i < symbols.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  if (process.stdout.isTTY) process.stdout.write('\n');

  // No persistence step here: ingestMarketData already wrote the scoped
  // snapshot, the partitioned JSON history, and the binary ts-index per symbol.

  printPayload({
    ok: results.errors === 0,
    symbols: symbols.length,
    successful: results.ok,
    errors: results.errors,
    total_5m_bars: symbolResults.reduce((n, r) => n + (r.bars_5m || 0), 0),
    timeframe: '5m',
    days,
    delay_ms: delayMs,
    symbol_results: symbolResults,
    output: DEFAULT_HISTORY,
  }, args);
  return results.errors === 0 ? 0 : 1;
}

/**
 * Handles the 'universe' command.
 */
async function commandUniverse(args) {
  const { loadConfig } = require('../../../scripts/data_ops/ingest_market_data.js');
  const config = await loadConfig();
  const families = ['equities', 'indices', 'commodities', 'fx', 'crypto'];
  const universe = [];
  
  for (const f of families) {
      const symbols = config[f]?.symbols || [];
      for (const s of symbols) {
          universe.push({ label: `${s} (${f})`, value: s, category: f });
      }
  }

  if (hasFlag(args, '--json')) {
      console.log(JSON.stringify(universe, null, 2));
      return 0;
  }

  const { promptSelect } = require('../../tui/engine/engine.js');
  
  console.log(`\n\x1b[1;36mSovereign Asset Universe\x1b[0m`);
  const selected = await promptSelect('Select an asset to analyze:', [
      ...universe,
      { label: 'Exit', value: null }
  ]);

  if (selected) {
      console.log(`\x1b[32mSelected: ${selected}\x1b[0m`);
      console.log(`To analyze this asset, run: \x1b[33msovereign backend correlation --symbols ${selected}\x1b[0m`);
  }
  return 0;
}

module.exports = {
  buildMassBackfillExecutionPlan,
  ingestOptionsFromArgs,
  commandIngest,
  commandBackfill,
  commandMassBackfill,
  commandCacheClean,
  inspectMassBackfillJob,
  commandValidate,
  commandWatch,
  commandPrune,
  commandLoc,
  commandUniverse,
  commandCryptoDeepBackfill,
};
