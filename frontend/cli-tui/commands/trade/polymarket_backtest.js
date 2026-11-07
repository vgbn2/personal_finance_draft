'use strict';

const {
  fetchResolvedGammaMarkets,
  fetchClobPriceHistory,
  capturePolymarketOrderbookLite,
  loadArchivedMarketIndex,
  loadArchivedPriceSeries,
  summarizeArchiveCoverage,
  yesTokenId,
  inferWinner,
  gammaFinalPrice,
  buildPriceSeries,
} = require('../../../../shared/lib/market/polymarket_history.js');
const {
  estimatePolymarketExecutionCost,
  rollingWindowBars,
} = require('../../../../shared/lib/market/polymarket_features.js');

function resolveOutcome(market) {
  if (Number.isFinite(Number(market && market.resolution_price))) {
    const resolutionPrice = Number(market.resolution_price);
    return { yesWon: resolutionPrice >= 0.5, resolutionPrice };
  }
  return inferWinner(market);
}

function holdHours(entryTimestamp, market) {
  const start = entryTimestamp ? new Date(entryTimestamp).getTime() : NaN;
  const rawEnd = market && (market.end_date || market.endDate || market.close_time);
  const end = rawEnd ? new Date(rawEnd).getTime() : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return Math.round(((end - start) / 3600000) * 100) / 100;
}

