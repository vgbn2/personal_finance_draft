const { fetchJson } = require('./common');

async function fetchBinanceBaseCandles(symbol, limit = 1000, interval = '1d', startTime = null, endTime = null) {
  const url = new URL('https://api.binance.com/api/v3/klines');
  url.searchParams.set('symbol', symbol.toUpperCase());
  url.searchParams.set('interval', interval);
  url.searchParams.set('limit', String(limit));
  if (startTime) url.searchParams.set('startTime', String(startTime));
  if (endTime) url.searchParams.set('endTime', String(endTime));

  const rows = await fetchJson(url.toString());
  if (!Array.isArray(rows)) {
    throw new Error(`No Binance candles returned for ${symbol}`);
  }

  return rows.map((row) => {
    const [openTime, o, h, l, c, v] = row;
    return {
      openTime: Number(openTime),
      open: Number(o),
      high: Number(h),
      low: Number(l),
      close: Number(c),
      volume: Number(v),
    };
  }).sort((a, b) => a.openTime - b.openTime);
}

module.exports = {
  fetchBinanceBaseCandles
};
