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
const { validateSnapshot, writeJson, readSnapshot, mergeSnapshots, writePartitionedSnapshot, writeTsIndex, readTsIndex, recordKey, capSnapshotForJson } = require('../../../../shared/lib/market/validation.js');
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

const DEFAULT_TS_DIR = path.join(utils.REPO_ROOT, 'storage', 'data', 'ts');
const API_CACHE_DIR = path.join(utils.REPO_ROOT, 'storage', 'data', 'cache', 'api_responses');

const {
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
} = require('./data_mass_backfill.js');

const { rollupFromBase, rollupTargetsAboveBase, writeDeadSymbolMarker, listDeepSymbols, listDeepFiveMinSymbols, readBinFamily, readFiveMinBinFamily, rollupFiveMinForSymbol, commandIntradayRollup, INTRADAY_TF_ORDER, FULL_TF_ORDER, FAMILY_BASE_TF } = require('./data_rollup.js');
const { equityUniverseEntries, alpacaEquity5mSkipReason, buildEquityDeepBackfillPlan, estimateEquity5mApiCalls, commandCryptoDeepBackfill, commandEquityDeepBackfill } = require('./data_deep_backfill.js');
const { buildFiveMinAccumulatePlan, commandFiveMinAccumulate, buildIntradayAccumulatePlan, commandIntradayAccumulate, commandUniverse } = require('./data_accumulate.js');

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
 * Handles the 'validate' command.
 */
function commandValidate(args) {
  const input = optionValue(args, '--input', DEFAULT_SNAPSHOT);
  const output = optionValue(args, '--output', DEFAULT_QUALITY_REPORT);
  const snapshot = readSnapshot(input);
  const { report } = validateSnapshot(snapshot);
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

async function loadWatchGridFromConfig() {
  const { loadMarketConfig } = require('../../../../shared/lib/runtime/config_loader.js');
  const yamlPath = path.join(utils.REPO_ROOT, 'config', 'markets', 'data_sources.yaml');
  try {
    const config = await loadMarketConfig(yamlPath);
    const indices = (config.indices?.symbols || []).slice(0, 3).map((s) => ['Indices', s, '1d']);
    const fx = (config.fx?.symbols || []).slice(0, 3).map((s) => ['FX', s, '1d']);
    const commodities = (config.commodities?.symbols || []).slice(0, 3).map((s) => ['Commodities', s, '1d']);
    const crypto = (config.crypto?.symbols || []).slice(0, 3).map((s) => ['Crypto', s, '1d']);
    const grid = [...indices, ...fx, ...commodities, ...crypto];
    return grid.length >= 4 ? grid : null;
  } catch {
    return null;
  }
}

const YAHOO_WATCH_MAP = {
  EURUSD: 'EURUSD=X', USDJPY: 'USDJPY=X', GBPUSD: 'GBPUSD=X', AUDUSD: 'AUDUSD=X',
  XAUUSD: 'GC=F',     USOIL: 'CL=F',      UKOIL: 'BZ=F',      XAGUSD: 'SI=F',
  US500: '^GSPC',     NDX: '^NDX',        GER40: '^GDAXI',    UK100: '^FTSE',
};

const WATCH_FAMILIES = [
  { name: 'CRYPTO', symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT'] },
  { name: 'FX (MAJOR PAIRS)', symbols: ['EURUSD', 'USDJPY', 'GBPUSD', 'AUDUSD'] },
  { name: 'COMMODITIES', symbols: ['XAUUSD', 'USOIL', 'UKOIL', 'XAGUSD'] },
  { name: 'INDICES', symbols: ['US500', 'NDX', 'GER40', 'UK100'] },
];

async function fetchLiveMarketQuotes() {
  const liveMap = new Map();
  const promises = [];

  // 1. Real-time Crypto via Binance 24hr ticker API (sub-second live prices)
  const cryptoGroup = WATCH_FAMILIES.find((f) => f.name === 'CRYPTO');
  const cryptoSymbols = cryptoGroup ? cryptoGroup.symbols : ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];
  const binanceParam = encodeURIComponent(JSON.stringify(cryptoSymbols));

  promises.push(
    fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${binanceParam}`, {
      signal: AbortSignal.timeout(2500),
    })
      .then((r) => r.json())
      .then((list) => {
        if (Array.isArray(list)) {
          for (const item of list) {
            liveMap.set(item.symbol, {
              price: Number(item.lastPrice),
              change: Number(item.priceChangePercent),
            });
          }
        }
      })
      .catch(() => {})
  );

  // 2. 1-minute real-time stream for FX, Commodities, and Indices via Yahoo v8 chart endpoint
  for (const [sym, ySym] of Object.entries(YAHOO_WATCH_MAP)) {
    promises.push(
      fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySym)}?interval=1m&range=1d`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(2500),
      })
        .then((r) => r.json())
        .then((data) => {
          const meta = data?.chart?.result?.[0]?.meta;
          if (meta && Number.isFinite(meta.regularMarketPrice)) {
            const price = meta.regularMarketPrice;
            const prev = meta.previousClose || meta.chartPreviousClose;
            const change = prev ? ((price - prev) / prev) * 100 : 0;
            liveMap.set(sym, { price, change });
          }
        })
        .catch(() => {})
    );
  }

  await Promise.allSettled(promises);
  return liveMap;
}

