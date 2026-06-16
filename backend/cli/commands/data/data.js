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
const { validateSnapshot, writeJson, readSnapshot, mergeSnapshots, writePartitionedSnapshot, writeTsIndex, readTsIndex, readTsIndexSince, recordKey } = require('../../../../shared/lib/market/validation.js');
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
const API_CACHE_DIR = path.join(utils.REPO_ROOT, 'storage', 'data', 'cache', 'api_responses');
const EQUITY_DEEP_BACKFILL_PROVIDER = 'alpaca';
const EQUITY_DEEP_BACKFILL_TIMEFRAME = '5m';
const EQUITY_5M_BARS_PER_DAY = 78;
const EQUITY_5M_PROVIDER_MAX_BARS = 10000;
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

function equityUniverseEntries(section = {}) {
  const entries = new Map();
  const add = (symbol, market = null) => {
    const normalized = String(symbol || '').trim().toUpperCase();
    if (!normalized) return;
    if (!entries.has(normalized)) {
      entries.set(normalized, { symbol: normalized, market: market || null });
      return;
    }
    const entry = entries.get(normalized);
    if (!entry.market && market) entry.market = market;
  };

  for (const symbol of section.symbols || []) add(symbol);

  const grid = section.universe_matrix?.grid || {};
  for (const [market, sectors] of Object.entries(grid)) {
    if (!sectors || typeof sectors !== 'object') continue;
    for (const symbols of Object.values(sectors)) {
      for (const symbol of symbols || []) add(symbol, market);
    }
  }

  return Array.from(entries.values());
}

function alpacaEquity5mSkipReason(entry) {
  const market = entry.market ? String(entry.market).toUpperCase() : null;
  if (market && market !== 'USA') {
    return `market ${market} is not covered by Alpaca US equity 5m backfill`;
  }
  if (!/^[A-Z][A-Z0-9.-]{0,11}$/.test(entry.symbol)) {
    return 'symbol format is not an Alpaca US equity ticker';
  }
  return null;
}

function buildEquityDeepBackfillPlan(config, options = {}) {
  const section = config.equities || {};
  const requestedSymbol = options.symbol ? String(options.symbol).trim().toUpperCase() : null;
  const entries = equityUniverseEntries(section);
  const filteredEntries = requestedSymbol
    ? entries.filter((entry) => entry.symbol === requestedSymbol)
    : entries;

  const symbols = [];
  const skipped_symbols = [];
  for (const entry of filteredEntries) {
    const reason = alpacaEquity5mSkipReason(entry);
    if (reason) {
      skipped_symbols.push({ symbol: entry.symbol, market: entry.market || null, reason });
    } else {
      symbols.push(entry.symbol);
    }
  }

  return {
    provider: EQUITY_DEEP_BACKFILL_PROVIDER,
    timeframe: EQUITY_DEEP_BACKFILL_TIMEFRAME,
    symbols,
    skipped_symbols,
    requested_symbol_found: requestedSymbol ? filteredEntries.length > 0 : true,
    configured_symbols: entries.length,
  };
}

function estimateEquity5mApiCalls(symbolCount, days) {
  const maxDaysPerChunk = Math.max(1, Math.floor(EQUITY_5M_PROVIDER_MAX_BARS / EQUITY_5M_BARS_PER_DAY));
  return symbolCount * Math.ceil(days / maxDaysPerChunk);
}

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
      allSources.push(...sources);
      allErrors.push(...errors);
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
  const skipRollup = hasFlag(args, '--no-rollup'); // by default, auto-derive coarser TFs from the base
  // Base grain: crypto serves deep native 1m via Binance, so 1m is the default base
  // (5m/15m/… are then derived locally). Override with --base-tf 5m for the legacy path.
  const baseTf = optionValue(args, '--base-tf', FAMILY_BASE_TF.crypto);
  const rollupTargets = rollupTargetsAboveBase(baseTf);

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
      timeframe: baseTf,
      days,
      delay_ms: delayMs,
      // ~bars/day at base grain (1m=1440, 5m=288); /1000 ≈ requests at Binance's 1000-bar page.
      estimated_api_calls: symbols.length * Math.ceil(days * (baseTf === '1m' ? 1440 : 288) / 1000),
      auto_rollup: skipRollup ? false : rollupTargets,
      message: `Would sequentially backfill ${baseTf} data for ${symbols.length} crypto symbols over ${days} days${skipRollup ? '' : `, then auto-derive ${rollupTargets.join('/')} locally`}. Re-run without --dry-run to execute.`,
    }, args);
    return 0;
  }

  const results = { ok: 0, errors: 0 };
  const allErrors = [];
  const symbolResults = [];

  if (!global.suppressLogs) console.log(`[CRYPTO-DEEP-BACKFILL] Starting sequential ${baseTf} backfill: ${symbols.length} symbols, ${days} days, delay=${delayMs}ms`);

  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    const progress = `[${i + 1}/${symbols.length}]`;
    if (!global.suppressLogs) {
      if (process.stdout.isTTY) {
        process.stdout.write(`\r\x1b[K${progress} ${symbol} ${baseTf} ...`);
      } else {
        console.log(`${progress} Backfilling ${symbol} ${baseTf} (${days} days)`);
      }
    }

    const start = Date.now();
    try {
      const snapshot = await ingestMarketData({
        family: 'crypto',
        symbol,
        timeframe: baseTf,
        historyDays: days,
        provider: 'binance', // pin: TwelveData earlier in the chain caps at 5,000 bars
        force: true, // deep backfill always re-fetches; freshness short-circuits don't apply
        // Per-run snapshot only. The merged history can exceed 100k records
        // (spreading it overflows the call stack), and ingestMarketData already
        // persists scoped JSON + partitioned history + ts-index itself.
        returnAttemptSnapshot: true,
      });
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      const baseBars = (snapshot.sources || []).filter(r => r.timeframe === baseTf && r.symbol === symbol);
      const snapErrors = snapshot.errors || [];
      for (const e of snapErrors) allErrors.push(e);
      // Deep backfill: 0 bars means delisted/never-listed — treat as failure.
      const symbolOk = baseBars.length > 0;
      if (symbolOk) results.ok++; else results.errors++;
      const entry = { symbol, ok: symbolOk, base_timeframe: baseTf, bars: baseBars.length, elapsed_s: Number(elapsed), errors: snapErrors.length };
      if (!symbolOk) {
        entry.error = snapErrors.map(e => e.message).filter(Boolean).slice(0, 3).join(' | ') || `no ${baseTf} bars returned (delisted or not listed on Binance)`;
        // Mark the symbol as "not found" so the daemon skips it for 7 days (see writeDeadSymbolMarker).
        entry.marker_written = writeDeadSymbolMarker(DEFAULT_TS_DIR, symbol, baseTf, 'crypto', 'binance');
      }
      // Auto-derive coarser intraday bins from the just-written deep base bin (lossless,
      // local, no extra network). Off with --no-rollup.
      if (symbolOk && !skipRollup) {
        try {
          const roll = rollupFromBase(DEFAULT_TS_DIR, symbol, baseTf, rollupTargets);
          if (roll.ok) entry.rolled_up = roll.derived;
        } catch (rollErr) {
          entry.rollup_error = rollErr.message;
        }
      }
      symbolResults.push(entry);
      if (!global.suppressLogs) {
        if (process.stdout.isTTY) {
          const color = symbolOk ? '\x1b[32m' : '\x1b[31m';
          process.stdout.write(`\r\x1b[K${progress} ${color}${symbol}\x1b[0m ${baseTf}: ${baseBars.length} bars (${elapsed}s)\n`);
        } else {
          const rollNote = entry.rolled_up ? ` + rollup ${rollupTargets.map(t => `${t}:${entry.rolled_up[t]}`).join(' ')}` : '';
          console.log(`${progress} ${symbol} ${baseTf}: ${baseBars.length} bars (${elapsed}s)${rollNote}${symbolOk ? '' : ` FAILED: ${entry.error}`}`);
        }
      }
    } catch (err) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      allErrors.push({ symbol, timeframe: baseTf, family: 'crypto', message: err.message });
      results.errors++;
      symbolResults.push({ symbol, ok: false, base_timeframe: baseTf, bars: 0, elapsed_s: Number(elapsed), error: err.message });
      if (!global.suppressLogs) {
        if (process.stdout.isTTY) {
          process.stdout.write(`\r\x1b[K${progress} \x1b[31m${symbol}\x1b[0m ${baseTf}: FAILED (${err.message})\n`);
        } else {
          console.error(`${progress} ${symbol} FAILED: ${err.message}`);
        }
      }
    }

    // Inter-symbol delay to avoid Binance rate-limit pressure
    if (delayMs > 0 && i < symbols.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  if (!global.suppressLogs && process.stdout.isTTY) process.stdout.write('\n');

  // No persistence step here: ingestMarketData already wrote the scoped
  // snapshot, the partitioned JSON history, and the binary ts-index per symbol.

  if (!global.suppressLogs) {
    printPayload({
      ok: results.errors === 0,
      symbols: symbols.length,
      successful: results.ok,
      errors: results.errors,
      total_base_bars: symbolResults.reduce((n, r) => n + (r.bars || 0), 0),
      timeframe: baseTf,
      days,
      delay_ms: delayMs,
      symbol_results: symbolResults,
      error_messages: [...new Set(allErrors.map(e => e.message).filter(Boolean))].slice(0, 24),
      output: DEFAULT_HISTORY,
    }, args);
  }
  return results.errors === 0 ? 0 : 1;
}

