const { fetchJson } = require('./common');

async function fetchKalshiPredictionEvent(eventTicker) {
  const url = `https://external-api.kalshi.com/trade-api/v2/events/${eventTicker}`;
  return fetchJson(url);
}

async function fetchPolymarketHistoricalPrices(slug) {
    // gamma-api.polymarket.com logic
}

async function fetchAlternativeMeFearGreed() {
  const url = 'https://api.alternative.me/fng/?limit=1';
  const data = await fetchJson(url);
  const val = data.data?.[0];
  return {
    family: 'sentiment',
    provider: 'alternative_me',
    symbol: 'fear_and_greed',
    metric: 'fear_and_greed',
    value: parseInt(val.value),
    classification: val.value_classification,
    timestamp: new Date(val.timestamp * 1000).toISOString()
  };
}

module.exports = {
  fetchKalshiPredictionEvent,
  fetchAlternativeMeFearGreed
};
