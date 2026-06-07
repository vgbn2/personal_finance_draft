const { fetchJson } = require('./common');

const FRANKFURTER_ENDPOINTS = [
  {
    name: 'frankfurter_dev_v1',
    latest: (pair) => `https://api.frankfurter.dev/v1/latest?base=${pair.base}&symbols=${pair.quote}`,
    history: (pair, start, end) => `https://api.frankfurter.dev/v1/${start}..${end}?base=${pair.base}&symbols=${pair.quote}`,
  },
  {
    name: 'frankfurter_app_legacy',
    latest: (pair) => `https://api.frankfurter.app/latest?from=${pair.base}&to=${pair.quote}`,
    history: (pair, start, end) => `https://api.frankfurter.app/${start}..${end}?from=${pair.base}&to=${pair.quote}`,
  },
];

function resolveCurrencyPair(symbol) {
  const normalized = String(symbol || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
  if (normalized.length !== 6) {
    throw new Error(`Unsupported FX symbol format: ${symbol}`);
  }
  return {
    base: normalized.slice(0, 3),
    quote: normalized.slice(3),
    symbol: normalized,
  };
}

async function fetchFrankfurterJson(pair, urlFactory, ...args) {
  const errors = [];
  for (const endpoint of FRANKFURTER_ENDPOINTS) {
    const url = urlFactory(endpoint, ...args);
    try {
      return { data: await fetchJson(url), sourceUrl: url };
    } catch (error) {
      errors.push(`${endpoint.name}: ${error.message}`);
    }
  }
  throw new Error(`Frankfurter fetch failed for ${pair.symbol}: ${errors.join('; ')}`);
}

async function fetchFrankfurterFx(symbol) {
  const pair = resolveCurrencyPair(symbol);
  const { data, sourceUrl } = await fetchFrankfurterJson(pair, (endpoint) => endpoint.latest(pair));
  const rate = Number(data.rates?.[pair.quote]);
  if (!Number.isFinite(rate)) {
    throw new Error(`Frankfurter response missing rate for ${pair.symbol}`);
  }
  return {
    family: 'fx',
    provider: 'frankfurter',
    symbol: pair.symbol,
    timeframe: '1d',
    timestamp: data.date ? new Date(`${data.date}T00:00:00Z`).toISOString() : new Date().toISOString(),
    close: rate,
    price: rate,
    source: 'frankfurter',
    source_url: sourceUrl,
  };
}

async function fetchFrankfurterHistory(symbol, days = 365) {
  const pair = resolveCurrencyPair(symbol);
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - days);
  
  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];
  
  const { data, sourceUrl } = await fetchFrankfurterJson(
    pair,
    (endpoint, start, end) => endpoint.history(pair, start, end),
    startStr,
    endStr
  );
  
  if (!data.rates) {
    throw new Error(`Frankfurter history response missing rates for ${pair.symbol}`);
  }
  
  return Object.entries(data.rates).map(([date, rates]) => {
    const rate = Number(rates[pair.quote]);
    return {
      family: 'fx',
      provider: 'frankfurter',
      symbol: pair.symbol,
      timeframe: '1d',
      timestamp: new Date(`${date}T00:00:00Z`).toISOString(),
      open: rate,
      high: rate,
      low: rate,
      close: rate,
      price: rate,
      volume: 0,
      source: 'frankfurter',
      source_url: sourceUrl,
    };
  });
}

module.exports = {
  resolveCurrencyPair,
  fetchFrankfurterFx,
  fetchFrankfurterHistory,
};
