'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const CACHE_DIR = path.join(REPO_ROOT, 'storage', 'data', 'polymarket_history');
const GAMMA_BASE = 'https://gamma-api.polymarket.com';
const CLOB_BASE  = 'https://clob.polymarket.com';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function ensureCache() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function _cachePath(key) {
  return path.join(CACHE_DIR, key.replace(/[^a-zA-Z0-9_-]/g, '_') + '.json');
}

function _readCache(key) {
  try {
    const raw = JSON.parse(fs.readFileSync(_cachePath(key), 'utf8'));
    if (Date.now() - new Date(raw.cachedAt).getTime() < CACHE_TTL_MS) return raw.data;
  } catch {}
  return null;
}

function _writeCache(key, data) {
  ensureCache();
  fs.writeFileSync(_cachePath(key), JSON.stringify({ cachedAt: new Date().toISOString(), data }, null, 2));
}

/**
 * Fetch resolved markets from Gamma API.
 * @param {object} opts
 * @param {number}  opts.daysBack resolved within last N days (0 = all, default 365)
 * @param {number}  opts.limit    max records to request (default 50)
 * @param {boolean} opts.noCache  bypass disk cache
 *
 * Note: tag_id / tag_slug filters on the Gamma /markets endpoint return empty
 * results for closed markets. We fetch by descending market ID (newest first)
 * and apply date filtering client-side via `endDate`.
 */
async function fetchResolvedGammaMarkets(opts = {}) {
  const { daysBack = 365, limit = 50, noCache = false } = opts;
  const cacheKey = `gamma_resolved_${daysBack}d_lid${limit}`;

  if (!noCache) {
    const hit = _readCache(cacheKey);
    if (hit) return { ok: true, source: 'cache', data: hit };
  }

  const url = `${GAMMA_BASE}/markets?closed=true&limit=${limit}&order=id&ascending=false`;
  let markets;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return { ok: false, error: `Gamma ${res.status}: ${res.statusText}` };
    markets = await res.json();
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }

  if (!Array.isArray(markets)) {
    return { ok: false, error: 'Gamma response is not an array', raw: markets };
  }

  const cutoff = daysBack > 0 ? Date.now() - daysBack * 86400 * 1000 : 0;
  const filtered = daysBack > 0
    ? markets.filter((m) => {
        const resolved = m.endDate || m.close_time || null;
        return resolved && new Date(resolved).getTime() > cutoff;
      })
    : markets;

  _writeCache(cacheKey, filtered);
  return { ok: true, source: 'api', data: filtered };
}

/**
 * Fetch CLOB price history for one YES-token.
 * Returns ok:true with data:[] when CLOB has no history (resolved tokens).
 * @param {string}  tokenId
 * @param {string}  interval  '1m' | '5m' | '1h' | '1d' (default '1d')
 * @param {boolean} noCache
 */
async function fetchClobPriceHistory(tokenId, interval = '1d', noCache = false) {
  if (!tokenId) return { ok: false, error: 'Missing tokenId' };
  const cacheKey = `clob_hist_${tokenId}_${interval}`;

  if (!noCache) {
    const hit = _readCache(cacheKey);
    if (hit) return { ok: true, source: 'cache', data: hit };
  }

  const fidelityMap = { '1m': 60, '5m': 300, '1h': 3600, '1d': 86400 };
  const fidelity = fidelityMap[interval] || 86400;
  const url = `${CLOB_BASE}/prices-history?market=${encodeURIComponent(tokenId)}&interval=max&fidelity=${fidelity}`;

  let raw;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return { ok: false, error: `CLOB ${res.status}: ${res.statusText}` };
    raw = await res.json();
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }

  const history = Array.isArray(raw) ? raw
    : (raw && Array.isArray(raw.history) ? raw.history : []);
  _writeCache(cacheKey, history);
  return { ok: true, source: 'api', data: history };
}

