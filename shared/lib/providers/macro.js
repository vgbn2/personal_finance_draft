const { fetchJson } = require('./common');

async function fetchFredLatest(seriesId) {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) throw new Error('FRED_API_KEY missing');

  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=1`;
  const data = await fetchJson(url);
  const obs = data.observations?.[0];
  if (!obs) throw new Error(`No observations for FRED series ${seriesId}`);

  return {
    provider: 'fred',
    series_id: seriesId,
    timestamp: new Date(obs.date).toISOString(),
    value: parseFloat(obs.value),
    source: 'fred',
  };
}

async function fetchWorldBankLatest(country, indicator) {
  const url = `https://api.worldbank.org/v2/country/${country}/indicator/${indicator}?format=json&per_page=60`;
  const data = await fetchJson(url);
  const val = (data[1] || []).find((row) => row && row.value !== null && row.value !== undefined);
  if (!val) throw new Error(`No World Bank data for ${country}:${indicator}`);

  return {
    provider: 'world_bank',
    country,
    indicator,
    timestamp: new Date(`${val.date}-01-01`).toISOString(),
    value: parseFloat(val.value),
    source: 'worldbank',
  };
}

async function fetchFredHistory(seriesId, days) {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) throw new Error('FRED_API_KEY missing');

  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&observation_start=${startDate}`;
  const data = await fetchJson(url);
  const obs = data.observations;
  if (!obs || obs.length === 0) throw new Error(`No observations for FRED series ${seriesId}`);

  return obs.map(o => ({
    provider: 'fred',
    series_id: seriesId,
    timestamp: new Date(o.date).toISOString(),
    value: parseFloat(o.value),
    source: 'fred',
  }));
}

async function fetchWorldBankHistory(country, indicator, days) {
  const startYear = new Date(Date.now() - days * 24 * 60 * 60 * 1000).getFullYear();
  const endYear = new Date().getFullYear();
  const url = `https://api.worldbank.org/v2/country/${country}/indicator/${indicator}?format=json&date=${startYear}:${endYear}`;
  const data = await fetchJson(url);
  const vals = data[1];
  if (!vals || vals.length === 0) throw new Error(`No World Bank data for ${country}:${indicator}`);

  return vals.filter(v => v.value !== null).map(v => ({
    provider: 'world_bank',
    country,
    indicator,
    timestamp: new Date(v.date.includes('M') ? v.date.replace('M', '-') + '-01' : `${v.date}-01-01`).toISOString(),
    value: parseFloat(v.value),
    source: 'worldbank',
  }));
}

module.exports = {
  fetchFredLatest,
  fetchWorldBankLatest,
  fetchFredHistory,
  fetchWorldBankHistory,
};