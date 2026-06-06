'use strict';
const fs = require('node:fs');
const path = require('node:path');
const A = require('../../../../shared/lib/ansi');
const { DEFAULT_USER_SETTINGS } = require('../../../../shared/lib/paths');
const { writeJson } = require('../../../../shared/lib/market_validation');
const utils = require('../../lib/utils');
const { printPayload, safeReadJson } = utils;

function paint(code, text) { return A.c(code, text); }

const VALID_TIMEZONES = new Set([
  'UTC', 'America/New_York', 'America/Chicago', 'America/Los_Angeles',
  'Europe/London', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Singapore',
  'Asia/Ho_Chi_Minh', 'Australia/Sydney',
]);

const VALID_LAYOUTS = new Set(['default', 'compact', 'research']);

const VALID_FLAGS = new Set([
  'bot_autopilot', 'polymarket', 'onchain_data', 'multi_agent_research', 'auto_rebalance',
  'ai_agent_trading', 'auto_backfill',
]);

const DEFAULTS = {
  timezone: 'UTC',
  layout: 'default',
  trading: {
    position_size: 100,
    stop_loss: 0.05,
    take_profit: 0.10,
    min_edge: 0.05,
    max_positions: 10,
    polling_interval: 60,
    backfill_interval_min: 1440,
  },
  feature_flags: {
    bot_autopilot: false,
    polymarket: false,
    onchain_data: false,
    multi_agent_research: false,
    auto_rebalance: false,
    ai_agent_trading: false,
    auto_backfill: false,
  },
  alerts: { email: true, push: false },
};

function resolveSettingsPath(override) {
  return override || process.env.SOVEREIGN_USER_SETTINGS_PATH || DEFAULT_USER_SETTINGS;
}

function loadSettings(settingsPath) {
  const stored = safeReadJson(resolveSettingsPath(settingsPath));
  if (!stored || typeof stored !== 'object') return { ...DEFAULTS, trading: { ...DEFAULTS.trading }, feature_flags: { ...DEFAULTS.feature_flags }, alerts: { ...DEFAULTS.alerts } };
  return {
    timezone: stored.timezone || DEFAULTS.timezone,
    layout: stored.layout || DEFAULTS.layout,
    trading: { ...DEFAULTS.trading, ...(stored.trading || {}) },
    feature_flags: { ...DEFAULTS.feature_flags, ...(stored.feature_flags || {}) },
    alerts: { ...DEFAULTS.alerts, ...(stored.alerts || {}) },
  };
}