/**
 * Extract the YES token id from a Gamma market object.
 * Handles both active markets (tokens array) and resolved markets (clobTokenIds JSON string).
 * First token in clobTokenIds is always the YES token.
 */
function yesTokenId(market) {
  if (!market) return null;

  // Active markets: tokens is a proper array of {token_id, outcome}
  if (Array.isArray(market.tokens) && market.tokens.length > 0) {
    const yes = market.tokens.find((t) => String(t.outcome || '').toLowerCase() === 'yes');
    return yes
      ? (yes.token_id || yes.tokenId || null)
      : (market.tokens[0].token_id || market.tokens[0].tokenId || null);
  }

  // Resolved markets: clobTokenIds is a JSON-encoded string "[\"<yes_id>\", \"<no_id>\"]"
  if (market.clobTokenIds) {
    try {
      const ids = typeof market.clobTokenIds === 'string'
        ? JSON.parse(market.clobTokenIds)
        : market.clobTokenIds;
      if (Array.isArray(ids) && ids.length > 0) return String(ids[0]);
    } catch {}
  }

  return null;
}

/**
 * Infer the YES resolution outcome (won/lost) from Gamma market fields.
 * Returns { yesWon: boolean, resolutionPrice: 0.0 | 1.0, confidence: 'high' | 'low' }.
 * Resolved markets: bestAsk is the YES ask price — 1.0 if YES won, 0.x if uncertain.
 * Fallback: outcomePrices JSON string "[yesPrice, noPrice]" — first entry near 1.0 → YES won.
 */
function inferWinner(market) {
  if (!market) return { yesWon: false, resolutionPrice: 0.0, confidence: 'low' };

  const bestAsk = parseFloat(market.bestAsk);
  if (Number.isFinite(bestAsk)) {
    if (bestAsk >= 0.9) return { yesWon: true,  resolutionPrice: 1.0, confidence: 'high' };
    if (bestAsk <= 0.1) return { yesWon: false, resolutionPrice: 0.0, confidence: 'high' };
  }

  // Fallback: parse outcomePrices JSON string
  try {
    const prices = JSON.parse(market.outcomePrices || '');
    const yesPrice = parseFloat(prices[0]);
    if (Number.isFinite(yesPrice)) {
      if (yesPrice >= 0.85) return { yesWon: true,  resolutionPrice: 1.0, confidence: 'low' };
      if (yesPrice <= 0.15) return { yesWon: false, resolutionPrice: 0.0, confidence: 'low' };
    }
  } catch {}

  return { yesWon: false, resolutionPrice: 0.0, confidence: 'low' };
}

/**
 * Return the Gamma-stored YES price as a synthetic entry/exit price.
 * Used when CLOB history is empty (resolved tokens have no CLOB history).
 * outcomePrices[0] is the AMM's last YES price before resolution.
 */
function gammaFinalPrice(market) {
  if (!market || !market.outcomePrices) return null;
  try {
    const prices = JSON.parse(market.outcomePrices);
    const p = parseFloat(prices[0]);
    if (Number.isFinite(p) && p >= 0 && p <= 1) return p;
  } catch {}
  return null;
}

/**
 * Convert raw CLOB price points [{t, p}] to [{timestamp, price}], sorted ascending.
 */
function buildPriceSeries(rawHistory) {
  if (!Array.isArray(rawHistory) || rawHistory.length === 0) return [];
  return rawHistory
    .map((pt) => ({ timestamp: new Date(pt.t * 1000).toISOString(), price: Number(pt.p) }))
    .filter((pt) => Number.isFinite(pt.price) && pt.price >= 0 && pt.price <= 1)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

module.exports = {
  fetchResolvedGammaMarkets,
  fetchClobPriceHistory,
  yesTokenId,
  inferWinner,
  gammaFinalPrice,
  buildPriceSeries,
  CACHE_DIR,
  GAMMA_BASE,
};
