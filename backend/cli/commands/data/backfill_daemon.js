'use strict';
/**
 * backfill_daemon.js -- passive background market-data poller.
 *
 * Wired as `sovereign backfill-daemon`. Once running (e.g. the Docker `backfill`
 * service), it keeps every configured symbol backfilled at its base grain and rolled
 * up to all coarser intraday timeframes, printing a per-symbol decision line and a
 * per-cycle JSON summary for easy debugging.
 *
 * Cache-aware: before polling a provider it checks what's already stored (bar count +
 * last-bar age) and only fetches symbols whose base bin is MISSING (deep backfill) or
 * STALE (incremental refresh). Fresh symbols are skipped, never silently re-fetched.
 *
 * Parallel provider lanes: crypto (Binance), equities (Alpaca), and Yahoo families
 * (indices/commodities/fx) run concurrently — one lane per provider — so a slow
 * Binance deep backfill doesn't block Yahoo or Alpaca and vice-versa.
 *
 * Mixed base grain: crypto + US equities use a native 1m base (5m/15m/… derived);
 * Yahoo families (indices/commodities/fx) use a 5m base (Yahoo only serves ~7d of 1m).
 *
 * The core `runBackfillCycle` takes injected executors so it is unit-testable without
 * network; `commandBackfillDaemon` wires the real ingest commands.
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  optionValue, hasFlag, numericOption, printPayload,
} = require('../../lib/utils.js');
const {
  FAMILY_BASE_TF, rollupTargetsAboveBase, rollupFromBase, DEFAULT_TS_DIR,
  commandCryptoDeepBackfill, commandEquityDeepBackfill, commandFiveMinAccumulate, commandIngest,
  buildFiveMinAccumulatePlan, buildEquityDeepBackfillPlan,
} = require('./data.js');
const { isFresh } = require('../../../../shared/lib/market/coverage.js');
const { writeJson } = require('../../../../shared/lib/market/validation.js');
const { pruneApiCache } = require('../../../../shared/lib/providers/common.js');
const { STORAGE_DATA_DIR } = require('../../../../shared/lib/runtime/paths.js');

// Progress/liveness state for ANY observer (the dashboard, a future web UI, a
// human tailing the file) regardless of whether they started this process --
// this daemon is meant to run headless (Docker `backfill` service, a separate
// terminal) just as often as it's launched from the dashboard, and console.log
// alone gives an external observer nothing to poll. Lives under the gitignored
// cache/ dir (transient runtime state, not data worth tracking).
const DAEMON_STATUS_PATH = path.join(STORAGE_DATA_DIR, 'cache', 'backfill_daemon_status.json');

const ONE_M_FAMILIES = ['crypto', 'equities'];
const YAHOO_FAMILIES = ['indices', 'commodities', 'fx'];
const ALL_FAMILIES = [...ONE_M_FAMILIES, ...YAHOO_FAMILIES];

// Provider lane each family belongs to.
const FAMILY_LANE = {
  crypto: 'binance',
  equities: 'alpaca',
  indices: 'yahoo',
  commodities: 'yahoo',
  fx: 'yahoo',
};

// Max concurrent jobs per provider lane (Yahoo rate-limits at ~429 above ~8).
const LANE_CONCURRENCY = { binance: 3, alpaca: 3, yahoo: 5 };

// HARD memory-safe ceiling per lane — a `--concurrency` override is clamped to this.
// The 1m lanes (binance/alpaca) touch multi-million-row bins (BTCUSDT 1m ≈ 3M records);
// each in-flight job transiently materializes the existing bin as JS objects in the
// merge-write, so running too many at once exhausts the V8 heap (OOM). Yahoo bins are
// 5m and ~100× smaller, so that lane can take the full override. A lane absent here is
// uncapped. (See windowed-rollup wiring below, which removes the second full-bin read.)
const LANE_MAX_CONCURRENCY = { binance: 3, alpaca: 3 };

const DAY_MS = 86400000;
// Floor a timestamp to its UTC-day boundary — a multiple of every intraday interval up
// to 4h, so a rollup window starting here produces no partial coarse bars.
function utcDayFloor(ms) { return Math.floor(ms / DAY_MS) * DAY_MS; }

// Default fetch windows (days). Deep = first-fill cold history; incremental = recent
// top-up for a stale-but-present bin (kept >5 because the native intraday fetch path
// requires --days > 5).
// Deep = first-fill cold history. Crypto/equity 1m reach back to listing / the provider
// floor (Binance to listing; Alpaca ~2016), so their windows are long. Yahoo families
// have no deep intraday (≤30m capped ~60d), so their deep job only fills the recent 5m
// window — their historical depth comes from the daily guard below, not this number.
const DEFAULT_DEEP_DAYS = { crypto: 5650, equities: 7650, indices: 7650, commodities:7650, fx: 7650 };
const INCREMENTAL_DAYS = 7;

// Per-family DEEP acquisition plan: every timeframe to fetch NATIVELY at its maximum
// depth from the deepest-capable provider, so one "Deep Backfill" run restores full
// history at the finest grain each provider offers:
//   - crypto: Binance 1m spans listing→now → 5m…1mo (incl. daily) all derive from it.
//   - equities: Alpaca 1m only reaches ~2020, so deep daily is fetched from Yahoo (→1998).
//   - indices/commodities/fx: no provider 1m; 5m via range-accumulate (~60d), plus native
//     1h (~730d) and deep daily (Yahoo, or Frankfurter for fx → ~20y).
// A deep job runs every step PER-SYMBOL (so the bulk-ingest freshness gate can't skip it);
// rollup then refines the recent overlap and rebuilds 1w/1mo from the deep daily. The
// merge keeps higher-priority recent bars (Alpaca) and deeper native bars. Supersedes the
// older deepAlsoNeedsDaily guard. `days:null` ⇒ use the family's DEFAULT_DEEP_DAYS window.
const DEEP_PLAN = {
  crypto:      [{ tf: '1m', kind: 'crypto', days: null }],
  equities:    [{ tf: '1m', kind: 'equity', days: null },
                { tf: '1d', kind: 'ingest', provider: 'yahoo', days: 7300 }],
  indices:     [{ tf: '1d', kind: 'ingest', provider: 'yahoo', days: 7300 },
                { tf: '1h', kind: 'ingest', provider: 'yahoo', days: 730 },
                { tf: '5m', kind: 'accumulate', days: null }],
  commodities: [{ tf: '1d', kind: 'ingest', provider: 'yahoo', days: 7300 },
                { tf: '1h', kind: 'ingest', provider: 'yahoo', days: 730 },
                { tf: '5m', kind: 'accumulate', days: null }],
  fx:          [{ tf: '1d', kind: 'ingest', provider: 'frankfurter', days: 7300 },
                { tf: '1h', kind: 'ingest', provider: 'yahoo', days: 730 },
                { tf: '5m', kind: 'accumulate', days: null }],
};

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
 * runWithConcurrency -- run async fn over items with a bounded concurrency pool.
 * JS is single-threaded so shared state mutations between awaits are safe.
 */
