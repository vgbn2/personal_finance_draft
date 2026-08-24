const fs = require('node:fs');
const path = require('node:path');
const { VALID_FLAGS } = require('../../../shared/lib/settings/user_settings');

const CACHE_TTL_MS = 5000;
let _walletCache = null;
let _walletCacheTime = 0;
let _assetMappingCache = null;
let _assetMappingCacheTime = 0;
let _universeCache = null;
let _universeCacheTime = 0;
let _strategiesCache = null;
let _strategiesCacheTime = 0;

// Lazy reader for wallet address display — cached for CACHE_TTL_MS
function getPmWalletAddress() {
  const now = Date.now();
  if (_walletCache !== null && (now - _walletCacheTime) < CACHE_TTL_MS) {
    return _walletCache;
  }
  try {
    const envPath = path.resolve(__dirname, '../../../.env');
    if (fs.existsSync(envPath)) {
      const raw = fs.readFileSync(envPath, 'utf8');
      const match = raw.match(/^POLYMARKET_WALLET_ADDRESS\s*=\s*(.+)$/m);
      if (match) {
        const addr = match[1].trim();
        _walletCache = addr.slice(0, 8) + '…' + addr.slice(-4);
        _walletCacheTime = now;
        return _walletCache;
      }
    }
  } catch {}
  _walletCache = null;
  _walletCacheTime = now;
  return null;
}

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

function getAssetMapping() {
  const now = Date.now();
  if (_assetMappingCache !== null && (now - _assetMappingCacheTime) < CACHE_TTL_MS) {
    return _assetMappingCache;
  }
  try {
    const assetMappingPath = path.join(__dirname, '../../../config/asset_mapping.json');
    if (fs.existsSync(assetMappingPath)) {
      const parsed = JSON.parse(fs.readFileSync(assetMappingPath, 'utf8'));
      _assetMappingCache = parsed.mapping || {};
      _assetMappingCacheTime = now;
      return _assetMappingCache;
    }
  } catch {}
  _assetMappingCache = {};
  _assetMappingCacheTime = now;
  return {};
}

/**
 * UTILS
 */
function getCategoryForSymbol(symbol) {
  const mapping = getAssetMapping();
  for (const [category, symbols] of Object.entries(mapping)) {
    if (Array.isArray(symbols) && symbols.some(s => symbol.includes(s))) {
      return category;
    }
  }
  return 'Equities';
}

