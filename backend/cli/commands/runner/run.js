'use strict';

const { startLoop, stopLoop, getStatus, installShutdownHandlers } = require('../../../../shared/lib/runtime/run_loop.js');
const { featureGate, loadRuntimeSettings } = require('../../../../shared/lib/settings/runtime');
const { resolveBotInterval } = require('../../../../shared/lib/settings/interval_policy');
const utils = require('../../lib/utils.js');
const { hasFlag, numericOption, optionValue, printPayload } = utils;
const { promptSelect, promptText, promptConfirm } = require('../../tui/index.js');

async function runBackfillLoop(intervalMin, opts = {}) {
  const { commandMassBackfill } = require('../data/data.js');
  const effectiveIntervalMin = Math.max(1, Number(intervalMin) || 1440);
  const intervalMs = effectiveIntervalMin * 60 * 1000;

  if (opts.once) {
    console.log('[run backfill] Running one-shot backfill...');
    await commandMassBackfill(['--days', '7', '--concurrency', '3']);
    return 0;
  }

  installShutdownHandlers();
  console.log(`[run backfill] Starting loop every ${effectiveIntervalMin} min. Ctrl+C to stop.`);

  startLoop('backfill', async ({ iteration }) => {
    console.log(`[backfill] #${iteration} — ${new Date().toISOString()}`);
    await commandMassBackfill(['--days', '7', '--concurrency', '3']);
  }, intervalMs, { continueOnError: true });

  // Block indefinitely; shutdown handlers handle exit
  await new Promise(() => {});
  return 0;
}

function resolvePaperBotInterval(intervalMin, settings) {
  return resolveBotInterval({ requestedMinutes: intervalMin, settings });
}

function buildPaperRunArgs(options = {}) {
  const args = ['paper-run', '--strategy', options.strategy || 'low_prob_dip', '--json'];
  const mappings = [
    ['--sizing-mode', options.sizingMode],
    ['--size', options.size],
    ['--stop-price', options.stopPrice],
    ['--max-position-usd', options.maxPositionUsd],
  ];
  for (const [flag, value] of mappings) {
    if (value !== undefined && value !== null && value !== '') args.push(flag, String(value));
  }
  return args;
}

function buildAlpacaPaperStrategyArgs(options = {}) {
  const args = [
    '--once',
    '--paper-provider',
    '--passes', '0',
    '--min-trust-score', String(options.minTrustScore || 70),
  ];
  if (options.paperMaxNotional) {
    args.push('--paper-max-notional', String(options.paperMaxNotional));
  }
  if (options.paperDailyMaxNotional) {
    args.push('--paper-daily-max-notional', String(options.paperDailyMaxNotional));
  }
  if (options.allowedTimeframes) {
    args.push('--allowed-timeframes', String(options.allowedTimeframes));
  }
  return args;
}

async function runPaperBotLoop(intervalMin, opts = {}) {
  const gate = featureGate('bot_autopilot', { settings: opts.settings, surface: 'Paper bot loop' });
  if (!gate.ok) {
    printPayload({ ok: false, type: 'feature_gate', feature_flag: gate.flag, reason: gate.reason, hint: gate.hint }, opts.args || []);
    return 1;
  }
  const intervalPolicy = resolvePaperBotInterval(intervalMin, opts.settings);
  const effectiveIntervalMin = intervalPolicy.effective_interval_min;
  const { commandPolymarket } = require('../trade/trade.js');
  const { checkAndCloseResolvedPositions } = require('../../../gateway/src/polymarket');
  const intervalMs = effectiveIntervalMin * 60 * 1000;
  const strategy = opts.strategy || 'low_prob_dip';
  const paperArgs = buildPaperRunArgs({ ...opts, strategy });

  if (opts.once) {
    console.log('[run bot paper] Running one-shot paper cycle...');
    const closed = await checkAndCloseResolvedPositions();
    if (closed.closed.length > 0) console.log(`[paper_bot] Auto-closed ${closed.closed.length} resolved position(s)`);
    await commandPolymarket(paperArgs);
    return 0;
  }

  installShutdownHandlers();
  console.log(`[run bot paper] Starting Polymarket paper bot every ${effectiveIntervalMin} min (global=${intervalPolicy.global_minimum_min} personal=${intervalPolicy.personal_interval_min} admin=${intervalPolicy.admin_minimum_min}). Ctrl+C to stop.`);

  const start = opts.startLoop || startLoop;
  start('paper_bot', async ({ iteration }) => {
    console.log(`[paper_bot] #${iteration} — ${new Date().toISOString()}`);
    const closed = await checkAndCloseResolvedPositions();
    if (closed.closed.length > 0) console.log(`[paper_bot] Auto-closed ${closed.closed.length} resolved position(s)`);
    await commandPolymarket(paperArgs);
  }, intervalMs, { continueOnError: true });

  if (opts.waitForShutdown !== false) await new Promise(() => {});
  return 0;
}

