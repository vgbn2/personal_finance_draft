'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const CACHE_DIR = path.join(REPO_ROOT, 'storage', 'data', 'polymarket_history');
const GAMMA_BASE = 'https://gamma-api.polymarket.com';
const CLOB_BASE  = 'https://clob.polymarket.com';
// Gamma /markets returns at most 100 rows per request regardless of the `limit`
// query param, so deep pagination must page by offset rather than asking for more.
const GAMMA_PAGE_MAX = 100;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const ARCHIVE_SCHEMA_VERSION = 'sovereign.polymarket.history/v1';
const ARCHIVE_SCHEMA_VERSION_V2 = 'sovereign.polymarket.history/v2';
const { buildPolymarketFeatureRows } = require('./polymarket_features.js');

let fetchWithRetry = null;
try {
  ({ fetchWithRetry } = require('../runtime/fetch_retry.js'));
} catch {}

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

function archivePaths(root = CACHE_DIR) {
  // `root = CACHE_DIR` only fires for `undefined` -- callers that thread an
  // explicit `null` through (e.g. polymarket_backtest.js's --archive-root
  // option defaulting through optionValue, which collapses an omitted flag
  // to null) bypass it, so path.join(null, ...) throws. loadArchivedMarketIndex
  // already guards with `opts.root || CACHE_DIR`; mirror that here too.
  root = root || CACHE_DIR;
  return {
    root,
    manifest: path.join(root, 'manifest.json'),
    marketsIndex: path.join(root, 'markets_index.json'),
    pricesDir: path.join(root, 'prices'),
    featuresDir: path.join(root, 'features'),
    orderbooksLiteDir: path.join(root, 'orderbooks-lite'),
  };
}

function ensureArchive(root = CACHE_DIR) {
  const paths = archivePaths(root);
  fs.mkdirSync(paths.root, { recursive: true });
  fs.mkdirSync(paths.pricesDir, { recursive: true });
  fs.mkdirSync(paths.featuresDir, { recursive: true });
  fs.mkdirSync(paths.orderbooksLiteDir, { recursive: true });
  return paths;
}

