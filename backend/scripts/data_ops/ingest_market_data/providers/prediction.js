const { fetchKalshiPredictionEvent, fetchJson } = require('../../../../../shared/lib/providers');

const {
  KALSHI_API_BASE,
  POLYMARKET_GAMMA_BASE,
  POLYMARKET_CLOB_BASE,
  KALSHI_EVENT_KEYWORDS,
  POLYMARKET_EVENT_KEYWORDS,
} = require('../constants');

// redactUrl lives in index.js (it needs SENSITIVE_QUERY_PARAMS, which is private to that
// file). Lazy-required at call time so this module never requires index.js at load time
// (index.js requires this module at its own top level — a top-level require here would
// be circular).
function redactUrl(value) {
  const { redactUrl: redact } = require('../index.js');
  return redact(value);
}

function impliedProbability(market) {
  const values = [
    market.yes_bid,
    market.yes_ask,
    market.last_price,
    market.yes_bid_dollars,
    market.yes_ask_dollars,
    market.last_price_dollars,
  ]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  if (values.length === 0) {
    return null;
  }

  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return average > 1 ? average / 100 : average;
}

async function fetchGoogleCustomSearchInterest(query) {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_CSE_ID || process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID;
  if (!apiKey || !cx) {
    throw new Error('Google Custom Search credentials not configured');
  }

  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('cx', cx);
  url.searchParams.set('q', query);
  url.searchParams.set('num', '10');

  const payload = await fetchJson(url.toString());
  const totalResults = Number(payload?.searchInformation?.totalResults || 0);
  const items = Array.isArray(payload.items) ? payload.items : [];
  const relevanceSignals = items.map((item) => String(item.title || item.snippet || '').toLowerCase());
  const keywordHits = relevanceSignals.reduce((count, text) => count + (text.includes(String(query).toLowerCase()) ? 1 : 0), 0);
  const interestScore = Math.max(0, Math.min(1,
    (Math.log10(totalResults + 1) / 10) + (items.length / 50) + (keywordHits / 20),
  ));

  return {
    family: 'sentiment',
    provider: 'google_custom_search',
    symbol: query.replace(/\s+/g, '_').toLowerCase(),
    metric: 'search_interest',
    timestamp: new Date().toISOString(),
    value: Number(interestScore.toFixed(3)),
    search_query: query,
    search_total_results: totalResults,
    result_count: items.length,
    source_url: redactUrl(url.toString()),
  };
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseJsonList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function eventKeywords(eventName, provider, config) {
  const mappings = config.prediction_market_keywords || {};
  const defaults = provider === 'polymarket' ? POLYMARKET_EVENT_KEYWORDS : KALSHI_EVENT_KEYWORDS;
  return mappings[eventName] || defaults[eventName] || [String(eventName || '').replace(/_/g, ' ')];
}

function matchesPredictionEvent(record, eventName, provider, config) {
  const keywords = eventKeywords(eventName, provider, config).filter(Boolean);
  const text = [
    record.title,
    record.subtitle,
    record.ticker,
    record.event_ticker,
    record.question,
    record.slug,
    record.description,
  ].filter(Boolean).join(' ').toLowerCase();
  return keywords.some((keyword) => text.includes(String(keyword).toLowerCase()));
}

function kalshiMarketRecord(eventName, market, sourceUrl) {
  return {
    family: 'prediction_market',
    provider: 'kalshi',
    symbol: eventName || market.ticker,
    market_ticker: market.ticker,
    event_ticker: market.event_ticker || null,
    title: market.title || market.yes_sub_title || null,
    timestamp: market.updated_time || market.close_time || market.open_time || new Date().toISOString(),
    value: impliedProbability(market),
    result: market.result || null,
    status: market.status || null,
    volume_fp: numberOrNull(market.volume_fp),
    volume_24h_fp: numberOrNull(market.volume_24h_fp),
    open_interest_fp: numberOrNull(market.open_interest_fp),
    regulatory_venue: 'cftc_dcm',
    source_url: sourceUrl,
  };
}

async function fetchKalshiPredictionMarket(eventName, config) {
  const direct = String(eventName || '').trim();
  if (/^[A-Z0-9-]+$/.test(direct)) {
    const sourceUrl = `${KALSHI_API_BASE}/events/${direct}`;
    return kalshiMarketRecord(eventName, await fetchKalshiPredictionEvent(direct, config), sourceUrl);
  }

  const url = new URL(`${KALSHI_API_BASE}/markets`);
  url.searchParams.set('limit', '200');
  url.searchParams.set('status', 'open');
  const payload = await fetchJson(url.toString());
  const markets = Array.isArray(payload?.markets) ? payload.markets : [];
  const match = markets.find((market) => matchesPredictionEvent(market, eventName, 'kalshi', config));
  if (!match) {
    return null;
  }
  return kalshiMarketRecord(eventName, match, redactUrl(url.toString()));
}

function parsePolymarketTokenIds(market = {}) {
  const candidates = [
    market.clobTokenIds,
    market.clob_token_ids,
    market.clobTokenIDs,
    market.tokenIds,
    market.token_ids,
  ];
  for (const value of candidates) {
    const parsed = parseJsonList(value).map(String).filter(Boolean);
    if (parsed.length > 0) return [...new Set(parsed)];
    if (Array.isArray(value)) return [...new Set(value.map(String).filter(Boolean))];
  }

  const tokens = Array.isArray(market.tokens) ? market.tokens : [];
  const tokenIds = tokens
    .map((token) => token.token_id || token.tokenId || token.id)
    .map(String)
    .filter(Boolean);
  return [...new Set(tokenIds)];
}

function polymarketMarketRecord(eventName, market, sourceUrl) {
  const price = numberOrNull(
    market.lastTradePrice ??
    market.last_trade_price ??
    market.bestAsk ??
    market.bestBid ??
    market.outcomePrice
  );
  return {
    family: 'prediction_market',
    provider: 'polymarket',
    symbol: eventName || market.slug || market.id,
    market_id: market.id || null,
    condition_id: market.conditionId || market.condition_id || null,
    question: market.question || market.title || null,
    timestamp: market.updatedAt || market.updated_at || market.endDate || market.end_date || new Date().toISOString(),
    value: price,
    status: market.active === false ? 'inactive' : (market.closed ? 'closed' : 'active'),
    volume: numberOrNull(market.volume ?? market.volumeNum),
    liquidity: numberOrNull(market.liquidity ?? market.liquidityNum),
    clob_token_ids: parsePolymarketTokenIds(market),
    source_url: sourceUrl,
  };
}

function polymarketHistoryPoints(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.history)) return payload.history;
  if (Array.isArray(payload?.prices)) return payload.prices;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function polymarketPriceHistoryRecords(symbol, market, tokenId, payload, options = {}, sourceUrl = '') {
  const timeframe = polymarketTimeframeFromOptions(options);
  const marketId = market.id || market.market_id || market.conditionId || market.condition_id || tokenId;
  return polymarketHistoryPoints(payload)
    .map((point) => predictionCandleRecord('polymarket', symbol, marketId, point, timeframe, sourceUrl, {
      token_id: tokenId,
      condition_id: market.conditionId || market.condition_id || null,
      question: market.question || market.title || null,
    }))
    .filter((record) => record.close !== null && !Number.isNaN(Date.parse(record.timestamp)));
}
function predictionCandleRecord(provider, symbol, marketId, candle, timeframe, sourceUrl, extra = {}) {
  const price = candle.price || candle.yes_bid || candle.yes_ask || {};
  const open = numberOrNull(price.open ?? candle.p);
  const high = numberOrNull(price.high ?? candle.p);
  const low = numberOrNull(price.low ?? candle.p);
  const close = numberOrNull(price.close ?? candle.p);
  const unixSeconds = Number(candle.end_period_ts ?? candle.t);
  return {
    family: 'prediction_market',
    provider,
    symbol,
    market_id: marketId,
    timeframe,
    timestamp: new Date(unixSeconds * 1000).toISOString(),
    open,
    high,
    low,
    close,
    volume: numberOrNull(candle.volume) || 0,
    open_interest: numberOrNull(candle.open_interest),
    source: `${provider}-${timeframe}-prediction-history`,
    source_url: redactUrl(sourceUrl),
    ...extra,
  };
}