async function commandWatchGrid(args = []) {
  const { readTsIndex } = require('../../../../shared/lib/market/ts_index_storage.js');
  const A = require('../../../../shared/lib/ui/ansi.js');
  const intervalSecs = numericOption(args, '--interval-secs', Math.round(numericOption(args, '--interval', 0.5) * 60));
  const once = hasFlag(args, '--once');

  let running = true;
  let wakeTimer = null;
  let sleepTimer = null;
  const previousPrices = new Map();
  const onSig = () => {
    running = false;
    if (sleepTimer) {
      clearTimeout(sleepTimer);
      sleepTimer = null;
    }
    if (wakeTimer) {
      wakeTimer();
      wakeTimer = null;
    }
  };
  process.on('SIGINT', onSig);
  process.on('SIGTERM', onSig);

  try {
    while (running) {
      const liveQuotes = await fetchLiveMarketQuotes();

      process.stdout.write('\x1b[2J\x1b[H');
      const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false });
      console.log('='.repeat(78));
      console.log(`  ${A.bold(A.CYAN + 'SOVEREIGN WATCH' + A.RESET)} ${A.muted(`— Live Market Grid [${intervalSecs}s Stream] (Updated ${timeStr})`)}`);
      console.log('='.repeat(78));

      const allEntries = [];

      for (let i = 0; i < WATCH_FAMILIES.length; i++) {
        const group = WATCH_FAMILIES[i];
        console.log(A.bold(A.YELLOW + `  [${group.name}]` + A.RESET));

        const items = [];
        for (const sym of group.symbols) {
          let price = null;
          let change = null;
          let bars = [];

          // 1. Prefer real-time live quote if available
          const live = liveQuotes.get(sym);
          if (live && live.price !== null && Number.isFinite(live.price)) {
            price = live.price;
            change = live.change;
          }

          // 2. Load historical bars for in-pane chart visualization or fallback quote
          try {
            const records = readTsIndex(DEFAULT_TS_DIR, sym, '1d');
            bars = Array.isArray(records) ? records : (records?.bars || []);
            if (price === null && bars.length > 0) {
              const last = bars[bars.length - 1];
              const prev = bars[bars.length - 2];
              price = last ? last.close : null;
              change = (last && prev && prev.close) ? ((last.close - prev.close) / prev.close) * 100 : null;
            }
          } catch {}

          let tick = ' ';
          if (previousPrices.has(sym) && price !== null) {
            const prevP = previousPrices.get(sym);
            if (price > prevP) {
              tick = A.c(A.GREEN, '▲');
            } else if (price < prevP) {
              tick = A.c(A.RED, '▼');
            }
          }
          if (price !== null) {
            previousPrices.set(sym, price);
          }

          const entry = { family: group.name, sym, price, change, bars, tick };
          items.push(entry);
          allEntries.push(entry);
        }

        // Render 2 pairs (4 columns) or 2 columns
        for (let r = 0; r < items.length; r += 2) {
          const left = items[r];
          const right = items[r + 1];

          const formatItem = (item) => {
            if (!item) return ''.padEnd(36);
            const pStr = item.price !== null
              ? (item.price >= 1000 ? item.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : item.price.toFixed(4))
              : 'N/A';
            const chgStr = item.change !== null ? `${item.change >= 0 ? '+' : ''}${item.change.toFixed(2)}%` : '';
            const col = item.change !== null ? (item.change >= 0 ? A.GREEN : A.RED) : '';
            const tick = item.tick || ' ';
            return `  ${item.sym.padEnd(9)} ${pStr.padStart(10)} ${tick}  ${col ? A.c(col, chgStr.padStart(7)) : ''.padStart(7)}`;
          };

          console.log(`${formatItem(left)}   │${formatItem(right)}`);
        }

        if (i < WATCH_FAMILIES.length - 1) {
          console.log(A.muted('─'.repeat(78)));
        }
      }
      console.log('='.repeat(78));

      if (once) {
        break;
      }

      console.log(A.muted(`  Live stream active (refreshing every ${intervalSecs}s | Press Ctrl+C or switch command to stop)\n`));

      await new Promise((resolve) => {
        wakeTimer = resolve;
        sleepTimer = setTimeout(resolve, intervalSecs * 1000);
      });
      sleepTimer = null;
    }
  } finally {
    if (sleepTimer) {
      clearTimeout(sleepTimer);
      sleepTimer = null;
    }
    process.removeListener('SIGINT', onSig);
    process.removeListener('SIGTERM', onSig);
  }

  return 0;
}

