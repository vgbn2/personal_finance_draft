const fs = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');

/**
 * ADAPTERS
 * 
 * Data fetchers and normalizers for the Sovereign Trading Platform.
 */

// --- Constants (Mirrored from ingest_market_data.js for now) ---
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const API_CACHE_DIR = path.join(REPO_ROOT, 'data', 'cache', 'api_responses');
const API_CACHE_TTL_MS = 60 * 60 * 1000;

const SUPPORTED_INTERVALS = {
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
};

const COINBASE_PRODUCTS = {
  BTCUSDT: 'BTC-USD', ETHUSDT: 'ETH-USD', BNBUSDT: 'BNB-USD', SOLUSDT: 'SOL-USD',
  XRPUSDT: 'XRP-USD', DOGEUSDT: 'DOGE-USD', SUIUSDT: 'SUI-USD', ADAUSDT: 'ADA-USD',
};

const COINBASE_GRANULARITY = {
  '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14400, '1d': 86400,
};

const YAHOO_INDEX_SYMBOLS = { SPX: '^GSPC', NDX: '^NDX', DJI: '^DJI', VIX: '^VIX' };
const YAHOO_COMMODITY_SYMBOLS = { XAUUSD: 'GC=F', XAGUSD: 'SI=F', XCUUSD: 'HG=F', USOIL: 'CL=F' };
const STOOQ_EQUITY_SUFFIX = '.us';
const STOOQ_INDEX_SYMBOLS = { SPX: '^spx', NDX: '^ndq', DJI: '^dji', VIX: '^vix' };
const STOOQ_COMMODITY_SYMBOLS = { XAUUSD: 'xauusd', XAGUSD: 'xagusd', XCUUSD: 'xcuusd', USOIL: 'usoil' };

const SPGLOBAL_FLASH_PMI_URL = 'https://www.pmi.spglobal.com/Public/Release/PressReleases?language=en';
const KALSHI_API_BASE = 'https://external-api.kalshi.com/trade-api/v2';
const POLYMARKET_GAMMA_BASE = 'https://gamma-api.polymarket.com';
const POLYMARKET_CLOB_BASE = 'https://clob.polymarket.com';
const OPEN_SKY_TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';

const WEATHER_LOCATION_COORDS = {
  us_gulf: { latitude: 29.7604, longitude: -95.3698 },
  us_midwest: { latitude: 41.8781, longitude: -87.6298 },
  europe_central: { latitude: 51.9244, longitude: 4.4777 },
  us_west: { latitude: 34.0522, longitude: -118.2437 },
};

const OPEN_SKY_REGIONS = {
  us_gulf: { lamin: 24.0, lomin: -98.0, lamax: 31.5, lomax: -80.0 },
  us_midwest: { lamin: 35.0, lomin: -104.0, lamax: 49.0, lomax: -82.0 },
  europe_central: { lamin: 45.0, lomin: 5.0, lamax: 55.0, lomax: 20.0 },
};

const BARS_PER_DAY = {
  crypto: { '1m': 1440, '5m': 288, '15m': 96, '30m': 48, '1h': 24, '4h': 6, '1d': 1 },
  equities: { '1m': 390, '5m': 78, '15m': 26, '30m': 13, '1h': 7, '4h': 2, '1d': 1 }, // Based on NYSE 6.5h
};

// --- Shared Utilities ---

async function cachedFetch(url, options = {}, ttl = API_CACHE_TTL_MS) {
  const urlStr = url.toString();
  // Use SHA-256 hash to prevent collisions between similar URLs with different timestamps
  const cacheKey = crypto.createHash('sha256').update(urlStr + JSON.stringify(options)).digest('hex');
  const cacheFile = path.join(API_CACHE_DIR, `${cacheKey}.json`);

  try {
    const stats = await fs.stat(cacheFile);
    if (Date.now() - stats.mtimeMs < ttl) {
      const cached = await fs.readFile(cacheFile, 'utf8');
      return { json: async () => JSON.parse(cached), ok: true, status: 200, from_cache: true };
    }
  } catch (e) {}

  const response = await fetch(url, options);
  if (response.ok) {
    const clone = response.clone();
    const data = await clone.text();
    await fs.mkdir(API_CACHE_DIR, { recursive: true });
    await fs.writeFile(cacheFile, data, 'utf8');
  }
  return response;
}