function polymarketTimeframeFromOptions(options = {}) {
  if (options.timeframe) return options.timeframe;
  if (options.interval === '1d') return '1d';
  const fidelity = Math.max(1, Math.floor(Number(options.fidelity) || 60));
  if (fidelity >= 1440) return '1d';
  if (fidelity % 60 === 0) return `${fidelity / 60}h`;
  return `${fidelity}m`;
}

async function fetchPredictionInterestSignal(eventName, provider = 'google_custom_search') {
  if (provider !== 'google_custom_search') {
    throw new Error(`Unsupported prediction interest provider: ${provider}`);
  }
  const query = String(eventName || '').replace(/_/g, ' ');
  return fetchGoogleCustomSearchInterest(query);
}

async function fetchPolymarketMarkets(eventName, config = {}, options = {}) {
  const url = new URL(`${POLYMARKET_GAMMA_BASE}/markets`);
  url.searchParams.set('limit', String(options.limit || 200));
  if (options.active !== false) url.searchParams.set('active', 'true');
  if (options.closed === false) url.searchParams.set('closed', 'false');

  const payload = await fetchJson(url.toString());
  const markets = Array.isArray(payload) ? payload : (Array.isArray(payload?.markets) ? payload.markets : []);
  return markets
    .filter((market) => matchesPredictionEvent(market, eventName, 'polymarket', config))
    .slice(0, options.maxMarkets || 3)
    .map((market) => polymarketMarketRecord(eventName, market, redactUrl(url.toString())));
}