/**
 * Handles the 'equity-deep-backfill' command.
 *
 * Runs a sequential native 5m backfill for Alpaca-eligible US equity symbols.
 * Non-US configured equities are reported as skipped instead of falling through
 * to Yahoo/Stooq daily-derived synthetic 5m data.
 */
async function commandEquityDeepBackfill(args) {
  const { loadConfig, ingestMarketData } = require('../../../scripts/data_ops/ingest_market_data.js');
  const days = numericOption(args, '--days', 1825);
  const delayMs = numericOption(args, '--delay-ms', 0);
  const chunkDelayMs = numericOption(args, '--chunk-delay-ms', 500);
  const dryRun = hasFlag(args, '--dry-run');
  const symbolArg = optionValue(args, '--symbol', null);
  const skipRollup = hasFlag(args, '--no-rollup'); // by default, auto-derive coarser TFs from the base
  // Base grain: Alpaca SIP serves deep native 1m, so 1m is the default base
  // (5m/15m/… derived locally). Override with --base-tf 5m for the legacy path.
  const baseTf = optionValue(args, '--base-tf', FAMILY_BASE_TF.equities);
  const rollupTargets = rollupTargetsAboveBase(baseTf);

  const config = await loadConfig();
  const plan = buildEquityDeepBackfillPlan(config, { symbol: symbolArg });

  if (symbolArg && !plan.requested_symbol_found) {
    printPayload({ ok: false, error: `Symbol ${String(symbolArg).toUpperCase()} not found in equity universe` }, args);
    return 1;
  }

  if (days <= 5) {
    printPayload({ ok: false, error: 'equity-deep-backfill requires --days > 5 (native intraday fetch); use plain ingest for short windows' }, args);
    return 1;
  }

  if (plan.symbols.length === 0) {
    printPayload({
      ok: false,
      error: symbolArg
        ? `Symbol ${String(symbolArg).toUpperCase()} is not supported by Alpaca US equity 5m backfill`
        : 'No Alpaca-eligible US equity symbols configured',
      skipped_symbols: plan.skipped_symbols,
    }, args);
    return 1;
  }

  if (dryRun) {
    printPayload({
      ok: true,
      dry_run: true,
      provider: plan.provider,
      symbols: plan.symbols.length,
      symbol_list: plan.symbols,
      skipped: plan.skipped_symbols.length,
      skipped_symbols: plan.skipped_symbols,
      timeframe: baseTf,
      days,
      delay_ms: delayMs,
      chunk_delay_ms: chunkDelayMs,
      estimated_api_calls: estimateEquity5mApiCalls(plan.symbols.length, days),
      auto_rollup: skipRollup ? false : rollupTargets,
      message: `Would sequentially backfill native ${baseTf} Alpaca data for ${plan.symbols.length} US equity symbols over ${days} days${skipRollup ? '' : `, then auto-derive ${rollupTargets.join('/')} locally`}. Re-run without --dry-run to execute.`,
    }, args);
    return 0;
  }

  const results = { ok: 0, errors: 0 };
  const allErrors = [];
  const symbolResults = [];

  if (!global.suppressLogs) {
    console.log(`[EQUITY-DEEP-BACKFILL] Starting sequential Alpaca ${baseTf} backfill: ${plan.symbols.length} symbols, ${days} days, delay=${delayMs}ms, chunk-delay=${chunkDelayMs}ms`);
    if (plan.skipped_symbols.length > 0) {
      console.log(`[EQUITY-DEEP-BACKFILL] Skipping ${plan.skipped_symbols.length} unsupported equity symbols`);
    }
  }

  for (let i = 0; i < plan.symbols.length; i++) {
    const symbol = plan.symbols[i];
    const progress = `[${i + 1}/${plan.symbols.length}]`;
    if (!global.suppressLogs) {
      if (process.stdout.isTTY) {
        process.stdout.write(`\r\x1b[K${progress} ${symbol} Alpaca ${baseTf} ...`);
      } else {
        console.log(`${progress} Backfilling ${symbol} Alpaca ${baseTf} (${days} days)`);
      }
    }

    const start = Date.now();
    try {
      const snapshot = await ingestMarketData({
        family: 'equities',
        symbol,
        timeframe: baseTf,
        historyDays: days,
        provider: plan.provider,
        force: true,
        chunkDelayMs,
        returnAttemptSnapshot: true,
      });
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      const baseBars = (snapshot.sources || []).filter(r => r.timeframe === baseTf && r.symbol === symbol);
      const snapErrors = snapshot.errors || [];
      for (const e of snapErrors) allErrors.push(e);

      const symbolOk = baseBars.length > 0 || snapErrors.length === 0;
      if (symbolOk) results.ok++; else results.errors++;
      const entry = { symbol, ok: symbolOk, base_timeframe: baseTf, bars: baseBars.length, elapsed_s: Number(elapsed), errors: snapErrors.length };
      if (!symbolOk) {
        entry.error = snapErrors.map(e => e.message).filter(Boolean).slice(0, 3).join(' | ') || `no native Alpaca ${baseTf} bars ingested`;
      }
      // Auto-derive coarser intraday bins from the just-written deep base bin (lossless,
      // local, no extra network). Off with --no-rollup.
      if (symbolOk && !skipRollup) {
        try {
          const roll = rollupFromBase(DEFAULT_TS_DIR, symbol, baseTf, rollupTargets);
          if (roll.ok) entry.rolled_up = roll.derived;
        } catch (rollErr) {
          entry.rollup_error = rollErr.message;
        }
      }
      symbolResults.push(entry);

      if (!global.suppressLogs) {
        if (process.stdout.isTTY) {
          const color = symbolOk ? '\x1b[32m' : '\x1b[31m';
          process.stdout.write(`\r\x1b[K${progress} ${color}${symbol}\x1b[0m Alpaca ${baseTf}: ${baseBars.length} bars (${elapsed}s)\n`);
        } else {
          const rollNote = entry.rolled_up ? ` + rollup ${rollupTargets.map(t => `${t}:${entry.rolled_up[t]}`).join(' ')}` : '';
          console.log(`${progress} ${symbol} Alpaca ${baseTf}: ${baseBars.length} bars (${elapsed}s)${rollNote}${symbolOk ? '' : ` FAILED: ${entry.error}`}`);
        }
      }
    } catch (err) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      allErrors.push({ symbol, timeframe: baseTf, family: 'equities', provider: plan.provider, message: err.message });
      results.errors++;
      symbolResults.push({ symbol, ok: false, base_timeframe: baseTf, bars: 0, elapsed_s: Number(elapsed), error: err.message });
      if (!global.suppressLogs) {
        if (process.stdout.isTTY) {
          process.stdout.write(`\r\x1b[K${progress} \x1b[31m${symbol}\x1b[0m Alpaca ${baseTf}: FAILED (${err.message})\n`);
        } else {
          console.error(`${progress} ${symbol} FAILED: ${err.message}`);
        }
      }
    }

    if (delayMs > 0 && i < plan.symbols.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  if (!global.suppressLogs && process.stdout.isTTY) process.stdout.write('\n');

  if (!global.suppressLogs) {
    printPayload({
      ok: results.errors === 0,
      provider: plan.provider,
      symbols: plan.symbols.length,
      skipped: plan.skipped_symbols.length,
      skipped_symbols: plan.skipped_symbols,
      successful: results.ok,
      errors: results.errors,
      total_base_bars: symbolResults.reduce((n, r) => n + (r.bars || 0), 0),
      timeframe: baseTf,
      days,
      delay_ms: delayMs,
      chunk_delay_ms: chunkDelayMs,
      symbol_results: symbolResults,
      error_messages: [...new Set(allErrors.map(e => e.message).filter(Boolean))].slice(0, 24),
      output: DEFAULT_HISTORY,
    }, args);
  }
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

/**
 * Builds the job list for the 'five-min-accumulate' command.
 *
 * Covers Yahoo-native 5m data for indices, commodities, and FX families.
 * Each family uses its own symbol-mapping table from the constants module.
 *
 * @param {object} config  - Loaded config (output of loadConfig())
 * @param {object} options - { family?: string, symbol?: string }
 * @returns {{ provider, timeframe, jobs, skipped_symbols, requested_symbol_found }}
 */
function buildFiveMinAccumulatePlan(config, options = {}) {
  const { YAHOO_INDEX_SYMBOLS, YAHOO_COMMODITY_SYMBOLS, YAHOO_FX_SYMBOLS } =
    require('../../../scripts/data_ops/ingest_market_data/constants.js');

  const VALID_FAMILIES = ['indices', 'commodities', 'fx'];
  // 'all' (or blank) means no family filter -- lets the TUI use a clean select.
  const rawFamily = options.family ? String(options.family).trim().toLowerCase() : null;
  const familyFilter = (rawFamily && rawFamily !== 'all') ? rawFamily : null;
  const symbolFilter = options.symbol ? String(options.symbol).trim().toUpperCase() : null;

  if (familyFilter && !VALID_FAMILIES.includes(familyFilter)) {
    throw new Error(`Invalid --family "${familyFilter}". Must be one of: ${VALID_FAMILIES.join(', ')}`);
  }

  const FAMILY_MAPS = {
    indices: YAHOO_INDEX_SYMBOLS,
    commodities: YAHOO_COMMODITY_SYMBOLS,
    fx: YAHOO_FX_SYMBOLS,
  };

  const families = VALID_FAMILIES.filter(f => !familyFilter || f === familyFilter);

  const jobs = [];
  const skipped_symbols = [];

  for (const family of families) {
    const configSymbols = config[family]?.symbols || [];
    const yahooMap = FAMILY_MAPS[family];
    const symbolsToProcess = symbolFilter
      ? configSymbols.filter(s => String(s).trim().toUpperCase() === symbolFilter)
      : configSymbols;

    for (const sym of symbolsToProcess) {
      const normalized = String(sym).trim().toUpperCase();
      if (yahooMap[normalized]) {
        jobs.push({ family, symbol: normalized });
      } else {
        skipped_symbols.push({ family, symbol: normalized, reason: 'no yahoo intraday symbol mapping' });
      }
    }
  }

  const requested_symbol_found = symbolFilter ? jobs.some(j => j.symbol === symbolFilter) || skipped_symbols.some(s => s.symbol === symbolFilter) : true;

  return {
    provider: 'yahoo',
    timeframe: '5m',
    jobs,
    skipped_symbols,
    requested_symbol_found,
  };
}

/**
 * Handles the 'five-min-accumulate' command.
 *
 * Harvests Yahoo's rolling ~60-day native 5m window for indices, commodities, and FX.
 * Weekly re-runs grow history; ts-index bins are merge-protected so re-runs are safe.
 *
 * Example: sovereign five-min-accumulate --dry-run --json
 */
async function commandFiveMinAccumulate(args) {
  const { loadConfig, ingestMarketData } = require('../../../scripts/data_ops/ingest_market_data.js');

  const days = numericOption(args, '--days', 59);
  const delayMs = numericOption(args, '--delay-ms', 250);
  const dryRun = hasFlag(args, '--dry-run');
  const familyArg = optionValue(args, '--family', null);
  const symbolArg = optionValue(args, '--symbol', null);

  if (days <= 5) {
    printPayload({ ok: false, error: 'five-min-accumulate requires --days > 5 (native intraday fetch); use plain ingest for short windows' }, args);
    return 1;
  }
  if (days > 59) {
    printPayload({ ok: false, error: 'five-min-accumulate supports at most --days 59 (Yahoo serves ~60 trading days of 5m; the request 422s beyond that)' }, args);
    return 1;
  }

  const config = await loadConfig();

  let plan;
  try {
    plan = buildFiveMinAccumulatePlan(config, { family: familyArg, symbol: symbolArg });
  } catch (err) {
    printPayload({ ok: false, error: err.message }, args);
    return 1;
  }

  if (symbolArg && !plan.requested_symbol_found) {
    printPayload({ ok: false, error: `Symbol ${String(symbolArg).toUpperCase()} not found in indices/commodities/fx universe` }, args);
    return 1;
  }

  const { jobs, skipped_symbols } = plan;

  if (dryRun) {
    printPayload({
      ok: true,
      dry_run: true,
      provider: 'yahoo',
      timeframe: '5m',
      days,
      delay_ms: delayMs,
      jobs: jobs.length,
      job_list: jobs,
      skipped: skipped_symbols.length,
      skipped_symbols,
      estimated_api_calls: jobs.length,
      message: `Would fetch native Yahoo 5m (~60 trading days) for ${jobs.length} symbols across indices/commodities/fx. Re-run without --dry-run to execute. Re-run weekly to accumulate history (gaps appear if runs are >8 weeks apart).`,
    }, args);
    return 0;
  }

  const results = { ok: 0, errors: 0 };
  const allErrors = [];
  const symbolResults = [];
  let total5mBars = 0;
  const familyCounts = { indices: 0, commodities: 0, fx: 0 };

  console.log(`[FIVE-MIN-ACCUMULATE] Starting Yahoo 5m harvest: ${jobs.length} symbols, ${days} days, delay=${delayMs}ms`);
  if (skipped_symbols.length > 0) {
    console.log(`[FIVE-MIN-ACCUMULATE] Skipping ${skipped_symbols.length} unmapped symbols`);
  }

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const progress = `[${i + 1}/${jobs.length}]`;
    if (process.stdout.isTTY) {
      process.stdout.write(`\r\x1b[K${progress} ${job.symbol} (${job.family}) Yahoo 5m ...`);
    } else {
      console.log(`${progress} Fetching ${job.symbol} (${job.family}) Yahoo 5m (${days} days)`);
    }

    const start = Date.now();
    try {
      const snapshot = await ingestMarketData({
        family: job.family,
        symbol: job.symbol,
        timeframe: '5m',
        historyDays: days,
        provider: 'yahoo',
        force: true,
        returnAttemptSnapshot: true,
      });
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      const fiveMBars = (snapshot.sources || []).filter(r => r.timeframe === '5m' && r.symbol === job.symbol);
      const snapErrors = snapshot.errors || [];
      for (const e of snapErrors) allErrors.push(e);

      const symbolOk = fiveMBars.length > 0 || snapErrors.length === 0;
      if (symbolOk) results.ok++; else results.errors++;
      total5mBars += fiveMBars.length;
      familyCounts[job.family] = (familyCounts[job.family] || 0) + 1;

      const entry = { symbol: job.symbol, family: job.family, ok: symbolOk, bars_5m: fiveMBars.length, elapsed_s: Number(elapsed), errors: snapErrors.length };
      if (!symbolOk) {
        entry.error = snapErrors.map(e => e.message).filter(Boolean).slice(0, 3).join(' | ') || 'no native Yahoo 5m bars ingested';
      }
      symbolResults.push(entry);

      if (process.stdout.isTTY) {
        const color = symbolOk ? '\x1b[32m' : '\x1b[31m';
        process.stdout.write(`\r\x1b[K${progress} ${color}${job.symbol}\x1b[0m (${job.family}) Yahoo 5m: ${fiveMBars.length} bars (${elapsed}s)\n`);
      } else {
        console.log(`${progress} ${job.symbol} (${job.family}) Yahoo 5m: ${fiveMBars.length} bars (${elapsed}s)${symbolOk ? '' : ` FAILED: ${entry.error}`}`);
      }
    } catch (err) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      allErrors.push({ symbol: job.symbol, timeframe: '5m', family: job.family, provider: 'yahoo', message: err.message });
      results.errors++;
      familyCounts[job.family] = (familyCounts[job.family] || 0) + 1;
      symbolResults.push({ symbol: job.symbol, family: job.family, ok: false, bars_5m: 0, elapsed_s: Number(elapsed), error: err.message });
      if (process.stdout.isTTY) {
        process.stdout.write(`\r\x1b[K${progress} \x1b[31m${job.symbol}\x1b[0m (${job.family}) Yahoo 5m: FAILED (${err.message})\n`);
      } else {
        console.error(`${progress} ${job.symbol} (${job.family}) FAILED: ${err.message}`);
      }
    }

    if (delayMs > 0 && i < jobs.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  if (process.stdout.isTTY) process.stdout.write('\n');

  printPayload({
    ok: results.errors === 0,
    provider: 'yahoo',
    timeframe: '5m',
    days,
    delay_ms: delayMs,
    jobs: jobs.length,
    skipped: skipped_symbols.length,
    skipped_symbols,
    successful: results.ok,
    errors: results.errors,
    total_5m_bars: total5mBars,
    families: familyCounts,
    symbol_results: symbolResults,
    error_messages: [...new Set(allErrors.map(e => e.message).filter(Boolean))].slice(0, 24),
    output: DEFAULT_HISTORY,
  }, args);
  return results.errors === 0 ? 0 : 1;
}

/**
 * Builds the job list for the 'intraday-accumulate' command.
 *
 * Covers Yahoo-native 15m, 30m, 1h data for indices, commodities, and FX.
 * Same symbol-mapping tables as five-min-accumulate but with wider depth:
 *   15m/30m → 60 trading days, 1h → 730 days.
 *
 * @param {object} config  - Loaded config (output of loadConfig())
 * @param {object} options - { timeframe, family?, symbols?: string[] }
 * @returns {{ provider, timeframe, jobs, skipped_symbols, requested_symbol_found }}
 */
function buildIntradayAccumulatePlan(config, options = {}) {
  const { YAHOO_INDEX_SYMBOLS, YAHOO_COMMODITY_SYMBOLS, YAHOO_FX_SYMBOLS } =
    require('../../../scripts/data_ops/ingest_market_data/constants.js');
  const { SUPPORTED_INTRADAY_TFS, INTRADAY_MAX_DAYS } =
    require('../../../scripts/data_ops/ingest_market_data/intraday_yahoo.js');

  const VALID_FAMILIES = ['indices', 'commodities', 'fx'];
  const rawTimeframe = options.timeframe ? String(options.timeframe).trim().toLowerCase() : '1h';
  if (!SUPPORTED_INTRADAY_TFS.includes(rawTimeframe)) {
    throw new Error(`Invalid --timeframe "${rawTimeframe}". Must be one of: ${SUPPORTED_INTRADAY_TFS.join(', ')}`);
  }

  const rawFamily = options.family ? String(options.family).trim().toLowerCase() : null;
  const familyFilter = (rawFamily && rawFamily !== 'all') ? rawFamily : null;
  if (familyFilter && !VALID_FAMILIES.includes(familyFilter)) {
    throw new Error(`Invalid --family "${familyFilter}". Must be one of: ${VALID_FAMILIES.join(', ')}`);
  }

  // Optional explicit symbol list filter
  const symbolFilter = options.symbols && options.symbols.length > 0
    ? options.symbols.map((s) => String(s).trim().toUpperCase()).filter(Boolean)
    : null;

  const FAMILY_MAPS = {
    indices:    YAHOO_INDEX_SYMBOLS,
    commodities: YAHOO_COMMODITY_SYMBOLS,
    fx:         YAHOO_FX_SYMBOLS,
  };

  const families = VALID_FAMILIES.filter((f) => !familyFilter || f === familyFilter);

  const jobs = [];
  const skipped_symbols = [];

  for (const family of families) {
    const configSymbols = config[family]?.symbols || [];
    const yahooMap = FAMILY_MAPS[family];
    const symbolsToProcess = symbolFilter
      ? configSymbols.filter((s) => symbolFilter.includes(String(s).trim().toUpperCase()))
      : configSymbols;

    for (const sym of symbolsToProcess) {
      const normalized = String(sym).trim().toUpperCase();
      if (yahooMap[normalized]) {
        jobs.push({ family, symbol: normalized, yahoo_symbol: yahooMap[normalized] });
      } else {
        skipped_symbols.push({ family, symbol: normalized, reason: 'no yahoo intraday symbol mapping' });
      }
    }
  }

  const requested_symbol_found = symbolFilter
    ? symbolFilter.some((s) => jobs.some((j) => j.symbol === s) || skipped_symbols.some((sk) => sk.symbol === s))
    : true;

  const maxDays = INTRADAY_MAX_DAYS[rawTimeframe] ?? 60;

  return {
    provider: 'yahoo',
    timeframe: rawTimeframe,
    max_days: maxDays,
    jobs,
    skipped_symbols,
    requested_symbol_found,
  };
}

/**
 * Handles the 'intraday-accumulate' command.
 *
 * Harvests Yahoo's rolling native intraday window for indices, commodities, and FX:
 *   --timeframe 15m → ~60 trading days
 *   --timeframe 30m → ~60 trading days
 *   --timeframe 1h  → ~730 trading days
 *
 * Re-runs are merge-safe (ts-index bins deduplicate on timestamp).
 *
 * Example: sovereign data intraday-accumulate --timeframe 1h --dry-run
 */
async function commandIntradayAccumulate(args) {
  const { loadConfig, ingestMarketData } = require('../../../scripts/data_ops/ingest_market_data.js');
  const { INTRADAY_MAX_DAYS } =
    require('../../../scripts/data_ops/ingest_market_data/intraday_yahoo.js');

  const timeframe = optionValue(args, '--timeframe', '1h');
  const familyArg = optionValue(args, '--family', null);
  const symbolsArg = optionValue(args, '--symbols', null);
  const dryRun = hasFlag(args, '--dry-run');

  // --symbols accepts comma-separated list
  const symbolsList = symbolsArg
    ? symbolsArg.split(',').map((s) => s.trim()).filter(Boolean)
    : null;

  const VALID_TIMEFRAMES = ['15m', '30m', '1h'];
  if (!VALID_TIMEFRAMES.includes(timeframe)) {
    printPayload({
      ok: false,
      error: `intraday-accumulate supports --timeframe ${VALID_TIMEFRAMES.join(', ')}. '4h' is not available natively from Yahoo — aggregate from 1h bars.`,
    }, args);
    return 1;
  }

  const maxDays = INTRADAY_MAX_DAYS[timeframe] ?? 60;
  const days = numericOption(args, '--days', maxDays);

  if (days <= 0) {
    printPayload({ ok: false, error: 'intraday-accumulate requires --days > 0' }, args);
    return 1;
  }
  if (days > maxDays) {
    printPayload({
      ok: false,
      error: `intraday-accumulate ${timeframe} supports at most --days ${maxDays} (Yahoo's intraday depth limit for this timeframe)`,
    }, args);
    return 1;
  }

  const delayMs = numericOption(args, '--delay-ms', 250);
  const config = await loadConfig();

  let plan;
  try {
    plan = buildIntradayAccumulatePlan(config, { timeframe, family: familyArg, symbols: symbolsList });
  } catch (err) {
    printPayload({ ok: false, error: err.message }, args);
    return 1;
  }

  if (symbolsList && !plan.requested_symbol_found) {
    printPayload({
      ok: false,
      error: `None of the requested symbols [${symbolsList.join(', ')}] found in indices/commodities/fx universe`,
    }, args);
    return 1;
  }

  const { jobs, skipped_symbols } = plan;

  if (dryRun) {
    printPayload({
      ok: true,
      dry_run: true,
      provider: 'yahoo',
      timeframe,
      days,
      delay_ms: delayMs,
      max_days: plan.max_days,
      jobs: jobs.length,
      job_list: jobs,
      skipped: skipped_symbols.length,
      skipped_symbols,
      estimated_api_calls: jobs.length,
      message: `Would fetch native Yahoo ${timeframe} (~${plan.max_days} trading days) for ${jobs.length} symbols across indices/commodities/fx. Re-run without --dry-run to execute.`,
    }, args);
    return 0;
  }

  const results = { ok: 0, errors: 0 };
  const allErrors = [];
  const symbolResults = [];
  let totalBars = 0;
  const familyCounts = { indices: 0, commodities: 0, fx: 0 };

  console.log(`[INTRADAY-ACCUMULATE] Starting Yahoo ${timeframe} harvest: ${jobs.length} symbols, ${days} days, delay=${delayMs}ms`);
  if (skipped_symbols.length > 0) {
    console.log(`[INTRADAY-ACCUMULATE] Skipping ${skipped_symbols.length} unmapped symbols`);
  }

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const progress = `[${i + 1}/${jobs.length}]`;
    if (process.stdout.isTTY) {
      process.stdout.write(`\r\x1b[K${progress} ${job.symbol} (${job.family}) Yahoo ${timeframe} ...`);
    } else {
      console.log(`${progress} Fetching ${job.symbol} (${job.family}) Yahoo ${timeframe} (${days} days)`);
    }

    const start = Date.now();
    try {
      const snapshot = await ingestMarketData({
        family: job.family,
        symbol: job.symbol,
        timeframe,
        historyDays: days,
        provider: 'yahoo',
        force: true,
        returnAttemptSnapshot: true,
      });
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      const intradayBars = (snapshot.sources || []).filter(
        (r) => r.timeframe === timeframe && r.symbol === job.symbol,
      );
      const snapErrors = snapshot.errors || [];
      for (const e of snapErrors) allErrors.push(e);

      // force:true ⇒ every job is an explicit fetch; zero target-timeframe bars is a
      // real failure (an empty provider response must not report silent success).
      const symbolOk = intradayBars.length > 0;
      if (symbolOk) results.ok++; else results.errors++;
      totalBars += intradayBars.length;
      familyCounts[job.family] = (familyCounts[job.family] || 0) + 1;

      const entry = {
        symbol: job.symbol,
        family: job.family,
        ok: symbolOk,
        bars: intradayBars.length,
        elapsed_s: Number(elapsed),
        errors: snapErrors.length,
      };
      if (!symbolOk) {
        entry.error = snapErrors.map((e) => e.message).filter(Boolean).slice(0, 3).join(' | ') || `no native Yahoo ${timeframe} bars ingested`;
      }
      symbolResults.push(entry);

      // [VISIBILITY] per-symbol bar count — required by Anti-Bullshit Testing Mandate
      if (process.stdout.isTTY) {
        const color = symbolOk ? '\x1b[32m' : '\x1b[31m';
        process.stdout.write(`\r\x1b[K${progress} ${color}${job.symbol}\x1b[0m (${job.family}) Yahoo ${timeframe}: ${intradayBars.length} bars (${elapsed}s)\n`);
      } else {
        console.log(`[VISIBILITY] ${progress} ${job.symbol} (${job.family}) Yahoo ${timeframe}: ${intradayBars.length} bars (${elapsed}s)${symbolOk ? '' : ` FAILED: ${entry.error}`}`);
      }
    } catch (err) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      allErrors.push({ symbol: job.symbol, timeframe, family: job.family, provider: 'yahoo', message: err.message });
      results.errors++;
      familyCounts[job.family] = (familyCounts[job.family] || 0) + 1;
      symbolResults.push({ symbol: job.symbol, family: job.family, ok: false, bars: 0, elapsed_s: Number(elapsed), error: err.message });
      if (process.stdout.isTTY) {
        process.stdout.write(`\r\x1b[K${progress} \x1b[31m${job.symbol}\x1b[0m (${job.family}) Yahoo ${timeframe}: FAILED (${err.message})\n`);
      } else {
        console.error(`[VISIBILITY] ${progress} ${job.symbol} (${job.family}) FAILED: ${err.message}`);
      }
    }

    if (delayMs > 0 && i < jobs.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  if (process.stdout.isTTY) process.stdout.write('\n');

  console.log(`[VISIBILITY] intraday-accumulate complete: ${results.ok} ok / ${results.errors} failed / ${totalBars} total ${timeframe} bars`);

  printPayload({
    ok: results.errors === 0,
    provider: 'yahoo',
    timeframe,
    days,
    delay_ms: delayMs,
    jobs: jobs.length,
    skipped: skipped_symbols.length,
    skipped_symbols,
    successful: results.ok,
    errors: results.errors,
    total_bars: totalBars,
    families: familyCounts,
    symbol_results: symbolResults,
    error_messages: [...new Set(allErrors.map((e) => e.message).filter(Boolean))].slice(0, 24),
    output: DEFAULT_HISTORY,
  }, args);
  return results.errors === 0 ? 0 : 1;
}

// ─── intraday-rollup: derive coarser intraday bins from the finest native bin ───
// All intraday timeframes, finest → coarsest. The base grain is whichever finest
// bin a family stores natively (1m for crypto/equities, 5m for Yahoo families).
const INTRADAY_TF_ORDER = ['1m', '5m', '15m', '30m', '1h', '4h'];

// Full canonical ladder, finest → coarsest, including daily/weekly/monthly. This is
// the default rollup chain: ingest the base grain, derive everything above it. The
// stage split (intraday/daily from base vs weekly/monthly from the 1d bin) lives in
// rollupFromBase; custom timeframes (2h/6h/3d…) are routed there by parsed interval.
const FULL_TF_ORDER = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1mo'];

// Per-family base (finest natively-fetched) grain. Crypto (Binance) and US equities
// (Alpaca SIP) serve deep 1m; Yahoo families (indices/commodities/fx) only get ~7d
// of 1m so they stay on a 5m base (Yahoo serves ~60d of 5m).
const FAMILY_BASE_TF = {
  crypto: '1m',
  equities: '1m',
  indices: '5m',
  commodities: '5m',
  fx: '5m',
};

// Coarser targets to derive from a given base grain — everything above it on the
// full ladder (intraday + 1d + 1w + 1mo). An unknown base falls back to "from 15m up".
function rollupTargetsAboveBase(baseTf) {
  const i = FULL_TF_ORDER.indexOf(baseTf);
  if (i < 0) return FULL_TF_ORDER.slice(FULL_TF_ORDER.indexOf('15m'));
  return FULL_TF_ORDER.slice(i + 1);
}

// Enumerate symbols that have a deep `<symbol>_<baseTf>.bin` in the ts index.
function listDeepSymbols(tsDir, baseTf = '5m') {
  let files;
  try { files = fs.readdirSync(tsDir); } catch (_) { return []; }
  const suffix = `_${baseTf}.bin`;
  return files.filter((f) => f.endsWith(suffix)).map((f) => f.slice(0, -suffix.length));
}

// Back-compat wrapper: 5m-base enumeration (existing intraday-rollup callers).
function listDeepFiveMinSymbols(tsDir) {
  return listDeepSymbols(tsDir, '5m');
}

// Read just the tiny meta sidecar to gate by family without loading the big bin.
function readBinFamily(tsDir, symbol, baseTf = '5m') {
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(tsDir, `${symbol}_${baseTf}.meta.json`), 'utf8'));
    return String(meta.family || '').toLowerCase();
  } catch (_) { return null; }
}

