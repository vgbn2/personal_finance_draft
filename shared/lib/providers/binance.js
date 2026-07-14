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

    for (let i = 0; i < bars.length; i++) {
      allBars.push(bars[i]);
    }
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

// Live WebSocket feed — writes closed klines to ts-index via mergeWriteBin
function startBinanceLiveFeed(symbols, options = {}) {
  if (typeof WebSocket === 'undefined') {
    console.warn('[binance] WebSocket not available in this Node version — live feed disabled');
    return { stop() {} };
  }

  const {
    timeframe = '1m',
    tsDir = null,
    onBar = null,
    onError = null,
    reconnectMs = 5000,
  } = options;

  let stopped = false;
  let ws = null;

  function getStorageDir() {
    if (tsDir) return tsDir;
    const { STORAGE_TS_DIR } = require('../runtime/paths');
    return STORAGE_TS_DIR;
  }

  function connect() {
    if (stopped) return;

    const streams = symbols
      .map((s) => `${s.toLowerCase()}@kline_${timeframe}`)
      .join('/');
    const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;

    ws = new WebSocket(url);

    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      const k = msg && msg.data && msg.data.k;
      if (!k || k.x !== true) return; // only closed klines

      const bar = {
        timestamp: new Date(k.t).toISOString(),
        open: Number(k.o),
        high: Number(k.h),
        low: Number(k.l),
        close: Number(k.c),
        volume: Number(k.v),
      };

      const symbol = (msg.data.s || k.s || '').toUpperCase();

      const { mergeWriteBin } = require('../market/validation');
      const dir = getStorageDir();
      const meta = { symbol, timeframe, family: 'crypto', provider: 'binance', count: 1 };
      try {
        mergeWriteBin(dir, meta, [bar]);
      } catch (err) {
        if (onError) onError(err);
        else console.error('[binance] mergeWriteBin error:', err);
      }

      if (onBar) onBar(symbol, bar);
    };

    ws.onerror = (event) => {
      const err = event.error || new Error('WebSocket error');
      if (onError) onError(err);
      else console.error('[binance] WebSocket error:', err);
    };

    ws.onclose = () => {
      if (stopped) return;
      if (onError) onError(new Error('WebSocket closed — reconnecting'));
      setTimeout(connect, reconnectMs);
    };
  }

  connect();

  return {
    stop() {
      stopped = true;
      if (ws) {
        ws.onclose = null; // prevent reconnect loop
        ws.close();
        ws = null;
      }
    },
  };
}

module.exports = {
  fetchBinanceBaseCandles,
  startBinanceLiveFeed,
};
