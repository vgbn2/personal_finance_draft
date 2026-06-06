'use strict';

const { startLoop, stopLoop, getStatus, installShutdownHandlers } = require('../../../shared/lib/run_loop.js');
const utils = require('../lib/utils.js');
const { hasFlag, numericOption, optionValue, printPayload } = utils;

async function runBackfillLoop(intervalMin, opts = {}) {
  const { commandMassBackfill } = require('./data/data.js');
  const intervalMs = intervalMin * 60 * 1000;

  if (opts.once) {
    console.log('[run backfill] Running one-shot backfill...');
    await commandMassBackfill(['--days', '7', '--concurrency', '3']);
    return 0;
  }

  installShutdownHandlers();
  console.log(`[run backfill] Starting loop every ${intervalMin} min. Ctrl+C to stop.`);

  startLoop('backfill', async ({ iteration }) => {
    console.log(`[backfill] #${iteration} — ${new Date().toISOString()}`);
    await commandMassBackfill(['--days', '7', '--concurrency', '3']);
  }, intervalMs, { continueOnError: true });

  // Block indefinitely; shutdown handlers handle exit
  await new Promise(() => {});
  return 0;
}

async function runPaperBotLoop(intervalMin, opts = {}) {
  const { commandPolymarket } = require('./trade/trade.js');
  const { checkAndCloseResolvedPositions } = require('../../gateway/src/polymarket_paper.js');
  const intervalMs = intervalMin * 60 * 1000;
  const strategy = opts.strategy || 'low_prob_dip';
  const paperArgs = ['paper-run', '--strategy', strategy, '--json'];

  if (opts.once) {
    console.log('[run bot paper] Running one-shot paper cycle...');
    const closed = await checkAndCloseResolvedPositions();
    if (closed.closed.length > 0) console.log(`[paper_bot] Auto-closed ${closed.closed.length} resolved position(s)`);
    await commandPolymarket(paperArgs);
    return 0;
  }

  installShutdownHandlers();
  console.log(`[run bot paper] Starting Polymarket paper bot every ${intervalMin} min. Ctrl+C to stop.`);

  startLoop('paper_bot', async ({ iteration }) => {
    console.log(`[paper_bot] #${iteration} — ${new Date().toISOString()}`);
    const closed = await checkAndCloseResolvedPositions();
    if (closed.closed.length > 0) console.log(`[paper_bot] Auto-closed ${closed.closed.length} resolved position(s)`);
    await commandPolymarket(paperArgs);
  }, intervalMs, { continueOnError: true });

  await new Promise(() => {});
  return 0;
}

async function commandRun(args) {
  const sub = args[0] || 'status';
  const rest = args.slice(1);

  if (sub === 'status' || sub === '--status') {
    const loops = getStatus();
    printPayload({ ok: true, loops }, args);
    return 0;
  }

  if (sub === 'stop') {
    const name = rest[0];
    if (!name) {
      console.error('[run stop] Usage: sovereign run stop <name>');
      return 1;
    }
    const stopped = stopLoop(name);
    printPayload({ ok: stopped, name, message: stopped ? `'${name}' stopped` : `'${name}' not running` }, args);
    return stopped ? 0 : 1;
  }

  if (sub === 'backfill') {
    const intervalMin = numericOption(rest, '--interval', 1440);
    const once       = hasFlag(rest, '--once');
    return runBackfillLoop(intervalMin, { once });
  }

  if (sub === 'bot') {
    const botSub  = rest[0] || 'paper';
    const botRest = rest.slice(1);

    if (botSub === 'paper') {
      const intervalMin = numericOption(botRest, '--interval', 30);
      const once        = hasFlag(botRest, '--once');
      const strategy    = optionValue(botRest, '--strategy', 'low_prob_dip');
      return runPaperBotLoop(intervalMin, { once, strategy });
    }

    if (botSub === 'live') {
      console.error('[run bot live] Not implemented here — use: sovereign bot run --live');
      return 1;
    }

    console.error(`[run bot] Unknown subcommand '${botSub}'. Use: paper | live`);
    return 1;
  }

  if (sub === 'all') {
    const { loadSettings } = require('./settings/settings.js');
    const settings = loadSettings();

    const intervalBotMin = numericOption(rest, '--interval-bot', 30);
    // Cadence comes from settings (user-tunable via `settings params --backfill-interval`);
    // an explicit --interval-backfill flag overrides and also forces the loop on.
    const explicitBackfill = rest.includes('--interval-backfill');
    const intervalBackfillMin = numericOption(rest, '--interval-backfill', settings.trading.backfill_interval_min || 1440);
    const autoBackfill = settings.feature_flags.auto_backfill === true || explicitBackfill;
    const once = hasFlag(rest, '--once');

    const { commandPolymarket } = require('./trade/trade.js');
    const { commandMassBackfill } = require('./data/data.js');

    installShutdownHandlers();
    console.log(`[run all] paper_bot every ${intervalBotMin} min` + (autoBackfill ? `, backfill every ${intervalBackfillMin} min` : ', backfill disabled'));

    startLoop('paper_bot', async ({ iteration }) => {
      console.log(`[paper_bot] #${iteration} — ${new Date().toISOString()}`);
      await commandPolymarket(['paper-run', '--strategy', 'low_prob_dip', '--json']);
    }, intervalBotMin * 60 * 1000, { continueOnError: true });

    if (autoBackfill) {
      // Forward-gap only: a 7-day window keeps each tick light (the ingest layer
      // fetches only the gap from latest-cached forward), so the timer never pulls
      // full history. Disabled by default — toggle via the auto_backfill flag.
      startLoop('backfill', async ({ iteration }) => {
        console.log(`[backfill] #${iteration} — ${new Date().toISOString()}`);
        await commandMassBackfill(['--days', '7', '--concurrency', '3']);
      }, intervalBackfillMin * 60 * 1000, { continueOnError: true });
    } else {
      console.log('[run all] auto_backfill is off — enable with: sovereign settings flags --flag auto_backfill --value true');
    }

    if (once) {
      // Let first tick fire then exit
      await new Promise((resolve) => setTimeout(resolve, 3000));
      stopLoop('paper_bot');
      stopLoop('backfill');
      return 0;
    }

    await new Promise(() => {});
    return 0;
  }

  console.error(`[run] Unknown subcommand '${sub}'. Use: status | bot paper | bot live | backfill | all`);
  return 1;
}

module.exports = { commandRun };
