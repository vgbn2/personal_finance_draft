'use strict';

// Pure-data constants and the small pure helpers that operate only on them.
// Extracted from index.js as a zero-dependency leaf module (no REPO_ROOT / fs / path),
// so it can be required anywhere in the ingest folder without import cycles.

const SUPPORTED_INTERVALS = {
  '5m':  5  * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h':  60 * 60 * 1000,
  '4h':  4  * 60 * 60 * 1000,
  '1d':  24 * 60 * 60 * 1000,
  '1w':  7  * 24 * 60 * 60 * 1000,
  '1mo': 30 * 24 * 60 * 60 * 1000,
};

// Yahoo's max lookback per interval
const YAHOO_MAX_DAYS = {
  '5m': 60, '15m': 60, '30m': 60,
  '1h': 730, '4h': 730,
  '1d': Infinity, '1w': Infinity, '1mo': Infinity,
};

// Choose the finest Yahoo base interval that fits the requested days.
// Returns { base: '<yahoo_interval>', effectiveDays: <number> }
function selectYahooBase(timeframes, historyDays) {
  const ORDER = ['5m', '15m', '30m', '1h', '4h', '1d', '1w', '1mo'];
  // Finest timeframe the caller actually needs
  const finest = ORDER.find(iv => timeframes.includes(iv));
  if (!finest || ['1d', '1w', '1mo'].includes(finest)) {
    // For weekly/monthly, fetch 1wk/1mo directly; daily stays daily
    let base = '1d';
    if (finest === '1w') base = '1wk';
    else if (finest === '1mo') base = '1mo';
    return { base, effectiveDays: historyDays };
  }
  const maxDays = YAHOO_MAX_DAYS[finest] ?? Infinity;
  const effectiveDays = Math.min(historyDays, maxDays);
  if (effectiveDays < historyDays) {
    console.log(`[INGEST] Yahoo ${finest} limited to ${maxDays}d (requested ${historyDays}d) — fetching ${effectiveDays}d`);
  }
  // 4h must be fetched as 1h and aggregated
  const base = finest === '4h' ? '1h' : finest;
  return { base, effectiveDays };
}

const COINBASE_PRODUCTS = {
  BTCUSDT: 'BTC-USD',
  ETHUSDT: 'ETH-USD',
  BNBUSDT: 'BNB-USD',
  SOLUSDT: 'SOL-USD',
  XRPUSDT: 'XRP-USD',
  DOGEUSDT: 'DOGE-USD',
  SUIUSDT: 'SUI-USD',
  ADAUSDT: 'ADA-USD',
  LINKUSDT: 'LINK-USD',
  PEPEUSDT: 'PEPE-USD',
  WIFUSDT: 'WIF-USD',
  SHIBUSDT: 'SHIB-USD',
  FETUSDT: 'FET-USD',
  POLUSDT: 'POL-USD',
  AVAXUSDT: 'AVAX-USD',
  NEARUSDT: 'NEAR-USD',
  INJUSDT: 'INJ-USD',
  RNDRUSDT: 'RNDR-USD',
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

const YAHOO_INDEX_SYMBOLS = {
  SPX:  '^GSPC',
  NDX:  '^NDX',
  DJI:  '^DJI',
  VIX:  '^VIX',
  RUT:  '^RUT',
  DAX:  '^GDAXI',
  FTSE: '^FTSE',
  N225: '^N225',
  IXIC: '^IXIC',   // NASDAQ Composite
  FCHI: '^FCHI',   // CAC 40
  HSI:  '^HSI',    // Hang Seng
  AORD: '^AORD',   // ASX 200 (All Ordinaries)
  IBEX: '^IBEX',   // IBEX 35
  MIB:  'FTSEMIB.MI', // FTSE MIB Italy
};

const YAHOO_COMMODITY_SYMBOLS = {
  XAUUSD: 'GC=F',   // Gold
  XAGUSD: 'SI=F',   // Silver
  XCUUSD: 'HG=F',   // Copper
  USOIL:  'CL=F',   // WTI Crude
  UKOIL:  'BZ=F',   // Brent Crude
  NG:     'NG=F',   // Natural Gas
  WHEAT:  'ZW=F',   // Wheat
  CORN:   'ZC=F',   // Corn
  SOYBN:  'ZS=F',   // Soybeans
};

const YAHOO_FX_SYMBOLS = {
  EURUSD: 'EURUSD=X',
  EURJPY: 'EURJPY=X',
  EURGBP: 'EURGBP=X',
  GBPUSD: 'GBPUSD=X',
  USDJPY: 'USDJPY=X',
  AUDUSD: 'AUDUSD=X',
  USDCAD: 'USDCAD=X',
  USDCHF: 'USDCHF=X',
  NZDUSD: 'NZDUSD=X',
  USDSEK: 'USDSEK=X',
};

// Maps any Yahoo-native commodity symbol back to the canonical name.
// Used to normalize config entries that mistakenly use Yahoo syntax (GC=F etc.).
const YAHOO_COMMODITY_REVERSE = {
  'GC=F': 'XAUUSD',
  'SI=F': 'XAGUSD',
  'HG=F': 'XCUUSD',
  'CL=F': 'USOIL',
  'BZ=F': 'UKOIL',
  'NG=F': 'NG',
  'ZW=F': 'WHEAT',
  'ZC=F': 'CORN',
  'ZS=F': 'SOYBN',
};

const STOOQ_EQUITY_SUFFIX = '.us';
const STOOQ_INDEX_SYMBOLS = {
  SPX: '^spx',
  NDX: '^ndq',
  DJI: '^dji',
  VIX: '^vix',
};
const STOOQ_COMMODITY_SYMBOLS = {
  XAUUSD: 'xauusd',
  XAGUSD: 'xagusd',
  XCUUSD: 'xcuusd',
  USOIL: 'usoil',
};
//adopt alpaca api as well
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

function openSkyRegions() {
  return { ...OPEN_SKY_REGIONS };
}

const KALSHI_EVENT_KEYWORDS = {
  fed_rate_cut_prob: ['fed', 'rate', 'cut'],
  us_recession_prob: ['recession'],
  inflation_above_target: ['inflation', 'cpi'],
  risk_off_spike: ['vix', 'volatility', 'recession', 'crash'],
};

const POLYMARKET_EVENT_KEYWORDS = {
  fed_rate_cut_prob: ['fed', 'rate', 'cut'],
  us_recession_prob: ['recession'],
  inflation_above_target: ['inflation', 'cpi'],
  risk_off_spike: ['vix', 'volatility', 'crash'],
};

module.exports = {
  SUPPORTED_INTERVALS,
  YAHOO_MAX_DAYS,
  selectYahooBase,
  COINBASE_PRODUCTS,
  COINBASE_GRANULARITY,
  YAHOO_INDEX_SYMBOLS,
  YAHOO_COMMODITY_SYMBOLS,
  YAHOO_COMMODITY_REVERSE,
  YAHOO_FX_SYMBOLS,
  STOOQ_EQUITY_SUFFIX,
  STOOQ_INDEX_SYMBOLS,
  STOOQ_COMMODITY_SYMBOLS,
  SPGLOBAL_FLASH_PMI_URL,
  KALSHI_API_BASE,
  POLYMARKET_GAMMA_BASE,
  POLYMARKET_CLOB_BASE,
  OPEN_SKY_TOKEN_URL,
  WEATHER_LOCATION_COORDS,
  OPEN_SKY_REGIONS,
  openSkyRegions,
  KALSHI_EVENT_KEYWORDS,
  POLYMARKET_EVENT_KEYWORDS,
};