// Back-compat wrapper.
function readFiveMinBinFamily(tsDir, symbol) {
  return readBinFamily(tsDir, symbol, '5m');
}

// Derive coarser intraday bins for one symbol from its deep `baseTf` bin. Lossless:
// the base bin is read-only; coarser bins are written merge-protected. Shared by
// `intraday-rollup`, the deep-backfill commands, and the backfill daemon.
/**
 * writeDeadSymbolMarker(tsDir, symbol, timeframe, family, provider) -- record a "no data on
 * provider" marker so the backfill daemon skips a delisted/never-listed symbol for 7 days
 * (DEAD_SYMBOL_TTL_MS in coverage.js) instead of re-deep-backfilling it every cycle.
 *
 * GUARD: the marker is written ONLY when no real `.bin` exists for (symbol, timeframe). A 0-bar
 * result for a symbol that already has bars is a transient provider failure (outage/429/empty
 * page), NOT a delisting — writing the stripped marker over a real `.meta.json` sidecar would
 * clobber coordinate_id, config_market/config_sector and derived_from for the retained bars
 * (readCoverage ignores the marker whenever a bin is present, so it would be harmful, not useless).
 *
 * @returns {boolean} true if a marker was written, false if skipped (bin present) or on error.
 */
function writeDeadSymbolMarker(tsDir, symbol, timeframe, family, provider) {
  try {
    const fsSync = require('node:fs');
    const safe = String(symbol).replace(/[^a-zA-Z0-9_]/g, '_');
    const binPath = path.join(tsDir, `${safe}_${timeframe}.bin`);
    if (fsSync.existsSync(binPath)) return false; // real bars present — never clobber the sidecar
    fsSync.mkdirSync(tsDir, { recursive: true });
    fsSync.writeFileSync(
      path.join(tsDir, `${safe}_${timeframe}.meta.json`),
      JSON.stringify({ symbol, timeframe, family, provider, count: 0, last_checked: Date.now() }),
      'utf8',
    );
    return true;
  } catch (_) {
    return false; // non-fatal: the daemon will just re-probe next cycle
  }
}

