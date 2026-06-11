const { fetchJson } = require('./common');

/**
 * ECB (European Central Bank) FX Provider.
 * Primary source for reference exchange rates.
 * Note: ECB primarily publishes rates against EUR.
 */

async function fetchEcbFx(symbol) {
  // Use Frankfurter as the primary reliable JSON gateway to ECB data.
  // This allows us to keep using fetchJson and standard normalization.
  const pair = String(symbol || '').trim().toUpperCase();
  if (pair.length !== 6) throw new Error(`Invalid FX pair: ${symbol}`);
  
  const base = pair.slice(0, 3);
  const quote = pair.slice(3);
  
  // ECB's official XML is complex to parse without extra dependencies.
  // Frankfurter is the community-standard open-source bridge to ECB data.
  const url = `https://api.frankfurter.dev/v1/latest?base=${base}&symbols=${quote}`;
  
  try {
    const data = await fetchJson(url);
    const rate = Number(data.rates?.[quote]);
    if (!Number.isFinite(rate)) throw new Error('Invalid rate returned');

    return {
      family: 'fx',
      provider: 'ecb', // Label as ECB since it's the underlying data source
      symbol: pair,
      timeframe: '1d',
      timestamp: data.date ? new Date(`${data.date}T00:00:00Z`).toISOString() : new Date().toISOString(),
      close: rate,
      price: rate,
      source: 'ecb-frankfurter',
    };
  } catch (err) {
    throw new Error(`ECB fetch failed: ${err.message}`);
  }
}

async function fetchEcbHistory(symbol, days = 90) {
  const pair = String(symbol || '').trim().toUpperCase();
  if (pair.length !== 6) throw new Error(`Invalid FX pair: ${symbol}`);
  
  const base = pair.slice(0, 3);
  const quote = pair.slice(3);
  
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - days);
  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];

  const url = `https://api.frankfurter.dev/v1/${startStr}..${endStr}?base=${base}&symbols=${quote}`;
  
  try {
    const data = await fetchJson(url);
    if (!data.rates) throw new Error('No historical rates returned');

    return Object.entries(data.rates).map(([date, rates]) => {
      const rate = Number(rates[quote]);
      return {
        family: 'fx',
        provider: 'ecb',
        symbol: pair,
        timeframe: '1d',
        timestamp: new Date(`${date}T00:00:00Z`).toISOString(),
        open: rate,
        high: rate,
        low: rate,
        close: rate,
        price: rate,
        volume: 0,
        source: 'ecb-frankfurter',
      };
    });
  } catch (err) {
    throw new Error(`ECB history fetch failed: ${err.message}`);
  }
}

module.exports = {
  fetchEcbFx,
  fetchEcbHistory,
};