function getCachedUniverse() {
  const now = Date.now();
  if (_universeCache !== null && (now - _universeCacheTime) < CACHE_TTL_MS) {
    return _universeCache;
  }
  const cachePath = path.join(__dirname, '../../../storage/data/cache/backtest_history.json');

  const configSymbols = [];
  try {
      const configPath = path.join(__dirname, '../../../config/markets/data_sources.yaml');
      if (fs.existsSync(configPath)) {
          const content = fs.readFileSync(configPath, 'utf8');
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
      _universeCache = {
          symbols: configSymbols.length > 0 ? configSymbols : [{ label: 'AAPL', value: 'AAPL', category: 'Equities' }],
          timeframes: ['1mo','1wk','1d', '1h', '5m','1m']
      };
      _universeCacheTime = now;
      return _universeCache;
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

    const groupedSymbols = Array.from(symbolsMap.values()).sort((a, b) => {
      if (a.category < b.category) return -1;
      if (a.category > b.category) return 1;
      return a.label.localeCompare(b.label);
    });

    _universeCache = {
      symbols: groupedSymbols,
      timeframes: Array.from(tfs).sort()
    };
    _universeCacheTime = now;
    return _universeCache;
  } catch (e) {
    _universeCache = { symbols: [{ label: 'AAPL', value: 'AAPL', category: 'Equities' }, { label: 'BTCUSDT', value: 'BTCUSDT', category: 'Crypto' }], timeframes: ['1d'] };
    _universeCacheTime = now;
    return _universeCache;
  }
}

function getCachedSymbols() {
  return getCachedUniverse().symbols;
}

function getCachedTimeframes() {
  return getCachedUniverse().timeframes;
}

function getRegisteredStrategies() {
  const now = Date.now();
  if (_strategiesCache !== null && (now - _strategiesCacheTime) < CACHE_TTL_MS) {
    return _strategiesCache;
  }
  try {
      const { registeredStrategyOptions } = require('../commands/strategy/strategy');
      _strategiesCache = registeredStrategyOptions();
      _strategiesCacheTime = now;
      return _strategiesCache;
  } catch (e) {
      _strategiesCache = [{ label: 'Mean Reversion', value: 'config/strategies/mean_reversion.yaml' }];
      _strategiesCacheTime = now;
      return _strategiesCache;
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
    { id: 'account',    label: 'Account & Auth (Supabase)' },
    { id: 'data',       label: 'Data Pipeline & Storage Ops' },
    { id: 'analytics',  label: 'Analytics (Math & C++ Engines)' },
    { id: 'research',   label: 'Research & Backtesting' },
    { id: 'ai',         label: 'AI & Machine Learning' },
    { id: 'trade',      label: 'Unified Multi-Venue Execution' },
    { id: 'polymarket', label: 'Prediction Market Probes' },
  ],
  commands: {
    op: [
      { id: 'status',      label: 'Status', desc: 'Query Gateway /api/status', flags: {
        '--component': { type: 'text', default: '', label: 'Component filter' },
        '--verbose':   { type: 'confirm', label: 'Verbose health breakdown?', default: false }
      }},
      { id: 'cockpit',     label: 'Cockpit', desc: 'Interactive TUI dashboard', args: [] },
      { id: 'watch',       label: 'Watch', desc: 'Streaming live watch feed', flags: {
        '--interval':  { type: 'text', default: '15', label: 'Interval (minutes)' },
        '--symbols':   { type: 'text', default: '', label: 'Symbols comma-sep' },
        '--live':      { type: 'confirm', label: 'Live stream mode?', default: false }
      }},
      { id: 'cache-clean', label: 'Cache Clean', desc: 'Quarantine cache maintenance', flags: {
        '--dry-run':   { type: 'confirm', label: 'Preview only?', default: true },
        '--age-hours': { type: 'text', default: '24', label: 'Age threshold (hours)' }
      }},
      { id: 'restart',     label: 'Restart', desc: 'Trigger Gateway /api/restart', flags: {
        '--service': { type: 'text', default: 'all', label: 'Target service' },
        '--force':   { type: 'confirm', label: 'Force immediate restart?', default: false }
      }},
      { id: 'kill-switch', label: 'Kill Switch', desc: 'Master safety intercept', flags: {
        '--action': { type: 'select', options: ['status', 'engage', 'disengage'], label: 'Action', default: 'status' }
      }},
    ],
    account: [
      { id: 'auth-status', label: 'Auth Status', desc: 'Verify session & JWT claims', args: [] },
      { id: 'login',       label: 'Login', desc: 'Authenticate platform user', flags: {
        '--email':    { type: 'text', default: '', label: 'Email address' },
        '--password': { type: 'text', default: '', label: 'Password' }
      }},
      { id: 'register',    label: 'Register', desc: 'Provision platform identity', flags: {
        '--email':    { type: 'text', default: '', label: 'Email address' },
        '--password': { type: 'text', default: '', label: 'Password' }
      }},
      { id: 'logout',      label: 'Logout', desc: 'Revoke active session', args: [] },
      { id: 'balance',     label: 'Balance', desc: 'Aggregate cash & collateral', flags: {
        '--currency': { type: 'text', default: 'USD', label: 'Currency' }
      }},
      { id: 'positions',   label: 'Positions', desc: 'Multi-broker position inspection', flags: {
        '--symbol':   { type: 'text', default: '', label: 'Symbol filter' },
        '--venue':    { type: 'select', options: ['all', 'paper', 'live', 'polymarket'], label: 'Venue', default: 'all' }
      }},
      { id: 'orders',      label: 'Orders', desc: 'Order lifecycle audit trail', flags: {
        '--symbol':   { type: 'text', default: '', label: 'Symbol filter' },
        '--status':   { type: 'select', options: ['all', 'open', 'filled', 'cancelled'], label: 'Status', default: 'all' },
        '--limit':    { type: 'text', default: '20', label: 'Limit' }
      }},
    ],
    data: [
      { id: 'integrity',          label: 'Integrity', desc: 'Freshness & gap analysis', flags: {
        '--symbol':    { type: 'text', default: '', label: 'Symbol filter' },
        '--timeframe': { type: 'select', options: ['1d', '1h', '15m'], label: 'Timeframe', default: '1d' }
      }},
      { id: 'ingest',             label: 'Ingest', desc: 'Live ingest daemon', flags: {
        '--source':    { type: 'select', options: ['binance', 'alpaca', 'polymarket'], label: 'Source', default: 'binance' },
        '--symbols':   { type: 'text', default: '', label: 'Symbols comma-sep' }
      }},
      { id: 'backfill-daemon',     label: 'Backfill Daemon', desc: 'Deep history backfill engine', flags: {
        '--symbols':    { type: 'text', default: '', label: 'Symbols comma-sep' },
        '--timeframes': { type: 'text', default: '15m,1h,1d', label: 'Timeframes' },
        '--days':       { type: 'text', default: '365', label: 'History days' }
      }},
      { id: 'stop-backfill-daemon', label: 'Stop Backfill', desc: 'Terminate backfill process', args: [] },
      { id: 'intraday-rollup',     label: 'Intraday Rollup', desc: 'Resample candle timeframes', flags: {
        '--from': { type: 'text', default: '1m', label: 'From timeframe' },
        '--to':   { type: 'text', default: '15m,1h', label: 'To timeframes' }
      }},
      { id: 'clear-api-cache',     label: 'Clear API Cache', desc: 'Flush provider API response caches', flags: {
        '--provider': { type: 'text', default: 'all', label: 'Provider name' }
      }},
    ],
    analytics: [
      { id: 'correlation', prefix: ['backend'], label: 'Pearson Correlation (C++)', flags: {
        '--timeframe':        { type: 'select', options: getCachedTimeframes, label: 'Timeframe' },
        '--max-bars':         { type: 'text', default: '252', label: 'Lookback Period (Bars)' },
        '--method':           { type: 'select', options: ['auto', 'pearson-returns', 'fx-returns', 'pearson-levels'], label: 'Method', default: 'auto' },
        '--drop-non-overlap': { type: 'confirm', label: 'Drop non-overlapping symbols?', default: false }
      }},
      { id: 'visualize', prefix: ['backend'], label: 'Sigma Bands', flags: {
        '--timeframe': { type: 'select', options: getCachedTimeframes, label: 'Timeframe' },
        '--window':    { type: 'text', default: '20', label: 'Rolling window' },
        '--interval':  { type: 'text', default: '30', label: 'Poll interval (seconds)' },
        '--no-poll':   { type: 'confirm', label: 'One-shot?', default: false }
      }},
      { id: 'risk', prefix: ['backend'], label: 'Pre-Trade Risk Model', flags: {
        '--notional':     { type: 'text', default: '100', label: 'Order Notional ($)' },
        '--equity':       { type: 'text', default: '10000', label: 'Account Equity ($)' },
        '--drawdown':     { type: 'text', default: '0.02', label: 'Current Drawdown (0.02 = 2%)' },
        '--max-drawdown': { type: 'text', default: '0.15', label: 'Max Allowed Drawdown' }
      }},
      { id: 'universe', prefix: ['backend'], label: 'Asset Universe Index', args: [] },
    ],
    research: [
      { id: 'features', label: 'Feature Generation', flags: {
        '--timeframe': { type: 'select', options: getCachedTimeframes, label: 'Timeframe' }
      }},
      { id: 'bt', label: 'Backtest Simulation', flags: {
        '--strategy':       { type: 'select', options: getRegisteredStrategies, label: 'Strategy' },
        '--timeframe':      { type: 'select', options: getCachedTimeframes, label: 'Timeframe' },
        '--days':           { type: 'text', default: '730', label: 'History window (days)' },
        '--allow-degraded': { type: 'confirm', label: 'Allow degraded data?', default: false }
      }},
      { id: 'mass-bt', label: 'Mass Backtest Matrix', flags: {
        '--timeframes':        { type: 'text', default: '5m,15m,30m,1h,4h,1d', label: 'Timeframes filter' },
        '--position-size-pct': { type: 'text', default: '0.1', label: 'Position allocation' },
        '--days':              { type: 'text', default: '0', label: 'History window (days)' },
        '--allow-degraded':    { type: 'confirm', label: 'Allow degraded data?', default: true }
      }},
      { id: 'optimize', label: 'Indicator Optimization', flags: {
        '--strategy':  { type: 'select', options: getRegisteredStrategies, label: 'Strategy' },
        '--timeframe': { type: 'select', options: getCachedTimeframes, label: 'Timeframe' }
      }},
      { id: 'sweep', label: 'Global Proxy Sweep', flags: {
        '--symbols':    { type: 'text', default: 'all', label: 'Symbols' },
        '--timeframes': { type: 'text', default: 'all', label: 'Timeframes' },
        '--top-k':      { type: 'text', default: '20', label: 'Top-K Leaders' }
      }},
      { id: 'edge-decay', label: 'Alpha Edge Decay', flags: {
        '--strategy':  { type: 'select', options: getRegisteredStrategies, label: 'Strategy' },
        '--timeframe': { type: 'select', options: getCachedTimeframes, label: 'Timeframe' },
        '--symbol':    { type: 'text', default: '', label: 'Symbol filter' }
      }},
      { id: 'bias', label: 'Regime Bias Signal', flags: {
        '--symbol':      { type: 'text', default: 'BTCUSDT', label: 'Symbol' },
        '--no-backfill': { type: 'confirm', label: 'Skip auto-backfill?', default: false }
      }},
      { id: 'scorecard', label: 'Edge Scorecard Matrix', flags: {
        '--schema':      { type: 'select', options: ['2', '3'], label: 'Schema', default: '2' },
        '--family':      { type: 'select', options: ['', 'crypto', 'equities', 'fx', 'indices', 'commodities'], label: 'Family filter' },
        '--direction':   { type: 'select', options: ['', 'long', 'short', 'neutral'], label: 'Direction' },
        '--min-conf':    { type: 'text', default: '0.3', label: 'Min confidence' },
        '--top':         { type: 'text', default: '50', label: 'Max rows' }
      }}
    ],
    ai: [
      { id: 'ml-predict', label: 'ONNX Model Inference', flags: {
        '--input': { type: 'text', default: '', label: 'Feature frame CSV path' }
      }},
      { id: 'ml-compare', label: 'Accuracy Benchmark Matrix', flags: {
        '--input': { type: 'text', default: '', label: 'Feature frame CSV path' }
      }},
      { id: 'models', label: 'Model Quality Gate Compare', flags: {
        '--timeframe': { type: 'select', options: getCachedTimeframes, label: 'Timeframe' }
      }},
      { id: 'agent', label: 'AI Agent Task Runner', flags: {
        '--query': { type: 'text', default: '', label: 'Task for the agent' }
      }}
    ],
    trade: [
      { id: 'execute', label: 'Execute Trade', flags: {
        '--venue':  { type: 'select', options: ['paper', 'live', 'polymarket'], label: 'Venue', default: 'paper' },
        '--symbol': { type: 'text', default: '', label: 'Symbol' },
        '--side':   { type: 'select', options: ['buy', 'sell'], label: 'Side', default: 'buy' },
        '--amount': { type: 'text', default: '100', label: 'Amount' },
        '--price':  { type: 'text', default: '', label: 'Price (limit)' }
      }},
      { id: 'cancel',  label: 'Cancel Orders', flags: {
        '--order-id': { type: 'text', default: '', label: 'Order ID' },
        '--all':      { type: 'confirm', label: 'Cancel all open orders?', default: false }
      }},
      { id: 'close',   label: 'Close Position', flags: {
        '--symbol': { type: 'text', default: '', label: 'Symbol' },
        '--ratio':  { type: 'text', default: '1.0', label: 'Ratio (1.0 = 100%)' }
      }},
      { id: 'auto-trade', label: 'Auto-Trade Loop', flags: {
        '--interval': { type: 'text', default: '15', label: 'Interval (minutes)' },
        '--live':     { type: 'confirm', label: 'EXECUTE LIVE TRADES?', default: false }
      }},
      { id: 'auto-trade status', label: 'Execution State', flags: {
        '--live': { type: 'confirm', label: 'Show LIVE account state?', default: false }
      }},
      { id: 'strategy', label: 'Strategy Selection Menu', args: [] },
      { id: 'run',      label: 'Daemonized Strategy Runner', args: [] },
    ],
    polymarket: [
      { id: 'portfolio',   prefix: ['polymarket'], get label() { const addr = getPmWalletAddress(); return `Portfolio${addr ? '  ·  ' + addr : ''}`; }, flags: {
        '--addr': { type: 'text', default: '', label: 'Wallet address' }
      }},
      { id: 'markets',     prefix: ['polymarket'], label: 'Gamma Markets Directory', args: [] },
      { id: 'history',     prefix: ['polymarket'], label: 'Price History Time-Series', flags: {
        '--event':        { type: 'text', default: 'fed_rate_cut_prob', label: 'Prediction event key' },
        '--history-days': { type: 'text', default: '30', label: 'Historical days' }
      }},
      { id: 'debug',       prefix: ['polymarket'], label: 'Diagnostic Probe', flags: {
        '--raw': { type: 'confirm', label: 'Raw JSON output?', default: false }
      }},
      { id: 'auth-health', prefix: ['polymarket'], label: 'Auth & Signature Verifier', args: [] },
      { id: 'paper',       prefix: ['polymarket'], label: 'CLOB Paper Engine', flags: {
        '--virtual-balance': { type: 'text', default: '1000', label: 'Virtual Balance ($)' }
      }},
    ]
  }
};

module.exports = {
  ...COMMAND_MANIFEST,
  getCachedSymbols,
  getCachedTimeframes,
  getCachedUniverse,
  getRegisteredStrategies,
  getPmWalletAddress,
};