async function runWithConcurrency(items, limit, fn) {
  const executing = new Set();
  for (const item of items) {
    const p = fn(item).finally(() => executing.delete(p));
    executing.add(p);
    if (executing.size >= limit) await Promise.race(executing);
  }
  await Promise.all(executing);
}

/**
 * groupIntoLanes -- split a flat job list into provider lanes.
 * @returns {Array<{lane:string, concurrency:number, jobs:Array}>}
 */
function groupIntoLanes(jobs, concurrencyOverride) {
  const map = {};
  for (const job of jobs) {
    const lane = FAMILY_LANE[job.family] || 'yahoo';
    if (!map[lane]) map[lane] = [];
    map[lane].push(job);
  }
  return Object.entries(map).map(([lane, laneJobs]) => {
    const requested = concurrencyOverride || LANE_CONCURRENCY[lane] || 3;
    const ceiling = LANE_MAX_CONCURRENCY[lane]; // undefined = uncapped
    const concurrency = ceiling ? Math.min(requested, ceiling) : requested;
    return { lane, concurrency, jobs: laneJobs };
  });
}

/**
 * runBackfillCycle -- one pass over the job universe.
 *
 * When o.parallelLanes === true (default), jobs are grouped by provider lane
 * (binance/alpaca/yahoo) and all lanes run concurrently with per-lane concurrency
 * limits. When false, jobs run sequentially (useful for deterministic tests).
 *
 * @param {object} o
 * @param {string} o.tsDir
 * @param {Array<{symbol,family,baseTf}>} o.jobs
 * @param {number} [o.now]
 * @param {(job, mode, days) => Promise<{ok:boolean, error?:string}>} o.execute
 * @param {(job) => {ok:boolean, derived?:object, error?:string}} o.rollup
 * @param {(line:string) => void} [o.log]
 * @param {(tsDir,symbol,tf,family,now)=>object} [o.freshness]
 * @param {number} [o.cycle]
 * @param {boolean} [o.parallelLanes]  default true
 */
