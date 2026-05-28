const { fetchJson } = require('./common');

// Alpaca API configuration
// Expects ALPACA_API_KEY and ALPACA_API_SECRET in the environment
const BASE_URL = 'https://data.alpaca.markets/v2';

async function fetchAlpacaBaseCandles(symbol, limit = 1000, timeframe = '1Day', startTs = null, endTs = null) {
  const apiKey = process.env.ALPACA_API_KEY;
  const apiSecret = process.env.ALPACA_API_SECRET;
  
  if (!apiKey || !apiSecret) {
    throw new Error("Alpaca API credentials (ALPACA_API_KEY, ALPACA_API_SECRET) missing");
  }

  const url = new URL(`${BASE_URL}/stocks/bars`);
  url.searchParams.set('symbols', symbol);
  url.searchParams.set('timeframe', timeframe);
  url.searchParams.set('limit', limit);
  
  if (startTs) {
    url.searchParams.set('start', new Date(startTs).toISOString());
  }
  if (endTs) {
    url.searchParams.set('end', new Date(endTs).toISOString());
  }

  const response = await fetchJson(url.toString(), {
    headers: {
      'APCA-API-KEY-ID': apiKey,
      'APCA-API-SECRET-KEY': apiSecret,
      'Accept': 'application/json'
    }
  });

  const bars = response.bars?.[symbol];
  if (!bars || bars.length === 0) {
    return [];
  }

  return bars.map(bar => ({
    openTime: new Date(bar.t).getTime(),
    open: bar.o,
    high: bar.h,
    low: bar.l,
    close: bar.c,
    volume: bar.v
  }));
}

module.exports = {
  fetchAlpacaBaseCandles
};
