const fs = require('node:fs');
const path = require('node:path');

const { DEFAULT_USER_SETTINGS } = require('../runtime/paths');
const { writeJson } = require('../market_validation');

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
  favorite_symbols: ['AAPL', 'MSFT', 'SPY', 'BTCUSDT', 'ETHUSDT'],
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

function cloneDefaultSettings() {
  return {
    ...DEFAULTS,
    favorite_symbols: [...DEFAULTS.favorite_symbols],
    trading: { ...DEFAULTS.trading },
    feature_flags: { ...DEFAULTS.feature_flags },
    alerts: { ...DEFAULTS.alerts },
  };
}

function resolveSettingsPath(override) {
  return override || process.env.SOVEREIGN_USER_SETTINGS_PATH || DEFAULT_USER_SETTINGS;
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function normalizeFavoriteSymbols(value) {
  const values = Array.isArray(value)
    ? value
    : String(value || '')
      .split(',')
      .map((entry) => entry.trim());

  const seen = new Set();
  return values
    .map((entry) => String(entry || '').trim().toUpperCase())
    .filter((entry) => {
      if (!entry || seen.has(entry)) return false;
      seen.add(entry);
      return true;
    });
}

function loadSettings(settingsPath) {
  const stored = safeReadJson(resolveSettingsPath(settingsPath));
  if (!stored || typeof stored !== 'object') return cloneDefaultSettings();
  return {
    timezone: stored.timezone || DEFAULTS.timezone,
    layout: stored.layout || DEFAULTS.layout,
    favorite_symbols: normalizeFavoriteSymbols(stored.favorite_symbols ?? DEFAULTS.favorite_symbols),
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

module.exports = {
  DEFAULTS,
  VALID_FLAGS,
  VALID_LAYOUTS,
  VALID_TIMEZONES,
  cloneDefaultSettings,
  loadSettings,
  persistSettings,
  resolveSettingsPath,
  normalizeFavoriteSymbols,
};