// Delete a (symbol, timeframe) bin + meta so the next write is a clean rebuild rather
// than a merge. Used for weekly/monthly/N-day bins, which are pure derived caches of the
// 1d bin — a clean rebuild lets a bucket-boundary change (e.g. Thursday→Monday weeks)
// replace stale mis-aligned bars instead of accumulating duplicates.
function removeDerivedBin(tsDir, symbol, timeframe) {
  const safe = String(symbol).replace(/[^a-zA-Z0-9_]/g, '_');
  for (const ext of ['bin', 'meta.json']) {
    try { fs.unlinkSync(path.join(tsDir, `${safe}_${timeframe}.${ext}`)); } catch (_) { /* absent — fine */ }
  }
}

const ROLLUP_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * rollupFromBase(tsDir, symbol, baseTf, timeframes, opts)
 *
 * Derives coarser bins from a symbol's data by local OHLCV aggregation. Two stages so
 * weekly/monthly stay correct and off the heap:
 *
 *   Stage 1 (interval <= 1d): aggregated from the intraday BASE bin and merge-written
 *     (lossless; new-wins-on-timestamp). Honors opts.sinceMs — when finite, only base
 *     bars at/after sinceMs are read (windowed incremental), instead of the whole
 *     possibly-multi-million-row base bin. sinceMs MUST be UTC-day aligned so daily and
 *     dividing-sub-day buckets in the window are whole.
 *   Stage 2 (interval > 1d, e.g. 1w/1mo/3d): aggregated from the (now-updated) small 1d
 *     bin — read in FULL regardless of sinceMs (thousands of rows, no OOM) and
 *     clean-REBUILT, so a day-aligned incremental window can never leave a partial
 *     weekly/monthly bar behind. Calendar-correct via aggregateCandles/bucketStartFor.
 *
 * Custom timeframes are routed by parsed interval, so 8h behaves like 4h (from base) and
 * 3d behaves like 1w (from the 1d bin) with no special-casing.
 */