/**
 * Handles the 'watch' command.
 */
async function commandWatch(args = []) {
  const family = optionValue(args, '--family', null);
  if (!family || family === 'all') {
    return commandWatchGrid(args);
  }

  if (['onchain', 'crypto_tx', 'holdings', 'reserves'].includes(family)) {
    const gate = featureGate('onchain_data', { surface: `Watch family '${family}'` });
    if (!gate.ok) {
      printPayload({ ok: false, type: 'feature_gate', feature_flag: gate.flag, reason: gate.reason, hint: gate.hint }, args);
      return 1;
    }
  }
  const intervalMinutes = numericOption(args, '--interval', 1);
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
      process.stdout.write(`\x1b[32m✔\x1b[0m Last sync: \x1b[1m${lastSyncTime}\x1b[0m (\x1b[90m${lastSyncCount} records, ${lastSyncDuration}s\x1b[0m)\n\n`);
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
    process.stdout.write(`\r\x1b[K\x1b[33m⌛\x1b[0m Synchronizing ${family} data...`);
    try {
      const isDry = process.env.SOVEREIGN_NONINTERACTIVE === 'true' || hasFlag(args, '--dry-run');
      const snapshot = await ingestMarketData({ family: family === 'all' ? null : family, dryRun: isDry });
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
      process.stdout.write(`\r\x1b[K\x1b[31m✘\x1b[0m Sync failed: ${error.message}\n`);
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

  if (process.env.SOVEREIGN_NONINTERACTIVE === 'true' || hasFlag(args, '--once') || hasFlag(args, '--dry-run')) {
    return 0;
  }

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
 * clear-api-cache: delete provider API response cache and/or ts bins.
 *
 * Flags:
 *   --dry-run          show what would be deleted without deleting
 *   --api              clear storage/data/cache/api_responses/ (default: true unless --ts-only)
 *   --ts               also clear storage/data/ts/ bins
 *   --ts-only          clear only ts bins (skip api_responses)
 *   --tmp              clean orphaned atomic write *.tmp files across cache and ts dirs
 *   --compact          apply tiered retention to compact oversized backtest_history.json caches
 *   --symbol SYMBOL    with --ts: restrict to bins for that symbol (e.g. BTCUSDT)
 *   --timeframe TF     with --ts + --symbol: restrict to a single timeframe bin
 *
 * Examples:
 *   sovereign clear-api-cache --dry-run
 *   sovereign clear-api-cache
 *   sovereign clear-api-cache --compact
 *   sovereign clear-api-cache --ts --symbol BTCUSDT
 *   sovereign clear-api-cache --ts-only --symbol AAPL --timeframe 1m
 */
function commandClearApiCache(args) {
  const dryRun = hasFlag(args, '--dry-run');
  const tsOnly = hasFlag(args, '--ts-only');
  const includeTs = tsOnly || hasFlag(args, '--ts');
  const includeApi = !tsOnly;
  const includeTmp = hasFlag(args, '--tmp') || includeApi;
  const doCompact = hasFlag(args, '--compact');
  const symbolFilter = (optionValue(args, '--symbol', null) || '').toUpperCase() || null;
  const tfFilter = optionValue(args, '--timeframe', null) || null;

  const result = { ok: true, dry_run: dryRun, api_cache: null, ts_cache: null, tmp_files: null, compacted: null };

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

  // --- Orphaned *.tmp files in cache and ts trees ---
  if (includeTmp) {
    const tmpFiles = [];
    let tmpBytes = 0;
    const scanTmp = (dir) => {
      if (!fs.existsSync(dir)) return;
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) scanTmp(full);
          else if (entry.isFile() && entry.name.includes('.tmp')) {
            try { tmpBytes += fs.statSync(full).size; } catch (_) {}
            tmpFiles.push(full);
          }
        }
      } catch (_) {}
    };
    scanTmp(path.join(utils.REPO_ROOT, 'storage', 'data', 'cache'));
    scanTmp(DEFAULT_TS_DIR);
    if (!dryRun) {
      let deleted = 0;
      for (const fp of tmpFiles) { try { fs.unlinkSync(fp); deleted++; } catch (_) {} }
      result.tmp_files = { deleted, freed_mb: +(tmpBytes / 1e6).toFixed(2) };
    } else {
      result.tmp_files = { would_delete: tmpFiles.length, size_mb: +(tmpBytes / 1e6).toFixed(2) };
    }
  }

  // --- Compact oversized backtest_history.json caches ---
  if (doCompact) {
    const cacheRoot = path.join(utils.REPO_ROOT, 'storage', 'data', 'cache');
    const compactReports = [];
    if (fs.existsSync(cacheRoot)) {
      try {
        for (const fam of fs.readdirSync(cacheRoot)) {
          const histFile = path.join(cacheRoot, fam, 'backtest_history.json');
          if (!fs.existsSync(histFile)) continue;
          try {
            const raw = fs.readFileSync(histFile, 'utf8');
            const data = JSON.parse(raw);
            if (!Array.isArray(data.sources)) continue;
            const capped = capSnapshotForJson(data);
            const beforeCount = data.sources.length;
            const afterCount = capped.sources.length;
            if (afterCount < beforeCount) {
              const beforeBytes = fs.statSync(histFile).size;
              if (!dryRun) {
                fs.writeFileSync(histFile, JSON.stringify(capped, null, 2), 'utf8');
              }
              const afterBytes = dryRun ? Buffer.byteLength(JSON.stringify(capped, null, 2)) : fs.statSync(histFile).size;
              compactReports.push({
                family: fam,
                records_dropped: beforeCount - afterCount,
                records_remaining: afterCount,
                freed_mb: +((beforeBytes - afterBytes) / 1e6).toFixed(2),
              });
            }
          } catch (_) {}
        }
      } catch (_) {}
    }
    result.compacted = compactReports;
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
  commandWatchGrid,
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