async function runBackfillCycle(o) {
  const tsDir = o.tsDir;
  const now = o.now || Date.now();
  const log = o.log || (() => {});
  const freshness = o.freshness || isFresh;
  const cycle = o.cycle || 1;
  const deepDays = o.deepDays || DEFAULT_DEEP_DAYS;
  const incrementalDays = o.incrementalDays || INCREMENTAL_DAYS;
  const parallelLanes = o.parallelLanes !== false; // default true
  // Fired once per job, after its outcome (skip/failed/ok) is final - the only
  // way to count progress accurately, since a freshness-skipped job (the
  // common case on a warm run) never logs a line at all. Optional; tests and
  // the sequential/CLI-only callers don't need it.
  const onJobDone = o.onJobDone || (() => {});

  const summary = {
    cycle, scanned: 0, deep: 0, incremental: 0, skipped: 0,
    rolled_up: 0, rollup_errors: 0, errors: 0, failures: [],
  };
  const start = Date.now();

  function runJobRollup(job, action) {
    try {
      const roll = o.rollup(job, action);
      if (!roll || roll.ok === false) {
        throw new Error((roll && roll.error) || 'rollup returned no successful result');
      }
      summary.rolled_up += 1;
      const n = Object.keys(roll.derived || {}).length;
      if (n > 0) log(`[BACKFILL] ${job.symbol}  +${n}TF`);
      return true;
    } catch (err) {
      const error = err && err.message ? err.message : String(err);
      summary.errors += 1;
      summary.rollup_errors += 1;
      summary.failures.push({ symbol: job.symbol, family: job.family, action, stage: 'rollup', error });
      log(`[BACKFILL] ${job.symbol}  rollup failed: ${error}`);
      return false;
    }
  }

  // Process a single job — shared by both sequential and parallel paths.
  async function processJob(job) {
    summary.scanned += 1;
    const gate = freshness(tsDir, job.symbol, job.baseTf, job.family, now);
    let action = decideAction(gate);
    // --deep-all: force every live symbol through the full DEEP_PLAN (ignore fresh/stale),
    // but still respect dead-symbol markers so delisted symbols aren't retried each run.
    if (o.forceDeep && gate.reason !== 'not_found') action = 'deep';

    if (action === 'skip') {
      summary.skipped += 1;
      if (gate.reason === 'not_found') {
        log(`[BACKFILL] ${job.symbol}  ✗ no data on provider (skip 7d)`);
        onJobDone(job, 'skipped');
        return;
      }

      // A live feed can keep the base grain fresh without touching stored coarse
      // bins. Refresh local rollups even when no provider fetch is needed.
      const rolledUp = runJobRollup(job, 'refresh');
      onJobDone(job, rolledUp ? 'skipped' : 'rollup_failed');
      return;
    }

    const days = action === 'deep' ? (deepDays[job.family] || 59) : incrementalDays;
    log(`[BACKFILL] ${job.symbol}  → ${action.toUpperCase()} ${days}d`);

    const t0 = Date.now();
    let res;
    try {
      res = await o.execute(job, action, days);
    } catch (err) {
      res = { ok: false, error: err && err.message ? err.message : String(err) };
    }
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

    if (!res || !res.ok) {
      summary.errors += 1;
      summary.failures.push({ symbol: job.symbol, family: job.family, action, error: (res && res.error) || 'fetch failed' });
      log(`[BACKFILL] ${job.symbol}  FAILED  ${(res && res.error) || 'fetch failed'}`);
      onJobDone(job, 'failed');
      return;
    }
    if (action === 'deep') summary.deep += 1; else summary.incremental += 1;
    log(`[BACKFILL] ${job.symbol}  ok  ${elapsed}s`);
    // Derive coarser bins from the freshly-written base bin. For an incremental
    // top-up only the recent window needs re-deriving, so the action is passed
    // through — the real rollup uses it to read just the tail of the base bin.
    const rolledUp = runJobRollup(job, action);
    onJobDone(job, rolledUp ? 'ok' : 'rollup_failed');
  }

  if (parallelLanes) {
    const lanes = groupIntoLanes(o.jobs, o.concurrency);
    await Promise.all(
      lanes.map((l) => runWithConcurrency(l.jobs, l.concurrency, processJob))
    );
  } else {
    // Sequential — used by tests or when explicitly disabled.
    for (const job of o.jobs) {
      await processJob(job);
    }
  }

  summary.elapsed_s = Number(((Date.now() - start) / 1000).toFixed(1));
  log(JSON.stringify({ type: 'backfill_cycle', ...summary }));
  return summary;
}