async function runAlpacaPaperLoop(intervalMin, opts = {}) {
  const runStrategies = opts.runAutomatedStrategies
    || require('../strategy/strategy.js').runAutomatedStrategies;
  const settings = opts.settings || loadRuntimeSettings();

  const gate = featureGate('bot_autopilot', {
    settings,
    surface: 'Alpaca Paper bot loop'
  });
  if (!gate.ok) {
    printPayload({
      ok: false,
      type: 'feature_gate',
      feature_flag: gate.flag,
      reason: gate.reason,
      hint: gate.hint
    }, opts.args || []);
    return 1;
  }

  const effectiveIntervalMin = Math.max(1, Number(intervalMin) || 15);
  const intervalMs = effectiveIntervalMin * 60 * 1000;
  const strategyArgs = buildAlpacaPaperStrategyArgs(opts);

  if (opts.once) {
    console.log('[run bot alpaca-paper] Running one-shot automation pass...');
    await runStrategies(strategyArgs);
    return 0;
  }

  installShutdownHandlers();
  console.log(`[run bot alpaca-paper] Starting Alpaca Paper automation loop every ${effectiveIntervalMin} min. Ctrl+C to stop.`);

  const start = opts.startLoop || startLoop;
  start('alpaca_paper_bot', async ({ iteration }) => {
    console.log(`[alpaca_paper_bot] #${iteration} — ${new Date().toISOString()}`);
    await runStrategies(strategyArgs);
  }, intervalMs, { continueOnError: true });

  if (opts.waitForShutdown !== false) await new Promise(() => {});
  return 0;
}

