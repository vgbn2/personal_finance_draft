const { fetchJson } = require('./common');

async function fetchBinanceBaseCandles(symbol, limit = 1000, interval = '1d', startTime = null, endTime = null) {
  const MAX_PER_CALL = 1000;
  const allBars = [];
  let currentEndTime = endTime || Date.now();
  let remaining = limit;
  let calls = 0;
  // When startTime is provided (bounded window via fetchPaginated), a single API call
  // covers the chunk and the loop exits naturally via the break conditions below.
  // When startTime is absent (unbounded/legacy callers), cap at 600 to support
  // deep 5m backfills (5y = 526 calls) without an artificial 20-call ceiling.
  const MAX_CALLS = startTime ? 2 : 600;

  while (remaining > 0 && calls < MAX_CALLS) {
    const fetchLimit = Math.min(remaining, MAX_PER_CALL);
    const url = new URL('https://api.binance.com/api/v3/klines');
    url.searchParams.set('symbol', symbol.toUpperCase());
    url.searchParams.set('interval', interval);
    url.searchParams.set('limit', String(fetchLimit));
    if (startTime) url.searchParams.set('startTime', String(startTime));
    url.searchParams.set('endTime', String(currentEndTime));

    const rows = await fetchJson(url.toString());
    if (!Array.isArray(rows) || rows.length === 0) break;

    const bars = rows.map((row) => {
      const [openTime, o, h, l, c, v] = row;
      return {
        openTime: Number(openTime),
        open: Number(o),
        high: Number(h),
        low: Number(l),
        close: Number(c),
        volume: Number(v),
      };
    });

    allBars.push(...bars);
    remaining -= bars.length;
    calls++;

    // Move endTime back to just before the earliest bar fetched in this block
    currentEndTime = bars[0].openTime - 1;

    if (startTime && currentEndTime <= startTime) break;
    if (bars.length < fetchLimit) break; // No more historical data
  }

  if (allBars.length === 0) {
     throw new Error(`No Binance candles returned for ${symbol}`);
  }

  return allBars.sort((a, b) => a.openTime - b.openTime);
}

module.exports = {
  fetchBinanceBaseCandles
};