// Run one DEEP_PLAN acquisition step for a symbol (per-symbol → bypasses the bulk gate).
async function runDeepStep(job, step, deepDays) {
  const sym = job.symbol;
  if (step.kind === 'crypto') {
    return commandCryptoDeepBackfill(['--symbol', sym, '--days', String(deepDays), '--json']);
  }
  if (step.kind === 'equity') {
    return commandEquityDeepBackfill(['--symbol', sym, '--days', String(deepDays), '--json']);
  }
  if (step.kind === 'accumulate') {
    return commandFiveMinAccumulate(['--family', job.family, '--symbol', sym, '--json']);
  }
  // kind === 'ingest': native fetch of one TF at its max depth from a pinned provider.
  return commandIngest(['--family', job.family, '--symbol', sym, '--timeframe', step.tf,
    '--history-days', String(step.days), '--provider', step.provider, '--force', '--json']);
}

// Real fetch executor. A DEEP job runs the family's full DEEP_PLAN (every TF at max
// native depth, per-symbol, provider-pinned); an INCREMENTAL job tops off only the finest
// grain (rollup then refreshes the recent coarse bars from it).
function makeRealExecutor() {
  return async (job, mode, days) => {
    if (mode === 'deep') {
      const steps = DEEP_PLAN[job.family] || [{ tf: job.baseTf, kind: 'accumulate', days: null }];
      let okAny = false;
      const errs = [];
      for (const step of steps) {
        try {
          const rc = await runDeepStep(job, step, days);
          if (rc === 0) okAny = true; else errs.push(`${step.tf}:exit ${rc}`);
        } catch (e) {
          errs.push(`${step.tf}:${e && e.message ? e.message : String(e)}`);
        }
      }
      return { ok: okAny, error: errs.length ? errs.join('; ') : undefined };
    }
    // incremental: finest-grain top-off only.
    let rc;
    if (job.family === 'crypto') {
      rc = await commandCryptoDeepBackfill(['--symbol', job.symbol, '--days', String(days), '--json']);
    } else if (job.family === 'equities') {
      rc = await commandEquityDeepBackfill(['--symbol', job.symbol, '--days', String(days), '--json']);
    } else {
      rc = await commandFiveMinAccumulate(['--family', job.family, '--symbol', job.symbol, '--days', String(days), '--json']);
    }
    return { ok: rc === 0, error: rc === 0 ? undefined : `exit ${rc}` };
  };
}

