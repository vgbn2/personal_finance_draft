/**
 * TERMINUS V2 — Quant Engine
 * Computes derived metrics from raw state data.
 * Runs every 5 seconds, broadcasts to clients.
 */

const state = require('../state')

class QuantEngine {
  constructor() {
    this.interval    = null
    this.onBroadcast = null
    this.history     = new Map() // symbol -> last N prices for volatility
    this.HISTORY_LEN = 20
  }

  start() {
    this.interval = setInterval(() => this._compute(), 5000)
    console.log('[Quant] Engine started')
  }

  stop() {
    if (this.interval) clearInterval(this.interval)
  }

  _compute() {
    for (const symbol of state.allSymbols()) {
      const snap    = state.snapshot(symbol)
      const metrics = this._computeSymbol(symbol, snap)
      if (metrics) {
        this._broadcast({ type: 'quant', symbol, ...metrics })
      }
    }
  }

  _computeSymbol(symbol, snap) {
    if (!snap.price) return null

    // Track price history for volatility
    if (!this.history.has(symbol)) this.history.set(symbol, [])
    const hist = this.history.get(symbol)
    hist.push(snap.price)
    if (hist.length > this.HISTORY_LEN) hist.shift()

    // ── Funding annualized ────────────────────────────────────
    // Funding is paid 3x per day. Annualized = rate * 3 * 365
    const fundingAnnualized = snap.fundingRate !== null
      ? snap.fundingRate * 3 * 365 * 100  // as percentage
      : null

    // ── Funding sentiment ─────────────────────────────────────
    let fundingSentiment = 'NEUTRAL'
    if (snap.fundingRate !== null) {
      if (snap.fundingRate >  0.0005) fundingSentiment = 'VERY_LONG'
      else if (snap.fundingRate >  0.0001) fundingSentiment = 'LONG'
      else if (snap.fundingRate < -0.0005) fundingSentiment = 'VERY_SHORT'
      else if (snap.fundingRate < -0.0001) fundingSentiment = 'SHORT'
    }

    // ── Orderbook imbalance ───────────────────────────────────
    let bidVolume  = 0
    let askVolume  = 0
    let imbalance  = null

    if (snap.bids.length && snap.asks.length) {
      for (const [, qty] of snap.bids) bidVolume += qty
      for (const [, qty] of snap.asks) askVolume += qty
      const total = bidVolume + askVolume
      imbalance = total > 0 ? ((bidVolume - askVolume) / total) * 100 : 0
    }

    // ── Spread ────────────────────────────────────────────────
    let spread = null
    let spreadPct = null
    if (snap.bids.length && snap.asks.length) {
      const bestBid = snap.bids[0]?.[0]
      const bestAsk = snap.asks[0]?.[0]
      if (bestBid && bestAsk) {
        spread    = bestAsk - bestBid
        spreadPct = (spread / bestAsk) * 100
      }
    }

    // ── Short-term volatility ─────────────────────────────────
    let volatility = null
    if (hist.length >= 5) {
      const returns = []
      for (let i = 1; i < hist.length; i++) {
        returns.push((hist[i] - hist[i-1]) / hist[i-1])
      }
      const mean    = returns.reduce((a, b) => a + b, 0) / returns.length
      const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length
      volatility    = Math.sqrt(variance) * 100  // as percentage
    }

    // ── Liquidation bias ─────────────────────────────────────
    let liqBias     = null
    let recentLiqs  = snap.liquidations?.slice(0, 20) || []
    if (recentLiqs.length > 0) {
      const longLiqs  = recentLiqs.filter(l => l.side === 'LONG').reduce((a, l) => a + l.usdValue, 0)
      const shortLiqs = recentLiqs.filter(l => l.side === 'SHORT').reduce((a, l) => a + l.usdValue, 0)
      const total     = longLiqs + shortLiqs
      liqBias = total > 0 ? ((longLiqs - shortLiqs) / total) * 100 : 0
    }

    // ── Score ─────────────────────────────────────────────────
    // Simple confluence score -5 to +5
    let score = 0
    if (snap.change24h !== null) {
      if (snap.change24h > 3)  score += 2
      else if (snap.change24h > 1)  score += 1
      else if (snap.change24h < -3) score -= 2
      else if (snap.change24h < -1) score -= 1
    }
    if (imbalance !== null) {
      if (imbalance > 20)  score += 1
      if (imbalance < -20) score -= 1
    }
    if (snap.fundingRate !== null) {
      if (snap.fundingRate > 0.0003) score -= 1  // overleveraged longs = bearish
      if (snap.fundingRate < -0.0003) score += 1
    }
    score = Math.max(-5, Math.min(5, score))

    return {
      fundingAnnualized:  fundingAnnualized ? parseFloat(fundingAnnualized.toFixed(2)) : null,
      fundingSentiment,
      imbalance:          imbalance !== null ? parseFloat(imbalance.toFixed(2))  : null,
      spread:             spread    !== null ? parseFloat(spread.toFixed(4))     : null,
      spreadPct:          spreadPct !== null ? parseFloat(spreadPct.toFixed(4))  : null,
      volatility:         volatility !== null ? parseFloat(volatility.toFixed(4)) : null,
      liqBias:            liqBias   !== null ? parseFloat(liqBias.toFixed(2))    : null,
      score,
    }
  }

  _broadcast(msg) {
    if (this.onBroadcast) this.onBroadcast(msg)
  }
}

module.exports = QuantEngine