function persistSettings(settings, settingsPath) {
  const target = resolveSettingsPath(settingsPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  writeJson(target, settings);
}

function renderHuman(settings) {
  const sep = paint(A.DIM, '─'.repeat(50));
  console.log(`\n${paint(A.B_CYAN, 'SOVEREIGN')} ${A.muted('— User Settings')}\n${sep}`);
  console.log(`  ${paint(A.BOLD, 'Timezone')}          ${settings.timezone}`);
  console.log(`  ${paint(A.BOLD, 'Layout')}            ${settings.layout}`);
  console.log(`\n  ${paint(A.BOLD, 'Trading Params')}`);
  const t = settings.trading;
  console.log(`    position_size    ${t.position_size} USDC`);
  console.log(`    stop_loss        ${(t.stop_loss * 100).toFixed(1)}%`);
  console.log(`    take_profit      ${(t.take_profit * 100).toFixed(1)}%`);
  console.log(`    min_edge         ${(t.min_edge * 100).toFixed(1)}%`);
  console.log(`    max_positions    ${t.max_positions}`);
  console.log(`    polling_interval ${t.polling_interval}s`);
  console.log(`    backfill_interval ${t.backfill_interval_min}min ${A.muted('(used when auto_backfill flag is on)')}`);
  console.log(`\n  ${paint(A.BOLD, 'Feature Flags')}`);
  for (const [k, v] of Object.entries(settings.feature_flags)) {
    const dot = v ? paint(A.GREEN, '●') : paint(A.DIM, '○');
    console.log(`    ${dot} ${k}`);
  }
  console.log(`\n  ${paint(A.BOLD, 'Alerts')}`);
  console.log(`    email  ${settings.alerts.email ? paint(A.GREEN, 'on') : paint(A.DIM, 'off')}`);
  console.log(`    push   ${settings.alerts.push ? paint(A.GREEN, 'on') : paint(A.DIM, 'off')}`);
  console.log('');
}

async function commandSettings(args, { settingsPath } = {}) {
  const sub = args[0] || 'show';
  const useJson = args.includes('--json');

  if (sub === 'show' || !sub) {
    const settings = loadSettings(settingsPath);
    if (useJson) {
      printPayload({ ok: true, type: 'user_settings', ...settings }, args);
    } else {
      renderHuman(settings);
    }
    return 0;
  }

  if (sub === 'reset') {
    const fresh = { ...DEFAULTS, trading: { ...DEFAULTS.trading }, feature_flags: { ...DEFAULTS.feature_flags }, alerts: { ...DEFAULTS.alerts } };
    persistSettings(fresh, settingsPath);
    if (useJson) {
      printPayload({ ok: true, type: 'user_settings', reset: true, ...fresh }, args);
    } else {
      console.log(`${paint(A.GREEN, '●')} Settings reset to defaults.`);
    }
    return 0;
  }

  if (sub === 'timezone') {
    const valueIdx = args.indexOf('--value');
    const tz = valueIdx !== -1 ? args[valueIdx + 1] : null;
    if (!tz || !VALID_TIMEZONES.has(tz)) {
      const msg = `Invalid timezone: ${tz || '(none)'}. Valid: ${[...VALID_TIMEZONES].join(', ')}`;
      printPayload({ ok: false, error: msg }, args);
      return 1;
    }
    const settings = loadSettings(settingsPath);
    settings.timezone = tz;
    persistSettings(settings, settingsPath);
    if (useJson) {
      printPayload({ ok: true, type: 'user_settings', timezone: tz }, args);
    } else {
      console.log(`${paint(A.GREEN, '●')} Timezone set to ${paint(A.BOLD, tz)}`);
    }
    return 0;
  }

  if (sub === 'layout') {
    const presetIdx = args.indexOf('--preset');
    const preset = presetIdx !== -1 ? args[presetIdx + 1] : null;
    if (!preset || !VALID_LAYOUTS.has(preset)) {
      const msg = `Invalid preset: ${preset || '(none)'}. Valid: ${[...VALID_LAYOUTS].join(', ')}`;
      printPayload({ ok: false, error: msg }, args);
      return 1;
    }
    const settings = loadSettings(settingsPath);
    settings.layout = preset;
    persistSettings(settings, settingsPath);
    if (useJson) {
      printPayload({ ok: true, type: 'user_settings', layout: preset }, args);
    } else {
      console.log(`${paint(A.GREEN, '●')} Layout set to ${paint(A.BOLD, preset)}`);
    }
    return 0;
  }

  if (sub === 'params') {
    const settings = loadSettings(settingsPath);
    const t = settings.trading;
    function numArg(flag) {
      const idx = args.indexOf(flag);
      return idx !== -1 ? parseFloat(args[idx + 1]) : null;
    }
    const ps = numArg('--position-size'); if (ps !== null && !isNaN(ps)) t.position_size = ps;
    const sl = numArg('--stop-loss');     if (sl !== null && !isNaN(sl)) t.stop_loss = sl;
    const tp = numArg('--take-profit');   if (tp !== null && !isNaN(tp)) t.take_profit = tp;
    const me = numArg('--min-edge');      if (me !== null && !isNaN(me)) t.min_edge = me;
    const mp = numArg('--max-positions'); if (mp !== null && !isNaN(mp)) t.max_positions = Math.round(mp);
    const pi = numArg('--polling-interval'); if (pi !== null && !isNaN(pi)) t.polling_interval = Math.round(pi);
    const bi = numArg('--backfill-interval'); if (bi !== null && !isNaN(bi)) t.backfill_interval_min = Math.max(1, Math.round(bi));
    persistSettings(settings, settingsPath);
    if (useJson) {
      printPayload({ ok: true, type: 'user_settings', trading: t }, args);
    } else {
      console.log(`${paint(A.GREEN, '●')} Trading params updated.`);
    }
    return 0;
  }

  if (sub === 'flags') {
    const flagIdx = args.indexOf('--flag');
    const valIdx  = args.indexOf('--value');
    const flagName = flagIdx !== -1 ? args[flagIdx + 1] : null;
    const flagVal  = valIdx  !== -1 ? args[valIdx  + 1] : null;
    if (!flagName || !VALID_FLAGS.has(flagName)) {
      printPayload({ ok: false, error: `Unknown flag: ${flagName || '(none)'}. Valid: ${[...VALID_FLAGS].join(', ')}` }, args);
      return 1;
    }
    const enabled = flagVal === 'true';
    const settings = loadSettings(settingsPath);
    settings.feature_flags[flagName] = enabled;
    persistSettings(settings, settingsPath);
    if (useJson) {
      printPayload({ ok: true, type: 'user_settings', feature_flags: settings.feature_flags }, args);
    } else {
      console.log(`${paint(A.GREEN, '●')} Flag ${paint(A.BOLD, flagName)} → ${enabled ? paint(A.GREEN, 'on') : paint(A.DIM, 'off')}`);
    }
    return 0;
  }

  if (sub === 'alerts') {
    const settings = loadSettings(settingsPath);
    const emailIdx = args.indexOf('--email');
    const pushIdx  = args.indexOf('--push');
    if (emailIdx !== -1) settings.alerts.email = args[emailIdx + 1] !== 'false';
    if (pushIdx  !== -1) settings.alerts.push  = args[pushIdx  + 1] !== 'false';
    persistSettings(settings, settingsPath);
    if (useJson) {
      printPayload({ ok: true, type: 'user_settings', alerts: settings.alerts }, args);
    } else {
      console.log(`${paint(A.GREEN, '●')} Alert preferences updated.`);
    }
    return 0;
  }

  printPayload({ ok: false, error: `Unknown settings subcommand: ${sub}. Valid: show, timezone, layout, params, flags, alerts, reset` }, args);
  return 1;
}

module.exports = { commandSettings, loadSettings, DEFAULTS, VALID_TIMEZONES, VALID_LAYOUTS, VALID_FLAGS };
