const fs = require('node:fs');
const path = require('node:path');
const { VALID_FLAGS } = require('../../../shared/lib/settings/user_settings');

// Read wallet address for display — no ethers needed, address stored in env directly
const _pmWallet = (() => {
  try {
    const envPath = path.resolve(__dirname, '../../../.env');
    const raw = fs.readFileSync(envPath, 'utf8');
    const match = raw.match(/^POLYMARKET_WALLET_ADDRESS\s*=\s*(.+)$/m);
    if (match) {
      const addr = match[1].trim();
      return addr.slice(0, 8) + '…' + addr.slice(-4);
    }
  } catch {}
  return null;
})();
const TIMEZONE_OPTIONS = [
  { label: '(UTC+0)   UTC',                   value: 'UTC' },
  { label: '(UTC+0)   Europe/London',          value: 'Europe/London' },
  { label: '(UTC+1)   Europe/Berlin',          value: 'Europe/Berlin' },
  { label: '(UTC+7)   Asia/Ho_Chi_Minh',       value: 'Asia/Ho_Chi_Minh' },
  { label: '(UTC+8)   Asia/Singapore',         value: 'Asia/Singapore' },
  { label: '(UTC+9)   Asia/Tokyo',             value: 'Asia/Tokyo' },
  { label: '(UTC+10)  Australia/Sydney',       value: 'Australia/Sydney' },
  { label: '(UTC−5)   America/New_York',       value: 'America/New_York' },
  { label: '(UTC−6)   America/Chicago',        value: 'America/Chicago' },
  { label: '(UTC−8)   America/Los_Angeles',    value: 'America/Los_Angeles' },
];

const { mapping } = require('../../../config/asset_mapping.json');

/**
 * UTILS
 */
function getCategoryForSymbol(symbol) {
  for (const [category, symbols] of Object.entries(mapping)) {
    if (symbols.some(s => symbol.includes(s))) {
      return category;
    }
  }
  return 'Equities';
}

