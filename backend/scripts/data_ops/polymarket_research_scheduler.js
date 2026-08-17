'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  CACHE_DIR,
  archivePaths,
  capturePolymarketOrderbookLite,
  fetchClobPriceHistory,
  normalizePriceHistory,
  tokenOrderbookLitePath,
  tokenPricePath,
  writePolymarketArchiveChunk,
} = require('../../../shared/lib/market/polymarket_history.js');

const MIN_POLL_SECONDS = 60;
const MAX_TOKENS = 100;

function readScopeFile(filePath) {
  if (!filePath) throw new Error('A local --scope-file is required');
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    const defaultPayload = { markets: [], token_ids: [] };
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    fs.writeFileSync(resolvedPath, JSON.stringify(defaultPayload, null, 2));
    return defaultPayload;
  }
  let payload = null;
  try {
    payload = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  } catch {
    payload = { markets: [], token_ids: [] };
  }
  if (!payload || !Array.isArray(payload.markets)) {
    return { markets: [], token_ids: [] };
  }
  return payload;
}

function marketTokenIds(market = {}) {
  if (Array.isArray(market.tokens)) {
    return market.tokens
      .map((token) => String(token && (token.token_id || token.tokenId || token.id) || '').trim())
      .filter(Boolean);
  }
  const raw = market.clobTokenIds ?? market.clob_token_ids ?? market.token_ids;
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function isActiveMarket(market, nowMs = Date.now()) {
  if (!market || market.active === false || market.closed === true) return false;
  if (String(market.active).toLowerCase() === 'false' || String(market.closed).toLowerCase() === 'true') return false;
  const endRaw = market.end_date || market.endDate || market.close_time;
  const endMs = endRaw ? Date.parse(endRaw) : NaN;
  return !Number.isFinite(endMs) || endMs > nowMs;
}

function selectScopedActiveTokens(scope, opts = {}) {
  const nowMs = Number.isFinite(Number(opts.nowMs)) ? Number(opts.nowMs) : Date.now();
  const requested = opts.tokenIds || scope.token_ids || scope.tokenIds || [];
  const allowlist = new Set((Array.isArray(requested) ? requested : String(requested).split(','))
    .map((value) => String(value).trim()).filter(Boolean));
  if (allowlist.size === 0) throw new Error('Scope must explicitly list token_ids');

  const maxTokens = Math.min(MAX_TOKENS, Math.max(1, Number(opts.maxTokens) || 20));
  const selected = [];
  for (const market of scope.markets || []) {
    if (!isActiveMarket(market, nowMs)) continue;
    for (const tokenId of marketTokenIds(market)) {
      if (!allowlist.has(tokenId)) continue;
      selected.push({ market, tokenId });
      if (selected.length >= maxTokens) return selected;
    }
  }
  return selected;
}

function directoryBytes(root) {
  if (!fs.existsSync(root)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) total += directoryBytes(target);
    else if (entry.isFile()) total += fs.statSync(target).size;
  }
  return total;
}

