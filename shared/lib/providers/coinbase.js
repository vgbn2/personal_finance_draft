const { fetchJson } = require('./common');

const COINBASE_PRODUCTS = {
  BTCUSDT: 'BTC-USD',
  ETHUSDT: 'ETH-USD',
  BNBUSDT: 'BNB-USD',
  SOLUSDT: 'SOL-USD',
  XRPUSDT: 'XRP-USD',
  DOGEUSDT: 'DOGE-USD',
  SUIUSDT: 'SUI-USD',
  ADAUSDT: 'ADA-USD',
};

const COINBASE_GRANULARITY = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
};

async function fetchCoinbaseBaseCandles(symbol, limit = 300, interval = '1d', startTs = null, endTs = null) {
  const product = COINBASE_PRODUCTS[String(symbol).toUpperCase()] || symbol;
  const granularity = COINBASE_GRANULARITY[interval] || COINBASE_GRANULARITY['1d'];
  const url = new URL(`https://api.exchange.coinbase.com/products/${product}/candles`);
  url.searchParams.set('granularity', String(granularity));
  if (Number.isFinite(startTs)) url.searchParams.set('start', new Date(startTs).toISOString());
  if (Number.isFinite(endTs)) url.searchParams.set('end', new Date(endTs).toISOString());
  if (!Number.isFinite(startTs) && !Number.isFinite(endTs) && Number.isFinite(limit)) {
    const end = Date.now();
    const start = end - (limit * granularity * 1000);
    url.searchParams.set('start', new Date(start).toISOString());
    url.searchParams.set('end', new Date(end).toISOString());
  }

  const rows = await fetchJson(url.toString());
  return rows.map(r => ({
    openTime: r[0] * 1000,
    open: r[3],
    high: r[2],
    low: r[1],
    close: r[4],
    volume: r[5],
  })).sort((a, b) => a.openTime - b.openTime);
}

module.exports = {
  fetchCoinbaseBaseCandles,
};
