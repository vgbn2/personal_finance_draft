'use strict';
const path = require('node:path');
const { writeTsIndex, readTsIndex, mergeWriteBin, readTsIndexSince } = require('../../../../shared/lib/market/validation.js');
const { featureGate } = require('../../../../shared/lib/settings/runtime');
const utils = require('../../lib/utils.js');
const { optionValue, numericOption, hasFlag, withLoadingAnimation, printPayload } = utils;
const {
  rollupFromBase, rollupFiveMinForSymbol, rollupTargetsAboveBase, writeDeadSymbolMarker,
  listDeepSymbols, readBinFamily, FAMILY_BASE_TF, INTRADAY_TF_ORDER, FULL_TF_ORDER,
} = require('./data_rollup.js');

const DEFAULT_HISTORY = utils.DEFAULT_HISTORY;

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
  const { CANONICAL_MARKET_FAMILIES } = require('../../../../shared/lib/market/configured_universe.js');

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
  const { printPayload } = require('../../lib/utils.js');

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
  const { CANONICAL_MARKET_FAMILIES } = require('../../../../shared/lib/market/configured_universe.js');

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
  const { printPayload } = require('../../lib/utils.js');
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

module.exports = {
  buildFiveMinAccumulatePlan, commandFiveMinAccumulate,
  buildIntradayAccumulatePlan, commandIntradayAccumulate,
  commandUniverse,
};
