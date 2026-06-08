'use strict';

const { loadSettings } = require('./user_settings');

const FEATURE_LABELS = {
  bot_autopilot: 'Bot autopilot',
  polymarket: 'Polymarket',
  onchain_data: 'On-chain data',
  multi_agent_research: 'Multi-agent research',
  auto_rebalance: 'Auto rebalance',
  ai_agent_trading: 'AI agent trading',
  auto_backfill: 'Auto backfill',
};

function loadRuntimeSettings(settingsPath) {
  return loadSettings(settingsPath);
}

function isFeatureEnabled(flagName, settings = loadRuntimeSettings()) {
  return settings?.feature_flags?.[flagName] === true;
}

function featureGate(flagName, options = {}) {
  const settings = options.settings || loadRuntimeSettings(options.settingsPath);
  const enabled = isFeatureEnabled(flagName, settings);
  if (enabled) {
    return { ok: true, settings, enabled: true };
  }
  const label = FEATURE_LABELS[flagName] || flagName;
  const surface = options.surface || label;
  const reason = `${label} is disabled in user settings`;
  const hint = `Enable it with: sovereign settings flags --flag ${flagName} --value true`;
  return {
    ok: false,
    enabled: false,
    settings,
    flag: flagName,
    reason,
    message: `${surface} is unavailable because ${reason.toLowerCase()}.`,
    hint,
  };
}

function layoutConfig(settings = loadRuntimeSettings()) {
  const layout = settings?.layout || 'default';
  if (layout === 'compact') {
    return { name: layout, selectPageSize: 8, multiSelectPageSize: 10 };
  }
  if (layout === 'research') {
    return { name: layout, selectPageSize: 14, multiSelectPageSize: 16 };
  }
  return { name: 'default', selectPageSize: 10, multiSelectPageSize: 12 };
}

function formatTimeForSettings(date = new Date(), settings = loadRuntimeSettings()) {
  const timeZone = settings?.timezone || 'UTC';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone,
    }).format(date);
  } catch {
    return new Date(date).toLocaleTimeString();
  }
}

module.exports = {
  FEATURE_LABELS,
  featureGate,
  formatTimeForSettings,
  isFeatureEnabled,
  layoutConfig,
  loadRuntimeSettings,
};
