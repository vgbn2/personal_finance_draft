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

const {
  optionValue, hasFlag, numericOption, printPayload,
} = require('../../lib/utils.js');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  FAMILY_BASE_TF, rollupTargetsAboveBase, rollupFromBase, DEFAULT_TS_DIR,
  commandCryptoDeepBackfill, commandEquityDeepBackfill, commandFiveMinAccumulate, commandIngest,
  buildFiveMinAccumulatePlan, buildEquityDeepBackfillPlan,
} = require('./data.js');
const { isFresh } = require('../../../../shared/lib/market/coverage.js');

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

// Poll starts are globally paced in addition to the per-provider concurrency caps.
// This prevents three lanes from all opening network/file/merge work at the same
// instant on a small host. CLI defaults are intentionally conservative; tests may
// pass zero or inject a clock/sleep implementation.
const DEFAULT_POLL_GAP_MS = 500;
const DEFAULT_WARMUP_JOBS = 4;
const DEFAULT_WARMUP_GAP_MS = 1500;
const DEFAULT_JITTER_MS = 125;
const DEFAULT_HIGH_LOAD_RATIO = 1.25;
const DEFAULT_HIGH_MEMORY_RATIO = 0.8;

const DAY_MS = 86400000;
const DAEMON_STATUS_PATH = path.resolve(__dirname, '../../../../storage/data/cache/backfill_daemon_status.json');

function writeDaemonStatus(status) {
  fs.mkdirSync(path.dirname(DAEMON_STATUS_PATH), { recursive: true });
  const tempPath = `${DAEMON_STATUS_PATH}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(status, null, 2)}\n`);
  fs.renameSync(tempPath, DAEMON_STATUS_PATH);
}

function stopResult(args, payload) {
  printPayload(payload, args);
  return payload.ok ? 0 : 1;
}

async function commandStopBackfillDaemon(args) {
  let status;
  try {
    status = JSON.parse(fs.readFileSync(DAEMON_STATUS_PATH, 'utf8'));
  } catch (error) {
    return stopResult(args, { ok: false, error: 'Backfill daemon status file is missing or unreadable.' });
  }

  const pid = Number(status.pid);
  if (!Number.isInteger(pid) || pid <= 0) {
    return stopResult(args, { ok: false, error: 'Backfill daemon status does not contain a valid PID.' });
  }
  try {
    process.kill(pid, 0);
  } catch (error) {
    return stopResult(args, { ok: false, error: `Backfill daemon PID ${pid} is not running.` });
  }

  try {
    process.kill(pid, 'SIGTERM');
  } catch (error) {
    return stopResult(args, { ok: false, error: `Could not stop backfill daemon PID ${pid}: ${error.message}` });
  }
  writeDaemonStatus({
    ...status,
    status: 'stopped',
    stopped_at: new Date().toISOString(),
    stopped_by: 'stop-backfill-daemon',
    updated_at: new Date().toISOString(),
  });
  return stopResult(args, { ok: true, pid, status: 'stopped' });
}
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

function defaultResourceProbe() {
  const cpus = Math.max(1, os.cpus().length || 1);
  const load = os.loadavg()[0] || 0;
  const memory = process.memoryUsage();
  return {
    load_ratio: load / cpus,
    memory_ratio: memory.rss / Math.max(1, os.totalmem()),
  };
}