// Real rollup executor: derive every coarser TF above the job's base grain.
// For an incremental top-up, re-derive only the recent window (last incrementalDays
// + 1 day of margin, floored to a UTC-day boundary) instead of the entire deep base
// bin — this is what keeps the daemon's per-cycle rollups off the heap-blowing
// full-bin read. Deep (first-fill) jobs still re-derive the whole freshly-written bin.
function makeRealRollup(tsDir, incrementalDays = INCREMENTAL_DAYS) {
  return (job, action) => {
    const targets = rollupTargetsAboveBase(job.baseTf);
    const opts = action !== 'deep'
      ? { sinceMs: utcDayFloor(Date.now() - (incrementalDays + 1) * DAY_MS) }
      : {};
    return rollupFromBase(tsDir, job.symbol, job.baseTf, targets, opts);
  };
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
  const sequential = hasFlag(args, '--sequential'); // escape hatch for debugging
  const concurrency = numericOption(args, '--concurrency', 0); // 0 = use per-lane defaults
  const deepAll = hasFlag(args, '--deep-all'); // force full DEEP_PLAN for every live symbol

  // Suppress verbose sub-command output — daemon owns all progress reporting.
  global.suppressLogs = true;

  const { loadConfig } = require('../../../scripts/data_ops/ingest_market_data.js');
  const log = (line) => console.log(line);
  const execute = makeRealExecutor();
  const rollup = makeRealRollup(tsDir);

  let statusState = null;
  function writeStatus(patch) {
    statusState = { ...statusState, ...patch, pid: process.pid, updated_at: new Date().toISOString() };
    try { writeJson(DAEMON_STATUS_PATH, statusState); } catch (_) { /* best-effort - a stale read is caught by the PID-liveness check on the reader side */ }
  }
  // Hoisted before clearStatusOnExit so the handler can reference it via closure.
  let liveFeedHandle = null;
  function clearStatusOnExit(signal) {
    if (liveFeedHandle) try { liveFeedHandle.stop(); } catch (_) {}
    writeStatus({ status: 'stopped', stopped_signal: signal || null });
    process.exit(signal ? 130 : 0);
  }
  process.once('SIGINT', () => clearStatusOnExit('SIGINT'));
  process.once('SIGTERM', () => clearStatusOnExit('SIGTERM'));

  // Start Binance WebSocket feed for crypto symbols so 1m bars land in the
  // ts-index in real time — independent of the polling cycle interval.
  // Only launched when crypto is in the active family list and not --once.
  if (!once && families.includes('crypto')) {
    try {
      const { startBinanceLiveFeed } = require('../../../../shared/lib/providers/binance.js');
      const initConfig = await loadConfig();
      const cryptoSymbols = (initConfig.crypto && initConfig.crypto.symbols) || [];
      if (cryptoSymbols.length > 0) {
        liveFeedHandle = startBinanceLiveFeed(cryptoSymbols, {
          tsDir,
          onError: (err) => log(`[WS] ${err.message}`),
        });
        log(`[WS] live feed started for ${cryptoSymbols.length} crypto symbols`);
      }
    } catch (err) {
      log(`[WS] could not start live feed: ${err.message}`);
    }
  }

  let cycle = 0;
  let lastSummary = null;
  /* eslint-disable no-await-in-loop */
  for (;;) {
    cycle += 1;
    try {
      const pruned = await pruneApiCache();
      if (pruned.deleted > 0) {
        log(`[CACHE] pruned ${pruned.deleted} expired API responses (${(pruned.freed_bytes / 1e6).toFixed(1)} MB)`);
      }
    } catch (error) {
      log(`[CACHE] prune skipped: ${error.message}`);
    }
    const config = await loadConfig();
    let jobs = buildJobUniverse(config, families);
    if (symbolFilter) jobs = jobs.filter((j) => symbolFilter.has(j.symbol));

    const lanes = groupIntoLanes(jobs, concurrency || undefined);
    const laneStr = lanes.map(l => `${l.lane}×${l.jobs.length}(c=${l.concurrency})`).join('  ');
    log(`[BACKFILL] start: ${jobs.length} jobs — ${laneStr}`);
    if (concurrency) {
      const clamped = lanes.filter(l => l.concurrency < concurrency);
      if (clamped.length) {
        log(`[BACKFILL] note: --concurrency ${concurrency} clamped to ${clamped.map(l => `${l.lane}=${l.concurrency}`).join(' ')} (1m lanes touch multi-million-row bins)`);
      }
    }
    let completedJobs = 0;
    writeStatus({
      status: 'running', cycle, total_jobs: jobs.length, completed_jobs: 0,
      current_symbol: null, families, once, interval_secs: intervalSecs,
      started_at: new Date().toISOString(),
    });
    lastSummary = await runBackfillCycle({
      tsDir, jobs, execute, rollup, log, cycle,
      parallelLanes: !sequential,
      concurrency: concurrency || undefined,
      forceDeep: deepAll,
      onJobDone: (job, outcome) => {
        completedJobs += 1;
        writeStatus({ completed_jobs: completedJobs, current_symbol: job.symbol, last_outcome: outcome });
      },
    });

    if (once) {
      writeStatus({ status: 'idle', completed_jobs: jobs.length, current_symbol: null });
      break;
    }
    writeStatus({ status: 'sleeping', completed_jobs: jobs.length, current_symbol: null, next_run_at: new Date(Date.now() + intervalSecs * 1000).toISOString() });
    await new Promise((resolve) => setTimeout(resolve, intervalSecs * 1000));
  }
  /* eslint-enable no-await-in-loop */

  if (liveFeedHandle) try { liveFeedHandle.stop(); } catch (_) {}
  if (once) printPayload({ ok: lastSummary.errors === 0, ...lastSummary }, args);
  return lastSummary && lastSummary.errors === 0 ? 0 : 1;
}