function rollupFromBase(tsDir, symbol, baseTf, timeframes, opts = {}) {
  const { aggregateCandles } = require('../../../scripts/data_ops/ingest_market_data.js');
  const { parseTimeframeMs } = require('../../../scripts/data_ops/ingest_market_data/constants.js');
  const sinceMs = Number.isFinite(opts.sinceMs) ? opts.sinceMs : null;

  // Route each target by its span: <= 1d from the base bin, > 1d from the daily bin.
  const fromBase = [];
  const fromDaily = [];
  for (const tf of timeframes) {
    const ms = parseTimeframeMs(tf);
    if (ms == null) continue; // un-parseable target — skip
    (ms > ROLLUP_DAY_MS ? fromDaily : fromBase).push(tf);
  }

  const tfCounts = {};
  let sourceBars = 0;
  const toCandles = (records) => records.map((r) => ({
    openTime: Date.parse(r.timestamp),
    open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume,
  }));

  // ── Stage 1: intraday + daily, from the base bin (windowed when sinceMs set) ──
  if (fromBase.length > 0) {
    const baseRecords = sinceMs !== null
      ? readTsIndexSince(tsDir, symbol, baseTf, sinceMs)
      : readTsIndex(tsDir, symbol, baseTf);
    if (!baseRecords || baseRecords.length === 0) {
      if (fromDaily.length === 0) {
        return { ok: false, error: `no readable ${baseTf} bin`, source_bars: 0, base_timeframe: baseTf, derived: {} };
      }
    } else {
      sourceBars = baseRecords.length;
      const provider = baseRecords[0].provider || 'rollup';
      const family = baseRecords[0].family || 'unknown';
      const candles = toCandles(baseRecords);
      const derivedSources = [];
      for (const tf of fromBase) {
        const derived = aggregateCandles(candles, tf, symbol, provider, family, { sourceTimeframe: baseTf });
        tfCounts[tf] = derived.length;
        for (const rec of derived) derivedSources.push(rec);
      }
      if (derivedSources.length > 0) writeTsIndex(tsDir, { sources: derivedSources });
    }
  }

  // ── Stage 2: weekly/monthly/N-day, clean-rebuilt from the full 1d bin ──
  if (fromDaily.length > 0) {
    const dailyRecords = readTsIndex(tsDir, symbol, '1d');
    if (dailyRecords && dailyRecords.length > 0) {
      const provider = dailyRecords[0].provider || 'rollup';
      const family = dailyRecords[0].family || 'unknown';
      const dailyCandles = toCandles(dailyRecords);
      for (const tf of fromDaily) {
        const derived = aggregateCandles(dailyCandles, tf, symbol, provider, family, { sourceTimeframe: '1d' });
        tfCounts[tf] = derived.length;
        if (derived.length > 0) {
          removeDerivedBin(tsDir, symbol, tf); // clean rebuild — pure cache of 1d
          writeTsIndex(tsDir, { sources: derived });
        }
      }
    } else {
      for (const tf of fromDaily) if (!(tf in tfCounts)) tfCounts[tf] = 0;
    }
  }

  return { ok: Object.keys(tfCounts).length > 0, source_bars: sourceBars, base_timeframe: baseTf, derived: tfCounts };
}