function sleepMs(ms) {
  if (!ms) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * createPollPacer -- one global token schedule shared by every provider lane.
 * The schedule is deliberately start-based: a slow request does not hold the
 * token, while simultaneous new requests cannot stampede the machine.
 */
function createPollPacer(options = {}) {
  const gapMs = Math.max(0, Number(options.gapMs ?? DEFAULT_POLL_GAP_MS));
  const warmupJobs = Math.max(0, Number(options.warmupJobs ?? DEFAULT_WARMUP_JOBS));
  const warmupGapMs = Math.max(gapMs, Number(options.warmupGapMs ?? DEFAULT_WARMUP_GAP_MS));
  const jitterMs = Math.max(0, Number(options.jitterMs ?? DEFAULT_JITTER_MS));
  const highLoadRatio = Math.max(0, Number(options.highLoadRatio ?? DEFAULT_HIGH_LOAD_RATIO));
  const highMemoryRatio = Math.max(0, Number(options.highMemoryRatio ?? DEFAULT_HIGH_MEMORY_RATIO));
  const adaptiveMultiplier = Math.max(1, Number(options.adaptiveMultiplier ?? 2));
  const now = options.now || (() => Date.now());
  const sleep = options.sleep || sleepMs;
  const random = options.random || Math.random;
  const probe = options.resourceProbe || defaultResourceProbe;
  let nextStartAt = now();
  let started = 0;
  let chain = Promise.resolve();

  async function acquire(lane) {
    let result;
    // Serialise token allocation without serialising the actual provider request.
    const turn = chain.then(async () => {
      const resource = probe() || {};
      const pressure = Number(resource.load_ratio) > highLoadRatio || Number(resource.memory_ratio) > highMemoryRatio;
      const baseGap = started < warmupJobs ? warmupGapMs : gapMs;
      const gap = pressure ? baseGap * adaptiveMultiplier : baseGap;
      const jitter = jitterMs ? Math.floor(random() * (jitterMs + 1)) : 0;
      const target = Math.max(now(), nextStartAt);
      const wait = target - now();
      if (wait > 0) await sleep(wait);
      const grantedAt = now();
      nextStartAt = grantedAt + gap + jitter;
      started += 1;
      result = { lane, started, wait_ms: Math.max(0, wait), gap_ms: gap, pressured: pressure };
    });
    chain = turn.catch(() => {});
    await turn;
    return result;
  }

  return { acquire, getState: () => ({ started, next_start_at: nextStartAt }) };
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
  const pollPacer = o.pollPacer || createPollPacer({
    gapMs: o.pollGapMs,
    warmupJobs: o.warmupJobs,
    warmupGapMs: o.warmupGapMs,
    jitterMs: o.jitterMs,
    resourceProbe: o.resourceProbe,
  });

  const summary = { cycle, scanned: 0, deep: 0, incremental: 0, skipped: 0, rolled_up: 0, rollup_errors: 0, errors: 0, failures: [] };
  const start = Date.now();

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
      // A fresh base bin can coexist with missing/stale derived bins after an interrupted
      // rollup. Repair them locally without issuing another provider request.
      try {
        const roll = o.rollup(job, 'refresh');
        if (!roll || !roll.ok) {
          const error = (roll && roll.error) || 'rollup failed';
          summary.errors += 1;
          summary.rollup_errors += 1;
          summary.failures.push({ symbol: job.symbol, family: job.family, action, stage: 'rollup', error });
          log(`[BACKFILL] ${job.symbol}  rollup failed: ${error}`);
          if (o.onJobDone) o.onJobDone(job, 'rollup_failed');
          return;
        }
        summary.rolled_up += 1;
        const n = Object.keys(roll.derived || {}).length;
        if (n > 0) log(`[BACKFILL] ${job.symbol}  +${n}TF refresh`);
      } catch (error) {
        summary.errors += 1;
        summary.rollup_errors += 1;
        summary.failures.push({ symbol: job.symbol, family: job.family, action, stage: 'rollup', error: error.message });
        log(`[BACKFILL] ${job.symbol}  rollup failed: ${error.message}`);
        if (o.onJobDone) o.onJobDone(job, 'rollup_failed');
        return;
      }
      if (gate.reason === 'not_found') log(`[BACKFILL] ${job.symbol}  ✗ no data on provider (skip 7d)`);
      if (o.onJobDone) o.onJobDone(job, 'skipped');
      return;
    }

    const days = action === 'deep' ? (deepDays[job.family] || 59) : incrementalDays;
    log(`[BACKFILL] ${job.symbol}  → ${action.toUpperCase()} ${days}d`);

    const t0 = Date.now();
    let res;
    try {
      const pacing = await pollPacer.acquire(FAMILY_LANE[job.family] || 'yahoo');
      if (o.onPollStart) o.onPollStart(job, pacing);
      res = await o.execute(job, action, days);
    } catch (err) {
      res = { ok: false, error: err && err.message ? err.message : String(err) };
    }
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

    if (!res || !res.ok) {
      summary.errors += 1;
      summary.failures.push({ symbol: job.symbol, family: job.family, action, error: (res && res.error) || 'fetch failed' });
      log(`[BACKFILL] ${job.symbol}  FAILED  ${(res && res.error) || 'fetch failed'}`);
      if (o.onJobDone) o.onJobDone(job, 'failed');
      return;
    }
    if (action === 'deep') summary.deep += 1; else summary.incremental += 1;
    log(`[BACKFILL] ${job.symbol}  ok  ${elapsed}s`);

    // Derive coarser bins from the freshly-written base bin. For an incremental
    // top-up only the recent window needs re-deriving, so the action is passed
    // through — the real rollup uses it to read just the tail of the base bin.
    try {
      const roll = o.rollup(job, action);
      if (roll && roll.ok) {
        summary.rolled_up += 1;
        const n = Object.keys(roll.derived || {}).length;
        if (n > 0) log(`[BACKFILL] ${job.symbol}  +${n}TF`);
      } else {
        const error = (roll && roll.error) || 'rollup failed';
        summary.errors += 1;
        summary.rollup_errors += 1;
        summary.failures.push({ symbol: job.symbol, family: job.family, action, stage: 'rollup', error });
        log(`[BACKFILL] ${job.symbol}  rollup failed: ${error}`);
        if (o.onJobDone) o.onJobDone(job, 'rollup_failed');
        return;
      }
    } catch (err) {
      summary.errors += 1;
      summary.rollup_errors += 1;
      summary.failures.push({ symbol: job.symbol, family: job.family, action, stage: 'rollup', error: err.message });
      log(`[BACKFILL] ${job.symbol}  rollup failed: ${err.message}`);
      if (o.onJobDone) o.onJobDone(job, 'rollup_failed');
      return;
    }
    if (o.onJobDone) o.onJobDone(job, 'ok');
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
  summary.polls_started = pollPacer.getState().started;
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
    const opts = action === 'deep'
      ? {}
      : { sinceMs: utcDayFloor(Date.now() - (incrementalDays + 1) * DAY_MS) };
    return rollupFromBase(tsDir, job.symbol, job.baseTf, targets, opts);
  };
}