function safeJsonParse(value, fallback = null) {
  if (Array.isArray(value) || (value && typeof value === 'object')) return value;
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function finiteNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function parseTokenList(market = {}) {
  if (Array.isArray(market.tokens) && market.tokens.length > 0) {
    return market.tokens
      .map((token, index) => ({
        token_id: String(token.token_id || token.tokenId || token.id || '').trim(),
        outcome: String(token.outcome || token.name || (index === 0 ? 'Yes' : index === 1 ? 'No' : `Token ${index + 1}`)).trim(),
      }))
      .filter((token) => token.token_id);
  }

  const ids = safeJsonParse(market.clobTokenIds, []);
  const outcomes = safeJsonParse(market.outcomes, []);
  return (Array.isArray(ids) ? ids : [])
    .map((id, index) => ({
      token_id: String(id || '').trim(),
      outcome: String(Array.isArray(outcomes) && outcomes[index] ? outcomes[index] : (index === 0 ? 'Yes' : index === 1 ? 'No' : `Token ${index + 1}`)).trim(),
    }))
    .filter((token) => token.token_id);
}

function normalizeGammaMarket(market = {}) {
  const tokens = parseTokenList(market);
  const winner = inferWinner(market);
  return {
    market_id: String(market.id || market.market_id || market.slug || market.conditionId || '').trim() || null,
    condition_id: String(market.conditionId || market.condition_id || '').trim() || null,
    question: String(market.question || market.title || market.groupItemTitle || '').trim(),
    category: String(market.category || market.categorySlug || market.tagSlug || market.tag || '').trim() || null,
    created_at: market.createdAt || market.created_at || market.created_time || market.startDate || market.start_date || null,
    end_date: market.endDate || market.end_date || market.close_time || market.resolutionTime || null,
    closed: market.closed === true || String(market.closed).toLowerCase() === 'true',
    volume: finiteNumber(market.volume, finiteNumber(market.volumeNum, 0)) || 0,
    liquidity: finiteNumber(market.liquidity, 0) || 0,
    tokens,
    winner: winner.yesWon ? 'yes' : 'no',
    resolution_price: winner.resolutionPrice,
    resolution_confidence: winner.confidence,
    raw: {
      bestAsk: market.bestAsk ?? null,
      outcomePrices: market.outcomePrices ?? null,
      slug: market.slug ?? null,
      groupItemTitle: market.groupItemTitle ?? null,
    },
  };
}

function normalizePriceHistory(rawHistory, source = 'clob_prices_history') {
  const rows = Array.isArray(rawHistory)
    ? rawHistory
    : (rawHistory && Array.isArray(rawHistory.history) ? rawHistory.history : []);
  const byTimestamp = new Map();

  rows.forEach((point) => {
    const t = finiteNumber(point.t ?? point.timestamp ?? point.time, null);
    const p = finiteNumber(point.p ?? point.price ?? point.close, null);
    if (!Number.isFinite(t) || !Number.isFinite(p) || p < 0 || p > 1) return;
    const seconds = t > 10_000_000_000 ? Math.floor(t / 1000) : Math.floor(t);
    byTimestamp.set(seconds, {
      t: seconds,
      iso: new Date(seconds * 1000).toISOString(),
      p,
      source,
    });
  });

  return Array.from(byTimestamp.values()).sort((a, b) => a.t - b.t);
}

function tokenPricePath(tokenId, root = CACHE_DIR) {
  return path.join(archivePaths(root).pricesDir, `${String(tokenId).replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
}

function tokenFeaturePath(tokenId, root = CACHE_DIR) {
  return path.join(archivePaths(root).featuresDir, `${String(tokenId).replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
}

function tokenOrderbookLitePath(tokenId, root = CACHE_DIR) {
  return path.join(archivePaths(root).orderbooksLiteDir, `${String(tokenId).replace(/[^a-zA-Z0-9_-]/g, '_')}.jsonl`);
}

function readJsonFile(filePath, fallback = null) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return fallback; }
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function appendJsonLines(filePath, rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const payload = rows.map((row) => JSON.stringify(row)).join('\n') + '\n';
  fs.appendFileSync(filePath, payload, 'utf8');
}

function loadArchivedMarketIndex(opts = {}) {
  const root = opts.root || CACHE_DIR;
  const payload = readJsonFile(archivePaths(root).marketsIndex, []);
  return Array.isArray(payload) ? payload : [];
}

function loadArchivedPriceSeries(tokenId, opts = {}) {
  if (!tokenId) return [];
  const root = opts.root || CACHE_DIR;
  const payload = readJsonFile(tokenPricePath(tokenId, root), []);
  return normalizePriceHistory(Array.isArray(payload) ? payload : []);
}

function loadArchivedFeatureRows(tokenId, opts = {}) {
  if (!tokenId) return [];
  const root = opts.root || CACHE_DIR;
  const payload = readJsonFile(tokenFeaturePath(tokenId, root), []);
  return Array.isArray(payload) ? payload : [];
}

function loadArchivedOrderbookLite(tokenId, opts = {}) {
  if (!tokenId) return [];
  const root = opts.root || CACHE_DIR;
  const filePath = tokenOrderbookLitePath(tokenId, root);
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

function writePolymarketArchiveChunk(record = {}, opts = {}) {
  const root = opts.root || CACHE_DIR;
  const paths = ensureArchive(root);
  const warnings = [];

  if (Array.isArray(record.markets)) {
    const normalized = record.markets.map(normalizeGammaMarket);
    writeJsonFile(paths.marketsIndex, normalized);
  }

  if (record.tokenId) {
    const prices = normalizePriceHistory(record.prices || []);
    writeJsonFile(tokenPricePath(record.tokenId, root), prices);
    if (Array.isArray(record.features)) writeJsonFile(tokenFeaturePath(record.tokenId, root), record.features);
    if (prices.length === 0) warnings.push({ code: 'empty_price_history', token_id: String(record.tokenId) });
  }

  if (record.manifest) {
    writeJsonFile(paths.manifest, {
      schema: ARCHIVE_SCHEMA_VERSION,
      generated_at: new Date().toISOString(),
      ...record.manifest,
    });
  }

  return { ok: true, root, warnings };
}

function readPolymarketArchive(opts = {}) {
  const root = opts.root || CACHE_DIR;
  const markets = loadArchivedMarketIndex({ root });
  return {
    ok: true,
    root,
    markets,
    manifest: readJsonFile(archivePaths(root).manifest, null),
  };
}

function summarizeArchiveCoverage(root = CACHE_DIR) {
  const paths = archivePaths(root);
  const markets = loadArchivedMarketIndex({ root });
  const priceFiles = fs.existsSync(paths.pricesDir)
    ? fs.readdirSync(paths.pricesDir).filter((name) => name.endsWith('.json'))
    : [];
  const featureFiles = fs.existsSync(paths.featuresDir)
    ? fs.readdirSync(paths.featuresDir).filter((name) => name.endsWith('.json'))
    : [];
  const orderbookFiles = fs.existsSync(paths.orderbooksLiteDir)
    ? fs.readdirSync(paths.orderbooksLiteDir).filter((name) => name.endsWith('.jsonl'))
    : [];
  let pricePoints = 0;
  let featureRows = 0;
  let orderbookSnapshots = 0;
  priceFiles.forEach((name) => {
    const rows = readJsonFile(path.join(paths.pricesDir, name), []);
    if (Array.isArray(rows)) pricePoints += rows.length;
  });
  featureFiles.forEach((name) => {
    const rows = readJsonFile(path.join(paths.featuresDir, name), []);
    if (Array.isArray(rows)) featureRows += rows.length;
  });
  orderbookFiles.forEach((name) => {
    const rows = fs.readFileSync(path.join(paths.orderbooksLiteDir, name), 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    orderbookSnapshots += rows.length;
  });
  const indexedTokenIds = new Set();
  markets.forEach((market) => {
    (market.tokens || []).forEach((token) => {
      if (token && token.token_id) indexedTokenIds.add(String(token.token_id));
    });
  });
  return {
    root,
    markets: markets.length,
    indexed_tokens: indexedTokenIds.size,
    price_files: priceFiles.length,
    feature_files: featureFiles.length,
    orderbook_files: orderbookFiles.length,
    price_points: pricePoints,
    feature_rows: featureRows,
    orderbook_snapshots: orderbookSnapshots,
    missing_price_files: Math.max(0, indexedTokenIds.size - priceFiles.length),
    missing_feature_files: Math.max(0, indexedTokenIds.size - featureFiles.length),
    missing_orderbook_files: Math.max(0, indexedTokenIds.size - orderbookFiles.length),
  };
}

function marketMatchesCategory(market, category) {
  const normalized = String(category || 'all').trim().toLowerCase();
  if (!normalized || normalized === 'all') return true;
  const haystack = [
    market.category,
    market.question,
    market.raw && market.raw.slug,
    market.raw && market.raw.groupItemTitle,
  ].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(normalized);
}

function primaryTokenIds(market, includeNo = false) {
  const tokens = Array.isArray(market.tokens) ? market.tokens : [];
  const yes = tokens.find((token) => String(token.outcome || '').toLowerCase() === 'yes') || tokens[0];
  const selected = yes ? [yes] : [];
  if (includeNo) {
    const no = tokens.find((token) => String(token.outcome || '').toLowerCase() === 'no');
    if (no && (!yes || no.token_id !== yes.token_id)) selected.push(no);
  }
  return selected.map((token) => String(token.token_id)).filter(Boolean);
}

function normalizeBookSide(entries, side = 'ask') {
  const direction = side === 'bid' ? -1 : 1;
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => ({
      price: Number(entry.price),
      size: Number(entry.size),
      orderCount: Number(entry.orderCount),
    }))
    .filter((entry) => Number.isFinite(entry.price) && Number.isFinite(entry.size) && entry.price > 0 && entry.price < 1 && entry.size > 0)
    .sort((a, b) => direction * (a.price - b.price));
}

function computeBookDepth(book, mid, pct = 0.01) {
  if (!Number.isFinite(mid) || mid <= 0) return 0;
  const lower = mid * (1 - pct);
  const upper = mid * (1 + pct);
  const bids = normalizeBookSide(book.bids, 'bid').filter((entry) => entry.price >= lower);
  const asks = normalizeBookSide(book.asks, 'ask').filter((entry) => entry.price <= upper);
  return [...bids, ...asks].reduce((sum, entry) => sum + entry.size, 0);
}

function normalizePmxtOrderBookSnapshot(payload, context = {}) {
  const data = payload && payload.data !== undefined ? payload.data : payload;
  const snapshots = Array.isArray(data) ? data : (data ? [data] : []);
  return snapshots.map((snapshot) => {
    const bids = normalizeBookSide(snapshot.bids, 'bid');
    const asks = normalizeBookSide(snapshot.asks, 'ask');
    const bestBid = bids[0] ? bids[0].price : null;
    const bestAsk = asks[0] ? asks[0].price : null;
    const lastTradePrice = finiteNumber(snapshot.lastTradePrice ?? snapshot.last_trade_price, null);
    const mid = Number.isFinite(bestBid) && Number.isFinite(bestAsk)
      ? (bestBid + bestAsk) / 2
      : lastTradePrice;
    const snapshotMs = finiteNumber(snapshot.timestamp ?? snapshot.ts ?? null, null);
    const datetime = snapshot.datetime || snapshot.dateTime || snapshot.iso || null;
    const resolvedMs = Number.isFinite(snapshotMs)
      ? (snapshotMs > 10_000_000_000 ? snapshotMs : snapshotMs * 1000)
      : (datetime ? Date.parse(datetime) : null);
    const source = snapshot.sourceMetadata && (snapshot.sourceMetadata.source || snapshot.sourceMetadata.provider)
      ? String(snapshot.sourceMetadata.source || snapshot.sourceMetadata.provider)
      : 'pmxt';
    const orderbookMid = Number.isFinite(mid) ? mid : null;
    return {
      market_id: context.marketId || null,
      condition_id: context.conditionId || null,
      token_id: context.tokenId || null,
      outcome: context.outcome || null,
      role: context.role || 'entry',
      requested_since: context.since ?? null,
      requested_until: context.until ?? null,
      snapshot_ts: Number.isFinite(resolvedMs) ? Math.floor(resolvedMs / 1000) : null,
      snapshot_iso: Number.isFinite(resolvedMs) ? new Date(resolvedMs).toISOString() : null,
      source,
      best_bid: bestBid,
      best_ask: bestAsk,
      mid: orderbookMid,
      spread: Number.isFinite(bestBid) && Number.isFinite(bestAsk)
        ? Math.round((bestAsk - bestBid) * 1000000) / 1000000
        : null,
      depth_1pct: computeBookDepth(snapshot, orderbookMid, 0.01),
      depth_5pct: computeBookDepth(snapshot, orderbookMid, 0.05),
      last_trade_price: lastTradePrice,
      is_neg_risk: Boolean(snapshot.isNegRisk),
      raw_source: snapshot.sourceMetadata || null,
    };
  });
}

async function fetchPmxtOrderBookHistory(opts = {}) {
  const {
    outcomeId,
    outcome,
    since,
    until,
    limit = 1,
    apiKey = process.env.PMXT_API_KEY || '',
    baseUrl = process.env.PMXT_BASE_URL || 'https://api.pmxt.dev',
    fetcher = fetchWithRetry || fetch,
  } = opts;

  if (!outcomeId) return { ok: false, error: 'Missing outcomeId' };
  const url = new URL(`/api/polymarket/fetchOrderBook`, baseUrl);
  url.searchParams.set('outcomeId', String(outcomeId));
  if (outcome) url.searchParams.set('outcome', String(outcome));
  if (since !== undefined && since !== null) url.searchParams.set('since', String(since));
  if (until !== undefined && until !== null) url.searchParams.set('until', String(until));
  if (limit !== undefined && limit !== null) url.searchParams.set('limit', String(limit));

  const headers = { Accept: 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  let res;
  try {
    res = await fetcher(url.toString(), { headers });
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err), url: url.toString() };
  }

  if (!res.ok) {
    return { ok: false, error: `PMXT ${res.status}: ${res.statusText}`, url: url.toString() };
  }

  let body;
  try {
    body = await res.json();
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err), url: url.toString() };
  }

  return { ok: true, source: 'pmxt_archive', data: body, url: url.toString() };
}

