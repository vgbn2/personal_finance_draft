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

module.exports = {
  path: '/api/config',
  status: (payload) => {
    if (payload.ok) return 200;
    if (payload.error === 'auth_required') return 401;
    if (payload.error === 'invalid_json' || payload.error === 'key_required') return 400;
    return 500;
  },
  handle: async (_query, { req }) => {
    const auth = await getAuthStatus(req);
    if (!auth.authenticated) {
      return { ok: false, error: 'auth_required' };
    }

    const supabase = createSovereignSupabaseClient(req);

    if (req.method === 'POST') {
      let body = {};
      try {
        const buffers = [];
        for await (const chunk of req) buffers.push(chunk);
        body = JSON.parse(Buffer.concat(buffers).toString());
      } catch {
        return { ok: false, error: 'invalid_json' };
      }
      const { key, value } = body;
      if (!key || typeof key !== 'string' || key.length > 64 || !/^[a-z_]+$/.test(key)) {
        return { ok: false, error: 'key_required' };
      }
      await setUserConfig(supabase, auth.user.id, key, value);
      return { ok: true };
    }

    const stored = await getUserConfig(supabase, auth.user.id);
    const config = { ...CONFIG_DEFAULTS, ...stored };
    return { ok: true, config };
  },
};

