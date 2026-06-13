const { cachedFetch, fetchJson, REPO_ROOT } = require('./common');
const path = require('node:path');
const fs = require('node:fs');

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const ID_MAP_PATH = path.join(REPO_ROOT, 'storage', 'data', 'cache', 'coingecko_id_map.json');

// CoinGecko keys its symbol→id list by the bare ticker ("pol", "sui", "pepe"),
// and that list has symbol collisions (multiple coins share "pol"/"pepe"), with
// the auto-built map keeping whichever coin appears last. These explicit ids pin
// the canonical coin for the symbols in our universe so resolution is deterministic.
const COINGECKO_ID_OVERRIDES = {
  BTC: 'bitcoin', ETH: 'ethereum', BNB: 'binancecoin', SOL: 'solana',
  XRP: 'ripple', DOGE: 'dogecoin', SUI: 'sui', ADA: 'cardano',
  LINK: 'chainlink', PEPE: 'pepe', WIF: 'dogwifcoin', SHIB: 'shiba-inu',
  FET: 'fetch-ai', POL: 'polygon-ecosystem-token', MATIC: 'matic-network',
  AVAX: 'avalanche-2', NEAR: 'near', INJ: 'injective-protocol', RNDR: 'render-token',
  DOT: 'polkadot', TRX: 'tron',
  // Stablecoins (for stablecoin-mcap aggregate / capital-flight signal).
  USDT: 'tether', USDC: 'usd-coin', DAI: 'dai', BUSD: 'binance-usd', TUSD: 'true-usd',
};

// Strip a trading-pair quote suffix so "POLUSDT" resolves on the base ticker "POL".
// Guard against bare stablecoins ("USDT" -> "" would break resolution): if stripping
// empties the symbol, keep the original so e.g. USDT/USDC still resolve as themselves.
function baseSymbol(symbol) {
  const up = String(symbol).toUpperCase();
  const stripped = up.replace(/(USDT|USDC|BUSD|USD)$/, '');
  return stripped || up;
}

/**
 * Resolves a (possibly pair-suffixed) symbol to a canonical CoinGecko coin id.
 * Prefers the explicit override, then falls back to the auto symbol→id map.
 */
async function resolveCoinGeckoId(symbol) {
  const base = baseSymbol(symbol);
  if (COINGECKO_ID_OVERRIDES[base]) return COINGECKO_ID_OVERRIDES[base];
  const map = await getCoinGeckoIdMap();
  const id = map[base.toLowerCase()];
  if (!id) {
    throw new Error(`[COINGECKO] Could not find ID for symbol: ${symbol} (base: ${base})`);
  }
  return id;
}

/**
 * Loads or refreshes the CoinGecko symbol-to-id mapping.
 */
async function getCoinGeckoIdMap() {
  if (fs.existsSync(ID_MAP_PATH)) {
    const stats = fs.statSync(ID_MAP_PATH);
    const ageHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
    if (ageHours < 24) {
      return JSON.parse(fs.readFileSync(ID_MAP_PATH, 'utf8'));
    }
  }

  console.log('[COINGECKO] Refreshing ID map...');
  const list = await fetchJson(`${COINGECKO_BASE}/coins/list`);
  const map = {};
  list.forEach(coin => {
    map[coin.symbol.toLowerCase()] = coin.id;
  });

  fs.mkdirSync(path.dirname(ID_MAP_PATH), { recursive: true });
  fs.writeFileSync(ID_MAP_PATH, JSON.stringify(map, null, 2), 'utf8');
  return map;
}

/**
 * Fetches historical market data (price, market cap, volume) from CoinGecko.
 * @param {string} symbol - The coin symbol (e.g., "BTC")
 * @param {number} days - Number of days of history
 * @returns {Promise<Object[]>}
 */