function snapshotTimeMs(row) {
  const seconds = Number(row && row.snapshot_ts);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const parsed = Date.parse(row && row.snapshot_iso);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function pruneOrderbookLiteFile(filePath, opts = {}) {
  if (!fs.existsSync(filePath)) return { before: 0, after: 0, removed: 0 };
  const nowMs = Number.isFinite(Number(opts.nowMs)) ? Number(opts.nowMs) : Date.now();
  const retentionDays = Math.min(3650, Math.max(1, Number(opts.retentionDays) || 30));
  const maxRows = Math.min(100000, Math.max(1, Number(opts.maxRows) || 5000));
  const cutoff = nowMs - retentionDays * 86400000;
  const rows = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
  const retained = rows.filter((row) => snapshotTimeMs(row) >= cutoff).slice(-maxRows);
  const payload = retained.length ? `${retained.map((row) => JSON.stringify(row)).join('\n')}\n` : '';
  fs.writeFileSync(filePath, payload, 'utf8');
  return { before: rows.length, after: retained.length, removed: rows.length - retained.length };
}

async function runPolymarketResearchCycle(opts = {}, deps = {}) {
  const root = opts.archiveRoot || CACHE_DIR;
  const scope = opts.scope || readScopeFile(opts.scopeFile);
  const selected = selectScopedActiveTokens(scope, opts);
  const dryRun = opts.execute !== true;
  if (!dryRun && opts.capturePrices === false && opts.captureOrderbooks === false) {
    throw new Error('Execute mode requires at least one capture lane: prices or orderbooks');
  }
  if (!dryRun && selected.length === 0) {
    throw new Error('Execute mode requires at least one active allowlisted token in the scope');
  }
  const maxArchiveBytes = Math.max(1, Number(opts.maxArchiveBytes) || (5 * 1024 * 1024 * 1024));
  const fetchHistory = deps.fetchHistory || fetchClobPriceHistory;
  const captureOrderbook = deps.captureOrderbook || capturePolymarketOrderbookLite;
  const nowMs = Number.isFinite(Number(opts.nowMs)) ? Number(opts.nowMs) : Date.now();
  const result = {
    ok: true,
    mode: dryRun ? 'dry_run_plan' : 'research_capture',
    archive_root: root,
    selected_tokens: selected.map(({ market, tokenId }) => ({
      market_id: market.id || market.market_id || null,
      token_id: tokenId,
    })),
    prices_written: 0,
    snapshots_written: 0,
    rows_pruned: 0,
    skipped_storage_limit: 0,
    errors: [],
  };
  if (dryRun) return result;

  fs.mkdirSync(root, { recursive: true });
  for (const { market, tokenId } of selected) {
    if (directoryBytes(root) >= maxArchiveBytes) {
      result.skipped_storage_limit += 1;
      continue;
    }

    if (opts.capturePrices !== false) {
      const history = await fetchHistory(tokenId, opts.historyInterval || '5m', true);
      if (!history.ok) {
        result.errors.push({ token_id: tokenId, stage: 'price_history', error: history.error || 'fetch_failed' });
      } else {
        const prices = normalizePriceHistory(history.data || [], history.source || 'clob_prices_history');
        const priceFile = tokenPricePath(tokenId, root);
        const oldBytes = fs.existsSync(priceFile) ? fs.statSync(priceFile).size : 0;
        const nextBytes = Buffer.byteLength(JSON.stringify(prices, null, 2));
        if (directoryBytes(root) - oldBytes + nextBytes <= maxArchiveBytes) {
          writePolymarketArchiveChunk({ tokenId, prices }, { root });
          result.prices_written += prices.length;
        } else {
          result.skipped_storage_limit += 1;
        }
      }
    }

    if (opts.captureOrderbooks !== false && directoryBytes(root) < maxArchiveBytes) {
      const filePath = tokenOrderbookLitePath(tokenId, root);
      const previous = fs.existsSync(filePath) ? fs.readFileSync(filePath) : null;
      const captured = await captureOrderbook(market, tokenId, {
        root,
        role: 'scheduled_research',
        since: nowMs,
        limit: 1,
        apiKey: opts.pmxtApiKey,
        baseUrl: opts.pmxtBaseUrl,
      });
      if (!captured.ok) {
        result.errors.push({ token_id: tokenId, stage: 'orderbook_lite', error: captured.error || 'fetch_failed' });
      } else {
        const pruned = pruneOrderbookLiteFile(filePath, {
          nowMs,
          retentionDays: opts.retentionDays,
          maxRows: opts.maxRowsPerToken,
        });
        result.rows_pruned += pruned.removed;
        if (directoryBytes(root) > maxArchiveBytes) {
          if (previous) fs.writeFileSync(filePath, previous);
          else fs.rmSync(filePath, { force: true });
          result.skipped_storage_limit += 1;
        } else {
          result.snapshots_written += Array.isArray(captured.rows) ? captured.rows.length : 0;
        }
      }
    }
  }
  if (result.prices_written === 0 && result.snapshots_written === 0) {
    result.errors.push({
      stage: 'capture',
      error: result.skipped_storage_limit > 0
        ? 'no_records_captured_archive_limit'
        : 'no_records_captured',
    });
  }
  result.ok = result.errors.length === 0;
  result.archive_bytes = directoryBytes(root);
  return result;
}

async function runPolymarketResearchScheduler(opts = {}, deps = {}) {
  const pollSeconds = Number(opts.pollSeconds) || 300;
  if (pollSeconds < MIN_POLL_SECONDS) throw new Error(`pollSeconds must be at least ${MIN_POLL_SECONDS}`);
  const sleep = deps.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const signal = opts.signal;
  const results = [];
  do {
    results.push(await runPolymarketResearchCycle(opts, deps));
    if (opts.once || (signal && signal.aborted)) break;
    await sleep(pollSeconds * 1000);
  } while (!(signal && signal.aborted));
  return { ok: results.every((result) => result.ok), cycles: results.length, results };
}

module.exports = {
  MIN_POLL_SECONDS,
  directoryBytes,
  isActiveMarket,
  pruneOrderbookLiteFile,
  readScopeFile,
  runPolymarketResearchCycle,
  runPolymarketResearchScheduler,
  selectScopedActiveTokens,
};
