const { fetchJson } = require('./common');

async function fetchYahooBaseCandles(symbol, interval = '1d', rangeDays = 5, startTime = null, endTime = null) {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  
  if (startTime && endTime) {
    url.searchParams.set('period1', Math.floor(startTime / 1000).toString());
    url.searchParams.set('period2', Math.floor(endTime / 1000).toString());
  } else {
    url.searchParams.set('range', `${rangeDays}d`);
  }
  
  url.searchParams.set('interval', interval);
  url.searchParams.set('includePrePost', 'false');

  const payload = await fetchJson(url.toString());
  const result = payload?.chart?.result?.[0];
  if (!result) {
    throw new Error(`Yahoo chart response missing result for ${symbol}`);
  }

  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const candles = [];

  for (let i = 0; i < timestamps.length; i++) {
    const open = quote.open?.[i];
    const high = quote.high?.[i];
    const low = quote.low?.[i];
    const close = quote.close?.[i];
    const volume = quote.volume?.[i];
    if ([open, high, low, close].some((value) => value == null)) {
      continue;
    }

    candles.push({
      openTime: Number(timestamps[i]) * 1000,
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: Number(volume || 0),
    });
  }

  return candles.sort((a, b) => a.openTime - b.openTime);
}

module.exports = {
  fetchYahooBaseCandles
};
