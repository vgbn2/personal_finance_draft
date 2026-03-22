/**
 * TERMINUS V2 — Central Market State
 * Single source of truth for all market data.
 * Everything reads and writes through here.
 */

class MarketState {
  constructor() {
    // Per-symbol state
    this.symbols = new Map()

    // Global metrics
    this.totalLiquidations = { long: 0, short: 0, usd: 0 }
    this.lastUpdate = Date.now()
  }

  // ── Symbol state ──────────────────────────────────────────────

  getSymbol(symbol) {
    if (!this.symbols.has(symbol)) {
      this.symbols.set(symbol, {
        symbol,
        price:        null,
        change24h:    null,
        volume24h:    null,
        high24h:      null,
        low24h:       null,
        fundingRate:  null,
        fundingTime:  null,
        openInterest: null,
        markPrice:    null,
        indexPrice:   null,
        bids:         [],   // [[price, qty], ...]
        asks:         [],
        liquidations: [],   // last 100
        trades:       [],   // last 50
        updatedAt:    null,
      })
    }
    return this.symbols.get(symbol)
  }

  updatePrice(symbol, data) {
    const s = this.getSymbol(symbol)
    if (data.price      !== undefined) s.price      = data.price
    if (data.change24h  !== undefined) s.change24h  = data.change24h
    if (data.volume24h  !== undefined) s.volume24h  = data.volume24h
    if (data.high24h    !== undefined) s.high24h    = data.high24h
    if (data.low24h     !== undefined) s.low24h     = data.low24h
    if (data.markPrice  !== undefined) s.markPrice  = data.markPrice
    if (data.indexPrice !== undefined) s.indexPrice = data.indexPrice
    s.updatedAt = Date.now()
    this.lastUpdate = Date.now()
  }

  updateOrderbook(symbol, bids, asks) {
    const s = this.getSymbol(symbol)
    s.bids = bids.slice(0, 25)
    s.asks = asks.slice(0, 25)
    s.updatedAt = Date.now()
    this.lastUpdate = Date.now()
  }

  updateFunding(symbol, rate, nextFundingTime) {
    const s = this.getSymbol(symbol)
    s.fundingRate = rate
    s.fundingTime = nextFundingTime
    s.updatedAt = Date.now()
    this.lastUpdate = Date.now()
  }

  updateOI(symbol, oi) {
    const s = this.getSymbol(symbol)
    s.openInterest = oi
    s.updatedAt = Date.now()
    this.lastUpdate = Date.now()
  }

  addLiquidation(symbol, side, price, qty, usdValue) {
    const s = this.getSymbol(symbol)
    const liq = { symbol, side, price, qty, usdValue, time: Date.now() }

    s.liquidations.unshift(liq)
    if (s.liquidations.length > 100) s.liquidations.pop()

    // Global totals
    if (side === 'LONG') this.totalLiquidations.long += usdValue
    else                 this.totalLiquidations.short += usdValue
    this.totalLiquidations.usd += usdValue

    this.lastUpdate = Date.now()
    return liq
  }

  addTrade(symbol, side, price, qty) {
    const s = this.getSymbol(symbol)
    s.trades.unshift({ side, price, qty, time: Date.now() })
    if (s.trades.length > 50) s.trades.pop()
    this.lastUpdate = Date.now()
  }

  // ── Snapshot for broadcast ────────────────────────────────────

  snapshot(symbol) {
    const s = this.getSymbol(symbol)
    return {
      type:         'snapshot',
      symbol:       s.symbol,
      price:        s.price,
      change24h:    s.change24h,
      volume24h:    s.volume24h,
      high24h:      s.high24h,
      low24h:       s.low24h,
      markPrice:    s.markPrice,
      fundingRate:  s.fundingRate,
      fundingTime:  s.fundingTime,
      openInterest: s.openInterest,
      bids:         s.bids.slice(0, 10),
      asks:         s.asks.slice(0, 10),
      liquidations: s.liquidations.slice(0, 20),
      updatedAt:    s.updatedAt,
    }
  }

  allSymbols() {
    return [...this.symbols.keys()]
  }

  summary() {
    const symbols = [...this.symbols.values()]
    return {
      type:        'summary',
      symbols:     symbols.map(s => ({
        symbol:       s.symbol,
        price:        s.price,
        change24h:    s.change24h,
        fundingRate:  s.fundingRate,
        openInterest: s.openInterest,
        updatedAt:    s.updatedAt,
      })),
      liquidations: this.totalLiquidations,
      lastUpdate:   this.lastUpdate,
    }
  }
}

// Singleton
const state = new MarketState()
module.exports = state