async function commandRunBot(args) {
  const botSub = args[0] || 'paper';
  const botArgs = args.slice(1);

  if (botSub === 'alpaca-paper') {
    const settings = loadRuntimeSettings();
    const interval = numericOption(botArgs, '--interval', 1);
    const once = hasFlag(botArgs, '--once');
    const minTrustScore = numericOption(botArgs, '--min-trust-score', 70);
    const paperMaxNotional = botArgs.includes('--paper-max-notional')
      ? numericOption(botArgs, '--paper-max-notional', 25)
      : null;

    return runAlpacaPaperLoop(interval, {
      once,
      minTrustScore,
      paperMaxNotional,
      paperDailyMaxNotional: botArgs.includes('--paper-daily-max-notional')
        ? numericOption(botArgs, '--paper-daily-max-notional', 1000)
        : null,
      allowedTimeframes: optionValue(botArgs, '--allowed-timeframes', null),
      args: botArgs,
      settings,
    });
  }

  if (botSub === 'paper') {
    const settings = loadRuntimeSettings();
    const requestedInterval = botArgs.includes('--interval')
      ? numericOption(botArgs, '--interval', null)
      : null;
    const once = hasFlag(botArgs, '--once');
    const strategy = optionValue(botArgs, '--strategy', 'low_prob_dip');

    return runPaperBotLoop(requestedInterval, {
      once,
      strategy,
      settings,
      args: botArgs,
      sizingMode: optionValue(botArgs, '--sizing-mode', null),
      size: optionValue(botArgs, '--size', null),
      stopPrice: optionValue(botArgs, '--stop-price', null),
      maxPositionUsd: optionValue(botArgs, '--max-position-usd', null),
    });
  }

  if (botSub === 'live') {
    console.error('[run bot live] Not implemented here — use: sovereign bot run --live');
    return 1;
  }

  console.error(`[run bot] Unknown subcommand '${botSub}'. Use: paper | alpaca-paper | live`);
  return 1;
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

  if (sub === 'bot') return commandRunBot(rest);

  if (sub === 'all') {
    const settings = loadRuntimeSettings();
    const botGate = featureGate('bot_autopilot', { settings, surface: 'Run all paper bot loop' });

    const requestedBotInterval = rest.includes('--interval-bot') ? numericOption(rest, '--interval-bot', null) : null;
    const intervalBotMin = resolveBotInterval({ requestedMinutes: requestedBotInterval, settings }).effective_interval_min;
    // Cadence comes from settings (user-tunable via `settings params --backfill-interval`);
    // an explicit --interval-backfill flag overrides and also forces the loop on.
    const explicitBackfill = rest.includes('--interval-backfill');
    const intervalBackfillMin = numericOption(rest, '--interval-backfill', settings.trading.backfill_interval_min || 1440);
    const autoBackfill = settings.feature_flags.auto_backfill === true || explicitBackfill;
    const once = hasFlag(rest, '--once');

    const { commandPolymarket } = require('../trade/trade.js');
    const { commandMassBackfill } = require('../data/data.js');

    installShutdownHandlers();
    console.log(`[run all] ${botGate.ok ? `paper_bot every ${intervalBotMin} min` : 'paper_bot disabled'}` + (autoBackfill ? `, backfill every ${intervalBackfillMin} min` : ', backfill disabled'));

    if (botGate.ok) {
      const paperArgs = buildPaperRunArgs({
        strategy: optionValue(rest, '--strategy', 'low_prob_dip'),
        sizingMode: optionValue(rest, '--sizing-mode', null),
        size: optionValue(rest, '--size', null),
        stopPrice: optionValue(rest, '--stop-price', null),
        maxPositionUsd: optionValue(rest, '--max-position-usd', null),
      });
      startLoop('paper_bot', async ({ iteration }) => {
        console.log(`[paper_bot] #${iteration} — ${new Date().toISOString()}`);
        await commandPolymarket(paperArgs);
      }, intervalBotMin * 60 * 1000, { continueOnError: true });
    } else {
      console.log(`[run all] ${botGate.reason}. ${botGate.hint}`);
    }

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

/**
 * TUI entry point for the "Persistent Runners" menu — presents a flat
 * Loop Status / Start Paper Bot / Start Auto-Backfill / Start All picker,
 * prompting for the same parameters the old flag-driven menu items exposed,
 * then delegates to commandRun. Direct CLI calls pass through untouched.
 */
async function commandRunnerMenu(args) {
  if (args.length > 0) return commandRun(args);

  global.suppressLogs = true;
  const action = await promptSelect('Persistent Runners:', [
    { label: 'Loop Status (all active runners)', value: 'status' },
    { label: 'Start Paper Bot (Polymarket)', value: 'paper' },
    { label: 'Start Auto-Backfill Loop', value: 'backfill' },
    { label: 'Start All Runners (bot + backfill)', value: 'all' },
  ]);
  global.suppressLogs = false;
  if (!action) return 0;

  if (action === 'status') return commandRun(['status']);

  if (action === 'paper') {
    global.suppressLogs = true;
    const interval = await promptText('Interval (minutes):', '1');
    const strategy = await promptSelect('Strategy:', [
      { label: 'low_prob_dip', value: 'low_prob_dip' },
      { label: 'mean_revert', value: 'mean_revert' },
    ]);
    const once = await promptConfirm('Run once only?');
    global.suppressLogs = false;
    const runArgs = ['bot', 'paper', '--interval', interval || '1', '--strategy', strategy || 'low_prob_dip'];
    if (once) runArgs.push('--once');
    return commandRun(runArgs);
  }

  if (action === 'backfill') {
    global.suppressLogs = true;
    const interval = await promptText('Interval (minutes):', '1440');
    const once = await promptConfirm('Run once only?');
    global.suppressLogs = false;
    const runArgs = ['backfill', '--interval', interval || '1440'];
    if (once) runArgs.push('--once');
    return commandRun(runArgs);
  }

  if (action === 'all') {
    global.suppressLogs = true;
    const intervalBot = await promptText('Bot interval (minutes):', '1');
    const intervalBackfill = await promptText('Backfill interval (minutes):', '1440');
    global.suppressLogs = false;
    return commandRun(['all', '--interval-bot', intervalBot || '1', '--interval-backfill', intervalBackfill || '1440']);
  }

  return 0;
}

module.exports = { buildPaperRunArgs, commandRun, commandRunnerMenu, resolvePaperBotInterval, runAlpacaPaperLoop, runPaperBotLoop };