async function capturePolymarketOrderbookLite(market, tokenId, opts = {}) {
  if (!market || !tokenId) {
    return { ok: false, error: 'Missing market or tokenId' };
  }
  const {
    root = CACHE_DIR,
    role = 'entry',
    since,
    until,
    limit = 1,
    apiKey,
    baseUrl,
    fetcher,
  } = opts;

  const tokens = Array.isArray(market.tokens) ? market.tokens : [];
  const token = tokens.find((item) => String(item && (item.token_id || item.tokenId || item.id || '')).trim() === String(tokenId).trim());
  const tokenOutcome = token && token.outcome ? String(token.outcome).trim().toLowerCase() : '';
  const rawTokenIds = Array.isArray(market.clobTokenIds)
    ? market.clobTokenIds
    : (typeof market.clobTokenIds === 'string' ? safeJsonParse(market.clobTokenIds, []) : []);
  const yesId = yesTokenId(market);
  const outcomeId = market.id || market.market_id || market.slug || market.conditionId || market.condition_id || tokenId;
  const outcome = opts.outcome
    || (yesId && String(yesId) === String(tokenId) ? 'yes' : null)
    || (rawTokenIds.length > 1 && String(rawTokenIds[1]) === String(tokenId) ? 'no' : null)
    || (tokenOutcome === 'yes' || tokenOutcome === 'no' ? tokenOutcome : null)
    || tokenId;
  const effectiveApiKey = apiKey || process.env.PMXT_API_KEY || '';
  if (!effectiveApiKey && !opts.quiet) {
    console.warn('[PMXT] Warning: PMXT_API_KEY is not configured; orderbook-lite snapshot request may fail or be rate-limited.');
  }
  const result = await fetchPmxtOrderBookHistory({
    outcomeId,
    outcome,
    since,
    until,
    limit,
    apiKey: effectiveApiKey,
    baseUrl,
    fetcher,
  });
  if (!result.ok) return result;

  const rows = normalizePmxtOrderBookSnapshot(result.data, {
    marketId: market.market_id || market.id || null,
    conditionId: market.condition_id || market.conditionId || null,
    tokenId,
    outcome,
    role,
    since,
    until,
  });
  if (rows.length === 0) {
    return { ok: true, source: result.source, rows: [], warnings: [{ code: 'empty_orderbook_snapshot' }] };
  }

  const record = {
    tokenId,
    marketId: market.market_id || market.id || null,
    conditionId: market.condition_id || market.conditionId || null,
    role,
    rows,
  };
  appendJsonLines(tokenOrderbookLitePath(tokenId, root), rows.map((row) => ({
    ...row,
    market_id: record.marketId,
    condition_id: record.conditionId,
  })));

  return { ok: true, source: result.source, rows, url: result.url };
}

