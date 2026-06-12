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
  const {
    tagId        = 21,
    daysBack     = 365,
    strategy     = 'low_prob_dip',
    maxMarkets   = 20,
    entryThreshold = 0.15,
    interval      = '1d',
    archiveRoot   = undefined,
    fromArchive   = true,
    repairMissing = false,
    fee           = 0,
    halfSpreadEstimate = 0.01,
    impactY       = 1,
    orderNotional = 10,
    rollingMarketVolume = undefined,
    captureOrderbookLite = false,
    pmxtApiKey = process.env.PMXT_API_KEY || '',
    pmxtBaseUrl = process.env.PMXT_BASE_URL || 'https://api.pmxt.dev',
    noCache      = false,
    _fetchMarkets = fetchResolvedGammaMarkets,
    _fetchHistory = fetchClobPriceHistory,
    _captureOrderbookLite = capturePolymarketOrderbookLite,
    _loadMarkets = loadArchivedMarketIndex,
    _loadPrices = loadArchivedPriceSeries,
    _summarizeArchive = summarizeArchiveCoverage,
  } = opts;

  let marketsResult = null;
  let archiveCoverage = null;
  if (fromArchive && opts._fetchMarkets === undefined) {
    const archived = _loadMarkets({ root: archiveRoot });
    if (archived.length > 0) {
      marketsResult = { ok: true, source: 'archive', data: archived };
      archiveCoverage = _summarizeArchive(archiveRoot);
    }
  }

  if (!marketsResult) {
    marketsResult = await _fetchMarkets({
      daysBack, limit: maxMarkets + 10, noCache,
    });
  }
  if (!marketsResult.ok) return { ok: false, error: marketsResult.error };

  const markets = marketsResult.data.slice(0, maxMarkets);
  const results = [];
  let totalPnl = 0;
  let grossPnl = 0;
  let totalExecutionCost = 0;
  let wins = 0;
  let trades = 0;
  let gammaFallbacks = 0;
  let gammaSkipped = 0;
  let fallbackOnlyCount = 0;
  let archivePriceHits = 0;
  let repairedMissing = 0;
  let equity = 0;
  let peakEquity = 0;
  let maxDrawdown = 0;
  let totalHoldHours = 0;
  let holdCount = 0;
  let orderbookLiteCaptured = 0;
  let orderbookLiteFailures = 0;

  for (const market of markets) {
    const tokenId = yesTokenId(market);
    if (!tokenId) continue;

    let rawHistory = [];
    let historySource = marketsResult.source || 'api';
    if (marketsResult.source === 'archive') {
      rawHistory = _loadPrices(tokenId, { root: archiveRoot });
      if (rawHistory.length > 0) archivePriceHits++;
      if (rawHistory.length === 0 && repairMissing) {
        const repaired = await _fetchHistory(tokenId, interval, noCache);
        if (!repaired.ok) continue;
        rawHistory = repaired.data;
        historySource = repaired.source || 'repair';
        repairedMissing++;
      }
    } else {
      const histResult = await _fetchHistory(tokenId, interval, noCache);
      if (!histResult.ok) continue;
      rawHistory = histResult.data;
      historySource = histResult.source || 'api';
    }

    let series = buildPriceSeries(rawHistory);

    // Gamma fallback: CLOB returns 0 points for resolved tokens — use outcomePrices
    if (series.length === 0) {
      const fp = gammaFinalPrice(market);
      if (fp !== null) {
        // Skip markets where Gamma price is at resolution boundary — no pre-entry signal
        if (fp <= 0.01 || fp >= 0.99) { gammaSkipped++; continue; }
        const ts = market.end_date || market.endDate || new Date().toISOString();
        series = [{ timestamp: ts, price: fp }];
        gammaFallbacks++;
        fallbackOnlyCount++;
        historySource = 'gamma_outcome_price_fallback';
      }
    }

    if (series.length === 0) continue;

    const { yesWon, resolutionPrice } = resolveOutcome(market);

    let entry = null;
    if (strategy === 'low_prob_dip') {
      entry = signalLowProbDip(series, { entryThreshold });
    } else if (strategy === 'mean_revert') {
      entry = signalMeanRevert(series);
    } else {
      return { ok: false, error: `Unknown strategy '${strategy}'. Use: low_prob_dip | mean_revert` };
    }

    if (!entry) continue;

    let entryOrderbookLite = null;
    let exitOrderbookLite = null;
    if (captureOrderbookLite) {
      const entrySince = new Date(entry.timestamp).getTime();
      const exitSince = market.end_date || market.endDate || market.close_time
        ? new Date(market.end_date || market.endDate || market.close_time).getTime()
        : null;

      const entryBook = await _captureOrderbookLite(market, tokenId, {
        root: archiveRoot,
        role: 'entry',
        since: Number.isFinite(entrySince) ? entrySince : undefined,
        apiKey: pmxtApiKey,
        baseUrl: pmxtBaseUrl,
      });
      if (entryBook.ok && Array.isArray(entryBook.rows) && entryBook.rows.length > 0) {
        entryOrderbookLite = entryBook.rows[0];
        orderbookLiteCaptured += entryBook.rows.length;
      } else {
        orderbookLiteFailures++;
      }

      if (Number.isFinite(exitSince)) {
        const exitBook = await _captureOrderbookLite(market, tokenId, {
          root: archiveRoot,
          role: 'exit',
          since: exitSince,
          apiKey: pmxtApiKey,
          baseUrl: pmxtBaseUrl,
        });
        if (exitBook.ok && Array.isArray(exitBook.rows) && exitBook.rows.length > 0) {
          exitOrderbookLite = exitBook.rows[0];
          orderbookLiteCaptured += exitBook.rows.length;
        } else {
          orderbookLiteFailures++;
        }
      }
    }

    trades++;
    const executionCost = estimatePolymarketExecutionCost({
      fee,
      half_spread_estimate: entryOrderbookLite && Number.isFinite(Number(entryOrderbookLite.spread))
        ? Number(entryOrderbookLite.spread) / 2
        : halfSpreadEstimate,
      Y: impactY,
      rolling_volatility: rollingVolatilityAtEntry(series, entry, interval),
      order_notional: orderNotional,
      rolling_market_volume: entryOrderbookLite && Number.isFinite(Number(entryOrderbookLite.depth_5pct))
        ? Number(entryOrderbookLite.depth_5pct)
        : volumeForCostModel(market, rollingMarketVolume),
    });
    const tradeGrossPnl = resolutionPrice - entry.price;
    const pnl = tradeGrossPnl - executionCost.total_cost;
    grossPnl += tradeGrossPnl;
    totalExecutionCost += executionCost.total_cost;
    totalPnl += pnl;
    if (pnl > 0) wins++;
    equity += pnl;
    peakEquity = Math.max(peakEquity, equity);
    maxDrawdown = Math.max(maxDrawdown, peakEquity - equity);
    const hold = holdHours(entry.timestamp, market);
    if (Number.isFinite(hold)) {
      totalHoldHours += hold;
      holdCount++;
    }

    results.push({
      market:          (market.question || market.title || market.id || '').slice(0, 100),
      marketId:        market.market_id || market.id || null,
      tokenId,
      strategy,
      entryPrice:      Math.round(entry.price * 10000) / 10000,
      entryTimestamp:  entry.timestamp,
      resolutionPrice,
      yesWon,
      grossPnl:        round4(tradeGrossPnl),
      executionCost:   round4(executionCost.total_cost),
      pnl:             round4(pnl),
      gammaFallback:   series.length === 1,
      fallbackOnly:    historySource === 'gamma_outcome_price_fallback',
      historySource,
      holdHours:       hold,
      orderbookLite:   entryOrderbookLite ? {
        entry: entryOrderbookLite,
        exit: exitOrderbookLite,
      } : null,
    });
  }

  return {
    ok:              true,
    strategy,
    tagId,
    daysBack,
    interval,
    source:          marketsResult.source || 'api',
    archiveRoot:     archiveRoot || null,
    archiveCoverage,
    marketsScanned:  markets.length,
    archivePriceHits,
    repairedMissing,
    costModel: {
      fee,
      half_spread_estimate: halfSpreadEstimate,
      impact_y: impactY,
      order_notional: orderNotional,
      rolling_market_volume: rollingMarketVolume ?? null,
    },
    gammaFallbacks,
    fallbackOnlyCount,
    gammaSkipped,
    orderbookLiteCaptured,
    orderbookLiteFailures,
    trades,
    wins,
    losses:          trades - wins,
    winRate:         trades > 0 ? Math.round((wins / trades) * 10000) / 100 : 0,
    grossPnl:        round4(grossPnl),
    totalExecutionCost: round4(totalExecutionCost),
    totalPnl:        round4(totalPnl),
    avgPnlPerTrade:  trades > 0 ? round4(totalPnl / trades) : 0,
    evPerTrade:      trades > 0 ? round4(totalPnl / trades) : 0,
    avgCostPerTrade: trades > 0 ? round4(totalExecutionCost / trades) : 0,
    maxDrawdown:     round4(maxDrawdown),
    avgHoldTimeHours: holdCount > 0 ? Math.round((totalHoldHours / holdCount) * 100) / 100 : null,
    results,
  };
}

module.exports = { runPolymarketBacktest, signalLowProbDip, signalMeanRevert };
