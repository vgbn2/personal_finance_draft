const { fetchJson, redactUrl } = require('./common');

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

async function fetchPredictionInterestSignal(eventName, provider = 'google_custom_search') {
  if (provider !== 'google_custom_search') {
    throw new Error(`Unsupported prediction interest provider: ${provider}`);
  }
  const query = String(eventName || '').replace(/_/g, ' ');
  return fetchGoogleCustomSearchInterest(query);
}

module.exports = {
  fetchGoogleCustomSearchInterest,
  fetchPredictionInterestSignal
};