async function fetchPolymarketPriceHistory(tokenId, options = {}) {
  if (!tokenId) return { payload: { history: [] }, sourceUrl: '' };
  const url = new URL(`${POLYMARKET_CLOB_BASE}/prices-history`);
  url.searchParams.set('market', tokenId);
  url.searchParams.set('interval', options.interval || 'max');
  url.searchParams.set('fidelity', String(options.fidelity || 60));
  if (options.startTs) url.searchParams.set('startTs', String(options.startTs));
  if (options.endTs) url.searchParams.set('endTs', String(options.endTs));
  return {
    payload: await fetchJson(url.toString()),
    sourceUrl: redactUrl(url.toString()),
  };
}

async function fetchPolymarketHistoricalPrices(eventName, config = {}, options = {}) {
  const markets = await fetchPolymarketMarkets(eventName, config, options);
  const records = [];
  for (const marketRecord of markets) {
    const tokenIds = marketRecord.clob_token_ids || [];
    for (const tokenId of tokenIds.slice(0, options.maxTokens || 1)) {
      const { payload, sourceUrl } = await fetchPolymarketPriceHistory(tokenId, options);
      records.push(...polymarketPriceHistoryRecords(eventName, marketRecord, tokenId, payload, options, sourceUrl));
    }
  }
  return records;
}

module.exports = {
  impliedProbability,
  fetchGoogleCustomSearchInterest,
  numberOrNull,
  parseJsonList,
  eventKeywords,
  matchesPredictionEvent,
  kalshiMarketRecord,
  fetchKalshiPredictionMarket,
  parsePolymarketTokenIds,
  polymarketMarketRecord,
  polymarketHistoryPoints,
  polymarketPriceHistoryRecords,
  predictionCandleRecord,
  polymarketTimeframeFromOptions,
  fetchPredictionInterestSignal,
  fetchPolymarketMarkets,
  fetchPolymarketPriceHistory,
  fetchPolymarketHistoricalPrices,
};
