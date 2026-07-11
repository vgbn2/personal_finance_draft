const {
  fetchFinnhubSnapshot,
  fetchTwelveDataSnapshot,
  fetchFredHistory,
  fetchFredLatest,
  fetchNasaPowerWeather,
  fetchAlternativeMeFearGreed,
  fetchWorldBankHistory,
  fetchWorldBankLatest,
  fetchFrankfurterHistory,
  fetchFrankfurterFx,
  fetchEcbFx,
  fetchEcbHistory,
} = require('../../../../shared/lib/providers');

const {
  fetchPolymarketMarkets,
  fetchPolymarketHistoricalPrices,
  fetchKalshiPredictionMarket,
} = require('./providers/prediction.js');

// These cross back into index.js (the "not extractable" snapshot fetchers + the two
// resolver helpers, which are tangled with provider-chain logic that stays put). index.js
// requires this module at its own top level, so a top-level require here would be
// circular — lazy-require on every call instead (cheap: Node caches the module).
function fetchEquityOrIndexSnapshot(...args) {
  return require('./index.js').fetchEquityOrIndexSnapshot(...args);
}
function fetchCommoditySnapshot(...args) {
  return require('./index.js').fetchCommoditySnapshot(...args);
}
function fetchFxSnapshot(...args) {
  return require('./index.js').fetchFxSnapshot(...args);
}
function fetchCryptoSnapshot(...args) {
  return require('./index.js').fetchCryptoSnapshot(...args);
}
function fetchYahooOptionsSnapshot(...args) {
  return require('./index.js').fetchYahooOptionsSnapshot(...args);
}
function resolveFredSeries(...args) {
  return require('./index.js').resolveFredSeries(...args);
}
function resolveWorldBankIndicator(...args) {
  return require('./index.js').resolveWorldBankIndicator(...args);
}

function notImplementedProvider(provider, family) {
  const err = new Error(`${provider} ${family} provider is not implemented`);
  err.code = 'not_implemented';
  err.provider = provider;
  err.family = family;
  throw err;
}

// Provider adapters that still need full extraction share this narrow boundary.
async function fetchOpenSkyRegion() { return notImplementedProvider('opensky', 'flight'); }
async function fetchBlockchairStats() { return notImplementedProvider('blockchair', 'crypto_tx'); }
async function fetchBlockchairOnchain() { return notImplementedProvider('blockchair', 'onchain'); }
async function fetchSecHoldingsSnapshot() { return notImplementedProvider('sec', 'holdings'); }
async function fetchSpGlobalFlashPmi() { return notImplementedProvider('spglobal', 'pmi'); }
async function fetchFxApiFx() { return notImplementedProvider('fxapi', 'fx'); }
async function fetchYahooBreadthProxy() { return notImplementedProvider('yahoo', 'breadth'); }
// fetchKalshiHistoricalCandlesticks callers spread the result directly, so [] is the
// correct empty shape. fetchKalshiHistoricalMarkets callers destructure { records }, so
// a bare [] crashes with "records is not iterable" -- return the shape callers expect.
async function fetchKalshiHistoricalMarkets() { return { records: [] }; }
async function fetchKalshiHistoricalCandlesticks() { return []; }

