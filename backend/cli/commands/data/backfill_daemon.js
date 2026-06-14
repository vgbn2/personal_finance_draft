'use strict';
/**
 * backfill_daemon.js -- passive background market-data poller.
 *
 * Wired as `sovereign data backfill-daemon`. Once running (e.g. the Docker `backfill`
 * service), it keeps every configured symbol backfilled at its base grain and rolled
 * up to all coarser intraday timeframes, printing a per-symbol decision line and a
 * per-cycle JSON summary for easy debugging.
 *
 * Cache-aware: before polling a provider it checks what's already stored (bar count +
 * last-bar age) and only fetches symbols whose base bin is MISSING (deep backfill) or
 * STALE (incremental refresh). Fresh symbols are skipped, never silently re-fetched.
 *
 * Mixed base grain: crypto + US equities use a native 1m base (5m/15m/… derived);
 * Yahoo families (indices/commodities/fx) use a 5m base (Yahoo only serves ~7d of 1m).
 *
 * The core `runBackfillCycle` takes injected executors so it is unit-testable without
 * network; `commandBackfillDaemon` wires the real ingest commands.
 */

const {
  optionValue, hasFlag, numericOption, printPayload,
} = require('../../lib/utils.js');
const {
  FAMILY_BASE_TF, rollupTargetsAboveBase, rollupFromBase, DEFAULT_TS_DIR,
  commandCryptoDeepBackfill, commandEquityDeepBackfill, commandFiveMinAccumulate,
  buildFiveMinAccumulatePlan, buildEquityDeepBackfillPlan,
} = require('./data.js');
const { isFresh } = require('../../../../shared/lib/market/coverage.js');

const ONE_M_FAMILIES = ['crypto', 'equities'];
const YAHOO_FAMILIES = ['indices', 'commodities', 'fx'];
const ALL_FAMILIES = [...ONE_M_FAMILIES, ...YAHOO_FAMILIES];

// Default fetch windows (days). Deep = first-fill cold history; incremental = recent
// top-up for a stale-but-present bin (kept >5 because the native intraday fetch path
// requires --days > 5).
const DEFAULT_DEEP_DAYS = { crypto: 1825, equities: 1825, indices: 59, commodities: 59, fx: 59 };
const INCREMENTAL_DAYS = 7;

/**
 * buildJobUniverse(config, families) -- one row per (symbol, family) at its base grain.
 * @returns {Array<{symbol:string, family:string, baseTf:string}>}
 */
function buildJobUniverse(config, families = ALL_FAMILIES) {
  const jobs = [];
  for (const family of families) {
    const baseTf = FAMILY_BASE_TF[family] || '5m';
    if (family === 'crypto') {
      for (const symbol of (config.crypto && config.crypto.symbols) || []) {
        jobs.push({ symbol: String(symbol).toUpperCase(), family, baseTf });
      }
    } else if (family === 'equities') {
      const plan = buildEquityDeepBackfillPlan(config, {});
      for (const symbol of plan.symbols) jobs.push({ symbol: String(symbol).toUpperCase(), family, baseTf });
    } else if (YAHOO_FAMILIES.includes(family)) {
      const plan = buildFiveMinAccumulatePlan(config, { family });
      for (const job of plan.jobs) jobs.push({ symbol: String(job.symbol).toUpperCase(), family, baseTf });
    }
  }
  return jobs;
}

// Map a freshness gate result to the action the daemon takes.
function decideAction(gate) {
  if (gate.reason === 'missing' || gate.reason === 'empty') return 'deep';
  if (gate.fresh) return 'skip';
  return 'incremental'; // stale or no-threshold
}