async function fetchJson(url, accept = 'application/json') {
  const response = await cachedFetch(url, { headers: { accept, 'user-agent': 'sovereign-market-ingestor/1.0' } });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

async function fetchText(url, accept = 'text/plain') {
  const response = await cachedFetch(url, { headers: { accept, 'user-agent': 'sovereign-market-ingestor/1.0' } });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.text();
}

// --- Fetchers ---

async function fetchYahooBaseCandles(symbol, interval = '5m', rangeDays = 5) {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.searchParams.set('range', `${rangeDays}d`);
  url.searchParams.set('interval', interval);
  url.searchParams.set('includePrePost', 'false');

  const payload = await fetchJson(url.toString());
  const result = payload?.chart?.result?.[0];
  if (!result) throw new Error(`Yahoo missing result for ${symbol}`);

  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const candles = [];

  for (let i = 0; i < timestamps.length; i++) {
    const open = quote.open?.[i];
    const high = quote.high?.[i];
    const low = quote.low?.[i];
    const close = quote.close?.[i];
    const volume = quote.volume?.[i];
    if ([open, high, low, close].some(v => v == null)) continue;

    candles.push({
      openTime: Number(timestamps[i]) * 1000,
      open: Number(open), high: Number(high), low: Number(low), close: Number(close), volume: Number(volume || 0)
    });
  }
  return candles.sort((a, b) => a.openTime - b.openTime);
}

async function fetchBinanceBaseCandles(symbol, interval = '1d', limit = 1000, startTime = null, endTime = null) {
  const url = new URL('https://api.binance.com/api/v3/klines');
  url.searchParams.set('symbol', symbol.toUpperCase());
  url.searchParams.set('interval', interval);
  url.searchParams.set('limit', limit.toString());
  if (startTime) url.searchParams.set('startTime', startTime.toString());
  if (endTime) url.searchParams.set('endTime', endTime.toString());

  const payload = await fetchJson(url.toString());
  if (!Array.isArray(payload)) throw new Error(`Binance invalid response for ${symbol}`);

  return payload.map((k) => ({
    openTime: Number(k[0]),
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5]),
  })).sort((a, b) => a.openTime - b.openTime);
}

/**
 * PAGINATED BACKFILL
 */

async function fetchPaginated(symbol, timeframe, days, family, fetchFn, forcedEndTs = null) {
  const marketType = family === 'crypto' ? 'crypto' : 'equities';
  const barsPerDay = BARS_PER_DAY[marketType][timeframe] || 1;
  const providerMaxBars = 1000;
  const maxDaysPerChunk = Math.max(1, Math.floor(providerMaxBars / barsPerDay));
  
  let currentEndTs = forcedEndTs || Date.now();
  const targetStartTs = currentEndTs - (days * 24 * 60 * 60 * 1000);
  let allCandles = [];

  while (currentEndTs > targetStartTs) {
    let currentStartTs = currentEndTs - (maxDaysPerChunk * 24 * 60 * 60 * 1000);
    if (currentStartTs < targetStartTs) currentStartTs = targetStartTs;
    
    try {
      let chunk;
      if (family === 'crypto') {
        chunk = await fetchFn(symbol, providerMaxBars, timeframe, currentStartTs, currentEndTs);
      } else {
        chunk = await fetchFn(symbol, timeframe, null, currentStartTs, currentEndTs);
      }
      
      if (!chunk || chunk.length === 0) break;
      
      allCandles.push(...chunk);
      
      // Update end for next loop (avoid overlap)
      currentEndTs = chunk[0].openTime - 1;
      
      // Rate limit protection
      await new Promise(r => setTimeout(r, 200));
    } catch (error) {
      console.error(`  [BACKFILL] Chunk failed for ${symbol}: ${error.message}`);
      break;
    }
  }

  // Deduplicate and sort
  const seen = new Set();
  return allCandles.filter(c => {
    if (seen.has(c.openTime)) return false;
    seen.add(c.openTime);
    return true;
  }).sort((a, b) => a.openTime - b.openTime);
}

/**
 * MULTI-PROVIDER ORCHESTRATOR
 */
async function fetchParallelBackfill(symbol, timeframe, totalDays, family, providers) {
  if (!providers || providers.length === 0) throw new Error("No providers supplied for parallel backfill");
  
  const numWorkers = providers.length;
  const daysPerWorker = totalDays / numWorkers;
  const now = Date.now();
  
  console.log(`[PARALLEL] Orchestrating ${numWorkers} workers for ${totalDays} days of ${symbol}:${timeframe}`);
  
  const tasks = providers.map((providerName, index) => {
    // Each worker takes a slice of the past
    // Index 0: Most recent slice
    // Index N: Oldest slice
    const endTs = now - (index * daysPerWorker * 24 * 60 * 60 * 1000);
    
    // Dynamically assign fetcher
    const fetchFn = providerName === 'binance' ? fetchBinanceBaseCandles : fetchYahooBaseCandles;
    
    console.log(`  Worker ${index} (${providerName}): Pulling ${daysPerWorker.toFixed(1)} days ending ${new Date(endTs).toLocaleDateString()}`);
    
    return fetchPaginated(symbol, timeframe, daysPerWorker, family, fetchFn, endTs);
  });

  const results = await Promise.all(tasks);
  const flattened = results.flat();
  
  // Final global dedupe and sort
  const seen = new Set();
  return flattened.filter(c => {
    if (seen.has(c.openTime)) return false;
    seen.add(c.openTime);
    return true;
  }).sort((a, b) => a.openTime - b.openTime);
}

module.exports = {
  cachedFetch,
  fetchJson,
  fetchText,
  fetchYahooBaseCandles,
  fetchBinanceBaseCandles,
  fetchPaginated,
  fetchParallelBackfill,
  SUPPORTED_INTERVALS,
  BARS_PER_DAY,
};
