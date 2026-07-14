'use strict';
const path = require('node:path');
const { writeTsIndex, readTsIndex, mergeWriteBin } = require('../../../../shared/lib/market/validation.js');
const { featureGate } = require('../../../../shared/lib/settings/runtime');
const utils = require('../../lib/utils.js');
const { optionValue, numericOption, hasFlag, withLoadingAnimation, printPayload } = utils;
const { DEFAULT_TS_DIR, rollupFromBase, rollupTargetsAboveBase, writeDeadSymbolMarker, FAMILY_BASE_TF } = require('./data_rollup.js');

const DEFAULT_HISTORY = utils.DEFAULT_HISTORY;

const EQUITY_DEEP_BACKFILL_PROVIDER = 'alpaca';
const EQUITY_DEEP_BACKFILL_TIMEFRAME = '5m';
const EQUITY_5M_BARS_PER_DAY = 78;
const EQUITY_5M_PROVIDER_MAX_BARS = 10000;

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

module.exports = {
  equityUniverseEntries, alpacaEquity5mSkipReason,
  buildEquityDeepBackfillPlan, estimateEquity5mApiCalls,
  commandCryptoDeepBackfill, commandEquityDeepBackfill,
};
