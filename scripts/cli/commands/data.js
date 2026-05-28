const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const {
  ingestMarketData,
  loadHistoricalSources,
  loadPredictionMarketHistory,
  mergeSnapshots,
} = require('../../data_ops/ingest_market_data');
const { validateSnapshot, writeJson, readSnapshot } = require('../../lib/market_validation');
const utils = require('../lib/utils.js');
const { 
  printPayload, 
  optionValue, 
  numericOption, 
  hasFlag, 
  pageText,
  DEFAULT_SNAPSHOT,
  DEFAULT_QUALITY_REPORT,
  DEFAULT_HISTORY
} = utils;

/**
 * Handles the 'ingest' command.
 */
async function commandIngest(args) {
  const snapshot = await ingestMarketData();
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
  const output = optionValue(args, '--output', DEFAULT_HISTORY);
  const relevanceFloor = numericOption(args, '--relevance-floor', 0);
  let marketHistory = null;
  try {
    marketHistory = await loadHistoricalSources(args);
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
  const predictionHistory = hasFlag(args, '--include-prediction')
    ? await loadPredictionMarketHistory(args)
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

  const existing = readSnapshot(output);
  const preservedSnapshot = mergeSnapshots(existing, filteredSnapshot);

  writeJson(output, preservedSnapshot);
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
  return hasFlag(args, '--strict') && !report.ok ? 1 : 0;
}

/**
 * Handles the 'watch' command.
 */
async function commandWatch(args) {
  const family = optionValue(args, '--family', 'all');
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

module.exports = {
  commandIngest,
  commandBackfill,
  commandValidate,
  commandWatch
};