/**
 * commandStopBackfillDaemon -- reads DAEMON_STATUS_PATH for the writer's pid and
 * sends it SIGTERM. Works regardless of whether the running daemon was started
 * from the dashboard, a separate terminal, or the Docker `backfill` service -
 * the status file is the only thing tying this command to a real process.
 *
 * Graceful-shutdown caveat (Windows): the daemon's own SIGTERM handler (above,
 * in commandBackfillDaemon) writes status:'stopped' before exiting - but only
 * on platforms where SIGTERM is a real, catchable signal (Linux/the Docker
 * `backfill` service). On native Windows, process.kill(pid, 'SIGTERM') sent
 * from a SEPARATE process is a hard kill (confirmed empirically: the target's
 * own 'SIGTERM' listener never runs) - the process dies just as reliably, but
 * the status file is left showing its last 'running'/'sleeping' snapshot
 * rather than 'stopped'. This is harmless for the dashboard's own display:
 * readDaemonStatus's PID-liveness probe (process.kill(pid, 0)) independently
 * detects the dead PID and returns null regardless of the stale status string.
 * It only matters if something inspects the raw JSON file directly expecting
 * an accurate 'stopped' marker on Windows specifically.
 */
async function commandStopBackfillDaemon(args) {
  let status;
  try {
    status = JSON.parse(fs.readFileSync(DAEMON_STATUS_PATH, 'utf8'));
  } catch (err) {
    printPayload({ ok: false, reason: 'no_status_file', error: 'No backfill-daemon status file found - nothing appears to be running.' }, args);
    return 1;
  }

  if (!status || typeof status.pid !== 'number') {
    printPayload({ ok: false, reason: 'invalid_status_file', error: 'Status file is malformed (no pid recorded).' }, args);
    return 1;
  }

  try {
    process.kill(status.pid, 0); // liveness probe only - sends no real signal
  } catch (err) {
    printPayload({ ok: false, reason: 'not_running', pid: status.pid, error: `PID ${status.pid} from the status file is not running (already stopped or stale).` }, args);
    return 1;
  }

  try {
    process.kill(status.pid, 'SIGTERM');
  } catch (err) {
    printPayload({ ok: false, reason: 'kill_failed', pid: status.pid, error: err && err.message ? err.message : String(err) }, args);
    return 1;
  }

  // Write the 'stopped' marker ourselves rather than relying on the target's own
  // SIGTERM handler to do it - on Windows that handler never runs (see the
  // caveat above), so without this the file would keep showing stale
  // 'running'/'sleeping' data until overwritten by a future run. Harmless if
  // the target IS gracefully shutting down concurrently: both writers use the
  // same atomic writeJson, so this is at worst a last-write-wins race on a
  // progress display, nothing safety-critical.
  try {
    writeJson(DAEMON_STATUS_PATH, { ...status, status: 'stopped', stopped_by: 'stop-backfill-daemon', updated_at: new Date().toISOString() });
  } catch (_) { /* best-effort - the command's own success already reflects the real kill */ }

  printPayload({
    ok: true, pid: status.pid,
    stopped_cycle: status.cycle, stopped_completed_jobs: status.completed_jobs, stopped_total_jobs: status.total_jobs,
  }, args);
  return 0;
}

module.exports = {
  commandBackfillDaemon,
  commandStopBackfillDaemon,
  runBackfillCycle,
  buildJobUniverse,
  groupIntoLanes,
  decideAction,
  makeRealExecutor,
  makeRealRollup,
  DEEP_PLAN,
  ALL_FAMILIES,
  DEFAULT_DEEP_DAYS,
  INCREMENTAL_DAYS,
  LANE_CONCURRENCY,
  LANE_MAX_CONCURRENCY,
  utcDayFloor,
  FAMILY_LANE,
  DAEMON_STATUS_PATH,
};
