'use strict';

const {
  fetchResolvedGammaMarkets,
  fetchClobPriceHistory,
  yesTokenId,
  inferWinner,
  gammaFinalPrice,
  buildPriceSeries,
} = require('../../../../shared/lib/polymarket_history.js');

/**
 * Apply low_prob_dip strategy: enter when earliest price ≤ entryThreshold,
 * exit at resolution (yesWon → 1.0, else 0.0).
 */
function signalLowProbDip(series, opts) {
  const threshold = opts.entryThreshold || 0.15;
  const early = series.slice(0, Math.min(5, series.length));
  const candidate = early.reduce((best, pt) => (pt.price < best.price ? pt : best), early[0]);
  if (candidate.price > threshold) return null;
  return { price: candidate.price, timestamp: candidate.timestamp };
}

/**
 * Apply mean_revert strategy: enter when price dips below MA − 1 std dev.
 */
function signalMeanRevert(series) {
  if (series.length < 5) return null;
  const prices = series.map((p) => p.price);
  const ma = prices.reduce((s, p) => s + p, 0) / prices.length;
  const variance = prices.reduce((s, p) => s + (p - ma) ** 2, 0) / prices.length;
  const trigger = ma - Math.sqrt(variance);
  const dip = series.find((pt) => pt.price < trigger);
  return dip ? { price: dip.price, timestamp: dip.timestamp } : null;
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
    noCache      = false,
    _fetchMarkets = fetchResolvedGammaMarkets,
    _fetchHistory = fetchClobPriceHistory,
  } = opts;

  const marketsResult = await _fetchMarkets({
    daysBack, limit: maxMarkets + 10, noCache,
  });
  if (!marketsResult.ok) return { ok: false, error: marketsResult.error };

  const markets = marketsResult.data.slice(0, maxMarkets);
  const results = [];
  let totalPnl = 0;
  let wins = 0;
  let trades = 0;
  let gammaFallbacks = 0;
  let gammaSkipped = 0;

  for (const market of markets) {
    const tokenId = yesTokenId(market);
    if (!tokenId) continue;

    const histResult = await _fetchHistory(tokenId, '1d', noCache);
    if (!histResult.ok) continue;

    let series = buildPriceSeries(histResult.data);

    // Gamma fallback: CLOB returns 0 points for resolved tokens — use outcomePrices
    if (series.length === 0) {
      const fp = gammaFinalPrice(market);
      if (fp !== null) {
        // Skip markets where Gamma price is at resolution boundary — no pre-entry signal
        if (fp <= 0.01 || fp >= 0.99) { gammaSkipped++; continue; }
        const ts = market.endDate || new Date().toISOString();
        series = [{ timestamp: ts, price: fp }];
        gammaFallbacks++;
      }
    }

    if (series.length === 0) continue;

    const { yesWon, resolutionPrice } = inferWinner(market);

    let entry = null;
    if (strategy === 'low_prob_dip') {
      entry = signalLowProbDip(series, { entryThreshold });
    } else if (strategy === 'mean_revert') {
      entry = signalMeanRevert(series);
    } else {
      return { ok: false, error: `Unknown strategy '${strategy}'. Use: low_prob_dip | mean_revert` };
    }

    if (!entry) continue;

    trades++;
    const pnl = resolutionPrice - entry.price;
    totalPnl += pnl;
    if (pnl > 0) wins++;

    results.push({
      market:          (market.question || market.title || market.id || '').slice(0, 100),
      marketId:        market.id || null,
      strategy,
      entryPrice:      Math.round(entry.price * 10000) / 10000,
      entryTimestamp:  entry.timestamp,
      resolutionPrice,
      yesWon,
      pnl:             Math.round(pnl * 10000) / 10000,
      gammaFallback:   series.length === 1,
    });
  }

  return {
    ok:              true,
    strategy,
    tagId,
    daysBack,
    marketsScanned:  markets.length,
    gammaFallbacks,
    gammaSkipped,
    trades,
    wins,
    losses:          trades - wins,
    winRate:         trades > 0 ? Math.round((wins / trades) * 10000) / 100 : 0,
    totalPnl:        Math.round(totalPnl * 10000) / 10000,
    avgPnlPerTrade:  trades > 0 ? Math.round((totalPnl / trades) * 10000) / 10000 : 0,
    results,
  };
}

module.exports = { runPolymarketBacktest, signalLowProbDip, signalMeanRevert };