/**
 * commandBackfillDaemon -- CLI entrypoint. Loops every --interval-secs (or one pass
 * with --once), wiring the real ingest commands as executors.
 */
async function commandBackfillDaemon(args) {
  // An explicitly selected machine profile is a security/ownership contract.
  // Keep unprofiled local development backward compatible, but never allow a
  // declared developer/client host to become a canonical writer by CLI accident.
  if (process.env.SOVEREIGN_DEPLOYMENT_PROFILE) {
    const { validateDeploymentProfile } = require('../../../../shared/lib/settings/deployment_profile.js');
    const profile = validateDeploymentProfile(process.env.SOVEREIGN_DEPLOYMENT_PROFILE, { requireWriter: true });
    if (!profile.ok) {
      console.error(`[BACKFILL] Refusing writer start: ${profile.reason}`);
      return 1;
    }
  }
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
  const pollGapMs = numericOption(args, '--poll-gap-ms', DEFAULT_POLL_GAP_MS);
  const warmupJobs = numericOption(args, '--warmup-jobs', DEFAULT_WARMUP_JOBS);
  const warmupGapMs = numericOption(args, '--warmup-gap-ms', DEFAULT_WARMUP_GAP_MS);
  const jitterMs = numericOption(args, '--poll-jitter-ms', DEFAULT_JITTER_MS);

  // Suppress verbose sub-command output — daemon owns all progress reporting.
  global.suppressLogs = true;

  const { loadConfig } = require('../../../scripts/data_ops/ingest_market_data.js');
  const log = (line) => console.log(line);
  const execute = makeRealExecutor();
  const rollup = makeRealRollup(tsDir);

  let cycle = 0;
  let lastSummary = null;
  let stopping = false;
  const stopDaemon = () => {
    if (stopping) return;
    stopping = true;
    writeDaemonStatus({ status: 'stopped', pid: process.pid, cycle, stopped_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    process.exit(0);
  };
  process.once('SIGINT', stopDaemon);
  process.once('SIGTERM', stopDaemon);
  /* eslint-disable no-await-in-loop */
  for (;;) {
    cycle += 1;
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
    const status = {
      status: 'running', pid: process.pid, cycle, total_jobs: jobs.length, completed_jobs: 0,
      current_symbol: null, families, once, started_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    writeDaemonStatus(status);
    lastSummary = await runBackfillCycle({
      tsDir, jobs, execute, rollup, log, cycle,
      parallelLanes: !sequential,
      concurrency: concurrency || undefined,
      forceDeep: deepAll,
      pollGapMs, warmupJobs, warmupGapMs, jitterMs,
      onPollStart: (job, pacing) => {
        status.current_symbol = job.symbol;
        status.last_poll_start = new Date().toISOString();
        status.last_poll_lane = pacing.lane;
        status.last_poll_wait_ms = pacing.wait_ms;
        status.polls_started = pacing.started;
        status.updated_at = new Date().toISOString();
        writeDaemonStatus(status);
      },
      onJobDone: (job, outcome) => {
        status.completed_jobs += 1;
        status.current_symbol = job.symbol;
        status.last_outcome = outcome;
        status.updated_at = new Date().toISOString();
        writeDaemonStatus(status);
      },
    });

    if (once) {
      writeDaemonStatus({
        ...status,
        status: 'idle',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      break;
    }
    writeDaemonStatus({ ...status, status: 'sleeping', next_run_at: new Date(Date.now() + intervalSecs * 1000).toISOString(), updated_at: new Date().toISOString() });
    await new Promise((resolve) => setTimeout(resolve, intervalSecs * 1000));
  }
  /* eslint-enable no-await-in-loop */

  if (once) printPayload({ ok: lastSummary.errors === 0, ...lastSummary }, args);
  return lastSummary && lastSummary.errors === 0 ? 0 : 1;
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
  createPollPacer,
  utcDayFloor,
  FAMILY_LANE,
  DAEMON_STATUS_PATH,
};
