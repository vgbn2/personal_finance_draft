'use strict';

// Historical crypto-market aggregates reconstructed from per-coin market-cap series.
//
// CoinGecko's free /global endpoint is snapshot-only, so the cross-family ML feature
// layer reconstructs total crypto market cap, BTC dominance, and stablecoin market cap
// by summing per-coin market_caps (from /market_chart) and aligning by UTC day. These
// are a "tracked-universe" proxy of the true global totals, but their RETURNS — which is
// what the regime classifier consumes — track the global aggregates very closely.

const { fetchCoinGeckoMcapSeries } = require('../providers/coingecko');

// Representative non-stable universe (BTC/ETH dominate total mcap; the long tail adds
// little but improves the proxy). Extend as the traded universe grows.
const DEFAULT_UNIVERSE = [
  'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'DOGE', 'ADA', 'AVAX',
  'LINK', 'TRX', 'DOT', 'SUI', 'NEAR', 'POL',
];
const DEFAULT_STABLECOINS = ['USDT', 'USDC', 'DAI'];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Builds historical crypto-aggregate series.
 *
 * @param {object} [opts]
 * @param {string[]} [opts.universe]     non-stable coins summed into total mcap
 * @param {string[]} [opts.stablecoins]  stablecoins summed into stablecoin mcap
 * @param {number}   [opts.days]         days of history (>=365 => daily granularity)
 * @param {number}   [opts.throttleMs]   delay between CoinGecko calls (free-tier rate limit)
 * @param {number}   [opts.minCoins]     min coins present on a day to emit that day
 * @param {(symbol:string, days:number)=>Promise<Map<string,number>>} [opts.fetchMcapSeries] injectable fetcher
 * @returns {Promise<{total_mcap:Array, btc_dominance:Array, stablecoin_mcap:Array, meta:object}>}
 */
async function buildCryptoAggregateSeries(opts = {}) {
  const universe = opts.universe || DEFAULT_UNIVERSE;
  const stablecoins = opts.stablecoins || DEFAULT_STABLECOINS;
  const days = opts.days || 365;
  const throttleMs = opts.throttleMs != null ? opts.throttleMs : 1500;
  const minCoins = opts.minCoins || Math.ceil(universe.length / 2);
  const fetchMcap = opts.fetchMcapSeries || fetchCoinGeckoMcapSeries;

  const all = [...new Set([...universe, ...stablecoins])];
  const stableSet = new Set(stablecoins.map((s) => s.toUpperCase()));
  const universeSet = new Set(universe.map((s) => s.toUpperCase()));

  // symbol -> Map(date -> mcap)
  const seriesBySymbol = new Map();
  const errors = [];
  for (let i = 0; i < all.length; i += 1) {
    const sym = all[i];
    try {
      seriesBySymbol.set(sym.toUpperCase(), await fetchMcap(sym, days));
    } catch (err) {
      errors.push({ symbol: sym, error: err.message });
    }
    if (throttleMs && i < all.length - 1) await sleep(throttleMs);
  }

  // Union of all dates seen.
  const dates = new Set();
  for (const m of seriesBySymbol.values()) for (const d of m.keys()) dates.add(d);

  const total = [];
  const dominance = [];
  const stable = [];
  for (const date of [...dates].sort()) {
    let totalMcap = 0;
    let stableMcap = 0;
    let coinCount = 0;
    let btcMcap = null;
    for (const [sym, m] of seriesBySymbol) {
      const v = m.get(date);
      if (!Number.isFinite(v)) continue;
      totalMcap += v;
      if (sym === 'BTC') btcMcap = v;
      if (stableSet.has(sym)) stableMcap += v;
      if (universeSet.has(sym)) coinCount += 1;
    }
    // Need BTC (for dominance) and a quorum of universe coins to avoid sparse-day skew.
    if (btcMcap == null || coinCount < minCoins || totalMcap <= 0) continue;
    total.push({ date, value: totalMcap });
    dominance.push({ date, value: btcMcap / totalMcap });
    stable.push({ date, value: stableMcap });
  }

  return {
    total_mcap: total,
    btc_dominance: dominance,
    stablecoin_mcap: stable,
    meta: {
      universe,
      stablecoins,
      days,
      coins_fetched: seriesBySymbol.size,
      days_emitted: total.length,
      errors,
    },
  };
}

module.exports = {
  DEFAULT_UNIVERSE,
  DEFAULT_STABLECOINS,
  buildCryptoAggregateSeries,
};