async function fetchJson(url, label, retryOpts = { attempts: 3, baseDelayMs: 250 }) {
  const request = fetchWithRetry || fetch;
  const res = await request(url, { headers: { Accept: 'application/json' } }, retryOpts);
  if (!res.ok) throw new Error(`${label} ${res.status}: ${res.statusText}`);
  return res.json();
}

async function fetchResolvedGammaMarketsPage(opts = {}) {
  const {
    limit = 100,
    offset = 0,
    order = 'id',
    ascending = false,
  } = opts;
  const clampedLimit = Math.min(Number(limit) || 100, GAMMA_PAGE_MAX);
  const url = `${GAMMA_BASE}/markets?closed=true&limit=${clampedLimit}&offset=${offset}&order=${encodeURIComponent(order)}&ascending=${ascending ? 'true' : 'false'}`;
  const backfillRetryOpts = { attempts: 5, baseDelayMs: 1000, retryOn429: true };
  try {
    const markets = await fetchJson(url, 'Gamma', backfillRetryOpts);
    if (!Array.isArray(markets)) return { ok: false, error: 'Gamma response is not an array', raw: markets };
    return { ok: true, source: 'api', data: markets, url };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err), url };
  }
}

async function backfillPolymarketArchive(opts = {}) {
  const {
    root = CACHE_DIR,
    daysBack = 180,
    interval = '1h',
    maxMarkets = 200,
    pageLimit = 200,
    startOffset = 0,
    category = 'all',
    order = 'id',
    noCache = false,
    includeNo = false,
    generateFeatures = true,
    fetchMarketsPage = fetchResolvedGammaMarketsPage,
    fetchHistory = fetchClobPriceHistory,
    refresh = false,
    delayMs = 0,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    minVolume = null,
    targetSymbols = null,
    targetSlugs = null,
    tuning = null,
  } = opts;
  const warnings = [];
  const errors = [];
  const paths = ensureArchive(root);
  const cutoff = daysBack > 0 ? Date.now() - daysBack * 86400 * 1000 : 0;
  const markets = [];
  let offset = Math.max(0, Number(startOffset) || 0);
  const startedAt = new Date().toISOString();

  // Gamma hard-caps a page at 100 rows regardless of the requested limit, so a
  // requested limit > 100 always comes back "short" — never treat that as the end
  // of the catalog. Terminate only on an empty page (true end) or maxMarkets.
  while (markets.length < maxMarkets) {
    const limit = Math.min(pageLimit, GAMMA_PAGE_MAX, maxMarkets - markets.length);
    const page = await fetchMarketsPage({ limit, offset, order, noCache });
    if (!page.ok) return { ok: false, error: page.error, warnings, errors };
    const rows = Array.isArray(page.data) ? page.data : [];
    if (rows.length === 0) break;

    for (const raw of rows) {
      const market = normalizeGammaMarket(raw);
      const endMs = market.end_date ? new Date(market.end_date).getTime() : NaN;
      if (cutoff && Number.isFinite(endMs) && endMs < cutoff) continue;
      if (!marketMatchesCategory(market, category)) continue;
      if (minVolume !== null && minVolume !== undefined && Number(market.volume || 0) < Number(minVolume)) continue;

      if (Array.isArray(targetSlugs) && targetSlugs.length > 0) {
        const slugMatch = targetSlugs.some((s) => {
          const lower = String(s).toLowerCase();
          return (market.slug && market.slug.toLowerCase().includes(lower)) || (market.question && market.question.toLowerCase().includes(lower));
        });
        if (!slugMatch) continue;
      }

      if (Array.isArray(targetSymbols) && targetSymbols.length > 0) {
        const symMatch = targetSymbols.some((s) => {
          const lower = String(s).toLowerCase();
          return (market.slug && market.slug.toLowerCase().includes(lower)) ||
                 (market.question && market.question.toLowerCase().includes(lower)) ||
                 (Array.isArray(market.tokens) && market.tokens.some((t) => t.outcome && t.outcome.toLowerCase().includes(lower)));
        });
        if (!symMatch) continue;
      }

      markets.push(market);
      if (markets.length >= maxMarkets) break;
    }

    offset += rows.length;
    if (rows.length < limit) break;
  }

  // Merge markets index: load existing, overlay this run's markets (new wins), sort by end_date desc.
  {
    const existingIndex = loadArchivedMarketIndex({ root });
    const indexMap = new Map();
    for (const m of existingIndex) {
      const key = (m.market_id != null && m.market_id !== '') ? m.market_id : m.condition_id;
      if (key) indexMap.set(key, m);
    }
    for (const m of markets) {
      const key = (m.market_id != null && m.market_id !== '') ? m.market_id : m.condition_id;
      if (key) indexMap.set(key, m);
      else indexMap.set(Symbol(), m); // no key: keep without overwriting
    }
    const merged = Array.from(indexMap.values()).sort((a, b) => {
      const da = a.end_date ? new Date(a.end_date).getTime() : null;
      const db = b.end_date ? new Date(b.end_date).getTime() : null;
      if (da === null && db === null) return 0;
      if (da === null) return 1;  // nulls last
      if (db === null) return -1;
      return db - da; // descending
    });
    writeJsonFile(paths.marketsIndex, merged);
  }

  let tokensArchived = 0;
  let pricePoints = 0;
  let featureRows = 0;
  let missingHistory = 0;
  let skippedExisting = 0;
  let fetchCount = 0; // count real fetches for inter-call delay tracking

  for (const market of markets) {
    for (const tokenId of primaryTokenIds(market, includeNo)) {
      // Skip-existing: if not refresh and a non-empty price file exists, skip the fetch.
      if (!refresh) {
        const pricePath = tokenPricePath(tokenId, root);
        let onDiskPrices = null;
        try {
          const raw = JSON.parse(fs.readFileSync(pricePath, 'utf8'));
          if (Array.isArray(raw) && raw.length > 0) onDiskPrices = raw;
        } catch { /* file missing or invalid */ }

        if (onDiskPrices !== null) {
          // Count on-disk points toward totals.
          tokensArchived++;
          pricePoints += onDiskPrices.length;
          skippedExisting++;

          // If features file is missing, regenerate from on-disk prices.
          if (generateFeatures) {
            const featPath = tokenFeaturePath(tokenId, root);
            const featExists = fs.existsSync(featPath);
            if (!featExists) {
              try {
                const normalizedPrices = normalizePriceHistory(onDiskPrices);
                const features = buildPolymarketFeatureRows(normalizedPrices, {
                  interval,
                  marketEndTime: market.end_date,
                });
                writeJsonFile(featPath, features);
                featureRows += features.length;
              } catch (err) {
                warnings.push({
                  code: 'feature_generation_skipped',
                  token_id: tokenId,
                  market_id: market.market_id,
                  error: err && err.message ? err.message : String(err),
                });
              }
            } else {
              // Count existing feature rows.
              try {
                const existingFeatures = JSON.parse(fs.readFileSync(featPath, 'utf8'));
                if (Array.isArray(existingFeatures)) featureRows += existingFeatures.length;
              } catch { /* ignore */ }
            }
          }
          continue; // skip fetch
        }
      }

      // Inter-call delay: only between real fetches (not before the first, not after skips).
      if (delayMs > 0 && fetchCount > 0) {
        await sleep(delayMs);
      }

      const history = await fetchHistory(tokenId, interval, noCache);
      fetchCount++;

      if (!history.ok) {
        errors.push({ token_id: tokenId, error: history.error || 'history_fetch_failed' });
        continue;
      }
      const prices = normalizePriceHistory(history.data || [], history.source || 'clob_prices_history');
      writeJsonFile(tokenPricePath(tokenId, root), prices);
      if (prices.length === 0) {
        missingHistory++;
        warnings.push({ code: 'empty_price_history', token_id: tokenId, market_id: market.market_id });
      } else {
        if (generateFeatures) {
          try {
            const features = buildPolymarketFeatureRows(prices, {
              interval,
              marketEndTime: market.end_date,
            });
            writeJsonFile(tokenFeaturePath(tokenId, root), features);
            featureRows += features.length;
          } catch (err) {
            warnings.push({
              code: 'feature_generation_skipped',
              token_id: tokenId,
              market_id: market.market_id,
              error: err && err.message ? err.message : String(err),
            });
          }
        }
        tokensArchived++;
        pricePoints += prices.length;
      }
    }
  }

  const finishedAt = new Date().toISOString();

  // Build v2 manifest with run history and legacy top-level mirror keys.
  const totals = summarizeArchiveCoverage(root);
  const thisRunEntry = {
    started_at: startedAt,
    finished_at: finishedAt,
    start_offset: Math.max(0, Number(startOffset) || 0),
    max_markets: maxMarkets,
    days_back: daysBack,
    interval,
    category,
    markets_scanned: markets.length,
    markets_archived: markets.length,
    tokens_archived: tokensArchived,
    price_points: pricePoints,
    feature_rows: featureRows,
    missing_history_count: missingHistory,
    errors_count: errors.length,
    skipped_existing: skippedExisting,
    delay_ms: delayMs,
    refresh,
  };

  // Load previous runs from existing manifest (v2 only; v1 or missing → no runs).
  let previousRuns = [];
  try {
    const existingManifest = readJsonFile(paths.manifest, null);
    if (
      existingManifest &&
      existingManifest.schema === ARCHIVE_SCHEMA_VERSION_V2 &&
      Array.isArray(existingManifest.runs)
    ) {
      previousRuns = existingManifest.runs;
    }
  } catch { /* ignore */ }

  const manifest = {
    schema: ARCHIVE_SCHEMA_VERSION_V2,
    generated_at: finishedAt,
    totals,
    runs: [...previousRuns, thisRunEntry].slice(-50),
    // Legacy v1 mirror keys — keep unknown consumers working.
    market_count: totals.markets,
    tokens_archived: totals.price_files,
    price_points: totals.price_points,
    feature_rows: totals.feature_rows,
    missing_history_count: missingHistory,
    errors_count: errors.length,
  };
  writeJsonFile(paths.manifest, manifest);

  return {
    ok: errors.length === 0,
    archive_root: root,
    manifest_path: paths.manifest,
    markets_scanned: markets.length,
    markets_archived: markets.length,
    tokens_archived: tokensArchived,
    price_points: pricePoints,
    feature_rows: featureRows,
    missing_history: missingHistory,
    skipped: warnings.length,
    skipped_existing: skippedExisting,
    delay_ms: delayMs,
    refresh,
    warnings,
    errors,
  };
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
  const { daysBack = 365, limit = 50, noCache = false, offset = 0 } = opts;
  const cacheKey = `gamma_resolved_${daysBack}d_lid${limit}_off${offset}`;

  if (!noCache) {
    const hit = _readCache(cacheKey);
    if (hit) return { ok: true, source: 'cache', data: hit };
  }

  const page = await fetchResolvedGammaMarketsPage({ limit, offset });
  if (!page.ok) return page;
  const markets = page.data;

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

  const fidelityMap = { '1m': 60, '5m': 300, '1h': 3600, '1d': 86400, '1w': 86400 * 7 };
  const fidelity = fidelityMap[interval] || 86400;
  const url = `${CLOB_BASE}/prices-history?market=${encodeURIComponent(tokenId)}&interval=max&fidelity=${fidelity}`;

  const backfillRetryOpts = { attempts: 5, baseDelayMs: 1000, retryOn429: true };
  let raw;
  try {
    raw = await fetchJson(url, 'CLOB', backfillRetryOpts);
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

  if (Number.isFinite(Number(market.resolution_price))) {
    const resolutionPrice = Number(market.resolution_price);
    return {
      yesWon: resolutionPrice >= 0.5,
      resolutionPrice,
      confidence: market.resolution_confidence || 'high',
    };
  }

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
  const outcomePrices = market && (market.outcomePrices || (market.raw && market.raw.outcomePrices));
  if (!outcomePrices) return null;
  try {
    const prices = JSON.parse(outcomePrices);
    const p = parseFloat(prices[0]);
    if (Number.isFinite(p) && p >= 0 && p <= 1) return p;
  } catch {}
  return null;
}

/**
 * Convert raw CLOB price points [{t, p}] to [{timestamp, price}], sorted ascending.
 */
function buildPriceSeries(rawHistory) {
  return normalizePriceHistory(rawHistory)
    .map((pt) => ({ timestamp: pt.iso, price: pt.p, t: pt.t }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

const CANONICAL_TIMEFRAMES = [
  { label: '1s',  seconds: 1 },
  { label: '5s',  seconds: 5 },
  { label: '15s', seconds: 15 },
  { label: '30s', seconds: 30 },
  { label: '1m',  seconds: 60 },
  { label: '5m',  seconds: 300 },
  { label: '15m', seconds: 900 },
  { label: '30m', seconds: 1800 },
  { label: '1h',  seconds: 3600 },
  { label: '2h',  seconds: 7200 },
  { label: '4h',  seconds: 14400 },
  { label: '6h',  seconds: 21600 },
  { label: '12h', seconds: 43200 },
  { label: '1d',  seconds: 86400 },
];

function timeframeToSeconds(timeframe = '1h') {
  const normalized = String(timeframe || '1h').trim().toLowerCase();
  const match = CANONICAL_TIMEFRAMES.find((tf) => tf.label === normalized);
  if (match) return match.seconds;
  if (normalized.endsWith('s')) return Math.max(1, parseInt(normalized, 10) || 1);
  if (normalized.endsWith('m')) return Math.max(1, (parseInt(normalized, 10) || 1) * 60);
  if (normalized.endsWith('h')) return Math.max(1, (parseInt(normalized, 10) || 1) * 3600);
  if (normalized.endsWith('d')) return Math.max(1, (parseInt(normalized, 10) || 1) * 86400);
  return 3600;
}

/**
 * Resolves sampling interval Delta t(L; N, gamma, beta) based on market lifespan.
 * Formula: Delta t = gamma * (L^beta / (N * 300^(beta - 1)))
 */
function resolveTunableRegressionFidelity(startTime, endTime, opts = {}) {
  const toMs = (v) => {
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date) return v.getTime();
    const n = Number(v);
    if (Number.isFinite(n)) return Math.abs(n) > 1e12 ? n : n * 1000;
    const p = Date.parse(String(v));
    return Number.isFinite(p) ? p : null;
  };

  const startMs = toMs(startTime) || 0;
  const endMs = toMs(endTime) || (startMs + 86400 * 1000);
  const lifespanSeconds = Math.max(1, Math.round((endMs - startMs) / 1000));

  const targetBars = Number(opts.targetBars || opts.n) || 300;
  const scale = Number(opts.scale || opts.gamma) || 1.0;
  const beta = Number(opts.beta) || 0.9852;

  // Evaluate Delta t formula
  const denominator = targetBars * Math.pow(300, beta - 1);
  const rawStepSeconds = scale * (Math.pow(lifespanSeconds, beta) / denominator);
  const clampedStepSeconds = Math.max(1, Math.min(86400, rawStepSeconds));

  let best = CANONICAL_TIMEFRAMES[0];
  let minDiff = Infinity;
  for (const tf of CANONICAL_TIMEFRAMES) {
    const diff = Math.abs(tf.seconds - clampedStepSeconds);
    if (diff < minDiff) {
      minDiff = diff;
      best = tf;
    }
  }

  return {
    lifespanSeconds,
    rawStepSeconds: Math.round(rawStepSeconds * 1000) / 1000,
    stepSeconds: best.seconds,
    timeframe: best.label,
    targetBars,
    scale,
    beta,
    expectedBars: Math.max(1, Math.round(lifespanSeconds / best.seconds)),
  };
}

/**
 * Resamples tick points into quantized OHLCV bars with optional forward filling.
 */
function bucketTicksToOhlcv(ticks = [], intervalSeconds = 60, opts = {}) {
  const {
    forwardFill = true,
    startTime = null,
    endTime = null,
  } = opts;

  const toMs = (v) => {
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date) return v.getTime();
    const n = Number(v);
    if (Number.isFinite(n)) return Math.abs(n) > 1e12 ? n : n * 1000;
    const p = Date.parse(String(v));
    return Number.isFinite(p) ? p : null;
  };

  const stepSec = typeof intervalSeconds === 'string'
    ? timeframeToSeconds(intervalSeconds)
    : Math.max(1, Number(intervalSeconds) || 60);

  if (!Array.isArray(ticks) || ticks.length === 0) {
    return [];
  }

  const normalized = [];
  for (const tick of ticks) {
    let t = null;
    let p = null;
    let v = 0;
    if (Array.isArray(tick)) {
      t = toMs(tick[0]);
      p = Number(tick[1]);
      v = Number(tick[2]) || 0;
    } else if (tick && typeof tick === 'object') {
      t = toMs(tick.t ?? tick.timestamp ?? tick.iso ?? tick.time);
      p = Number(tick.p ?? tick.price ?? tick.close ?? tick.last_price);
      v = Number(tick.v ?? tick.volume ?? tick.size ?? 0) || 0;
    }
    if (t !== null && Number.isFinite(p) && p >= 0) {
      normalized.push({ tSec: Math.floor(t / 1000), p, v });
    }
  }

  if (normalized.length === 0) return [];
  normalized.sort((a, b) => a.tSec - b.tSec);

  const startSec = startTime ? Math.floor(toMs(startTime) / 1000) : normalized[0].tSec;
  const endSec = endTime ? Math.floor(toMs(endTime) / 1000) : normalized[normalized.length - 1].tSec;

  const binned = new Map();
  for (const item of normalized) {
    const bucket = Math.floor(item.tSec / stepSec) * stepSec;
    if (!binned.has(bucket)) {
      binned.set(bucket, {
        open: item.p,
        high: item.p,
        low: item.p,
        close: item.p,
        volume: item.v,
        count: 1,
      });
    } else {
      const b = binned.get(bucket);
      b.high = Math.max(b.high, item.p);
      b.low = Math.min(b.low, item.p);
      b.close = item.p;
      b.volume += item.v;
      b.count += 1;
    }
  }

  const buckets = Array.from(binned.keys()).sort((a, b) => a - b);
  if (buckets.length === 0) return [];

  const firstBucket = Math.floor(Math.min(startSec, buckets[0]) / stepSec) * stepSec;
  const lastBucket = Math.floor(Math.max(endSec, buckets[buckets.length - 1]) / stepSec) * stepSec;

  const result = [];
  let lastClose = binned.get(buckets[0]).open;

  for (let b = firstBucket; b <= lastBucket; b += stepSec) {
    if (binned.has(b)) {
      const data = binned.get(b);
      lastClose = data.close;
      result.push({
        t: b,
        timestamp: new Date(b * 1000).toISOString(),
        open: data.open,
        high: data.high,
        low: data.low,
        close: data.close,
        volume: Math.round(data.volume * 10000) / 10000,
        count: data.count,
      });
    } else if (forwardFill && result.length > 0) {
      result.push({
        t: b,
        timestamp: new Date(b * 1000).toISOString(),
        open: lastClose,
        high: lastClose,
        low: lastClose,
        close: lastClose,
        volume: 0,
        count: 0,
      });
    }
  }

  return result;
}

module.exports = {
  ARCHIVE_SCHEMA_VERSION,
  ARCHIVE_SCHEMA_VERSION_V2,
  archivePaths,
  backfillPolymarketArchive,
  ensureArchive,
  fetchResolvedGammaMarkets,
  fetchResolvedGammaMarketsPage,
  fetchClobPriceHistory,
  loadArchivedMarketIndex,
  loadArchivedFeatureRows,
  loadArchivedOrderbookLite,
  loadArchivedPriceSeries,
  normalizeGammaMarket,
  normalizePriceHistory,
  normalizePmxtOrderBookSnapshot,
  fetchPmxtOrderBookHistory,
  capturePolymarketOrderbookLite,
  readPolymarketArchive,
  summarizeArchiveCoverage,
  tokenFeaturePath,
  tokenPricePath,
  tokenOrderbookLitePath,
  writePolymarketArchiveChunk,
  yesTokenId,
  inferWinner,
  gammaFinalPrice,
  buildPriceSeries,
  resolveTunableRegressionFidelity,
  bucketTicksToOhlcv,
  timeframeToSeconds,
  CANONICAL_TIMEFRAMES,
  CACHE_DIR,
  GAMMA_BASE,
};