function getCachedUniverse() {
  const cachePath = path.join(__dirname, '../../../storage/data/cache/backtest_history.json');
  
 
  const configSymbols = [];
  try {
      const configPath = path.join(__dirname, '../../../config/markets/data_sources.yaml');
      if (fs.existsSync(configPath)) {
          const content = fs.readFileSync(configPath, 'utf8');
          // Simple regex parsing to avoid async dependency in manifest
          const sections = ['equities', 'indices', 'commodities', 'fx', 'crypto'];
          for (const s of sections) {
              const match = content.match(new RegExp(`${s}:[\\s\\S]+?symbols:\\s*\\[(.*?)\\]`));
              if (match) {
                  const symbols = match[1].split(',').map(sym => sym.trim().replace(/"/g, '').replace(/'/g, ''));
                  for (const sym of symbols) {
                      if (sym) configSymbols.push({ label: sym, value: sym, category: s.charAt(0).toUpperCase() + s.slice(1) });
                  }
              }
          }
      }
  } catch (e) {}

  if (!fs.existsSync(cachePath)) {
      return { 
          symbols: configSymbols.length > 0 ? configSymbols : [{ label: 'AAPL', value: 'AAPL', category: 'Equities' }], 
          timeframes: ['1mo','1wk','1d', '1h', '5m','1m'] 
      };
  }

  try {
    const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    const symbolsMap = new Map();
    const tfs = new Set();
    data.sources.forEach(s => {
      if (s.symbol) {
        const category = s.family ? s.family.charAt(0).toUpperCase() + s.family.slice(1) : getCategoryForSymbol(s.symbol);
        symbolsMap.set(s.symbol, { label: s.symbol, value: s.symbol, category });
      }
      if (s.timeframe) tfs.add(s.timeframe);
    });
    
    // Group by category then sort by symbol name
    const groupedSymbols = Array.from(symbolsMap.values()).sort((a, b) => {
      if (a.category < b.category) return -1;
      if (a.category > b.category) return 1;
      return a.label.localeCompare(b.label);
    });
    
    return {
      symbols: groupedSymbols,
      timeframes: Array.from(tfs).sort()
    };
  } catch (e) {
    return { symbols: [{ label: 'AAPL', value: 'AAPL', category: 'Equities' }, { label: 'BTCUSDT', value: 'BTCUSDT', category: 'Crypto' }], timeframes: ['1d'] };
  }
}

function getCachedSymbols() {
  return getCachedUniverse().symbols;
}

function getCachedTimeframes() {
  return getCachedUniverse().timeframes;
}

function getRegisteredStrategies() {
    try {
        const { registeredStrategyOptions } = require('../commands/strategy/strategy');
        return registeredStrategyOptions();
    } catch (e) {
        return [{ label: 'Mean Reversion', value: 'config/strategies/mean_reversion.yaml' }];
    }
}

/**
 * COMMAND_MANIFEST
 *
 * Central registry for all Sovereign commands.
 * This decouples the "what" (metadata/flags) from the "how" (rendering).
 */
const COMMAND_MANIFEST = {
  categories: [
    { id: 'op',         label: 'Operational Dashboard & Health' },
    { id: 'data',       label: 'Data & Backfill' },
    { id: 'backend',    label: 'Backend Tools' },
    { id: 'research',   label: 'Research & Backtesting' },
    { id: 'trade',      label: 'Execution & Trading' },
    { id: 'polymarket', label: 'Prediction Markets' },
    { id: 'settings',   label: 'Settings & Preferences' },
    { id: 'account',    label: 'Account & Auth' },
  ],
  commands: {
    op: [
      { id: 'status',   label: 'Status ', args: [] },
      { id: 'cockpit',  label: 'Terminal dashboard', args: [] },
      { id: 'watch',    label: 'Watch', flags: {
        '--family':   { type: 'select', options: ['all', 'crypto', 'fx', 'equities', 'indices', 'commodities', 'macro', 'prediction_market'], label: 'Family', default: 'all' },
        '--interval': { type: 'text', default: '15', label: 'Interval (minutes)' }
      }},
      { id: 'cache-clean', label: 'Cache Clean', flags: {
        '--dry-run': { type: 'confirm', label: 'Preview only?', default: true }
      }},
    ],
    data: [
      { id: 'integrity',   prefix: ['backend'], label: 'Integrity', args: [], flags: {
        '--audit-vintages': { type: 'confirm', label: 'Only show vintage anomalies?', default: false }
      }},
      { id: 'ingest',      label: 'Ingest ', loading: true, flags: {
        '--family': { type: 'select', options: [
          'all', 'crypto', 'fx', 'equities', 'indices', 'commodities',
          'macro', 'macro_alt', 'pmi', 'breadth', 'sentiment',
          'onchain', 'prediction_market', 'weather', 'flight',
          'crypto_tx', 'holdings', 'reserves'
        ], label: 'Family', default: 'all' },
        '--symbol':       { type: 'text', default: '', label: 'Symbol filter (optional)' },
        '--timeframe':    { type: 'select', options: ['1w', '1d', '1h', '15m'], label: 'Timeframe', default: '1h' },
        '--history-days': { type: 'text', default: '', label: 'History days (blank = latest only)' }
      }},
      { id: 'backfill-daemon', label: 'Deep Backfill', loading: true, flags: {
        '--once':          { type: 'confirm', label: 'Run once (no daemon loop)?', default: true },
        '--deep-all':      { type: 'confirm', label: 'Full rebuild? (force deep on every symbol, ignore freshness)', default: false },
        '--families':      { type: 'text', default: '', label: 'Families (comma-separated, blank = all)' },
        '--concurrency':   { type: 'text', default: '5', label: 'Symbols in parallel per provider' },
        '--interval-secs': { type: 'text', default: '1800', label: 'Loop interval seconds (daemon mode only)' }
      }},
      { id: 'intraday-rollup', label: 'Intraday Rollup ', loading: true, flags: {
        '--family':     { type: 'select', options: ['all', 'crypto', 'equities'], label: 'Family', default: 'all' },
        '--symbols':    { type: 'text', default: '', label: 'Symbol filter, comma-separated (blank = all)' },
        '--timeframes': { type: 'text', default: '15m,30m,1h,4h', label: 'Target timeframes to derive' }
      }},
      { id: 'clear-api-cache', label: 'Clear API Cache', flags: {
        '--dry-run':   { type: 'confirm', label: 'Preview only (no deletion)?', default: true },
        '--ts':        { type: 'confirm', label: 'Also delete ts/ candle bins?', default: false },
        '--symbol':    { type: 'text', default: '', label: 'Symbol filter for ts/ bins (blank = all)' },
        '--timeframe': { type: 'text', default: '', label: 'Timeframe filter for ts/ bins (blank = all)' }
      }},
    ],
    backend: [
      { id: 'status', prefix: ['backend'], label: 'Backend Status', args: [] },
      { id: 'stats', prefix: ['backend'], label: 'Backend Stats', args: [] },
      { id: 'correlation', prefix: ['backend'], label: 'Pearson Correlation', loading: true, flags: {
        '--timeframe': { type: 'select', options: getCachedTimeframes, label: 'Timeframe' },
        '--max-bars': { type: 'text', default: '252', label: 'Lookback Period (Bars)' },
        '--method': { type: 'select', options: ['auto', 'pearson-returns', 'fx-returns', 'pearson-levels'], label: 'Correlation Method', default: 'auto' },
        '--drop-non-overlap': { type: 'confirm', label: 'Drop non-overlapping symbols automatically?', default: false }
      }},
      { id: 'visualize', prefix: ['backend'], label: 'Sigma bands', flags: {
        '--timeframe': { type: 'select', options: getCachedTimeframes, label: 'Timeframe' },
        '--window': { type: 'text', default: '20', label: 'Rolling window (bars)' },
        '--interval': { type: 'text', default: '30', label: 'Poll interval (seconds)' },
        '--no-poll': { type: 'confirm', label: 'One-shot (no live poll)?', default: false },
      }},
      { id: 'universe', prefix: ['backend'], label: 'Backend Universe', args: [] },
    ],
    research: [
      { id: 'features', label: 'Features / Indicators', flags: {
        '--timeframe': { type: 'select', options: getCachedTimeframes, label: 'Timeframe' }
      }},
      { id: 'models', label: 'Models Compare (quality gate)', flags: {
        '--timeframe': { type: 'select', options: getCachedTimeframes, label: 'Timeframe' }
      }},
      { id: 'bt', label: 'Backtest (Prop-firm fit)', loading: true, flags: {
        '--strategy': { type: 'select', options: getRegisteredStrategies, label: 'Strategy' },
        '--timeframe': { type: 'select', options: getCachedTimeframes, label: 'Timeframe' },
        '--days': { type: 'text', default: '730', label: 'History window (days)' },
        '--allow-degraded': { type: 'confirm', label: 'Allow degraded data?', default: false }
      }},
      { id: 'optimize', label: 'Optimize (Indicators only)', loading: true, flags: {
        '--strategy': { type: 'select', options: getRegisteredStrategies, label: 'Strategy' },
        '--timeframe': { type: 'select', options: getCachedTimeframes, label: 'Timeframe' }
      }},
      { id: 'edge-decay', label: 'Edge Decay (Rolling window alpha check)', loading: true, flags: {
        '--strategy': { type: 'select', options: getRegisteredStrategies, label: 'Strategy' },
        '--timeframe': { type: 'select', options: getCachedTimeframes, label: 'Timeframe' },
        '--symbol': { type: 'text', default: '', label: 'Symbol filter (optional)' }
      }}
    ],
    settings: [
      { id: 'show',     prefix: ['settings'], label: 'Show Current Config', args: [] },
      { id: 'favorites', prefix: ['settings'], label: 'Favourite Symbols', args: [] },
      { id: 'timezone', prefix: ['settings'], label: 'Set Timezone', flags: {
        '--value': { type: 'select', options: TIMEZONE_OPTIONS, label: 'Timezone' }
      }},
      { id: 'layout',   prefix: ['settings'], label: 'Set Layout Preset', flags: {
        '--preset': { type: 'select', options: ['default', 'compact', 'research'], label: 'Preset', default: 'default' }
      }},
      { id: 'params',   prefix: ['settings'], label: 'Default Trading Params', flags: {
        '--position-size':       { type: 'text', default: '100',  label: 'Position size (USDC)' },
        '--stop-loss':           { type: 'text', default: '0.05', label: 'Stop loss %' },
        '--take-profit':         { type: 'text', default: '0.10', label: 'Take profit %' },
        '--min-edge':            { type: 'text', default: '0.05', label: 'Min edge threshold' },
        '--max-positions':       { type: 'text', default: '10',   label: 'Max open positions' },
        '--polling-interval':    { type: 'text', default: '60',   label: 'Polling interval (seconds)' },
      }},
      { id: 'flags',    prefix: ['settings'], label: 'Feature Flags', flags: {
        '--flag':  { type: 'select', options: [...VALID_FLAGS], label: 'Flag' },
        '--value': { type: 'select', options: ['true', 'false'], label: 'Enable?', default: 'false' }
      }},
      { id: 'alerts',   prefix: ['settings'], label: 'Alert Preferences', flags: {
        '--email': { type: 'confirm', label: 'Email alerts?', default: true },
        '--push':  { type: 'confirm', label: 'Push alerts?',  default: false },
      }},
      { id: 'reset',    prefix: ['settings'], label: 'Reset to Defaults', args: [] },
    ],
    account: [
      { id: 'auth-status', label: 'Auth Status (who am I)', args: [] },
      { id: 'login', label: 'Sign In', args: [] },
      { id: 'register', label: 'Create Account', args: [] },
      { id: 'logout', label: 'Sign Out', args: [] },
    ],
    trade: [
      { id: 'alpaca',       label: 'Alpaca', args: [] },
      { id: 'mt5',          label: 'MT5 / EA', args: [] },
      { id: 'add-platform', label: '+ Add Broker', args: [] },
      { id: 'favorites',    label: 'Favourite Symbols', args: [] },
      { id: 'auto-trade',   label: 'Auto-Trade Loop', flags: {
        '--interval': { type: 'text', default: '15', label: 'Interval (minutes)' },
        '--live':     { type: 'confirm', label: 'EXECUTE LIVE TRADES?', default: false }
      }},
      { id: 'agent',        label: 'AI Agent', flags: {
        '--query': { type: 'text', default: '', label: 'Task for the agent' }
      }},
      // --- Strategy / Prop Firm / Runners: each opens its own sub-menu (see commandStrategyMenu / commandPropFirmMenu / commandRunnerMenu) ---
      { id: 'strategy',   label: 'Strategy', args: [] },
      { id: 'prop-firms', label: 'Prop Firm', args: [] },
      { id: 'run',        label: 'Persistent Runners', args: [] },
    ],
    polymarket: [
      { id: 'portfolio',     prefix: ['polymarket'], label: `Portfolio${_pmWallet ? '  ·  ' + _pmWallet : ''}` },
      { id: 'markets',       prefix: ['polymarket'], label: 'Browse Active Markets' },
      { id: 'history',       prefix: ['polymarket'], label: 'Historical Price Data', loading: true, flags: {
        '--event': { type: 'text', default: 'fed_rate_cut_prob', label: 'Prediction event key' },
        '--history-days': { type: 'text', default: '30', label: 'Historical days' },
        '--timeframe': { type: 'select', options: ['1d', '1h', '15m'], label: 'Timeframe', default: '1h' },
      }},
      { id: 'backtest',      prefix: ['polymarket'], label: 'Backtest (Resolved markets P&L)', loading: true, flags: {
        '--strategy':        { type: 'select', options: ['low_prob_dip', 'mean_revert'], label: 'Strategy', default: 'low_prob_dip' },
        '--tag-id':          { type: 'text', default: '21', label: 'Gamma tag ID (21=crypto 2023+)' },
        '--days':            { type: 'text', default: '365', label: 'Days back to scan' },
        '--max-markets':     { type: 'text', default: '20', label: 'Max markets to test' },
        '--entry-threshold': { type: 'text', default: '0.15', label: 'Max entry price (low_prob_dip)' },
      }},
      { id: 'derive-creds',  prefix: ['polymarket'], label: 'Derive L2 API Credentials' },
      { id: 'bot',           label: 'Edge Trader Bot', args: [] },
    ],
  }
};

module.exports = {
  ...COMMAND_MANIFEST,
  getCachedSymbols,
  getCachedTimeframes,
  getCachedUniverse,
  getRegisteredStrategies
};
