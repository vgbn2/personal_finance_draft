const { fetchJson } = require('./common');

async function fetchYahooBaseCandles(symbol, interval = '1d', rangeDays = 5, startTime = null, endTime = null) {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  
  const queryEndTime = endTime || Date.now();

  if (startTime) {
    url.searchParams.set('period1', Math.floor(startTime / 1000));
    url.searchParams.set('period2', Math.floor(queryEndTime / 1000));
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
  console.log(`[YAHOO] Fetched ${timestamps.length} candles for ${symbol} (${interval}, range=${url.searchParams.get('range')})`);
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
