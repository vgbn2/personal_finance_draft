const { fetchJson } = require('./common');
const { resolveAlpacaSettings } = require('../brokers/alpaca_env');

// Alpaca API configuration
// Prefers the explicit Alpaca Paper credential set; legacy generic names remain a compatibility fallback.
const BASE_URL = 'https://data.alpaca.markets/v2';
const DEFAULT_LIMIT = 1000;
const DEFAULT_PAGINATED_LIMIT = 10000;
const MAX_PAGES = 1000;
// Free-plan SIP queries 403 when the window touches the most recent ~15 minutes
// ("subscription does not permit querying recent SIP data"); clamp with margin.
const SIP_RECENT_BLACKOUT_MS = 16 * 60 * 1000;

const TIMEFRAME_MAP = {
  '1m': '1Min',
  '5m': '5Min',
  '15m': '15Min',
  '30m': '30Min',
  '1h': '1Hour',
  '1d': '1Day',
};

function normalizeAlpacaArgs(symbol, limitOrTimeframe = DEFAULT_LIMIT, timeframeOrLimit = '1Day', startTs = null, endTs = null) {
  if (typeof limitOrTimeframe === 'string') {
    const parsedLimit = Number(timeframeOrLimit);
    return {
      symbol,
      timeframe: limitOrTimeframe,
      limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : DEFAULT_PAGINATED_LIMIT,
      startTs,
      endTs,
    };
  }

  const parsedLimit = Number(limitOrTimeframe);
  return {
    symbol,
    timeframe: timeframeOrLimit || '1Day',
    limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : DEFAULT_LIMIT,
    startTs,
    endTs,
  };
}

function alpacaTimeframe(timeframe) {
  return TIMEFRAME_MAP[timeframe] || timeframe;
}

async function fetchAlpacaBaseCandles(symbol, limitOrTimeframe = DEFAULT_LIMIT, timeframeOrLimit = '1Day', startTs = null, endTs = null) {
  const { keyId: apiKey, secretKey: apiSecret } = resolveAlpacaSettings(process.env);
  
  if (!apiKey || !apiSecret) {
    throw new Error(
      'Alpaca Paper API credentials '
      + '(ALPACA_PAPER_API_KEY and ALPACA_PAPER_SECRET_KEY) missing',
    );
  }

  const args = normalizeAlpacaArgs(symbol, limitOrTimeframe, timeframeOrLimit, startTs, endTs);
  const feed = process.env.ALPACA_DATA_FEED || 'iex';
  if (feed === 'sip') {
    const maxEndTs = Date.now() - SIP_RECENT_BLACKOUT_MS;
    args.endTs = args.endTs ? Math.min(args.endTs, maxEndTs) : maxEndTs;
    if (args.startTs && args.startTs >= args.endTs) {
      return [];
    }
  }
  const headers = {
    'APCA-API-KEY-ID': apiKey,
    'APCA-API-SECRET-KEY': apiSecret,
    'Accept': 'application/json'
  };
  const allBars = [];
  let pageToken = null;
  let pages = 0;

  do {
    const url = new URL(`${BASE_URL}/stocks/bars`);
    url.searchParams.set('symbols', args.symbol);
    url.searchParams.set('timeframe', alpacaTimeframe(args.timeframe));
    url.searchParams.set('limit', String(args.limit));
    url.searchParams.set('adjustment', process.env.ALPACA_ADJUSTMENT || 'split');
    url.searchParams.set('sort', 'asc');
    url.searchParams.set('feed', process.env.ALPACA_DATA_FEED || 'iex');
    if (args.startTs) {
      url.searchParams.set('start', new Date(args.startTs).toISOString());
    }
    if (args.endTs) {
      url.searchParams.set('end', new Date(args.endTs).toISOString());
    }
    if (pageToken) {
      url.searchParams.set('page_token', pageToken);
    }

    const response = await fetchJson(url.toString(), { headers });
    const bars = response?.bars?.[args.symbol] || [];
    allBars.push(...bars);
    pageToken = response?.next_page_token || null;
    pages++;
  } while (pageToken && pages < MAX_PAGES);

  if (allBars.length === 0) {
    return [];
  }

  return allBars.map(bar => ({
    openTime: new Date(bar.t).getTime(),
    open: bar.o,
    high: bar.h,
    low: bar.l,
    close: bar.c,
    volume: bar.v
  })).sort((a, b) => a.openTime - b.openTime);
}

module.exports = {
  fetchAlpacaBaseCandles,
  alpacaTimeframe,
  normalizeAlpacaArgs,
};