function round4(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

function sleep(ms) {
  const delay = Number(ms);
  if (!Number.isFinite(delay) || delay <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function rollingVolatilityAtEntry(series, entry, interval) {
  const index = series.findIndex((point) => (
    point.timestamp === entry.timestamp && point.price === entry.price
  ));
  if (index < 0) return 0;
  let windowBars = 7;
  try {
    windowBars = rollingWindowBars(interval, 7);
  } catch {
    windowBars = 7;
  }
  const prices = series
    .slice(Math.max(0, index - windowBars + 1), index + 1)
    .map((point) => Number(point.price))
    .filter(Number.isFinite);
  if (prices.length < 2) return 0;
  const avg = prices.reduce((sum, price) => sum + price, 0) / prices.length;
  const variance = prices.reduce((sum, price) => sum + (price - avg) ** 2, 0) / prices.length;
  return Math.sqrt(variance);
}

function volumeForCostModel(market, fallback) {
  const override = Number(fallback);
  if (Number.isFinite(override) && override > 0) return override;
  const volume = Number(market && market.volume);
  return Number.isFinite(volume) && volume > 0 ? volume : 0;
}

/**
 * Apply low_prob_dip strategy: enter when earliest price ≤ entryThreshold,
 * exit at resolution (yesWon → 1.0, else 0.0).
 */
function signalLowProbDip(series, opts) {
  const threshold = opts.entryThreshold || 0.15;
  const early = series.slice(0, Math.min(5, series.length));
  const candidate = early.find((pt) => pt.price <= threshold);
  return candidate ? { price: candidate.price, timestamp: candidate.timestamp } : null;
}

/**
 * Apply mean_revert strategy: enter when price dips below MA − 1 std dev.
 */
function signalMeanRevert(series) {
  if (series.length < 5) return null;
  for (let i = 4; i < series.length; i += 1) {
    const window = series.slice(0, i + 1).map((point) => Number(point.price)).filter(Number.isFinite);
    if (window.length < 5) continue;
    const ma = window.reduce((s, p) => s + p, 0) / window.length;
    const variance = window.reduce((s, p) => s + (p - ma) ** 2, 0) / window.length;
    const trigger = ma - Math.sqrt(variance);
    const point = series[i];
    if (point.price < trigger) return { price: point.price, timestamp: point.timestamp };
  }
  return null;
}

const FALLBACK_CAPTURE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function createBacktestTotals() {
  return {
    totalPnl: 0,
    grossPnl: 0,
    totalExecutionCost: 0,
    wins: 0,
    trades: 0,
    gammaFallbacks: 0,
    gammaSkipped: 0,
    fallbackOnlyCount: 0,
    archivePriceHits: 0,
    repairedMissing: 0,
    equity: 0,
    peakEquity: 0,
    maxDrawdown: 0,
    totalHoldHours: 0,
    holdCount: 0,
    orderbookLiteCaptured: 0,
    orderbookLiteFailures: 0,
  };
}

async function loadBacktestMarkets(opts, options, loaders) {
  if (options.fromArchive && opts._fetchMarkets === undefined) {
    const archived = loaders.loadMarkets({ root: options.archiveRoot });
    if (archived.length > 0) {
      return {
        marketsResult: { ok: true, source: 'archive', data: archived },
        archiveCoverage: loaders.summarizeArchive(options.archiveRoot),
      };
    }
  }

  const marketsResult = await loaders.fetchMarkets({
    daysBack: options.daysBack,
    limit: options.maxMarkets + 10,
    noCache: options.noCache,
  });
  return { marketsResult, archiveCoverage: null };
}

async function loadMarketHistory(tokenId, marketSource, options, loaders, totals) {
  let rawHistory = [];
  let historySource = marketSource || 'api';

  if (marketSource === 'archive') {
    rawHistory = loaders.loadPrices(tokenId, { root: options.archiveRoot });
    if (rawHistory.length > 0) totals.archivePriceHits += 1;
    if (rawHistory.length === 0 && options.repairMissing) {
      const repaired = await loaders.fetchHistory(tokenId, options.interval, options.noCache);
      if (!repaired.ok) return null;
      rawHistory = repaired.data;
      historySource = repaired.source || 'repair';
      totals.repairedMissing += 1;
    }
  } else {
    const historyResult = await loaders.fetchHistory(tokenId, options.interval, options.noCache);
    if (!historyResult.ok) return null;
    rawHistory = historyResult.data;
    historySource = historyResult.source || 'api';
  }

  return { series: buildPriceSeries(rawHistory), historySource };
}

function applyGammaFallback(market, marketHistory, totals) {
  if (marketHistory.series.length > 0) return { ...marketHistory, skipMarket: false };

  const finalPrice = gammaFinalPrice(market);
  if (finalPrice === null) return { ...marketHistory, skipMarket: false };
  if (finalPrice <= 0.01 || finalPrice >= 0.99) {
    totals.gammaSkipped += 1;
    return { ...marketHistory, skipMarket: true };
  }

  const timestamp = market.end_date || market.endDate || new Date().toISOString();
  totals.gammaFallbacks += 1;
  totals.fallbackOnlyCount += 1;
  return {
    series: [{ timestamp, price: finalPrice }],
    historySource: 'gamma_outcome_price_fallback',
    skipMarket: false,
  };
}

function fallbackCaptureWindow(market) {
  const endRaw = market.end_date || market.endDate || market.close_time || null;
  const createdRaw = market.created_at || market.createdAt || market.start_date || market.startDate || null;
  const endSince = endRaw ? new Date(endRaw).getTime() : NaN;
  const createdSince = createdRaw ? new Date(createdRaw).getTime() : NaN;
  const openSince = Number.isFinite(createdSince)
    ? createdSince
    : (Number.isFinite(endSince) ? Math.max(0, endSince - FALLBACK_CAPTURE_WINDOW_MS) : NaN);
  return { openSince, endSince };
}

async function captureOrderbookSnapshot(market, tokenId, request, options) {
  const captured = await options.capture(market, tokenId, {
    root: options.archiveRoot,
    ...request,
    apiKey: options.pmxtApiKey,
    baseUrl: options.pmxtBaseUrl,
  });
  await sleep(options.throttleMs);

  const rows = captured.ok && Array.isArray(captured.rows) ? captured.rows : [];
  return {
    captured: rows.length,
    failures: rows.length > 0 ? 0 : 1,
    first: rows[0] || null,
  };
}

function recordCaptureTotals(totals, captureResult) {
  totals.orderbookLiteCaptured += captureResult.captured;
  totals.orderbookLiteFailures += captureResult.failures;
}

async function captureFallbackOrderbooks(market, tokenId, options, totals) {
  const { openSince, endSince } = fallbackCaptureWindow(market);
  if (Number.isFinite(openSince)) {
    const openBook = await captureOrderbookSnapshot(market, tokenId, {
      role: 'open',
      since: openSince,
      until: Number.isFinite(endSince) ? endSince : undefined,
    }, options);
    recordCaptureTotals(totals, openBook);
  }

  if (Number.isFinite(endSince)) {
    const closeBook = await captureOrderbookSnapshot(market, tokenId, {
      role: 'close',
      since: Math.max(0, endSince - FALLBACK_CAPTURE_WINDOW_MS),
      until: endSince,
    }, options);
    recordCaptureTotals(totals, closeBook);
  }
}

async function captureTradeOrderbooks(market, tokenId, entry, options, totals) {
  const entrySince = new Date(entry.timestamp).getTime();
  const entryBook = await captureOrderbookSnapshot(market, tokenId, {
    role: 'entry',
    since: Number.isFinite(entrySince) ? entrySince : undefined,
  }, options);
  recordCaptureTotals(totals, entryBook);

  const endRaw = market.end_date || market.endDate || market.close_time;
  const exitSince = endRaw ? new Date(endRaw).getTime() : null;
  let exitBook = null;
  if (Number.isFinite(exitSince)) {
    exitBook = await captureOrderbookSnapshot(market, tokenId, {
      role: 'exit',
      since: exitSince,
    }, options);
    recordCaptureTotals(totals, exitBook);
  }

  return {
    entry: entryBook.first,
    exit: exitBook ? exitBook.first : null,
  };
}

function selectStrategyEntry(series, strategy, entryThreshold) {
  if (strategy === 'low_prob_dip') return signalLowProbDip(series, { entryThreshold });
  if (strategy === 'mean_revert') return signalMeanRevert(series);
  return { error: `Unknown strategy '${strategy}'. Use: low_prob_dip | mean_revert` };
}

function evaluateTrade(market, tokenId, marketHistory, entry, orderbooks, options) {
  const { yesWon, resolutionPrice } = resolveOutcome(market);
  const entryOrderbook = orderbooks.entry;
  const executionCost = estimatePolymarketExecutionCost({
    fee: options.fee,
    half_spread_estimate: entryOrderbook && Number.isFinite(Number(entryOrderbook.spread))
      ? Number(entryOrderbook.spread) / 2
      : options.halfSpreadEstimate,
    Y: options.impactY,
    rolling_volatility: rollingVolatilityAtEntry(marketHistory.series, entry, options.interval),
    order_notional: options.orderNotional,
    rolling_market_volume: entryOrderbook && Number.isFinite(Number(entryOrderbook.depth_5pct))
      ? Number(entryOrderbook.depth_5pct)
      : volumeForCostModel(market, options.rollingMarketVolume),
  });
  const grossPnl = resolutionPrice - entry.price;
  const pnl = grossPnl - executionCost.total_cost;
  const hold = holdHours(entry.timestamp, market);

  return {
    grossPnl,
    executionCost: executionCost.total_cost,
    pnl,
    hold,
    result: {
      market: (market.question || market.title || market.id || '').slice(0, 100),
      marketId: market.market_id || market.id || null,
      tokenId,
      strategy: options.strategy,
      entryPrice: Math.round(entry.price * 10000) / 10000,
      entryTimestamp: entry.timestamp,
      resolutionPrice,
      yesWon,
      grossPnl: round4(grossPnl),
      executionCost: round4(executionCost.total_cost),
      pnl: round4(pnl),
      gammaFallback: marketHistory.series.length === 1,
      fallbackOnly: marketHistory.historySource === 'gamma_outcome_price_fallback',
      historySource: marketHistory.historySource,
      holdHours: hold,
      orderbookLite: entryOrderbook ? { entry: entryOrderbook, exit: orderbooks.exit } : null,
    },
  };
}

function recordTrade(totals, trade) {
  totals.trades += 1;
  totals.grossPnl += trade.grossPnl;
  totals.totalExecutionCost += trade.executionCost;
  totals.totalPnl += trade.pnl;
  if (trade.pnl > 0) totals.wins += 1;
  totals.equity += trade.pnl;
  totals.peakEquity = Math.max(totals.peakEquity, totals.equity);
  totals.maxDrawdown = Math.max(totals.maxDrawdown, totals.peakEquity - totals.equity);
  if (Number.isFinite(trade.hold)) {
    totals.totalHoldHours += trade.hold;
    totals.holdCount += 1;
  }
}

function buildBacktestReport(options, marketsResult, archiveCoverage, markets, totals, results) {
  return {
    ok: true,
    strategy: options.strategy,
    tagId: options.tagId,
    daysBack: options.daysBack,
    interval: options.interval,
    source: marketsResult.source || 'api',
    archiveRoot: options.archiveRoot || null,
    archiveCoverage,
    marketsScanned: markets.length,
    archivePriceHits: totals.archivePriceHits,
    repairedMissing: totals.repairedMissing,
    costModel: {
      fee: options.fee,
      half_spread_estimate: options.halfSpreadEstimate,
      impact_y: options.impactY,
      order_notional: options.orderNotional,
      rolling_market_volume: options.rollingMarketVolume ?? null,
    },
    gammaFallbacks: totals.gammaFallbacks,
    fallbackOnlyCount: totals.fallbackOnlyCount,
    gammaSkipped: totals.gammaSkipped,
    orderbookLiteCaptured: totals.orderbookLiteCaptured,
    orderbookLiteFailures: totals.orderbookLiteFailures,
    trades: totals.trades,
    wins: totals.wins,
    losses: totals.trades - totals.wins,
    winRate: totals.trades > 0 ? Math.round((totals.wins / totals.trades) * 10000) / 100 : 0,
    grossPnl: round4(totals.grossPnl),
    totalExecutionCost: round4(totals.totalExecutionCost),
    totalPnl: round4(totals.totalPnl),
    avgPnlPerTrade: totals.trades > 0 ? round4(totals.totalPnl / totals.trades) : 0,
    evPerTrade: totals.trades > 0 ? round4(totals.totalPnl / totals.trades) : 0,
    avgCostPerTrade: totals.trades > 0 ? round4(totals.totalExecutionCost / totals.trades) : 0,
    maxDrawdown: round4(totals.maxDrawdown),
    avgHoldTimeHours: totals.holdCount > 0
      ? Math.round((totals.totalHoldHours / totals.holdCount) * 100) / 100
      : null,
    results,
  };
}

function resolveBacktestConfiguration(opts) {
  const valueOrDefault = (name, fallback) => (
    opts[name] === undefined ? fallback : opts[name]
  );
  const options = {
    tagId: valueOrDefault('tagId', 21),
    daysBack: valueOrDefault('daysBack', 365),
    strategy: valueOrDefault('strategy', 'low_prob_dip'),
    maxMarkets: valueOrDefault('maxMarkets', 20),
    entryThreshold: valueOrDefault('entryThreshold', 0.15),
    interval: valueOrDefault('interval', '1d'),
    archiveRoot: opts.archiveRoot,
    fromArchive: valueOrDefault('fromArchive', true),
    repairMissing: valueOrDefault('repairMissing', false),
    fee: valueOrDefault('fee', 0),
    halfSpreadEstimate: valueOrDefault('halfSpreadEstimate', 0.01),
    impactY: valueOrDefault('impactY', 1),
    orderNotional: valueOrDefault('orderNotional', 10),
    rollingMarketVolume: opts.rollingMarketVolume,
    noCache: valueOrDefault('noCache', false),
  };
  const loaders = {
    fetchMarkets: valueOrDefault('_fetchMarkets', fetchResolvedGammaMarkets),
    fetchHistory: valueOrDefault('_fetchHistory', fetchClobPriceHistory),
    loadMarkets: valueOrDefault('_loadMarkets', loadArchivedMarketIndex),
    loadPrices: valueOrDefault('_loadPrices', loadArchivedPriceSeries),
    summarizeArchive: valueOrDefault('_summarizeArchive', summarizeArchiveCoverage),
  };
  const capture = {
    enabled: valueOrDefault('captureOrderbookLite', false),
    capture: valueOrDefault('_captureOrderbookLite', capturePolymarketOrderbookLite),
    archiveRoot: options.archiveRoot,
    pmxtApiKey: valueOrDefault('pmxtApiKey', process.env.PMXT_API_KEY || ''),
    pmxtBaseUrl: valueOrDefault('pmxtBaseUrl', process.env.PMXT_BASE_URL || 'https://api.pmxt.dev'),
    throttleMs: valueOrDefault('captureThrottleMs', 0),
  };
  return { options, loaders, capture };
}

/**
 * Run a Polymarket backtest against resolved markets.
 *
 * When CLOB price history is unavailable (resolved tokens have no CLOB data),
 * falls back to Gamma's stored outcomePrices[0] as a synthetic single-point series.
 *
 * Supports dependency injection for testing:
 *   opts._fetchMarkets  — replaces fetchResolvedGammaMarkets
 *   opts._fetchHistory  — replaces fetchClobPriceHistory
 */
async function runPolymarketBacktest(opts = {}) {
  const { options, loaders, capture } = resolveBacktestConfiguration(opts);
  const { marketsResult, archiveCoverage } = await loadBacktestMarkets(opts, options, loaders);
  if (!marketsResult.ok) return { ok: false, error: marketsResult.error };

  const markets = marketsResult.data.slice(0, options.maxMarkets);
  const results = [];
  const totals = createBacktestTotals();

  for (const market of markets) {
    const tokenId = yesTokenId(market);
    if (!tokenId) continue;

    const loadedHistory = await loadMarketHistory(
      tokenId,
      marketsResult.source,
      options,
      loaders,
      totals,
    );
    if (!loadedHistory) continue;

    const marketHistory = applyGammaFallback(market, loadedHistory, totals);
    if (marketHistory.skipMarket || marketHistory.series.length === 0) {
      if (capture.enabled) {
        await captureFallbackOrderbooks(market, tokenId, capture, totals);
      }
      continue;
    }

    const entry = selectStrategyEntry(
      marketHistory.series,
      options.strategy,
      options.entryThreshold,
    );
    if (entry && entry.error) return { ok: false, error: entry.error };

    if (!entry) {
      if (capture.enabled) {
        await captureFallbackOrderbooks(market, tokenId, capture, totals);
      }
      continue;
    }

    const orderbooks = capture.enabled
      ? await captureTradeOrderbooks(market, tokenId, entry, capture, totals)
      : { entry: null, exit: null };
    const trade = evaluateTrade(market, tokenId, marketHistory, entry, orderbooks, options);
    recordTrade(totals, trade);
    results.push(trade.result);
  }

  return buildBacktestReport(options, marketsResult, archiveCoverage, markets, totals, results);
}

async function runPolymarketOrderbookLiteBackfill(opts = {}) {
  const result = await runPolymarketBacktest({
    ...opts,
    captureOrderbookLite: true,
  });

  return {
    ...result,
    ok: Boolean(result && result.ok),
    mode: 'orderbook_lite_backfill',
    downloadedSnapshots: Number(result && result.orderbookLiteCaptured) || 0,
    failedSnapshots: Number(result && result.orderbookLiteFailures) || 0,
  };
}

module.exports = {
  runPolymarketBacktest,
  runPolymarketOrderbookLiteBackfill,
  signalLowProbDip,
  signalMeanRevert,
};
