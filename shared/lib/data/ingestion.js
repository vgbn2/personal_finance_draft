const fs = require('node:fs/promises');
const path = require('node:path');
const { 
  fetchBinanceBaseCandles, 
  fetchYahooBaseCandles,
  fetchFrankfurterFx,
  fetchFredLatest,
  fetchWorldBankLatest,
  fetchKalshiPredictionEvent,
  fetchAlternativeMeFearGreed,
} = require('../providers');
const { DEFAULT_SNAPSHOT } = require('../runtime/paths');

const CACHE_PATH = DEFAULT_SNAPSHOT;

const FAMILIES_MANIFEST = [
  { id: 'equities', fetcher: async (p, s, t) => fetchYahooBaseCandles(s, t) },
  { id: 'crypto', fetcher: async (p, s, t) => fetchBinanceBaseCandles(s, 1000, t) },
  { id: 'fx', fetcher: async (p, s, t) => [await fetchFrankfurterFx(s)] },
  { id: 'macro', fetcher: async (p, s, t) => [await fetchFredLatest(s)] },
  { id: 'sentiment', fetcher: async (p, s, t) => [await fetchAlternativeMeFearGreed()] },
];

async function runIngestBatch(config, options = {}) {
  const snapshot = {
    mode: 'live',
    fetched_at: new Date().toISOString(),
    sources: [],
    errors: [],
    provider_checks: []
  };

  for (const family of FAMILIES_MANIFEST) {
    if (options.family && options.family !== family.id) continue;
    const section = config[family.id];
    if (!section || !section.enabled) continue;

    for (const symbol of section.symbols || ['default']) {
       try {
         const records = await family.fetcher(section.providers[0], symbol, section.timeframes?.[0] || '1d');
         snapshot.sources.push(...records.map(r => ({ ...r, family: family.id, symbol })));
         snapshot.provider_checks.push({ family: family.id, provider: section.providers[0], status: 'ok' });
       } catch (e) {
         snapshot.errors.push({ family: family.id, message: e.message });
       }
    }
  }

  return snapshot;
}

module.exports = {
  FAMILIES_MANIFEST,
  runIngestBatch
};