// Back-compat wrapper: 5m-base rollup (existing deep-backfill + intraday-rollup callers).
function rollupFiveMinForSymbol(tsDir, symbol, timeframes) {
  const res = rollupFromBase(tsDir, symbol, '5m', timeframes);
  // Preserve the legacy field name used by existing callers/tests.
  return { ...res, source_5m_bars: res.source_bars || 0 };
}

const ROLLUP_TARGET_TFS = ['15m', '30m', '1h', '4h'];

/**
 * Handles 'intraday-rollup': derives every coarser timeframe from the already-deep native
 * 5m bins by local OHLCV aggregation. No network. Defaults to the full ladder above 5m
 * (15m/30m/1h/4h/1d/1w/1mo) but accepts ANY coarser custom timeframe via --timeframes
 * (e.g. 2h,6h,8h,12h,3d). Intraday/daily are merge-protected (new-wins-on-timestamp) so
 * native bars at non-overlapping timestamps survive; weekly/monthly/N-day are rebuilt
 * from the 1d bin (calendar-correct). The 5m base bin is read-only.
 *
 * Examples:
 *   sovereign data intraday-rollup --family crypto --dry-run
 *   sovereign data intraday-rollup --family crypto --timeframes 2h,6h,1w
 */
async function commandIntradayRollup(args) {
  const { parseTimeframeMs } = require('../../../scripts/data_ops/ingest_market_data/constants.js');

  const BASE_TF = '5m';
  const baseMs = parseTimeframeMs(BASE_TF);
  const tfArg = optionValue(args, '--timeframes', rollupTargetsAboveBase(BASE_TF).join(','));
  const timeframes = tfArg.split(',').map((s) => s.trim()).filter(Boolean);
  const badTf = timeframes.find((t) => {
    const ms = parseTimeframeMs(t);
    return ms == null || ms <= baseMs; // must parse AND be strictly coarser than the 5m base
  });
  if (badTf || timeframes.length === 0) {
    printPayload({ ok: false, error: `intraday-rollup --timeframes must be non-empty timeframes coarser than ${BASE_TF} (e.g. 15m,1h,4h,1d,1w,1mo,2h,6h,3d); got '${tfArg}'` }, args);
    return 1;
  }

  const rawFamily = optionValue(args, '--family', null);
  const familyFilter = (rawFamily && rawFamily.toLowerCase() !== 'all') ? rawFamily.toLowerCase() : null;
  const symbolsArg = optionValue(args, '--symbols', null);
  const explicitSymbols = symbolsArg
    ? symbolsArg.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
    : null;
  const dryRun = hasFlag(args, '--dry-run');
  const tsDir = optionValue(args, '--ts-dir', DEFAULT_TS_DIR);  // overridable for tests

  let symbols = listDeepFiveMinSymbols(tsDir);
  if (explicitSymbols) symbols = symbols.filter((s) => explicitSymbols.includes(s.toUpperCase()));
  if (familyFilter) symbols = symbols.filter((s) => readFiveMinBinFamily(tsDir, s) === familyFilter);
  symbols.sort();

  if (symbols.length === 0) {
    printPayload({
      ok: false,
      error: `No symbols with a deep _5m.bin matched (family=${familyFilter || 'any'}, symbols=${explicitSymbols ? explicitSymbols.join(',') : 'all'})`,
    }, args);
    return 1;
  }

  if (dryRun) {
    printPayload({
      ok: true,
      dry_run: true,
      source_timeframe: '5m',
      timeframes,
      symbols: symbols.length,
      symbol_list: symbols,
      message: `Would derive ${timeframes.join('/')} from deep 5m bins for ${symbols.length} symbols (local aggregation, no network). 5m bins are read-only.`,
    }, args);
    return 0;
  }

  const results = { ok: 0, errors: 0 };
  const allErrors = [];
  const symbolResults = [];

  console.log(`[INTRADAY-ROLLUP] Deriving ${timeframes.join('/')} from 5m for ${symbols.length} symbols`);

  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    const progress = `[${i + 1}/${symbols.length}]`;
    const start = Date.now();
    try {
      const res = rollupFiveMinForSymbol(tsDir, symbol, timeframes);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      if (!res.ok) {
        results.errors++;
        allErrors.push({ symbol, message: res.error });
        symbolResults.push({ symbol, ok: false, error: res.error });
        console.error(`[VISIBILITY] ${progress} ${symbol} FAILED: ${res.error}`);
        continue;
      }
      results.ok++;
      symbolResults.push({ symbol, ok: true, source_5m_bars: res.source_5m_bars, derived: res.derived, elapsed_s: Number(elapsed) });
      const summary = timeframes.map((t) => `${t}:${res.derived[t]}`).join(' ');
      console.log(`[VISIBILITY] ${progress} ${symbol} 5m=${res.source_5m_bars} -> ${summary} (${elapsed}s)`);
    } catch (err) {
      results.errors++;
      allErrors.push({ symbol, message: err.message });
      symbolResults.push({ symbol, ok: false, error: err.message });
      console.error(`[VISIBILITY] ${progress} ${symbol} FAILED: ${err.message}`);
    }
  }

  console.log(`[VISIBILITY] intraday-rollup complete: ${results.ok} ok / ${results.errors} failed across ${symbols.length} symbols`);

  printPayload({
    ok: results.errors === 0,
    source_timeframe: '5m',
    timeframes,
    symbols: symbols.length,
    successful: results.ok,
    errors: results.errors,
    symbol_results: symbolResults,
    error_messages: [...new Set(allErrors.map((e) => e.message).filter(Boolean))].slice(0, 24),
    output: DEFAULT_TS_DIR,
  }, args);
  return results.errors === 0 ? 0 : 1;
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
