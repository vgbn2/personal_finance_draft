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
  STRATEGY_MANIFEST,
  DATA_MANIFEST,
  RESEARCH_MANIFEST,
  getCachedSymbols,
  getCachedTimeframes,
  getCachedUniverse
};