const FAMILIES_MANIFEST = [
  { id: 'equities', configKey: 'equities', itemsKey: 'symbols', fetcher: async (p, s, t, cfg, opts) => {
        if (p === 'tradingview') {
          const { fetchTradingViewQuotes } = require('../../../../shared/lib/providers/tradingview');
          return fetchTradingViewQuotes([s]);
        }
        if (p === 'finnhub') return fetchFinnhubSnapshot('equities', s, t, opts);
        if (p === 'twelve') return fetchTwelveDataSnapshot('equities', s, t, opts);
        return fetchEquityOrIndexSnapshot('equities', p, s, t, cfg, opts);
      }
    },
  { id: 'indices', configKey: 'indices', itemsKey: 'symbols', fetcher: async (p, s, t, cfg, opts) => {
        if (p === 'tradingview') {
          const { fetchTradingViewQuotes } = require('../../../../shared/lib/providers/tradingview');
          return fetchTradingViewQuotes([s]);
        }
        if (p === 'twelve') return fetchTwelveDataSnapshot('indices', s, t, opts);
        if (p === 'fred') {
          const id = resolveFredSeries('indices', s, cfg);
          if (!id) throw new Error(`No FRED series mapping for ${s}`);
          if (opts?.historyDays) {
              const records = await fetchFredHistory(id, opts.historyDays);
            return records.map(r => ({ ...r, family: 'indices', symbol: s }));
        }
        return [{ ...await fetchFredLatest(id), family: 'indices', symbol: s }];
      }
      return fetchEquityOrIndexSnapshot('indices', p, s, t, cfg, opts);
    }
  },
  { id: 'commodities', configKey: 'commodities', itemsKey: 'symbols', fetcher: async (p, s, t, cfg, opts) => {
        if (p === 'tradingview') {
          const { fetchTradingViewQuotes } = require('../../../../shared/lib/providers/tradingview');
          return fetchTradingViewQuotes([s]);
        }
        if (p === 'twelve') return fetchTwelveDataSnapshot('commodities', s, t, opts);
        return fetchCommoditySnapshot('commodities', p, s, t, cfg, opts);
      }
    },
  { id: 'fx', configKey: 'fx', itemsKey: 'symbols', fetcher: async (p, s, t, cfg, opts) => {
      if (p === 'tradingview') {
        const { fetchTradingViewQuotes } = require('../../../../shared/lib/providers/tradingview');
        return fetchTradingViewQuotes([s]);
      }
        if (p === 'yahoo') return fetchFxSnapshot('fx', p, s, t, cfg, opts);
        if (p === 'frankfurter') {
          if (opts?.historyDays) {
            return fetchFrankfurterHistory(s, opts.historyDays);
          }
          return [await fetchFrankfurterFx(s)];
        }
        if (p === 'finnhub') return fetchFinnhubSnapshot('fx', s, t, opts);
        if (p === 'twelve') return fetchTwelveDataSnapshot('fx', s, t, opts);
        if (p === 'fxapi') return [await fetchFxApiFx(s)];
        if (p === 'ecb') {
          if (opts?.historyDays) {
            return fetchEcbHistory(s, opts.historyDays);
          }
          return [await fetchEcbFx(s)];
        }
        return [await fetchEcbFx(s)];
      }
    },
  { id: 'crypto', configKey: 'crypto', itemsKey: 'symbols', fetcher: async (p, s, t, cfg, opts) => {
        if (p === 'tradingview') {
          const { fetchTradingViewQuotes } = require('../../../../shared/lib/providers/tradingview');
          return fetchTradingViewQuotes([s]);
        }
        if (p === 'finnhub') return fetchFinnhubSnapshot('crypto', s, t, opts);
        if (p === 'twelve') return fetchTwelveDataSnapshot('crypto', s, t, opts);
        return fetchCryptoSnapshot(p, s, t, 'crypto', opts);
      }
    },
  { id: 'pmi', configKey: 'pmi', itemsKey: 'series', fetcher: async (p, s, t, cfg) => fetchSpGlobalFlashPmi() },
  { id: 'macro', configKey: 'macro', itemsKey: 'series', fetcher: async (p, s, t, cfg, opts) => {
      const id = resolveFredSeries('macro', s, cfg);
      if (!id) throw new Error(`No FRED series mapping for ${s}`);
      if (opts?.historyDays) {
        const records = await fetchFredHistory(id, opts.historyDays);
        return records.map(r => ({ ...r, family: 'macro', series: s }));
      }
      return [{ ...await fetchFredLatest(id), family: 'macro', series: s }];
    }
  },
  { id: 'weather', configKey: 'weather', itemsKey: 'locations', fetcher: (p, s, t, cfg) => fetchNasaPowerWeather(s).then(r => [r]) },
  { id: 'flight', configKey: 'flight', itemsKey: 'regions', fetcher: (p, s, t, cfg) => fetchOpenSkyRegion(s).then(r => [r]) },
  { id: 'crypto_tx', configKey: 'crypto_tx', itemsKey: 'chains', fetcher: (p, s, t, cfg) => fetchBlockchairStats(s).then(r => [r]) },
  { id: 'sentiment', configKey: 'sentiment', itemsKey: null, fetcher: (p, s, t, cfg) => fetchAlternativeMeFearGreed().then(r => [r]) },
  { id: 'holdings', configKey: 'holdings', itemsKey: 'symbols', fetcher: (p, s, t, cfg) => fetchSecHoldingsSnapshot(s, cfg).then(r => [r]) },
  { id: 'reserves', configKey: 'reserves', itemsKey: 'countries', fetcher: async (p, s, t, cfg, opts) => {
      const results = [];
      for (const m of cfg.reserves.metrics) {
        const indicator = resolveWorldBankIndicator(m, cfg);
        if (opts?.historyDays) {
          const records = await fetchWorldBankHistory(s, indicator, opts.historyDays);
          results.push(...records.map(r => ({ ...r, family: 'reserves', country: s, metric: m })));
        } else {
          results.push({ ...await fetchWorldBankLatest(s, indicator, cfg), family: 'reserves', country: s, metric: m });
        }
      }
      return results;
    }
  },
  { id: 'onchain', configKey: 'onchain', itemsKey: 'chains', fetcher: (p, s, t, cfg) => fetchBlockchairOnchain(s).then(r => [r]) },
  { id: 'breadth', configKey: 'breadth', itemsKey: 'metrics', fetcher: (p, s, t, cfg) => fetchYahooBreadthProxy(s, cfg).then(r => [r]) },
  { id: 'prediction_market', configKey: 'prediction_market', itemsKey: 'events', fetcher: async (p, s, t, cfg, opts) => {
      if (p === 'polymarket') {
        if (opts?.historyDays || opts?.history || opts?.backfill) {
          return fetchPolymarketHistoricalPrices(s, cfg, opts);
        }
        return fetchPolymarketMarkets(s, cfg, opts);
      }
      if (opts?.historyDays || opts?.history || opts?.backfill) {
        return [];
      }
      const record = await fetchKalshiPredictionMarket(s, cfg);
      return record ? [record] : [];
    }
  },
];

const OPTIONS_MANIFEST = [
  { id: 'equities_options', configKey: 'equities_options', itemsKey: 'underlyings', fetcher: (p, s, t, cfg) => fetchYahooOptionsSnapshot('equities_options', p, s) },
  { id: 'stock_options', configKey: 'stock_options', itemsKey: 'underlyings', fetcher: (p, s, t, cfg) => fetchYahooOptionsSnapshot('stock_options', p, s) },
];

module.exports = {
  notImplementedProvider,
  fetchOpenSkyRegion,
  fetchBlockchairStats,
  fetchBlockchairOnchain,
  fetchSecHoldingsSnapshot,
  fetchSpGlobalFlashPmi,
  fetchEcbFx,
  fetchFxApiFx,
  fetchYahooBreadthProxy,
  fetchKalshiHistoricalMarkets,
  fetchKalshiHistoricalCandlesticks,
  FAMILIES_MANIFEST,
  OPTIONS_MANIFEST,
};
