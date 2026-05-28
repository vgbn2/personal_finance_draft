const fs = require('node:fs');
const path = require('node:path');

/**
 * UTILS
 */
function getCachedUniverse() {
  const cachePath = path.join(__dirname, '../../data/cache/backtest_history.json');
  if (!fs.existsSync(cachePath)) return { symbols: ['AAPL', 'BTCUSDT'], timeframes: ['1d'] };
  try {
    const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    const symbols = new Set();
    const tfs = new Set();
    data.sources.forEach(s => {
      if (s.symbol) symbols.add(s.symbol);
      if (s.timeframe) tfs.add(s.timeframe);
    });
    return {
      symbols: Array.from(symbols).sort(),
      timeframes: Array.from(tfs).sort()
    };
  } catch (e) {
    return { symbols: ['AAPL', 'BTCUSDT'], timeframes: ['1d'] };
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
        '--timeframe': { type: 'select', options: ['1d', '1h', '15m'], label: 'Timeframe' },
        '--days': { type: 'text', default: '365', label: 'Days to backfill' }
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
        '--timeframe': { type: 'select', options: getCachedTimeframes, label: 'Timeframe' },
        '--sample': { type: 'confirm', label: 'Run deterministic sample?' },
        '--weight-momentum': { type: 'text', default: '0.45', label: 'Weight: Momentum' },
        '--weight-strength': { type: 'text', default: '0.35', label: 'Weight: RSI Strength' },
        '--weight-bias': { type: 'text', default: '0.20', label: 'Weight: MACD Bias' }
      }},
      { id: 'optimize', label: 'Optimize (Indicator periods)', flags: {
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
      { id: 'validate', prefix: ['strategy'], label: 'Strategy Validate' }
    ],
    trade: [
      { id: 'balance', prefix: ['trade'], label: 'Check Alpaca Balance' },
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

module.exports = COMMAND_MANIFEST;
