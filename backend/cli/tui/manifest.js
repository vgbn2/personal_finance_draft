const fs = require('node:fs');
const path = require('node:path');
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
  const cachePath = path.join(__dirname, '../../data/cache/backtest_history.json');
  if (!fs.existsSync(cachePath)) {
      // Return default with category lookup
      const symbols = ['AAPL', 'BTCUSDT'];
      return { 
          symbols: symbols.map(s => ({ label: s, value: s, category: getCategoryForSymbol(s) })), 
          timeframes: ['1d'] 
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

/**
 * COMMAND_MANIFEST
 *
 * Central registry for all Sovereign commands.
 * This decouples the "what" (metadata/flags) from the "how" (rendering).
 */
const COMMAND_MANIFEST = {
  categories: [
    { id: 'op', label: 'Operational Dashboard & Health' },
    { id: 'backend', label: 'Backend Tools' },
    { id: 'research', label: 'Research & Backtesting' },
    { id: 'strategy', label: 'Strategy Management' },
    { id: 'trade', label: 'Execution & Trading (Alpaca)' },
  ],

  commands: {
    op: [
      { id: 'status', label: 'Status (Phase, cache, quality)', args: [] },
      { id: 'cockpit', label: 'Cockpit (Terminal dashboard)', args: [] },
      { id: 'watch', label: 'Watch (Semi-live data sync)', flags: {
        '--family': { type: 'select', options: ['all', 'crypto', 'fx', 'equities', 'indices', 'commodities', 'macro', 'prediction_market'], label: 'Family', default: 'all' },     
        '--interval': { type: 'text', default: '15', label: 'Interval (minutes)' }
      }},
      { id: 'check', label: 'Check (Validate live cache)', args: [] },
      { id: 'ingest', label: 'Ingest (Sync market data)', flags: {
        '--family': { type: 'select', options: [
          'all', 'crypto', 'fx', 'equities', 'indices', 'commodities',
          'macro', 'macro_alt', 'pmi', 'breadth', 'sentiment',
          'onchain', 'prediction_market', 'weather', 'flight',
          'crypto_tx', 'holdings', 'reserves'
        ], label: 'Family', default: 'all' }
      }},
      { id: 'backfill', label: 'Backfill (Build historical cache)', flags: {
        '--symbol': { type: 'text', prompt: 'Symbol (e.g. AAPL, BTCUSDT):' },
        '--timeframe': { type: 'select', options: ['1d', '1h', '15m'], label: 'Timeframe', default: '1d' },
        '--days': { type: 'text', default: '365', label: 'Days to backfill' },
        '--20-years': { type: 'confirm', label: '20 Year Deep History?', default: false }
      }}
    ],
    backend: [
      { id: 'status', prefix: ['backend'], label: 'Backend Status' },
      { id: 'stats', prefix: ['backend'], label: 'Backend Stats' },
      { id: 'summary', prefix: ['backend', 'data'], label: 'Backend Data Summary', flags: {
        '--symbol': { type: 'select', options: getCachedSymbols, label: 'Symbol' },
        '--timeframe': { type: 'select', options: getCachedTimeframes, label: 'Timeframe' },
        '--max-bars': { type: 'text', default: '0', label: 'Max Bars (0 = All)' }
      }},
      { id: 'correlation', prefix: ['backend'], label: 'Backend Correlation', flags: {
        '--symbols': { type: 'text', default: 'AAPL,MSFT,SPY', label: 'Symbols (comma separated)' },
        '--timeframe': { type: 'select', options: getCachedTimeframes, label: 'Timeframe' },
        '--max-bars': { type: 'text', default: '252', label: 'Lookback Period (Bars)' }
      }},
      { id: 'universe', prefix: ['backend'], label: 'Backend Universe' },
      { id: 'integrity', prefix: ['backend'], label: 'Backend Integrity' }
    ],
    research: [
      { id: 'features', label: 'Features / Indicators', flags: {
        '--timeframe': { type: 'select', options: getCachedTimeframes, label: 'Timeframe' }
      }},
      { id: 'models', label: 'Models Compare', flags: {
        '--timeframe': { type: 'select', options: getCachedTimeframes, label: 'Timeframe' }
      }},
      { id: 'bt', label: 'Backtest (Live cache)', flags: {
        '--strategy': { type: 'text', prompt: 'Strategy file path (e.g. config/strategies/mean_reversion.yaml):' },
        '--timeframe': { type: 'select', options: getCachedTimeframes, label: 'Timeframe' },
        '--sample': { type: 'confirm', label: 'Run deterministic sample?' },
        '--allow-degraded': { type: 'confirm', label: 'Allow degraded data?', default: false }
      }},
      { id: 'optimize', label: 'Optimize (Indicator periods)', flags: {
        '--strategy': { type: 'text', prompt: 'Strategy file path:' },
        '--timeframe': { type: 'select', options: getCachedTimeframes, label: 'Timeframe' }
      }}
    ],
    strategy: [
      { id: 'new', prefix: ['strategy'], label: 'Strategy New', flags: {
        'name': { type: 'text', label: 'Strategy Name', required: true },
        '--kind': { type: 'select', options: ['momentum', 'mean_reversion', 'arbitrage', 'ml'], label: 'Kind' },
        '--model': { type: 'select', options: ['cnn_v3', 'lstm_v1', 'xgboost'], label: 'Model' }
      }},
      { id: 'list', prefix: ['strategy'], label: 'Strategy List' },
      { id: 'validate', prefix: ['strategy'], label: 'Strategy Validate' },
      { id: 'run_automated', prefix: ['strategy'], label: 'Run Automation Loop', flags: {
          '--interval': { type: 'text', default: '15', label: 'Interval (minutes)' },
          '--live': { type: 'confirm', label: 'EXECUTE LIVE TRADES?', default: false }
      }}
    ],
    trade: [
      { id: 'balance', prefix: ['trade'], label: 'Check Alpaca Balance' },
      { id: 'visualize', prefix: ['trade'], label: 'Visualize Sigma Bands', flags: {
          'symbol': { type: 'text', label: 'Symbol to visualize:', default: 'BTCUSDT' }
      }},
      { id: 'buy', prefix: ['trade'], label: 'Place Buy Order', flags: {
        'symbol': { type: 'text', label: 'Symbol (e.g. AAPL, TSLA)', required: true },
        'qty': { type: 'text', label: 'Quantity', required: true },
        'type': { type: 'select', options: ['market', 'limit'], label: 'Order Type', default: 'market' },
        'price': { type: 'text', label: 'Limit Price (if applicable)', default: '' },
        '--live': { type: 'confirm', label: 'EXECUTE LIVE? (DANGER)', default: false }
      }},
      { id: 'sell', prefix: ['trade'], label: 'Place Sell Order', flags: {
        'symbol': { type: 'text', label: 'Symbol (e.g. AAPL, TSLA)', required: true },
        'qty': { type: 'text', label: 'Quantity', required: true },
        'type': { type: 'select', options: ['market', 'limit'], label: 'Order Type', default: 'market' },
        'price': { type: 'text', label: 'Limit Price (if applicable)', default: '' },
        '--live': { type: 'confirm', label: 'EXECUTE LIVE? (DANGER)', default: false }
      }},
      { id: 'process', prefix: ['trade'], label: 'Process Proposed Orders File', flags: {
        'file': { type: 'text', label: 'JSON File Path', default: 'proposed_orders.json' },
        '--live': { type: 'confirm', label: 'EXECUTE LIVE? (DANGER)', default: false }
      }}
    ]
  }
};

const STRATEGY_MANIFEST = {
  momentum: {
    description: 'Trend-following strategy based on moving average crossovers and volume confirmation.',
    options: [
      { name: '--kind', type: 'choice', choices: ['momentum', 'mean_reversion'], default: 'momentum' },
      { name: '--model', type: 'choice', choices: ['cnn_v3', 'lstm_v2', 'xgboost_v1'], default: 'cnn_v3' },
      { name: '--signal-threshold', type: 'number', default: 0.65 },
      { name: '--max-holding-days', type: 'number', default: 5 }
    ]
  },
  mean_reversion: {
    description: 'Strategy that bets on price returning to its mean after an extreme deviation.',
    options: [
      { name: '--kind', type: 'choice', choices: ['momentum', 'mean_reversion'], default: 'mean_reversion' },
      { name: '--model', type: 'choice', choices: ['cnn_v3', 'lstm_v2', 'xgboost_v1'], default: 'cnn_v3' },
      { name: '--signal-threshold', type: 'number', default: 0.70 },
      { name: '--max-holding-days', type: 'number', default: 3 }
    ]
  }
};

const DATA_MANIFEST = {
  ingest: {
    description: 'Fetch and synchronize market data from multiple providers.',
    options: [
      { name: '--full', type: 'boolean', default: false },
      { name: '--family', type: 'choice', choices: ['all', 'crypto', 'equities', 'fx'], default: 'all' }
    ]
  },
  backfill: {
    description: 'Download historical data for a specific symbol and timeframe.',
    options: [
      { name: '--symbol', type: 'text', prompt: 'Symbol (e.g. AAPL, BTCUSDT):' },
      { name: '--timeframe', type: 'choice', choices: ['1m', '5m', '15m', '1h', '1d'], default: '1d' },
      { name: '--days', type: 'number', default: 365 },
      { name: '--20-years', type: 'boolean', default: false }
    ]
  }
};

const RESEARCH_MANIFEST = {
  backtest: {
    description: 'Run a backtest on historical data with the selected model and risk parameters.',
    options: [
      { name: '--strategy', type: 'text', prompt: 'Strategy file path:' },
      { name: '--model', type: 'text', default: 'cnn_window_v0' },
      { name: '--timeframe', type: 'choice', choices: ['1m', '5m', '15m', '1h', '1d'], default: '1d' },
      { name: '--horizon', type: 'number', default: 5 },
      { name: '--threshold', type: 'number', default: 0.55 }
    ]
  }
};

module.exports = {
  ...COMMAND_MANIFEST,
  STRATEGY_MANIFEST,
  DATA_MANIFEST,
  RESEARCH_MANIFEST,
  getCachedSymbols,
  getCachedTimeframes,
  getCachedUniverse
};
