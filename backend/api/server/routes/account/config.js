const {
  getAuthStatus,
  createSovereignSupabaseClient,
  getUserConfig,
  setUserConfig,
} = require('../../services/supabase_client');

const CONFIG_DEFAULTS = {
  timezone: 'UTC',
  risk_thresholds: { max_position_pct: 0.05, max_drawdown_pct: 0.15 },
  broker_preference: { default: 'alpaca' },
  dashboard_layout: {
    default_tab: 'overview',
    pinned_panels: [],
    sidebar_collapsed: false,
    panel_order: ['overview', 'signals', 'market_intel', 'backtest', 'bot'],
    density: 'comfortable',
    preset: 'default',
  },
  alert_preferences: { email: true, push: false },
  default_params: {
    position_size_usdc: 100,
    stop_loss_pct: 0.05,
    take_profit_pct: 0.10,
    min_edge_threshold: 0.05,
    max_positions: 10,
    order_timeout_seconds: 30,
    polling_interval_seconds: 60,
  },
  feature_flags: {
    bot_autopilot: false,
    polymarket: false,
    onchain_data: false,
    multi_agent_research: false,
    auto_rebalance: false,
  },
};

const CONFIG_KEYS = new Set(Object.keys(CONFIG_DEFAULTS));

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function matchesConfigShape(value, template) {
  if (Array.isArray(template)) {
    return Array.isArray(value) && value.every((entry) => typeof entry === 'string' && entry.length > 0);
  }
  if (isPlainObject(template)) {
    if (!isPlainObject(value)) return false;
    const keys = Object.keys(template);
    return Object.keys(value).length === keys.length
      && keys.every((key) => Object.hasOwn(value, key) && matchesConfigShape(value[key], template[key]));
  }
  if (typeof template === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === typeof template;
}

function isValidConfigValue(key, value) {
  if (!CONFIG_KEYS.has(key) || !matchesConfigShape(value, CONFIG_DEFAULTS[key])) return false;
  if (key === 'timezone') {
    if (!value || value.length > 64) return false;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value });
    } catch {
      return false;
    }
  }
  return true;
}

module.exports = {
  path: '/api/config',
  status: (payload) => {
    if (payload.ok) return 200;
    if (payload.error === 'auth_required') return 401;
    if (payload.error === 'invalid_json' || payload.error === 'key_required' || payload.error === 'invalid_config') return 400;
    return 500;
  },
  handle: async (query, { req }) => {
    const auth = await getAuthStatus(req);
    if (!auth.authenticated) {
      return { ok: false, error: 'auth_required' };
    }

    const supabase = createSovereignSupabaseClient(req);

    if (req.method === 'POST') {
      const { key, value } = query;
      if (!key || typeof key !== 'string' || key.length > 64 || !/^[a-z_]+$/.test(key) || !CONFIG_KEYS.has(key)) {
        return { ok: false, error: 'key_required' };
      }
      if (!isValidConfigValue(key, value)) return { ok: false, error: 'invalid_config' };
      await setUserConfig(supabase, auth.user.id, key, value);
      return { ok: true };
    }

    const stored = await getUserConfig(supabase, auth.user.id);
    const config = { ...CONFIG_DEFAULTS, ...stored };
    return { ok: true, config };
  },
};

module.exports.CONFIG_DEFAULTS = CONFIG_DEFAULTS;
module.exports.isValidConfigValue = isValidConfigValue;
