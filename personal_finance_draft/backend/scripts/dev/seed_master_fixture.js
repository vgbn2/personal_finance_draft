const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const CACHE_PATH = path.join(REPO_ROOT, 'storage', 'data', 'cache', 'last_fetch.json');

const masterFixture = {
  mode: 'live',
  fetched_at: new Date().toISOString(),
  sources: [
    // Equities
    { family: 'equities', provider: 'stooq', symbol: 'AAPL', timestamp: '2026-05-28T12:00:00Z', open: 150, high: 155, low: 149, close: 152, volume: 1000000 },
    { family: 'equities', provider: 'yahoo', symbol: 'MSFT', timestamp: '2026-05-28T12:00:00Z', open: 300, high: 305, low: 299, close: 302, volume: 500000 },
    { family: 'equities', provider: 'stooq', symbol: 'SPY', timestamp: '2026-05-28T12:00:00Z', open: 400, high: 405, low: 399, close: 402, volume: 2000000 },
    { family: 'equities', provider: 'yahoo', symbol: 'QQQ', timestamp: '2026-05-28T12:00:00Z', open: 350, high: 355, low: 349, close: 352, volume: 1500000 },
    
    // Crypto
    { family: 'crypto', provider: 'binance', symbol: 'BTCUSDT', timestamp: '2026-05-28T12:00:00Z', open: 60000, high: 61000, low: 59000, close: 60500, volume: 100 },
    { family: 'crypto', provider: 'coinbase', symbol: 'ETHUSDT', timestamp: '2026-05-28T12:00:00Z', open: 3000, high: 3100, low: 2900, close: 3050, volume: 1000 },
    
    // FX
    { family: 'fx', provider: 'frankfurter', symbol: 'EURUSD', timestamp: '2026-05-28T12:00:00Z', value: 1.08 },
    { family: 'fx', provider: 'fxapi', symbol: 'GBPUSD', timestamp: '2026-05-28T12:00:00Z', value: 1.25 },
    { family: 'fx', provider: 'ecb', symbol: 'USDJPY', timestamp: '2026-05-28T12:00:00Z', value: 155.5 },
    
    // Commodities
    { family: 'commodities', provider: 'stooq', symbol: 'XAUUSD', timestamp: '2026-05-28T12:00:00Z', close: 2300 },
    { family: 'commodities', provider: 'yahoo', symbol: 'XAGUSD', timestamp: '2026-05-28T12:00:00Z', close: 28 },
    
    // Indices
    { family: 'indices', provider: 'stooq', symbol: 'SPX', timestamp: '2026-05-28T12:00:00Z', close: 5200 },
    
    // PMI
    { family: 'pmi', provider: 'spglobal', symbol: 'US_MANUFACTURING', timestamp: '2026-05-01T00:00:00Z', value: 50.2 },
    { family: 'pmi', provider: 'spglobal', symbol: 'US_SERVICES', timestamp: '2026-05-01T00:00:00Z', value: 51.5 },
    { family: 'pmi', provider: 'spglobal', symbol: 'US_COMPOSITE', timestamp: '2026-05-01T00:00:00Z', value: 50.8 },
    
    // Macro
    { family: 'macro', provider: 'fred', symbol: 'CPI', timestamp: '2026-04-01T00:00:00Z', value: 3.4 },
    
    // Crypto TX
    { family: 'crypto_tx', provider: 'blockchain', symbol: 'bitcoin', timestamp: '2026-05-28T12:00:00Z', value: 500000 },
    
    // Sentiment
    { family: 'sentiment', provider: 'alternative_me', symbol: 'fear_and_greed', timestamp: '2026-05-28T12:00:00Z', value: 65 },
    
    // Breadth
    { family: 'breadth', provider: 'custom', symbol: 'spy_rsp_ratio', timestamp: '2026-05-28T12:00:00Z', value: 1.12 },
    
    // Prediction Market
    { family: 'prediction_market', provider: 'polymarket', symbol: 'fed_rate_cut_prob', timestamp: '2026-05-28T12:00:00Z', value: 0.25 },

    // Missing families
    { family: 'weather', provider: 'openweather', symbol: 'NYC', timestamp: '2026-05-28T12:00:00Z', value: 22 },
    { family: 'flight', provider: 'adsbexchange', symbol: 'GLOBAL_COUNT', timestamp: '2026-05-28T12:00:00Z', value: 15000 },
    { family: 'onchain', provider: 'glassnode', symbol: 'BTC_EXCHANGE_NETFLOW', timestamp: '2026-05-28T12:00:00Z', value: -500 },
    { family: 'holdings', provider: 'sec', symbol: 'BRK_A', timestamp: '2026-05-28T12:00:00Z', value: 600000 },
    { family: 'reserves', provider: 'world_bank', symbol: 'USA', timestamp: '2026-05-28T12:00:00Z', value: 1.5 },
    { family: 'equities_options', provider: 'cboe', symbol: 'AAPL_CALL', timestamp: '2026-05-28T12:00:00Z', value: 5.5 },
    { family: 'stock_options', provider: 'cboe', symbol: 'MSFT_PUT', timestamp: '2026-05-28T12:00:00Z', value: 2.2 }
  ],
  errors: [],
  provider_checks: [
    { family: 'equities', providers: ['stooq', 'yahoo'], symbols: ['AAPL', 'MSFT', 'SPY', 'QQQ'] },
    { family: 'commodities', providers: ['stooq', 'yahoo'] },
    { family: 'weather', provider: 'openweather', status: 'ok' },
    { family: 'flight', provider: 'adsbexchange', status: 'ok' },
    { family: 'onchain', provider: 'glassnode', status: 'ok' },
    { family: 'holdings', provider: 'sec', status: 'ok' },
    { family: 'reserves', provider: 'world_bank', status: 'ok' },
    { family: 'crypto', provider: 'binance', status: 'ok' },
    { family: 'crypto', provider: 'coinbase', status: 'ok' },
    { family: 'fx', provider: 'frankfurter', status: 'ok' },
    { family: 'fx', provider: 'fxapi', status: 'ok' },
    { family: 'fx', provider: 'ecb', status: 'ok' },
    { family: 'pmi', provider: 'spglobal', status: 'ok' },
    { family: 'macro', provider: 'fred', status: 'ok' }
  ]
};

fs.writeFileSync(CACHE_PATH, JSON.stringify(masterFixture, null, 2), 'utf8');
console.log(`[VISIBILITY] Master test fixture seeded to ${CACHE_PATH}`);