function fmtAge(ms) {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return 'n/a';
  const m = Math.round(ms / 60000);
  if (m < 90) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

/**
 * runBackfillCycle -- one pass over the job universe. Pure orchestration: the cache
 * gate decides deep/incremental/skip per symbol, the injected executor fetches, and
 * the injected rollup derives coarser bins. Returns a structured summary.
 *
 * @param {object} o
 * @param {string} o.tsDir
 * @param {Array<{symbol,family,baseTf}>} o.jobs
 * @param {number} [o.now]
 * @param {(job, mode, days) => Promise<{ok:boolean, error?:string}>} o.execute  deep/incremental fetch
 * @param {(job) => {ok:boolean, derived?:object, error?:string}} o.rollup        derive coarser bins
 * @param {(line:string) => void} [o.log]
 * @param {(tsDir,symbol,tf,family,now)=>object} [o.freshness]  defaults to coverage.isFresh
 * @param {number} [o.cycle]
 */
async function runBackfillCycle(o) {
  const tsDir = o.tsDir;
  const now = o.now || Date.now();
  const log = o.log || (() => {});
  const freshness = o.freshness || isFresh;
  const cycle = o.cycle || 1;
  const deepDays = o.deepDays || DEFAULT_DEEP_DAYS;
  const incrementalDays = o.incrementalDays || INCREMENTAL_DAYS;

  const summary = { cycle, scanned: 0, deep: 0, incremental: 0, skipped: 0, rolled_up: 0, errors: 0, failures: [] };
  const start = Date.now();

  for (const job of o.jobs) {
    summary.scanned += 1;
    const gate = freshness(tsDir, job.symbol, job.baseTf, job.family, now);
    const action = decideAction(gate);

    if (action === 'skip') {
      summary.skipped += 1;
      log(`[BACKFILL] cycle=${cycle} ${job.symbol} ${job.baseTf}: have=${gate.count} age=${fmtAge(gate.ageMs)} FRESH -> skip`);
      continue;
    }

    const days = action === 'deep' ? (deepDays[job.family] || 59) : incrementalDays;
    log(`[BACKFILL] cycle=${cycle} ${job.symbol} ${job.baseTf}: have=${gate.count} age=${fmtAge(gate.ageMs)} ${gate.reason.toUpperCase()} -> ${action.toUpperCase()} (${days}d)`);

    let res;
    try {
      res = await o.execute(job, action, days);
    } catch (err) {
      res = { ok: false, error: err && err.message ? err.message : String(err) };
    }
    if (!res || !res.ok) {
      summary.errors += 1;
      summary.failures.push({ symbol: job.symbol, family: job.family, action, error: (res && res.error) || 'fetch failed' });
      log(`[BACKFILL] cycle=${cycle} ${job.symbol} ${job.baseTf}: ${action.toUpperCase()} FAILED: ${(res && res.error) || 'fetch failed'}`);
      continue;
    }
    if (action === 'deep') summary.deep += 1; else summary.incremental += 1;

    // Derive coarser bins from the freshly-written base bin (idempotent, merge-protected).
    try {
      const roll = o.rollup(job);
      if (roll && roll.ok) {
        summary.rolled_up += 1;
        log(`[BACKFILL] cycle=${cycle} ${job.symbol} rollup: ${Object.entries(roll.derived || {}).map(([t, n]) => `${t}:${n}`).join(' ')}`);
      }
    } catch (err) {
      log(`[BACKFILL] cycle=${cycle} ${job.symbol} rollup FAILED: ${err.message}`);
    }
  }

  summary.elapsed_s = Number(((Date.now() - start) / 1000).toFixed(1));
  log(JSON.stringify({ type: 'backfill_cycle', ...summary }));
  return summary;
}

// Real fetch executor: route to the family's ingest command with the computed window.
function makeRealExecutor() {
  return async (job, _mode, days) => {
    const args = ['--symbol', job.symbol, '--days', String(days), '--json'];
    let rc;
    if (job.family === 'crypto') {
      rc = await commandCryptoDeepBackfill(args);
    } else if (job.family === 'equities') {
      rc = await commandEquityDeepBackfill(args);
    } else {
      rc = await commandFiveMinAccumulate(['--family', job.family, ...args]);
    }
    return { ok: rc === 0, error: rc === 0 ? undefined : `exit ${rc}` };
  };
}

// Real rollup executor: derive every coarser TF above the job's base grain.
function makeRealRollup(tsDir) {
  return (job) => rollupFromBase(tsDir, job.symbol, job.baseTf, rollupTargetsAboveBase(job.baseTf));
}

/**
 * commandBackfillDaemon -- CLI entrypoint. Loops every --interval-secs (or one pass
 * with --once), wiring the real ingest commands as executors.
 */
async function commandBackfillDaemon(args) {
  const intervalSecs = numericOption(args, '--interval-secs', 1800);
  const once = hasFlag(args, '--once');
  const tsDir = optionValue(args, '--ts-dir', DEFAULT_TS_DIR);
  const familyArg = optionValue(args, '--families', null);
  const families = familyArg
    ? familyArg.split(',').map((s) => s.trim().toLowerCase()).filter((f) => ALL_FAMILIES.includes(f))
    : ALL_FAMILIES;
  const symbolArg = optionValue(args, '--symbols', null);
  const symbolFilter = symbolArg
    ? new Set(symbolArg.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))
    : null;

  const { loadConfig } = require('../../../scripts/data_ops/ingest_market_data.js');
  const log = (line) => console.log(line);
  const execute = makeRealExecutor();
  const rollup = makeRealRollup(tsDir);

  let cycle = 0;
  let lastSummary = null;
  /* eslint-disable no-await-in-loop */
  for (;;) {
    cycle += 1;
    const config = await loadConfig();
    let jobs = buildJobUniverse(config, families);
    if (symbolFilter) jobs = jobs.filter((j) => symbolFilter.has(j.symbol));

    console.log(`[BACKFILL] cycle=${cycle} start: ${jobs.length} jobs across ${families.join(',')} (ts-dir=${tsDir})`);
    lastSummary = await runBackfillCycle({ tsDir, jobs, execute, rollup, log, cycle });

    if (once) break;
    await new Promise((resolve) => setTimeout(resolve, intervalSecs * 1000));
  }
  /* eslint-enable no-await-in-loop */

  if (once) printPayload({ ok: lastSummary.errors === 0, ...lastSummary }, args);
  return lastSummary && lastSummary.errors === 0 ? 0 : 1;
}

module.exports = {
  commandBackfillDaemon,
  runBackfillCycle,
  buildJobUniverse,
  decideAction,
  makeRealExecutor,
  makeRealRollup,
  ALL_FAMILIES,
  DEFAULT_DEEP_DAYS,
  INCREMENTAL_DAYS,
};