async function fetchCoinGeckoHistory(symbol, days = 30) {
  const map = await getCoinGeckoIdMap();
  const id = map[symbol.toLowerCase()];
  if (!id) {
    throw new Error(`[COINGECKO] Could not find ID for symbol: ${symbol}`);
  }

  const url = `${COINGECKO_BASE}/coins/${id}/market_chart?vs_currency=usd&days=${days}`;
  const data = await fetchJson(url);

  // CoinGecko returns [timestamp, value] arrays
  const records = [];
  const prices = data.prices || [];
  const marketCaps = data.market_caps || [];
  const volumes = data.total_volumes || [];

  for (let i = 0; i < prices.length; i++) {
    const [timestamp, price] = prices[i];
    const [, marketCap] = marketCaps[i] || [0, 0];
    const [, volume] = volumes[i] || [0, 0];

    records.push({
      family: 'crypto',
      provider: 'coingecko',
      symbol: symbol.toUpperCase(),
      timestamp: new Date(timestamp).toISOString(),
      price: price,
      market_cap: marketCap,
      volume_24h: volume,
      source: 'coingecko-api'
    });
  }

  return records;
}

/**
 * Fetches OHLCV-shaped base candles for the crypto ingest path.
 *
 * CoinGecko's `/ohlc` endpoint only returns 4-day candles for windows >30d on the
 * free tier, which is useless for a daily series. `/market_chart` instead returns
 * one daily price point per day for windows >90d, which is close-accurate. We
 * synthesize single-price base candles (open=high=low=close=price) and carry the
 * daily volume; `aggregateCandles` then buckets them to the requested timeframe.
 * Volume/close are correct; intrabar high/low are not available from this source,
 * which is acceptable for a last-resort fallback that keeps the close series fresh.
 *
 * @param {string} symbol - Pair or bare ticker (e.g. "POLUSDT" or "POL")
 * @param {number} days   - Days of history to request
 * @returns {Promise<Array<{openTime:number, open:number, high:number, low:number, close:number, volume:number}>>}
 */
async function fetchCoinGeckoBaseCandles(symbol, days = 365) {
  const id = await resolveCoinGeckoId(symbol);
  const url = `${COINGECKO_BASE}/coins/${id}/market_chart?vs_currency=usd&days=${days}`;
  const data = await fetchJson(url);

  const prices = data.prices || [];
  const volumes = data.total_volumes || [];
  return prices
    .map(([timestamp, price], i) => {
      const [, volume] = volumes[i] || [0, 0];
      return {
        openTime: Number(timestamp),
        open: price,
        high: price,
        low: price,
        close: price,
        volume: Number(volume) || 0,
      };
    })
    .sort((a, b) => a.openTime - b.openTime);
}

/**
 * Fetches a daily market-cap time series for a coin from CoinGecko's market_chart.
 * Used to reconstruct historical crypto aggregates (total mcap, dominance, stablecoin
 * mcap) since the free /global endpoint is snapshot-only. Buckets to one point per UTC
 * day (last value wins) so series across coins can be aligned by date.
 *
 * @param {string} symbol - Pair or bare ticker (e.g. "BTCUSDT" or "BTC")
 * @param {number} days   - Days of history (>=365 yields daily granularity)
 * @returns {Promise<Map<string, number>>} date "YYYY-MM-DD" -> market_cap (USD)
 */
async function fetchCoinGeckoMcapSeries(symbol, days = 365) {
  const id = await resolveCoinGeckoId(symbol);
  const url = `${COINGECKO_BASE}/coins/${id}/market_chart?vs_currency=usd&days=${days}`;
  const data = await fetchJson(url);
  const caps = data.market_caps || [];
  const byDay = new Map();
  for (const [timestamp, mcap] of caps) {
    if (!Number.isFinite(mcap) || mcap <= 0) continue;
    const date = new Date(Number(timestamp)).toISOString().slice(0, 10);
    byDay.set(date, Number(mcap)); // later (intraday) points overwrite -> last per day
  }
  return byDay;
}

module.exports = {
  fetchCoinGeckoHistory,
  fetchCoinGeckoBaseCandles,
  fetchCoinGeckoMcapSeries,
  resolveCoinGeckoId,
  getCoinGeckoIdMap
};
