'use strict';
const path = require('node:path');
const { writeTsIndex, readTsIndex, mergeWriteBin } = require('../../../../shared/lib/market/validation.js');
const { featureGate } = require('../../../../shared/lib/settings/runtime');
const utils = require('../../lib/utils.js');
const { optionValue, numericOption, hasFlag, withLoadingAnimation, printPayload } = utils;
const { rollupFromBase, rollupTargetsAboveBase, writeDeadSymbolMarker, FAMILY_BASE_TF } = require('./data_rollup.js');
const {
  equityUniverseEntries,
  alpacaEquity5mSkipReason,
} = require('../../../../shared/lib/market/configured_universe.js');

const DEFAULT_TS_DIR = path.join(utils.REPO_ROOT, 'storage', 'data', 'ts');
const DEFAULT_HISTORY = utils.DEFAULT_HISTORY;

const EQUITY_DEEP_BACKFILL_PROVIDER = 'alpaca';
const EQUITY_DEEP_BACKFILL_TIMEFRAME = '5m';
const EQUITY_5M_BARS_PER_DAY = 78;
const EQUITY_5M_PROVIDER_MAX_BARS = 10000;

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

function elapsedSeconds(startedAt) {
  return Number(((Date.now() - startedAt) / 1000).toFixed(1));
}

function applyDeepBackfillRollup(entry, symbol, baseTimeframe, targets, skipRollup) {
  if (!entry.ok || skipRollup) return;
  try {
    const rollup = rollupFromBase(DEFAULT_TS_DIR, symbol, baseTimeframe, targets);
    if (rollup.ok) entry.rolled_up = rollup.derived;
  } catch (error) {
    entry.rollup_error = error.message;
  }
}

function rollupProgressNote(entry, targets) {
  if (!entry.rolled_up) return '';
  return ` + rollup ${targets.map((target) => `${target}:${entry.rolled_up[target]}`).join(' ')}`;
}

async function waitBetweenSymbols(delayMs, index, symbolCount) {
  if (delayMs > 0 && index < symbolCount - 1) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

async function backfillCryptoSymbol(symbol, options, ingestMarketData) {
  const startedAt = Date.now();
  try {
    const snapshot = await ingestMarketData({
      family: 'crypto',
      symbol,
      timeframe: options.baseTimeframe,
      historyDays: options.days,
      provider: 'binance',
      force: true,
      returnAttemptSnapshot: true,
    });
    const bars = (snapshot.sources || []).filter((record) => (
      record.timeframe === options.baseTimeframe && record.symbol === symbol
    ));
    const errors = snapshot.errors || [];
    const entry = {
      symbol,
      ok: bars.length > 0,
      base_timeframe: options.baseTimeframe,
      bars: bars.length,
      elapsed_s: elapsedSeconds(startedAt),
      errors: errors.length,
    };
    if (!entry.ok) {
      entry.error = errors.map((error) => error.message).filter(Boolean).slice(0, 3).join(' | ')
        || `no ${options.baseTimeframe} bars returned (delisted or not listed on Binance)`;
      entry.marker_written = writeDeadSymbolMarker(
        DEFAULT_TS_DIR,
        symbol,
        options.baseTimeframe,
        'crypto',
        'binance',
      );
    }
    applyDeepBackfillRollup(
      entry,
      symbol,
      options.baseTimeframe,
      options.rollupTargets,
      options.skipRollup,
    );
    return { entry, errors, thrown: false };
  } catch (error) {
    return {
      entry: {
        symbol,
        ok: false,
        base_timeframe: options.baseTimeframe,
        bars: 0,
        elapsed_s: elapsedSeconds(startedAt),
        error: error.message,
      },
      errors: [{
        symbol,
        timeframe: options.baseTimeframe,
        family: 'crypto',
        message: error.message,
      }],
      thrown: true,
    };
  }
}

function renderCryptoProgressStart(progress, symbol, options) {
  if (global.suppressLogs) return;
  if (process.stdout.isTTY) {
    process.stdout.write(`\r\x1b[K${progress} ${symbol} ${options.baseTimeframe} ...`);
  } else {
    console.log(`${progress} Backfilling ${symbol} ${options.baseTimeframe} (${options.days} days)`);
  }
}

function renderCryptoProgressResult(progress, result, options) {
  if (global.suppressLogs) return;
  const { entry } = result;
  if (process.stdout.isTTY) {
    const color = entry.ok ? '\x1b[32m' : '\x1b[31m';
    const detail = result.thrown
      ? `FAILED (${entry.error})`
      : `${entry.bars} bars (${entry.elapsed_s.toFixed(1)}s)`;
    process.stdout.write(`\r\x1b[K${progress} ${color}${entry.symbol}\x1b[0m ${options.baseTimeframe}: ${detail}\n`);
    return;
  }
  if (result.thrown) {
    console.error(`${progress} ${entry.symbol} FAILED: ${entry.error}`);
    return;
  }
  const rollup = rollupProgressNote(entry, options.rollupTargets);
  console.log(`${progress} ${entry.symbol} ${options.baseTimeframe}: ${entry.bars} bars (${entry.elapsed_s.toFixed(1)}s)${rollup}${entry.ok ? '' : ` FAILED: ${entry.error}`}`);
}

async function backfillEquitySymbol(symbol, options, ingestMarketData) {
  const startedAt = Date.now();
  try {
    const snapshot = await ingestMarketData({
      family: 'equities',
      symbol,
      timeframe: options.baseTimeframe,
      historyDays: options.days,
      provider: options.provider,
      force: true,
      chunkDelayMs: options.chunkDelayMs,
      returnAttemptSnapshot: true,
    });
    const bars = (snapshot.sources || []).filter((record) => (
      record.timeframe === options.baseTimeframe && record.symbol === symbol
    ));
    const errors = snapshot.errors || [];
    const entry = {
      symbol,
      ok: bars.length > 0 || errors.length === 0,
      base_timeframe: options.baseTimeframe,
      bars: bars.length,
      elapsed_s: elapsedSeconds(startedAt),
      errors: errors.length,
    };
    if (!entry.ok) {
      entry.error = errors.map((error) => error.message).filter(Boolean).slice(0, 3).join(' | ')
        || `no native Alpaca ${options.baseTimeframe} bars ingested`;
    }
    applyDeepBackfillRollup(
      entry,
      symbol,
      options.baseTimeframe,
      options.rollupTargets,
      options.skipRollup,
    );
    return { entry, errors, thrown: false };
  } catch (error) {
    return {
      entry: {
        symbol,
        ok: false,
        base_timeframe: options.baseTimeframe,
        bars: 0,
        elapsed_s: elapsedSeconds(startedAt),
        error: error.message,
      },
      errors: [{
        symbol,
        timeframe: options.baseTimeframe,
        family: 'equities',
        provider: options.provider,
        message: error.message,
      }],
      thrown: true,
    };
  }
}

function renderEquityProgressStart(progress, symbol, options) {
  if (global.suppressLogs) return;
  if (process.stdout.isTTY) {
    process.stdout.write(`\r\x1b[K${progress} ${symbol} Alpaca ${options.baseTimeframe} ...`);
  } else {
    console.log(`${progress} Backfilling ${symbol} Alpaca ${options.baseTimeframe} (${options.days} days)`);
  }
}

function renderEquityProgressResult(progress, result, options) {
  if (global.suppressLogs) return;
  const { entry } = result;
  if (process.stdout.isTTY) {
    const color = entry.ok ? '\x1b[32m' : '\x1b[31m';
    const detail = result.thrown
      ? `FAILED (${entry.error})`
      : `${entry.bars} bars (${entry.elapsed_s.toFixed(1)}s)`;
    process.stdout.write(`\r\x1b[K${progress} ${color}${entry.symbol}\x1b[0m Alpaca ${options.baseTimeframe}: ${detail}\n`);
    return;
  }
  if (result.thrown) {
    console.error(`${progress} ${entry.symbol} FAILED: ${entry.error}`);
    return;
  }
  const rollup = rollupProgressNote(entry, options.rollupTargets);
  console.log(`${progress} ${entry.symbol} Alpaca ${options.baseTimeframe}: ${entry.bars} bars (${entry.elapsed_s.toFixed(1)}s)${rollup}${entry.ok ? '' : ` FAILED: ${entry.error}`}`);
}

function deepBackfillErrorMessages(errors) {
  return [...new Set(errors.map((error) => error.message).filter(Boolean))].slice(0, 24);
}

function buildCryptoBackfillSummary(options, results, symbolResults, errors) {
  return {
    ok: results.errors === 0,
    symbols: options.symbols.length,
    successful: results.ok,
    errors: results.errors,
    total_base_bars: symbolResults.reduce((total, result) => total + (result.bars || 0), 0),
    timeframe: options.baseTimeframe,
    days: options.days,
    delay_ms: options.delayMs,
    symbol_results: symbolResults,
    error_messages: deepBackfillErrorMessages(errors),
    output: DEFAULT_HISTORY,
  };
}

function buildEquityBackfillSummary(options, results, symbolResults, errors) {
  return {
    ok: results.errors === 0,
    provider: options.provider,
    symbols: options.symbols.length,
    skipped: options.skippedSymbols.length,
    skipped_symbols: options.skippedSymbols,
    successful: results.ok,
    errors: results.errors,
    total_base_bars: symbolResults.reduce((total, result) => total + (result.bars || 0), 0),
    timeframe: options.baseTimeframe,
    days: options.days,
    delay_ms: options.delayMs,
    chunk_delay_ms: options.chunkDelayMs,
    symbol_results: symbolResults,
    error_messages: deepBackfillErrorMessages(errors),
    output: DEFAULT_HISTORY,
  };
}

function buildEquityDryRun(plan, options) {
  return {
    ok: true,
    dry_run: true,
    provider: plan.provider,
    symbols: plan.symbols.length,
    symbol_list: plan.symbols,
    skipped: plan.skipped_symbols.length,
    skipped_symbols: plan.skipped_symbols,
    timeframe: options.baseTimeframe,
    days: options.days,
    delay_ms: options.delayMs,
    chunk_delay_ms: options.chunkDelayMs,
    estimated_api_calls: estimateEquity5mApiCalls(plan.symbols.length, options.days),
    auto_rollup: options.skipRollup ? false : options.rollupTargets,
    message: `Would sequentially backfill native ${options.baseTimeframe} Alpaca data for ${plan.symbols.length} US equity symbols over ${options.days} days${options.skipRollup ? '' : `, then auto-derive ${options.rollupTargets.join('/')} locally`}. Re-run without --dry-run to execute.`,
  };
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
  const { printPayload } = require('../../lib/utils.js');
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
  const runOptions = {
    symbols,
    days,
    delayMs,
    baseTimeframe: baseTf,
    skipRollup,
    rollupTargets,
  };

  if (!global.suppressLogs) console.log(`[CRYPTO-DEEP-BACKFILL] Starting sequential ${baseTf} backfill: ${symbols.length} symbols, ${days} days, delay=${delayMs}ms`);

  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    const progress = `[${i + 1}/${symbols.length}]`;
    renderCryptoProgressStart(progress, symbol, runOptions);
    const result = await backfillCryptoSymbol(symbol, runOptions, ingestMarketData);
    symbolResults.push(result.entry);
    allErrors.push(...result.errors);
    if (result.entry.ok) results.ok += 1;
    else results.errors += 1;
    renderCryptoProgressResult(progress, result, runOptions);
    await waitBetweenSymbols(delayMs, i, symbols.length);
  }

  if (!global.suppressLogs && process.stdout.isTTY) process.stdout.write('\n');

  // No persistence step here: ingestMarketData already wrote the scoped
  // snapshot, the partitioned JSON history, and the binary ts-index per symbol.

  if (!global.suppressLogs) {
    printPayload(buildCryptoBackfillSummary(runOptions, results, symbolResults, allErrors), args);
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
  const { printPayload } = require('../../lib/utils.js');
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
    printPayload(buildEquityDryRun(plan, {
      baseTimeframe: baseTf,
      days,
      delayMs,
      chunkDelayMs,
      skipRollup,
      rollupTargets,
    }), args);
    return 0;
  }

  const results = { ok: 0, errors: 0 };
  const allErrors = [];
  const symbolResults = [];
  const runOptions = {
    provider: plan.provider,
    symbols: plan.symbols,
    skippedSymbols: plan.skipped_symbols,
    days,
    delayMs,
    chunkDelayMs,
    baseTimeframe: baseTf,
    skipRollup,
    rollupTargets,
  };

  if (!global.suppressLogs) {
    console.log(`[EQUITY-DEEP-BACKFILL] Starting sequential Alpaca ${baseTf} backfill: ${plan.symbols.length} symbols, ${days} days, delay=${delayMs}ms, chunk-delay=${chunkDelayMs}ms`);
    if (plan.skipped_symbols.length > 0) {
      console.log(`[EQUITY-DEEP-BACKFILL] Skipping ${plan.skipped_symbols.length} unsupported equity symbols`);
    }
  }

  for (let i = 0; i < plan.symbols.length; i++) {
    const symbol = plan.symbols[i];
    const progress = `[${i + 1}/${plan.symbols.length}]`;
    renderEquityProgressStart(progress, symbol, runOptions);
    const result = await backfillEquitySymbol(symbol, runOptions, ingestMarketData);
    symbolResults.push(result.entry);
    allErrors.push(...result.errors);
    if (result.entry.ok) results.ok += 1;
    else results.errors += 1;
    renderEquityProgressResult(progress, result, runOptions);
    await waitBetweenSymbols(delayMs, i, plan.symbols.length);
  }

  if (!global.suppressLogs && process.stdout.isTTY) process.stdout.write('\n');

  if (!global.suppressLogs) {
    printPayload(buildEquityBackfillSummary(runOptions, results, symbolResults, allErrors), args);
  }
  return results.errors === 0 ? 0 : 1;
}

module.exports = {
  equityUniverseEntries, alpacaEquity5mSkipReason,
  buildEquityDeepBackfillPlan, estimateEquity5mApiCalls,
  commandCryptoDeepBackfill, commandEquityDeepBackfill,
};
